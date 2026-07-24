#!/usr/bin/env node

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const mqtt = require("mqtt");

const FORMAL_FIELD_DEVICE_IDS = new Set([
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003"
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usage() {
  return [
    "Usage: node scripts/load/telemetry-pipeline-stress.cjs [options]",
    "",
    "Options:",
    "  --count <n>          Messages to publish (default: 10000)",
    "  --rate <n>           Target messages/second, 0 means unlimited (default: 500)",
    "  --concurrency <n>    Maximum QoS 1 publishes in flight (default: 256)",
    "  --device-id <uuid>   Dedicated non-production load-test device UUID",
    "  --start-seq <n>      First sequence number (default: 1)",
    "  --run-id <value>     Stable run label (default: generated)",
    "  --dry-run            Validate configuration and print one payload without connecting",
    "  --help               Show this help",
    "",
    "Environment:",
    "  STRESS_MQTT_URL or MQTT_URL",
    "  STRESS_MQTT_USERNAME or MQTT_USERNAME",
    "  STRESS_MQTT_PASSWORD or MQTT_PASSWORD"
  ].join("\n");
}

function parsePositiveInteger(value, name, { allowZero = false } = {}) {
  const parsed = Number(value);
  const valid = Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
  if (!valid) throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  return parsed;
}

function parseArgs(argv) {
  const options = {
    count: 10_000,
    rate: 500,
    concurrency: 256,
    deviceId: process.env.STRESS_DEVICE_ID ?? "",
    startSeq: 1,
    runId: process.env.STRESS_RUN_ID ?? `stress-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const takeValue = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[i];
    };

    if (arg === "--count") options.count = parsePositiveInteger(takeValue(), "count");
    else if (arg === "--rate") options.rate = parsePositiveInteger(takeValue(), "rate", { allowZero: true });
    else if (arg === "--concurrency") options.concurrency = parsePositiveInteger(takeValue(), "concurrency");
    else if (arg === "--device-id") options.deviceId = takeValue();
    else if (arg === "--start-seq") options.startSeq = parsePositiveInteger(takeValue(), "start-seq", { allowZero: true });
    else if (arg === "--run-id") options.runId = takeValue();
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help") options.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }

  if (options.help) return options;
  if (!UUID_PATTERN.test(options.deviceId)) throw new Error("device-id must be a UUID");
  if (FORMAL_FIELD_DEVICE_IDS.has(options.deviceId.toLowerCase())) {
    throw new Error("refusing to use a formal A/B/C device UUID for load testing");
  }
  if (options.count > 1_000_000) throw new Error("count exceeds the one-run safety limit of 1,000,000 messages");
  if (options.rate > 100_000) throw new Error("rate exceeds the safety limit of 100,000 messages/second");
  if (options.concurrency > 10_000) throw new Error("concurrency exceeds the safety limit of 10,000");
  if (!options.runId || options.runId.length > 80) throw new Error("run-id must contain 1 to 80 characters");
  return options;
}

function buildTelemetryEnvelope(options, sequence) {
  const phase = sequence % 100;
  return {
    schema_version: 1,
    device_id: options.deviceId,
    event_ts: new Date().toISOString(),
    seq: sequence,
    metrics: {
      temperature_c: 24 + phase / 100,
      humidity_pct: 55 + phase / 200,
      soil_temperature_c: 23 + phase / 100,
      soil_moisture_pct: 35 + phase / 100,
      electrical_conductivity_us_cm: 420 + phase,
      tilt_x_deg: 0.1 + phase / 10_000,
      tilt_y_deg: 0.2 + phase / 10_000,
      tilt_z_deg: 0.05 + phase / 10_000,
      gps_latitude: 24.437 + phase / 1_000_000,
      gps_longitude: 118.097 + phase / 1_000_000,
      warning_flag: false
    },
    meta: {
      load_test: true,
      load_test_run: options.runId,
      source: "telemetry-pipeline-stress"
    }
  };
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1));
  return Number(ordered[index].toFixed(2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectClient(url, username, password, runId) {
  const client = mqtt.connect(url, {
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 15_000,
    clientId: `lsmv2-stress-${runId}-${crypto.randomBytes(3).toString("hex")}`.slice(0, 120),
    ...(username ? { username } : {}),
    ...(password ? { password } : {})
  });

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      client.end(true);
      reject(error);
    };
    client.once("error", onError);
    client.once("connect", () => {
      client.off("error", onError);
      resolve(client);
    });
  });
}

async function publishLoad(options, env = process.env) {
  const mqttUrl = env.STRESS_MQTT_URL ?? env.MQTT_URL;
  const username = env.STRESS_MQTT_USERNAME ?? env.MQTT_USERNAME;
  const password = env.STRESS_MQTT_PASSWORD ?? env.MQTT_PASSWORD;
  if (!mqttUrl) throw new Error("STRESS_MQTT_URL or MQTT_URL is required");

  const client = await connectClient(mqttUrl, username, password, options.runId);
  const topic = `telemetry/${options.deviceId}`;
  const latenciesMs = [];
  const errors = [];
  const inFlight = new Set();
  let acknowledged = 0;
  let failed = 0;
  const startedAt = performance.now();
  client.on("error", (error) => {
    if (errors.length < 10) errors.push(error instanceof Error ? error.message : String(error));
  });

  const publishOne = async (index) => {
    const sequence = options.startSeq + index;
    const payload = JSON.stringify(buildTelemetryEnvelope(options, sequence));
    const publishStartedAt = performance.now();
    await new Promise((resolve, reject) => {
      client.publish(topic, payload, { qos: 1, retain: false }, (error) => (error ? reject(error) : resolve()));
    });
    latenciesMs.push(performance.now() - publishStartedAt);
    acknowledged += 1;
  };

  try {
    for (let index = 0; index < options.count; index += 1) {
      if (options.rate > 0) {
        const targetAt = startedAt + (index * 1000) / options.rate;
        const delayMs = targetAt - performance.now();
        if (delayMs > 1) await sleep(delayMs);
      }

      while (inFlight.size >= options.concurrency) await Promise.race(inFlight);
      let task;
      task = publishOne(index)
        .catch((error) => {
          failed += 1;
          if (errors.length < 10) errors.push(error instanceof Error ? error.message : String(error));
        })
        .finally(() => inFlight.delete(task));
      inFlight.add(task);

      if ((index + 1) % 5000 === 0) {
        const elapsedS = (performance.now() - startedAt) / 1000;
        process.stderr.write(
          `${JSON.stringify({ progress: index + 1, acknowledged, failed, inFlight: inFlight.size, elapsedS: Number(elapsedS.toFixed(2)) })}\n`
        );
      }
    }

    await Promise.all(inFlight);
  } finally {
    await new Promise((resolve) => client.end(false, {}, resolve));
  }

  const durationMs = performance.now() - startedAt;
  const maxLatencyMs = latenciesMs.reduce((maximum, value) => Math.max(maximum, value), 0);
  return {
    runId: options.runId,
    deviceId: options.deviceId,
    topic,
    requested: options.count,
    acknowledged,
    failed,
    startSeq: options.startSeq,
    endSeq: options.startSeq + options.count - 1,
    targetRateMessagesPerSecond: options.rate,
    concurrency: options.concurrency,
    durationMs: Number(durationMs.toFixed(2)),
    achievedRateMessagesPerSecond: Number(((acknowledged * 1000) / durationMs).toFixed(2)),
    publishAckLatencyMs: {
      p50: percentile(latenciesMs, 0.5),
      p95: percentile(latenciesMs, 0.95),
      p99: percentile(latenciesMs, 0.99),
      max: latenciesMs.length ? Number(maxLatencyMs.toFixed(2)) : null
    },
    errors
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.dryRun) {
    const payload = buildTelemetryEnvelope(options, options.startSeq);
    console.log(JSON.stringify({ options, payload, payloadBytes: Buffer.byteLength(JSON.stringify(payload), "utf8") }, null, 2));
    return;
  }

  const result = await publishLoad(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0 || result.acknowledged !== result.requested) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  FORMAL_FIELD_DEVICE_IDS,
  buildTelemetryEnvelope,
  parseArgs,
  percentile
};
