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

async function loadCommandValidator(repoRoot) {
  if (!loadAndCompileSchema) return null;
  const schemaPath = path.join(repoRoot, "docs", "integrations", "mqtt", "schemas", "device-command.v1.schema.json");
  return loadAndCompileSchema(schemaPath);
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

    client.on("message", (_topic, payloadBuf) => {
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
        command: {
          commandId: message.command_id || null,
          deviceId: message.device_id || null,
          commandType: message.command_type || null
        },
        plan,
        sinkResult
      };

      fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n", "utf8");
      client.end(true);
      resolve(report);
    });

    client.on("error", (err) => {
      clearInterval(timer);
      client.end(true);
      reject(err);
    });
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
