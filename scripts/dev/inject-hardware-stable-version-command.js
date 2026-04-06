const fs = require("node:fs");
const path = require("node:path");
const mqtt = require("mqtt");

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

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function chunkString(input, size) {
  const chunks = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

function findSample(report, sampleName) {
  const normalized = sampleName.trim().toLowerCase();
  const aligned = report.alignedSamples ?? [];
  const mismatch = report.mismatchSample ?? null;

  for (const sample of aligned) {
    const aliases = new Set([
      String(sample.commandType || "").toLowerCase(),
      String(sample.fileName || "").toLowerCase(),
      String(sample.fileName || "")
        .replace(/\.pretty\.json$/i, "")
        .toLowerCase()
    ]);
    if (aliases.has(normalized)) {
      return { ...sample, sampleKind: "aligned" };
    }
  }

  if (mismatch) {
    const aliases = new Set([
      "mismatch",
      "mismatched_manual_collect",
      "manual_collect.mismatched-device",
      String(mismatch.fileName || "").toLowerCase(),
      String(mismatch.fileName || "")
        .replace(/\.pretty\.json$/i, "")
        .toLowerCase()
    ]);
    if (aliases.has(normalized)) {
      return {
        ...mismatch,
        commandType: mismatch.command?.command_type || "manual_collect",
        suggestedChunks80: chunkString(JSON.stringify(mismatch.command, null, 2), 80),
        sampleKind: "mismatch"
      };
    }
  }

  throw new Error(`Unknown sample: ${sampleName}`);
}

function resolveChunkStrategy(sample, chunkStrategy, chunkSize) {
  if (chunkStrategy === "whole") {
    return {
      strategy: "whole",
      chunkSize: null
    };
  }

  if (chunkStrategy === "fixed") {
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
      throw new Error("chunkStrategy=fixed requires --chunkSize > 0");
    }
    return {
      strategy: "fixed",
      chunkSize
    };
  }

  return {
    strategy: "suggested",
    chunkSize: Number.isFinite(chunkSize) && chunkSize > 0 ? chunkSize : 80
  };
}

function buildChunks(sampleText, sample, chunkStrategy, chunkSize, ackPrefix) {
  const strategy = resolveChunkStrategy(sample, chunkStrategy, chunkSize);
  let chunks;

  if (strategy.strategy === "whole") {
    chunks = [sampleText];
  } else if (strategy.strategy === "fixed") {
    chunks = chunkString(sampleText, strategy.chunkSize);
  } else if (Array.isArray(sample.suggestedChunks80) && sample.suggestedChunks80.length > 0) {
    chunks = [...sample.suggestedChunks80];
  } else {
    chunks = chunkString(sampleText, strategy.chunkSize);
  }

  if (ackPrefix === "ack" || ackPrefix === "ok") {
    const prefix = ackPrefix === "ack" ? "ACK\r\n" : "OK\r\n";
    chunks[0] = prefix + (chunks[0] || "");
  }

  return {
    chunks,
    chunkStrategy: strategy.strategy,
    chunkSize: strategy.chunkSize
  };
}

function buildPlan(repoRoot, sampleName) {
  const payloadFileArg = getArg("payloadFile");
  const payloadLabel = getArg("payloadLabel", sampleName || "payload-file");

  if (payloadFileArg) {
    const payloadPath = path.isAbsolute(payloadFileArg) ? payloadFileArg : path.join(repoRoot, payloadFileArg);
    if (!fs.existsSync(payloadPath)) {
      throw new Error(`Payload file not found: ${payloadPath}`);
    }

    const sampleText = readText(payloadPath).trimEnd();
    const command = JSON.parse(sampleText);
    const chunkStrategy = getArg("chunkStrategy", "suggested").toLowerCase();
    const chunkSize = Number(getArg("chunkSize", ""));
    const ackPrefix = getArg("ackPrefix", "none").toLowerCase();
    const interChunkDelayMs = Number(getArg("interChunkDelayMs", "0"));
    const syntheticSample = {
      suggestedChunks80: chunkString(sampleText, 80)
    };
    const chunkInfo = buildChunks(sampleText, syntheticSample, chunkStrategy, chunkSize, ackPrefix);
    const topic = getArg("topic", `cmd/${command.device_id}`);

    return {
      generatedAt: new Date().toISOString(),
      mode: "uart-plan",
      sample: payloadLabel,
      sampleKind: "runtime-payload",
      samplePath: path.relative(repoRoot, payloadPath).replace(/\\/g, "/"),
      commandType: command.command_type || null,
      commandId: command.command_id || null,
      deviceId: command.device_id || null,
      topic,
      payloadBytes: Buffer.byteLength(sampleText, "utf8"),
      chunkCount: chunkInfo.chunks.length,
      chunkStrategy: chunkInfo.chunkStrategy,
      chunkSize: chunkInfo.chunkSize,
      ackPrefix,
      interChunkDelayMs: Number.isFinite(interChunkDelayMs) && interChunkDelayMs >= 0 ? interChunkDelayMs : 0,
      chunks: chunkInfo.chunks,
      nextUse: [
        "use mode=mqtt with --payloadFile when you need a one-off runtime command without adding a new static sample",
        "use the PowerShell wrapper with -PayloadFile for uart-com relay execution against a Windows COM port",
        "switch chunkStrategy to whole when you want one write closer to a gateway-side serial send"
      ]
    };
  }

  if (!sampleName) {
    throw new Error("Missing required arg: --sample (or provide --payloadFile)");
  }

  const reportPath = path.join(
    repoRoot,
    "docs",
    "unified",
    "reports",
    "hardware-stable-version-gateway-command-samples-latest.json"
  );
  const report = readJson(reportPath);
  const sample = findSample(report, sampleName);
  const samplePath = path.join(
    repoRoot,
    "docs",
    "tools",
    "field-rehearsal",
    "payload-samples",
    "hardware-stable-version",
    sample.fileName
  );

  const sampleText = fs.readFileSync(samplePath, "utf8").trimEnd();
  const chunkStrategy = getArg("chunkStrategy", "suggested").toLowerCase();
  const chunkSize = Number(getArg("chunkSize", ""));
  const ackPrefix = getArg("ackPrefix", "none").toLowerCase();
  const interChunkDelayMs = Number(getArg("interChunkDelayMs", "0"));

  const chunkInfo = buildChunks(sampleText, sample, chunkStrategy, chunkSize, ackPrefix);
  const command = sample.command || {};
  const topic = getArg("topic", sample.topic || `cmd/${command.device_id}`);

  return {
    generatedAt: new Date().toISOString(),
    mode: "uart-plan",
    sample: sampleName,
    sampleKind: sample.sampleKind,
    samplePath: path.relative(repoRoot, samplePath).replace(/\\/g, "/"),
    commandType: sample.commandType || command.command_type || null,
    commandId: command.command_id || null,
    deviceId: command.device_id || null,
    topic,
    payloadBytes: Buffer.byteLength(sampleText, "utf8"),
    chunkCount: chunkInfo.chunks.length,
    chunkStrategy: chunkInfo.chunkStrategy,
    chunkSize: chunkInfo.chunkSize,
    ackPrefix,
    interChunkDelayMs: Number.isFinite(interChunkDelayMs) && interChunkDelayMs >= 0 ? interChunkDelayMs : 0,
    chunks: chunkInfo.chunks,
    nextUse: [
      "use mode=mqtt to publish the same pretty JSON to cmd/{device_id}",
      "use the PowerShell wrapper with -Mode uart-com to send these chunks to a Windows COM port",
      "switch chunkStrategy to whole when you want one write closer to a gateway-side serial send"
    ]
  };
}

async function publishMqtt(plan) {
  const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://127.0.0.1:1883");
  const username = getArg("username", process.env.MQTT_USERNAME);
  const password = getArg("password", process.env.MQTT_PASSWORD);
  const qos = Number(getArg("qos", "1"));
  const timeoutMs = Number(getArg("timeoutMs", "12000"));

  const payload = fs.readFileSync(path.resolve(process.cwd(), plan.samplePath), "utf8").trimEnd();

  await new Promise((resolve, reject) => {
    const client = mqtt.connect(mqttUrl, {
      reconnectPeriod: 0,
      connectTimeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000,
      ...(username && password ? { username, password } : {})
    });

    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error(`MQTT connect timeout: ${mqttUrl}`));
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs + 2000 : 14000);

    client.on("connect", () => {
      clearTimeout(timer);
      client.publish(plan.topic, payload, { qos: Number.isFinite(qos) ? qos : 1 }, (err) => {
        client.end(true);
        if (err) reject(err);
        else resolve();
      });
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      client.end(true);
      reject(err);
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: "mqtt",
    sample: plan.sample,
    sampleKind: plan.sampleKind,
    topic: plan.topic,
    mqttUrl,
    commandType: plan.commandType,
    commandId: plan.commandId,
    deviceId: plan.deviceId,
    payloadBytes: plan.payloadBytes
  };
}

async function main() {
  const repoRoot = process.cwd();
  const mode = getArg("mode", "uart-plan").toLowerCase();
  const sampleName = getArg("sample");
  const plan = buildPlan(repoRoot, sampleName);

  if (mode === "uart-plan") {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (mode === "mqtt") {
    const result = await publishMqtt(plan);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
