/*
  Dev helper: publish many TelemetryEnvelope v1 messages to MQTT and measure throughput.

  Example (PowerShell):
    node scripts/dev/telemetry-load-test.js `
      --mqtt mqtt://localhost:1883 `
      --device <deviceId> `
      --count 10000 `
      --qos 1 `
      --concurrency 50

  If MQTT auth is enabled (stage 1):
    node scripts/dev/telemetry-load-test.js `
      --mqtt mqtt://localhost:1883 `
      --device <deviceId> `
      --username <deviceId> `
      --password <deviceSecret> `
      --count 10000
*/

const mqtt = require("mqtt");

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

function nowMs() {
  return Date.now();
}

const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://localhost:1883");
const username = getArg("username", process.env.MQTT_USERNAME);
const password = getArg("password", process.env.MQTT_PASSWORD);
const deviceId = requireArg("device");
const topic = getArg("topic", `telemetry/${deviceId}`);
const count = Number(getArg("count", "1000"));
const qos = Number(getArg("qos", "1"));
const concurrency = Number(getArg("concurrency", "20"));
const metricsCount = Number(getArg("metricsCount", "5"));
const noteBytes = Number(getArg("noteBytes", "0"));

if (!Number.isFinite(count) || count <= 0) {
  console.error("Invalid --count");
  process.exit(2);
}
if (!Number.isFinite(concurrency) || concurrency <= 0 || concurrency > 5000) {
  console.error("Invalid --concurrency (1..5000)");
  process.exit(2);
}
if (!Number.isFinite(qos) || (qos !== 0 && qos !== 1)) {
  console.error("Invalid --qos (0 or 1)");
  process.exit(2);
}
if (!Number.isFinite(metricsCount) || metricsCount < 1 || metricsCount > 50000) {
  console.error("Invalid --metricsCount (1..50000)");
  process.exit(2);
}
if (!Number.isFinite(noteBytes) || noteBytes < 0 || noteBytes > 5_000_000) {
  console.error("Invalid --noteBytes (0..5000000)");
  process.exit(2);
}

const client = mqtt.connect(mqttUrl, {
  ...(username && password ? { username, password } : {})
});

let sent = 0;
let acked = 0;
let failed = 0;
let inFlight = 0;
let startedAtMs = 0;
let lastLogAtMs = 0;
let done = false;

function buildPayload(seq) {
  const metrics = {
    displacement_mm: 1.23,
    tilt_x_deg: 0.18,
    battery_v: 3.92,
    online: true
  };
  for (let i = 0; Object.keys(metrics).length < metricsCount; i += 1) {
    metrics[`m_${i}`] = i;
  }

  const note = noteBytes > 0 ? "x".repeat(noteBytes) : "load_test";

  return {
    schema_version: 1,
    device_id: deviceId,
    event_ts: new Date().toISOString(),
    seq,
    metrics,
    meta: { note }
  };
}

function logProgress(force) {
  const t = nowMs();
  if (!force && t - lastLogAtMs < 1000) return;
  lastLogAtMs = t;
  const elapsedS = Math.max(0.001, (t - startedAtMs) / 1000);
  const rate = Math.round(acked / elapsedS);
  console.log(
    `sent=${sent} acked=${acked} failed=${failed} inFlight=${inFlight} elapsed_s=${elapsedS.toFixed(
      1
    )} rate_ack_s=${rate}`
  );
}

function maybeDone() {
  if (done) return;
  if (acked + failed < count) return;
  done = true;
  logProgress(true);
  client.end(true);
  process.exitCode = failed > 0 ? 1 : 0;
}

function pump() {
  while (inFlight < concurrency && sent < count) {
    const seq = sent + 1;
    const payload = JSON.stringify(buildPayload(seq));
    sent += 1;
    inFlight += 1;

    client.publish(topic, payload, { qos }, (err) => {
      inFlight -= 1;
      if (err) failed += 1;
      else acked += 1;
      logProgress(false);
      maybeDone();
      if (!done) pump();
    });
  }
}

client.on("connect", () => {
  startedAtMs = nowMs();
  lastLogAtMs = startedAtMs;
  console.log(
    `connected mqtt=${mqttUrl} topic=${topic} qos=${qos} count=${count} concurrency=${concurrency} metricsCount=${metricsCount} noteBytes=${noteBytes}`
  );
  pump();
});

client.on("error", (err) => {
  console.error("mqtt error:", err);
  process.exitCode = 1;
  client.end(true);
});

setInterval(() => logProgress(false), 1000).unref();

