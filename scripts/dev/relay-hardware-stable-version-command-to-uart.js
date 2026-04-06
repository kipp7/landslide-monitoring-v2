const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const mqtt = require("mqtt");

let loadAndCompileSchema = null;
try {
  ({ loadAndCompileSchema } = require("@lsmv2/validation"));
} catch {}

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requireArg(name) {
  const value = getArg(name);
  if (!value) {
    console.error(`Missing required arg: --${name}`);
    process.exit(2);
  }
  return value;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseJsonOrThrow(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

function tryParseJson(text) {
  try {
    return parseJsonOrThrow(text);
  } catch {
    return null;
  }
}

async function loadCommandValidator(repoRoot) {
  if (!loadAndCompileSchema) return null;
  const schemaPath = path.join(repoRoot, "docs", "integrations", "mqtt", "schemas", "device-command.v1.schema.json");
  return loadAndCompileSchema(schemaPath);
}

async function loadAckValidator(repoRoot) {
  if (!loadAndCompileSchema) return null;
  const schemaPath = path.join(repoRoot, "docs", "integrations", "mqtt", "schemas", "device-command-ack.v1.schema.json");
  return loadAndCompileSchema(schemaPath);
}

function isAckPayload(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.schema_version === 1 &&
      typeof value.command_id === "string" &&
      typeof value.device_id === "string" &&
      typeof value.ack_ts === "string" &&
      (value.status === "acked" || value.status === "failed")
  );
}

function extractJsonObjects(text) {
  const results = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (start === -1) {
      if (ch === "{") {
        start = i;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

function extractCapturedAck(captureText, expectedCommandId, expectedDeviceId) {
  if (typeof captureText !== "string" || captureText.trim().length === 0) {
    return null;
  }

  for (const candidate of extractJsonObjects(captureText)) {
    const parsed = tryParseJson(candidate);
    if (!isAckPayload(parsed)) continue;
    if (expectedCommandId && parsed.command_id !== expectedCommandId) continue;
    if (expectedDeviceId && parsed.device_id !== expectedDeviceId) continue;
    return parsed;
  }

  return null;
}

function mqttPublish(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function runNode(repoRoot, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Node command failed: node ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function runPowerShell(repoRoot, args) {
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/dev/inject-hardware-stable-version-command.ps1", ...args],
    {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8"
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `PowerShell command failed: inject-hardware-stable-version-command.ps1 ${args.join(" ")}\n${result.stdout}\n${result.stderr}`
    );
  }
  return result.stdout.trim();
}

async function main() {
  const repoRoot = process.cwd();
  const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://127.0.0.1:1883");
  const username = getArg("username", process.env.MQTT_USERNAME);
  const password = getArg("password", process.env.MQTT_PASSWORD);
  const deviceId = getArg("device");
  const topic = getArg("topic", deviceId ? `cmd/${deviceId}` : null);
  const sink = getArg("sink", "file").toLowerCase();
  const timeoutSeconds = Number(getArg("timeout", "30"));
  const chunkStrategy = getArg("chunkStrategy", "suggested");
  const interChunkDelayMs = Number(getArg("interChunkDelayMs", "50"));
  const readAfterWriteSeconds = Number(getArg("readAfterWriteSeconds", "0"));
  const port = getArg("port", "");
  const baudRate = Number(getArg("baudRate", "115200"));
  const publishCapturedAck = hasFlag("publishCapturedAck");
  const ackTopicPrefix = getArg("ackTopicPrefix", process.env.MQTT_TOPIC_ACK_PREFIX || "cmd_ack/");
  const stamp = getArg("stamp", nowStamp());
  const outFileArg = getArg("outFile", `.tmp/mqtt-uart-relay-${stamp}.json`);

  if (!topic) {
    throw new Error("Missing required arg: --topic or --device");
  }

  const outFile = path.isAbsolute(outFileArg) ? outFileArg : path.join(repoRoot, outFileArg);
  ensureDir(path.dirname(outFile));

  const payloadFile = path.join(repoRoot, ".tmp", `mqtt-uart-relay-payload-${stamp}.json`);
  ensureDir(path.dirname(payloadFile));

  const validator = await loadCommandValidator(repoRoot);
  const ackValidator = await loadAckValidator(repoRoot);
  const deadline = Date.now() + (Number.isFinite(timeoutSeconds) ? timeoutSeconds : 30) * 1000;

  const result = await new Promise((resolve, reject) => {
    const client = mqtt.connect(mqttUrl, {
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      ...(username && password ? { username, password } : {})
    });

    const timer = setInterval(() => {
      if (Date.now() > deadline) {
        clearInterval(timer);
        client.end(true);
        reject(new Error(`timeout waiting for command on ${topic}`));
      }
    }, 250);

    client.on("connect", () => {
      client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          clearInterval(timer);
          client.end(true);
          reject(err);
          return;
        }
        console.log(`subscribed: ${topic}`);
      });
    });

    client.on("message", async (_topic, payloadBuf) => {
      clearInterval(timer);
      const payloadText = payloadBuf.toString("utf8");
      let message;
      try {
        message = parseJsonOrThrow(payloadText);
      } catch (err) {
        client.end(true);
        reject(err);
        return;
      }

      console.log(
        `received: ${JSON.stringify({
          topic,
          commandId: message.command_id || null,
          deviceId: message.device_id || null,
          commandType: message.command_type || null
        })}`
      );

      if (validator && !validator.validate(message)) {
        client.end(true);
        reject(new Error(`command schema validation failed: ${JSON.stringify(validator.errors)}`));
        return;
      }

      fs.writeFileSync(payloadFile, payloadText.endsWith("\n") ? payloadText : `${payloadText}\n`, "utf8");

      const planText = runNode(repoRoot, [
        "scripts/dev/inject-hardware-stable-version-command.js",
        "--payloadFile",
        payloadFile,
        "--payloadLabel",
        message.command_type || "runtime-command",
        "--mode",
        "uart-plan",
        "--chunkStrategy",
        chunkStrategy
      ]);
      const plan = parseJsonOrThrow(planText);

      let sinkResult = null;
      let capturedAck = null;
      let ackPublish = null;
      if (sink === "stdout") {
        sinkResult = { mode: "stdout" };
        console.log(planText);
      } else if (sink === "uart-com") {
        if (!port) {
          client.end(true);
          reject(new Error("sink=uart-com requires --port"));
          return;
        }
        const sinkArgs = [
          "-PayloadFile",
          payloadFile,
          "-PayloadLabel",
          message.command_type || "runtime-command",
          "-Mode",
          "uart-com",
          "-Port",
          port,
          "-BaudRate",
          String(Number.isFinite(baudRate) ? baudRate : 115200),
          "-ChunkStrategy",
          chunkStrategy,
          "-InterChunkDelayMs",
          String(Number.isFinite(interChunkDelayMs) ? interChunkDelayMs : 50)
        ];
        if (Number.isFinite(readAfterWriteSeconds) && readAfterWriteSeconds > 0) {
          sinkArgs.push("-ReadAfterWriteSeconds", String(readAfterWriteSeconds));
        }
        const sinkText = runPowerShell(repoRoot, sinkArgs);
        sinkResult = sinkText ? parseJsonOrThrow(sinkText) : { mode: "uart-com" };
        capturedAck = extractCapturedAck(
          sinkResult?.capture?.text,
          message.command_id || null,
          message.device_id || null
        );
        if (capturedAck && ackValidator && !ackValidator.validate(capturedAck)) {
          ackPublish = {
            published: false,
            topic: `${ackTopicPrefix}${message.device_id || ""}`,
            reason: "captured-ack-failed-schema-validation",
            errors: ackValidator.errors
          };
          capturedAck = null;
        }
        if (publishCapturedAck) {
          const ackTopic = `${ackTopicPrefix}${message.device_id || ""}`;
          if (!capturedAck) {
            ackPublish = {
              published: false,
              topic: ackTopic,
              reason: "no-standard-ack-found-in-capture"
            };
          } else {
            await mqttPublish(client, ackTopic, JSON.stringify(capturedAck));
            ackPublish = {
              published: true,
              topic: ackTopic,
              ack: capturedAck
            };
          }
        }
      } else {
        sinkResult = {
          mode: "file",
          outFile: path.relative(repoRoot, outFile).replace(/\\/g, "/")
        };
      }

      const report = {
        generatedAt: new Date().toISOString(),
        conclusion:
          sink === "uart-com" && sinkResult && sinkResult.capture && Number(sinkResult.capture.bytes || 0) > 0
            ? "mqtt-command-received-and-forwarded-to-uart-com-with-live-capture"
            : "mqtt-command-received-and-converted-into-uart-ready-relay-plan",
        mqttUrl,
        topic,
        sink,
        readAfterWriteSeconds: Number.isFinite(readAfterWriteSeconds) && readAfterWriteSeconds > 0 ? readAfterWriteSeconds : null,
        payloadFile: path.relative(repoRoot, payloadFile).replace(/\\/g, "/"),
        publishCapturedAck,
        command: {
          commandId: message.command_id || null,
          deviceId: message.device_id || null,
          commandType: message.command_type || null
        },
        plan,
        sinkResult,
        capturedAck,
        ackPublish
      };

      fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n", "utf8");
      client.removeAllListeners();
      client.end(true);
      resolve(report);
    });

    client.on("error", (err) => {
      clearInterval(timer);
      client.end(true);
      reject(err);
    });
  });

  return result;
}

main()
  .then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n");
    process.exit(1);
  });
