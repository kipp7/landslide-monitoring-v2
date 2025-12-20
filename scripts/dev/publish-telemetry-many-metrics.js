/*
  Dev helper: publish a TelemetryEnvelope v1 message with many metrics keys.

  Usage (PowerShell):
    node scripts/dev/publish-telemetry-many-metrics.js `
      --mqtt mqtt://localhost:1883 `
      --device <deviceId> `
      --count 600 `
      --username <deviceId> `
      --password <deviceSecret>
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

const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://localhost:1883");
const username = getArg("username", process.env.MQTT_USERNAME);
const password = getArg("password", process.env.MQTT_PASSWORD);
const deviceId = requireArg("device");
const topic = getArg("topic", `telemetry/${deviceId}`);
const count = Number(getArg("count", "600"));

if (!Number.isFinite(count) || count <= 0 || count > 50000) {
  console.error("Invalid --count (1..50000)");
  process.exit(2);
}

const metrics = {};
for (let i = 0; i < count; i += 1) {
  metrics[`m_${i}`] = i;
}

const payload = {
  schema_version: 1,
  device_id: deviceId,
  event_ts: new Date().toISOString(),
  seq: 1,
  metrics,
  meta: { note: "many_metrics" }
};

const client = mqtt.connect(mqttUrl, {
  ...(username && password ? { username, password } : {})
});

client.on("connect", () => {
  client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) {
      console.error("publish failed:", err);
      process.exitCode = 1;
    } else {
      console.log(`published to ${topic} (metrics=${count})`);
    }
    client.end(true);
  });
});

client.on("error", (err) => {
  console.error("mqtt error:", err);
  process.exitCode = 1;
  client.end(true);
});

