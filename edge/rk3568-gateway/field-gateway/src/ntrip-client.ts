import net from "node:net";

const MAX_RESPONSE_HEADER_BYTES = 16 * 1024;

export type NtripClientConfig = {
  host: string;
  port: number;
  mountpoint: string;
  username: string;
  password: string;
  ggaIntervalMs: number;
  connectTimeoutMs: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
};

export type NtripClientStats = {
  state: "stopped" | "connecting" | "streaming" | "backoff";
  connectAttempts: number;
  successfulConnections: number;
  reconnects: number;
  receivedChunks: number;
  receivedBytes: number;
  ggaWrites: number;
  ggaWriteErrors: number;
  lastConnectedTs: string | null;
  lastDataTs: string | null;
  lastGgaTs: string | null;
  lastStatusLine: string | null;
  lastError: string | null;
};

export type NtripClientHooks = {
  getGga: () => string | null;
  onData: (chunk: Buffer) => void;
  onState?: (stats: NtripClientStats) => void;
};

function validateConfig(config: NtripClientConfig): void {
  if (!config.host.trim() || !config.mountpoint.trim() || !config.username || !config.password) {
    throw new Error("NTRIP host, mountpoint and credentials are required");
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("NTRIP port is out of range");
  }
  for (const value of [
    config.ggaIntervalMs,
    config.connectTimeoutMs,
    config.reconnectBaseDelayMs,
    config.reconnectMaxDelayMs
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("NTRIP timing values must be positive integers");
  }
  if (config.reconnectMaxDelayMs < config.reconnectBaseDelayMs) {
    throw new Error("NTRIP reconnect delay range is inverted");
  }
}

export class NtripClient {
  private socket: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private ggaTimer: NodeJS.Timeout | null = null;
  private responseHeader = Buffer.alloc(0);
  private responseAccepted = false;
  private stopped = true;
  private consecutiveFailures = 0;
  private readonly counters: NtripClientStats = {
    state: "stopped",
    connectAttempts: 0,
    successfulConnections: 0,
    reconnects: 0,
    receivedChunks: 0,
    receivedBytes: 0,
    ggaWrites: 0,
    ggaWriteErrors: 0,
    lastConnectedTs: null,
    lastDataTs: null,
    lastGgaTs: null,
    lastStatusLine: null,
    lastError: null
  };

  constructor(
    private readonly config: NtripClientConfig,
    private readonly hooks: NtripClientHooks
  ) {
    validateConfig(config);
  }

  stats(): NtripClientStats {
    return { ...this.counters };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ggaTimer) clearInterval(this.ggaTimer);
    this.reconnectTimer = null;
    this.ggaTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) socket.destroy();
    this.setState("stopped");
  }

  private setState(state: NtripClientStats["state"]): void {
    this.counters.state = state;
    this.hooks.onState?.(this.stats());
  }

  private connect(): void {
    if (this.stopped || this.socket) return;
    this.responseHeader = Buffer.alloc(0);
    this.responseAccepted = false;
    this.counters.connectAttempts += 1;
    this.setState("connecting");

    const socket = net.createConnection({ host: this.config.host, port: this.config.port });
    this.socket = socket;
    socket.setTimeout(this.config.connectTimeoutMs);
    socket.on("connect", () => {
      const mountpoint = this.config.mountpoint.replace(/^\/+/, "");
      const authorization = Buffer.from(`${this.config.username}:${this.config.password}`, "utf8").toString("base64");
      const request = [
        `GET /${mountpoint} HTTP/1.0`,
        `Host: ${this.config.host}:${String(this.config.port)}`,
        "User-Agent: NTRIP lsmv2-field-gateway/1.0",
        "Ntrip-Version: Ntrip/2.0",
        `Authorization: Basic ${authorization}`,
        "Connection: close",
        "",
        ""
      ].join("\r\n");
      socket.write(request, "ascii");
    });
    socket.on("timeout", () => {
      this.counters.lastError = "NTRIP connection or response timeout";
      socket.destroy(new Error(this.counters.lastError));
    });
    socket.on("data", (chunk) => this.handleData(socket, chunk));
    socket.on("error", (error) => {
      this.counters.lastError = error.message;
    });
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      if (this.ggaTimer) clearInterval(this.ggaTimer);
      this.ggaTimer = null;
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  private handleData(socket: net.Socket, chunk: Buffer): void {
    if (!this.responseAccepted) {
      this.responseHeader = Buffer.concat([this.responseHeader, chunk]);
      if (this.responseHeader.length > MAX_RESPONSE_HEADER_BYTES) {
        this.counters.lastError = "NTRIP response header exceeded 16 KiB";
        socket.destroy(new Error(this.counters.lastError));
        return;
      }
      const buffered = this.responseHeader;
      const firstLineEnd = buffered.indexOf("\r\n");
      if (firstLineEnd < 0) return;
      const statusLine = buffered.subarray(0, firstLineEnd).toString("latin1").trim();
      this.counters.lastStatusLine = statusLine;
      const icyAccepted = /^ICY\s+200\s+OK$/iu.test(statusLine);
      const httpAccepted = /^HTTP\/\d(?:\.\d)?\s+200\b/iu.test(statusLine);
      if (!icyAccepted && !httpAccepted) {
        this.counters.lastError = `NTRIP caster rejected request: ${statusLine || "missing status"}`;
        socket.destroy(new Error(this.counters.lastError));
        return;
      }

      const headerEnd = buffered.indexOf("\r\n\r\n");
      let bodyOffset = headerEnd >= 0 ? headerEnd + 4 : -1;
      // NTRIP v1 casters may send only "ICY 200 OK\r\n" before raw RTCM.
      // Wait until the first RTCM preamble arrives so an optional text header is
      // never mistaken for correction data.
      if (bodyOffset < 0 && icyAccepted) {
        const icyBodyOffset = firstLineEnd + 2;
        if (icyBodyOffset < buffered.length && buffered[icyBodyOffset] === 0xd3) {
          bodyOffset = icyBodyOffset;
        }
      }
      if (bodyOffset < 0) return;

      this.responseAccepted = true;
      this.responseHeader = Buffer.alloc(0);
      this.consecutiveFailures = 0;
      socket.setTimeout(0);
      this.counters.successfulConnections += 1;
      this.counters.lastConnectedTs = new Date().toISOString();
      this.counters.lastError = null;
      this.setState("streaming");
      this.writeGga();
      this.ggaTimer = setInterval(() => this.writeGga(), this.config.ggaIntervalMs);
      if (bodyOffset < buffered.length) this.deliver(buffered.subarray(bodyOffset));
      return;
    }
    this.deliver(chunk);
  }

  private deliver(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.counters.receivedChunks += 1;
    this.counters.receivedBytes += chunk.length;
    this.counters.lastDataTs = new Date().toISOString();
    this.hooks.onData(Buffer.from(chunk));
  }

  private writeGga(): void {
    const socket = this.socket;
    if (!socket || !this.responseAccepted || socket.destroyed) return;
    const sentence = this.hooks.getGga();
    if (!sentence) return;
    const normalized = sentence.endsWith("\r\n") ? sentence : `${sentence.replace(/[\r\n]+$/u, "")}\r\n`;
    if (!/^\$[^*]+\*[0-9A-F]{2}\r\n$/iu.test(normalized)) {
      this.counters.ggaWriteErrors += 1;
      this.counters.lastError = "NTRIP GGA callback returned an invalid sentence";
      return;
    }
    socket.write(normalized, "ascii", (error) => {
      if (error) {
        this.counters.ggaWriteErrors += 1;
        this.counters.lastError = error.message;
        return;
      }
      this.counters.ggaWrites += 1;
      this.counters.lastGgaTs = new Date().toISOString();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.consecutiveFailures += 1;
    const exponent = Math.min(16, Math.max(0, this.consecutiveFailures - 1));
    const delayMs = Math.min(
      this.config.reconnectMaxDelayMs,
      this.config.reconnectBaseDelayMs * 2 ** exponent
    );
    this.counters.reconnects += 1;
    this.setState("backoff");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }
}
