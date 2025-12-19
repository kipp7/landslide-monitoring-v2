/*
  Firmware simulator (single-host dev/e2e):
  - Publishes TelemetryEnvelope v1 to telemetry/{deviceId}
  - Subscribes DeviceCommand v1 from cmd/{deviceId}
  - Publishes DeviceCommandAck v1 to cmd_ack/{deviceId}
  - Validates payloads with JSON Schemas under docs/integrations/mqtt/schemas/
  - Persists seq + config (power-loss safe) and uses exponential reconnect backoff.

  Usage (PowerShell):
    node scripts/dev/firmware-sim.js `
      --mqtt mqtt://localhost:1883 `
      --device <deviceId> `
      --username <deviceId> `
      --password <deviceSecret> `
      --stateFile backups/firmware-sim/<deviceId>.json `
      --telemetryIntervalMs 2000
*/

const fs = require("node:fs/promises");
const path = require("node:path");
const mqtt = require("mqtt");
const { loadAndCompileSchema } = require("@lsmv2/validation");

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function requireArg(name) {
  const v = getArg(name);
  if (!v) {
    console.error(`Missing required arg: --${name}`);
    process.exit(2);
  }
  return v;
}

async function readJsonOrNull(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") return null;
    return null;
  }
}

async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  const content = JSON.stringify(value, null, 2) + "\n";
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, filePath);
}

function nowIso() {
  return new Date().toISOString();
}

function toErrorString(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

function defaultStateFile(deviceId) {
  // Keep state under backups/ (gitignored) by default.
  return path.resolve(process.cwd(), "backups", "firmware-sim", `${deviceId}.json`);
}

const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://localhost:1883");
const deviceId = requireArg("device");
const username = getArg("username", process.env.MQTT_USERNAME);
const password = getArg("password", process.env.MQTT_PASSWORD);
const telemetryTopic = getArg("telemetryTopic", `telemetry/${deviceId}`);
const cmdTopic = getArg("cmdTopic", `cmd/${deviceId}`);
const ackTopic = getArg("ackTopic", `cmd_ack/${deviceId}`);
const telemetryIntervalMs = Number(getArg("telemetryIntervalMs", "2000"));
const stateFile = getArg("stateFile", defaultStateFile(deviceId));

const schemaDir = path.resolve(process.cwd(), "docs", "integrations", "mqtt", "schemas");
const telemetrySchemaPath = path.join(schemaDir, "telemetry-envelope.v1.schema.json");
const cmdSchemaPath = path.join(schemaDir, "device-command.v1.schema.json");
const ackSchemaPath = path.join(schemaDir, "device-command-ack.v1.schema.json");

let stop = false;
let client = null;
let telemetryTimer = null;

async function loadValidators() {
  const telemetryV = await loadAndCompileSchema(telemetrySchemaPath);
  const cmdV = await loadAndCompileSchema(cmdSchemaPath);
  const ackV = await loadAndCompileSchema(ackSchemaPath);
  return { telemetryV, cmdV, ackV };
}

async function loadState() {
  const s = await readJsonOrNull(stateFile);
  if (s && typeof s === "object") {
    return {
      seq: Number.isFinite(s.seq) ? s.seq : 0,
      config: s.config && typeof s.config === "object" ? s.config : {},
      lastRebootAt: typeof s.lastRebootAt === "string" ? s.lastRebootAt : null
    };
  }
  return { seq: 0, config: {}, lastRebootAt: null };
}

async function persistState(state) {
  await writeJsonAtomic(stateFile, state);
}

function buildTelemetry(state) {
  state.seq += 1;
  const samplingS = Number.isFinite(state.config.sampling_s) ? Number(state.config.sampling_s) : 5;
  const reportIntervalS = Number.isFinite(state.config.report_interval_s) ? Number(state.config.report_interval_s) : 5;

  return {
    schema_version: 1,
    device_id: deviceId,
    event_ts: nowIso(),
    seq: state.seq,
    metrics: {
      displacement_mm: 1.23,
      tilt_x_deg: 0.18,
      battery_v: 3.92,
      sampling_s: samplingS,
      report_interval_s: reportIntervalS
    },
    meta: {
      fw: "firmware-sim",
      state_file: path.basename(stateFile)
    }
  };
}

function buildAck(commandId, status, result) {
  return {
    schema_version: 1,
    command_id: commandId,
    device_id: deviceId,
    ack_ts: nowIso(),
    status,
    ...(result ? { result } : {})
  };
}

async function handleCommand(validators, state, payloadBuf) {
  let msg;
  try {
    msg = JSON.parse(payloadBuf.toString("utf-8"));
  } catch (err) {
    console.error("cmd invalid json:", toErrorString(err));
    return;
  }

  if (!validators.cmdV.validate(msg)) {
    console.error("cmd schema validation failed:", JSON.stringify(validators.cmdV.errors));
    const ack = buildAck(msg.command_id || "00000000-0000-0000-0000-000000000000", "failed", {
      error: "invalid_command_schema"
    });
    await publishAck(validators, ack);
    return;
  }

  const { command_id: commandId, command_type: commandType, payload } = msg;

  if (commandType === "ping") {
    const ack = buildAck(commandId, "acked", { pong: true, ts: nowIso() });
    await publishAck(validators, ack);
    return;
  }

  if (commandType === "set_config") {
    const p = payload && typeof payload === "object" ? payload : null;
    if (!p) {
      const ack = buildAck(commandId, "failed", { error: "payload_must_be_object" });
      await publishAck(validators, ack);
      return;
    }
    state.config = { ...(state.config || {}), ...p };
    await persistState(state);
    const ack = buildAck(commandId, "acked", { applied: true, config: state.config });
    await publishAck(validators, ack);
    return;
  }

  if (commandType === "reboot") {
    state.lastRebootAt = nowIso();
    await persistState(state);
    const ack = buildAck(commandId, "acked", { rebooting: true, ts: state.lastRebootAt });
    await publishAck(validators, ack);
    // Simulate a reboot by disconnecting; main loop will reconnect with backoff.
    setTimeout(() => {
      if (client) client.end(true);
    }, 250);
    return;
  }

  const ack = buildAck(commandId, "failed", { error: "unknown_command_type", commandType });
  await publishAck(validators, ack);
}

async function publishTelemetry(validators, state) {
  if (!client || !client.connected) return;
  const payload = buildTelemetry(state);
  if (!validators.telemetryV.validate(payload)) {
    console.error("telemetry schema validation failed:", JSON.stringify(validators.telemetryV.errors));
    return;
  }

  client.publish(telemetryTopic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) console.error("telemetry publish failed:", toErrorString(err));
    else console.log(`telemetry published: seq=${payload.seq}`);
  });
  await persistState(state);
}

async function publishAck(validators, ack) {
  if (!client || !client.connected) return;
  if (!validators.ackV.validate(ack)) {
    console.error("ack schema validation failed:", JSON.stringify(validators.ackV.errors));
    return;
  }
  client.publish(ackTopic, JSON.stringify(ack), { qos: 1 }, (err) => {
    if (err) console.error("ack publish failed:", toErrorString(err));
    else console.log(`ack published: command_id=${ack.command_id} status=${ack.status}`);
  });
}

async function run() {
  const validators = await loadValidators();
  const state = await loadState();

  let attempt = 0;
  const baseDelayMs = 500;
  const maxDelayMs = 30_000;

  while (!stop) {
    attempt += 1;
    const delayMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.min(attempt - 1, 10)));
    const jitterMs = Math.floor(Math.random() * 250);
    const connectDelayMs = attempt === 1 ? 0 : delayMs + jitterMs;

    if (connectDelayMs > 0) {
      console.log(`reconnect backoff: attempt=${attempt} delay_ms=${connectDelayMs}`);
      await new Promise((r) => setTimeout(r, connectDelayMs));
    }

    if (stop) break;

    console.log(`connecting: mqtt=${mqttUrl} device=${deviceId} cmd=${cmdTopic}`);

    client = mqtt.connect(mqttUrl, {
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      keepalive: 30,
      ...(username && password ? { username, password } : {})
    });

    const connected = await new Promise((resolve) => {
      const cleanup = () => {
        client.off("connect", onConnect);
        client.off("error", onError);
        client.off("close", onClose);
      };
      const onConnect = () => {
        cleanup();
        resolve(true);
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };
      const onClose = () => {
        cleanup();
        resolve(false);
      };
      client.on("connect", onConnect);
      client.on("error", onError);
      client.on("close", onClose);
    });

    if (!connected) {
      try {
        client.end(true);
      } catch {}
      continue;
    }

    attempt = 0;
    console.log("connected");

    client.on("message", async (_topic, payloadBuf) => {
      try {
        await handleCommand(validators, state, payloadBuf);
      } catch (err) {
        console.error("handleCommand failed:", toErrorString(err));
      }
    });

    await new Promise((resolve) => {
      client.subscribe(cmdTopic, { qos: 1 }, (err) => {
        if (err) {
          console.error("subscribe failed:", toErrorString(err));
          resolve(false);
        } else {
          console.log(`subscribed: ${cmdTopic}`);
          resolve(true);
        }
      });
    });

    if (telemetryTimer) clearInterval(telemetryTimer);
    telemetryTimer = setInterval(() => {
      void publishTelemetry(validators, state);
    }, Number.isFinite(telemetryIntervalMs) && telemetryIntervalMs > 0 ? telemetryIntervalMs : 2000);

    // Publish one telemetry immediately so e2e can progress.
    await publishTelemetry(validators, state);

    console.log("ready");

    await new Promise((resolve) => {
      const onClose = () => resolve();
      client.once("close", onClose);
      client.once("end", onClose);
    });

    try {
      if (telemetryTimer) clearInterval(telemetryTimer);
      telemetryTimer = null;
      client.removeAllListeners();
    } catch {}
    client = null;
  }

  try {
    if (telemetryTimer) clearInterval(telemetryTimer);
  } catch {}
  try {
    if (client) client.end(true);
  } catch {}
}

process.on("SIGINT", () => {
  stop = true;
});
process.on("SIGTERM", () => {
  stop = true;
});

run().catch((err) => {
  console.error("firmware-sim fatal:", toErrorString(err));
  process.exitCode = 1;
});

