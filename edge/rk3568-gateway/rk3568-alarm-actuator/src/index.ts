import { createLogger } from "@lsmv2/observability";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
  serviceName: z.string().default("rk3568-alarm-actuator"),
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().positive().default(18087),
  dryRun: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  serialDevice: z.string().default("/dev/ttyS7"),
  serialBaud: z.coerce.number().int().positive().default(9600),
  modbusAddress: z.coerce.number().int().min(1).max(247).default(1),
  demoVolume: z.coerce.number().int().min(0).max(30).default(5),
  playMode: z.enum(["folder", "physical", "both"]).default("both"),
  requireEcho: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  pythonBin: z.string().default("python3"),
  platformApiUrl: z.string().optional(),
  platformApiToken: z.string().optional(),
  reconcileIntervalMs: z.coerce.number().int().positive().default(3000)
});

type Config = z.infer<typeof configSchema>;
type AlarmState = "idle" | "active" | "silenced" | "failed";
type ActionName = "alarm_on" | "alarm_off" | "silence" | "status";
type Yx75rQueryKey = "online" | "playback" | "volume" | "fileCount" | "currentTrack" | "soundLight";

type Yx75rQueryResult = {
  key: Yx75rQueryKey;
  frame: string;
  echo: string;
  valid: boolean;
  rawDh?: number;
  rawDl?: number;
  value?: number | string | Record<string, unknown>;
  note?: string;
  error?: string;
};

const PY_SERIAL_WRITE = String.raw`
import sys, time
import serial

port = sys.argv[1]
baud = int(sys.argv[2])
hex_frames = sys.argv[3:]

with serial.Serial(port=port, baudrate=baud, bytesize=8, parity="N", stopbits=1, timeout=0.35, write_timeout=0.8) as ser:
    echoes = []
    for hex_frame in hex_frames:
        payload = bytes.fromhex(hex_frame)
        ser.reset_input_buffer()
        ser.write(payload)
        ser.flush()
        time.sleep(0.12)
        echoes.append(ser.read(64).hex(" ").upper())
    print("|".join(echoes))
`;

function loadConfig(): Config {
  return configSchema.parse({
    serviceName: process.env.SERVICE_NAME,
    host: process.env.ACTUATOR_HOST,
    port: process.env.ACTUATOR_PORT,
    dryRun: process.env.ALARM_DRY_RUN,
    serialDevice: process.env.ALARM_SERIAL_DEVICE,
    serialBaud: process.env.ALARM_SERIAL_BAUD,
    modbusAddress: process.env.ALARM_MODBUS_ADDRESS,
    demoVolume: process.env.ALARM_DEMO_VOLUME,
    playMode: process.env.ALARM_PLAY_MODE,
    requireEcho: process.env.ALARM_REQUIRE_ECHO,
    pythonBin: process.env.ALARM_PYTHON_BIN,
    platformApiUrl: process.env.PLATFORM_API_URL,
    platformApiToken: process.env.PLATFORM_API_TOKEN,
    reconcileIntervalMs: process.env.ALARM_RECONCILE_INTERVAL_MS
  });
}

function frameForVolume(address: number, volume: number): string {
  const safe = Math.max(0, Math.min(30, Math.round(volume)));
  return modbusWriteSingleRegister(address, 0x0006, safe);
}

function crc16Modbus(bytes: number[]): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const lsb = crc & 1;
      crc >>= 1;
      if (lsb) crc ^= 0xa001;
    }
  }
  return crc & 0xffff;
}

function modbusWriteSingleRegister(address: number, register: number, value: number): string {
  const bytes = [
    address & 0xff,
    0x06,
    (register >> 8) & 0xff,
    register & 0xff,
    (value >> 8) & 0xff,
    value & 0xff
  ];
  const crc = crc16Modbus(bytes);
  bytes.push(crc & 0xff, (crc >> 8) & 0xff);
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function modbusQueryCommand(address: number, commandRegister: number): string {
  const bytes = [
    address & 0xff,
    0x03,
    (commandRegister >> 8) & 0xff,
    commandRegister & 0xff,
    0x00,
    0x00
  ];
  const crc = crc16Modbus(bytes);
  bytes.push(crc & 0xff, (crc >> 8) & 0xff);
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function yx75rFrames(action: ActionName, config: Config): string[] {
  if (action === "alarm_on") {
    const playFrame =
      config.playMode === "folder"
        ? modbusWriteSingleRegister(config.modbusAddress, 0x300f, 0x0101)
        : modbusWriteSingleRegister(config.modbusAddress, 0x3008, 0x0001);
    return [
      frameForVolume(config.modbusAddress, config.demoVolume),
      playFrame
    ];
  }
  if (action === "alarm_off" || action === "silence") {
    return [
      modbusWriteSingleRegister(config.modbusAddress, 0x0019, 0x0001),
      modbusWriteSingleRegister(config.modbusAddress, 0x0016, 0x0001),
      modbusWriteSingleRegister(config.modbusAddress, 0x00c2, 0x0006)
    ];
  }
  return [];
}

function normalizeHex(input: string): string {
  return input.replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function assertWriteEchoes(frames: string[], echoes: string[], config: Config): void {
  if (config.dryRun || !config.requireEcho) return;
  const invalid = frames
    .map((frame, index) => ({ frame, echo: echoes[index] ?? "" }))
    .filter((item) => normalizeHex(item.echo) !== normalizeHex(item.frame));
  if (invalid.length > 0) {
    throw new Error(
      `YX75R Modbus 回显异常：${invalid
        .map((item) => `${item.frame} <= ${item.echo || "empty"}`)
        .join("; ")}`
    );
  }
}

function writeFrames(config: Config, frames: string[]): Promise<string[]> {
  if (config.dryRun) return Promise.resolve(frames.map((frame) => `DRY_RUN:${frame}`));
  if (config.serialDevice === "/dev/ttyS3") {
    return Promise.reject(new Error("refuse to open /dev/ttyS3; it is reserved for XL01 field gateway"));
  }

  return new Promise((resolve, reject) => {
    execFile(
      config.pythonBin,
      ["-c", PY_SERIAL_WRITE, config.serialDevice, String(config.serialBaud), ...frames],
      { timeout: 5000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr.trim() || err.message));
          return;
        }
        resolve(stdout.trim() ? stdout.trim().split("|") : []);
      }
    );
  });
}

const YX75R_QUERY_REGISTERS: Array<{ key: Yx75rQueryKey; register: number }> = [
  { key: "online", register: 0x003f },
  { key: "playback", register: 0x0042 },
  { key: "volume", register: 0x0043 },
  { key: "fileCount", register: 0x0049 },
  { key: "currentTrack", register: 0x004d },
  { key: "soundLight", register: 0x0070 }
];

function parseHexBytes(input: string): number[] {
  return input
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseInt(part, 16))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 0xff);
}

function isValidModbusCrc(bytes: number[]): boolean {
  if (bytes.length < 4) return false;
  const payload = bytes.slice(0, -2);
  const expected = crc16Modbus(payload);
  return bytes[bytes.length - 2] === (expected & 0xff) && bytes[bytes.length - 1] === ((expected >> 8) & 0xff);
}

function playbackNote(dl: number): string {
  if (dl === 0x00) return "停止播放";
  if (dl === 0x01) return "正在播放";
  if (dl === 0x02) return "暂停播放";
  return `未知播放状态 ${dl}`;
}

function lightNote(dl: number): string {
  if (dl === 0x00) return "随播放爆闪";
  if (dl === 0x01) return "随播放慢闪";
  if (dl === 0x02) return "随播放常亮";
  if (dl === 0x03) return "一直爆闪";
  if (dl === 0x04) return "一直慢闪";
  if (dl === 0x05) return "一直常亮";
  if (dl === 0x06) return "关闭";
  return `未知灯光状态 ${dl}`;
}

function interpretYx75rQuery(key: Yx75rQueryKey, dh: number, dl: number): Pick<Yx75rQueryResult, "value" | "note"> {
  if (key === "online") {
    return {
      value: { storageCode: dl, flashOnline: dl === 0x08 },
      note: dl === 0x08 ? "FLASH 在线" : `在线设备码 ${dl}`
    };
  }
  if (key === "playback") return { value: dl, note: playbackNote(dl) };
  if (key === "volume") return { value: dl, note: `当前音量 ${dl}/30` };
  if (key === "fileCount") {
    const count = (dh << 8) + dl;
    return { value: count, note: `FLASH 文件数 ${count}` };
  }
  if (key === "currentTrack") {
    const track = (dh << 8) + dl;
    return { value: track, note: track > 0 ? `当前/最近曲目 ${track}` : "无当前曲目" };
  }
  return {
    value: { track: dh, lightCode: dl, playing: dh > 0, lightState: lightNote(dl) },
    note: `${dh > 0 ? `正在播放物理曲目 ${dh}` : "未播放语音"}，灯光${lightNote(dl)}`
  };
}

async function queryYx75rStatus(config: Config): Promise<{ available: boolean; queries: Yx75rQueryResult[]; queriedAt: string }> {
  const frames = YX75R_QUERY_REGISTERS.map((item) => modbusQueryCommand(config.modbusAddress, item.register));
  const echoes = await writeFrames(config, frames);
  const queries = YX75R_QUERY_REGISTERS.map((item, index): Yx75rQueryResult => {
    const frame = frames[index] ?? "";
    const echo = echoes[index] ?? "";
    const bytes = parseHexBytes(echo);
    if (bytes.length < 7) {
      return { key: item.key, frame, echo, valid: false, error: "empty_or_short_response" };
    }
    if (!isValidModbusCrc(bytes)) {
      return { key: item.key, frame, echo, valid: false, error: "crc_mismatch" };
    }
    if (bytes[0] !== config.modbusAddress || bytes[1] !== 0x03 || bytes[2] !== 0x02) {
      return { key: item.key, frame, echo, valid: false, error: "unexpected_response_shape" };
    }

    const dh = bytes[3] ?? 0;
    const dl = bytes[4] ?? 0;
    return { key: item.key, frame, echo, valid: true, rawDh: dh, rawDl: dl, ...interpretYx75rQuery(item.key, dh, dl) };
  });

  return {
    available: queries.some((item) => item.valid),
    queries,
    queriedAt: new Date().toISOString()
  };
}

function sendJson(res: http.ServerResponse, code: number, payload: Record<string, unknown>): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
  const config = loadConfig();
  const logger = createLogger(config.serviceName);
  let state: AlarmState = "idle";
  let lastAction: ActionName | null = null;
  let lastActionAt: string | null = null;
  let lastError: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const statusPayload = async (withDeviceQuery: boolean) => {
    let yx75r: Awaited<ReturnType<typeof queryYx75rStatus>> | { available: false; queriedAt: string; error: string } | null = null;
    if (withDeviceQuery) {
      try {
        yx75r = await queryYx75rStatus(config);
      } catch (err) {
        yx75r = {
          available: false,
          queriedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }

    return {
    available: true,
    dryRun: config.dryRun,
    state,
    lastAction,
    lastActionAt,
    lastError,
      detail: `${config.serialDevice} ${config.serialBaud} 8N1 address=${config.modbusAddress} volume=${config.demoVolume} playMode=${config.playMode} requireEcho=${config.requireEcho}`,
      ...(yx75r ? { yx75r } : {})
    };
  };

  const runAction = async (action: ActionName, body: Record<string, unknown>) => {
    if (action === "status") return { echoes: [] as string[] };
    const frames = yx75rFrames(action, config);
    const echoes = await writeFrames(config, frames);
    assertWriteEchoes(frames, echoes, config);
    lastAction = action;
    lastActionAt = new Date().toISOString();
    lastError = null;
    state = action === "alarm_on" ? "active" : "silenced";
    logger.info({ action, frames, echoes, source: body.source, alertId: body.alertId }, "alarm actuator action");
    return { echoes };
  };

  const reconcileFromPlatform = async () => {
    const baseUrl = config.platformApiUrl?.trim().replace(/\/+$/, "");
    if (!baseUrl) return;

    const res = await fetch(`${baseUrl}/api/v1/alerts?status=active&pageSize=50`, {
      headers: {
        ...(config.platformApiToken ? { authorization: `Bearer ${config.platformApiToken}` } : {})
      }
    });
    if (!res.ok) throw new Error(`platform status http ${res.status}`);
    const envelope = (await res.json()) as {
      data?: { list?: Array<{ severity?: string; status?: string }> };
    };
    const activeEscalations =
      envelope.data?.list?.filter(
        (item) => item.status === "active" && (item.severity === "high" || item.severity === "critical")
      ) ?? [];
    if (activeEscalations.length > 0 && state !== "active") {
      await runAction("alarm_on", { source: "platform-reconcile" });
    } else if (activeEscalations.length === 0 && state === "active") {
      await runAction("alarm_off", { source: "platform-reconcile" });
    }
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
        sendJson(res, 200, await statusPayload(url.searchParams.get("queryDevice") !== "false"));
        return;
      }

      const action = url.pathname.replace(/^\/+/, "") as ActionName;
      if (req.method !== "POST" || !["alarm_on", "alarm_off", "silence"].includes(action)) {
        sendJson(res, 404, { message: "not found" });
        return;
      }

      const body = await readBody(req);
      queue = queue.catch(() => undefined).then(async () => runAction(action, body));
      const result = (await queue) as { echoes: string[] };
      sendJson(res, 200, { ...(await statusPayload(false)), ...result });
    })().catch((err) => {
      lastError = err instanceof Error ? err.message : String(err);
      state = "failed";
      logger.error({ err }, "alarm actuator request failed");
      void statusPayload(false).then((payload) => sendJson(res, 500, { ...payload, message: lastError }));
    });
  });

  server.listen(config.port, config.host, () => {
    logger.info(
      {
        host: config.host,
        port: config.port,
        dryRun: config.dryRun,
        serialDevice: config.serialDevice,
        serialBaud: config.serialBaud
      },
      "rk3568-alarm-actuator started"
    );
  });

  if (config.platformApiUrl?.trim()) {
    const timer = setInterval(() => {
      queue = queue
        .catch(() => undefined)
        .then(reconcileFromPlatform)
        .catch((err) => {
          lastError = err instanceof Error ? err.message : String(err);
          logger.warn({ err }, "platform alarm reconcile failed");
        });
    }, config.reconcileIntervalMs);
    timer.unref();
  }

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main();
