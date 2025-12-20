/*
  Dev helper: publish a raw payload string to MQTT.

  Usage (PowerShell):
    node scripts/dev/publish-raw-mqtt.js `
      --mqtt mqtt://localhost:1883 `
      --topic telemetry/<deviceId> `
      --payload "{"
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
const topic = requireArg("topic");
const payloadArg = getArg("payload");
const payloadSize = Number(getArg("payloadSize", ""));
const username = getArg("username", process.env.MQTT_USERNAME);
const password = getArg("password", process.env.MQTT_PASSWORD);
const qos = Number(getArg("qos", "1"));

let payload = payloadArg;
if (!payload) {
  if (!Number.isFinite(payloadSize) || payloadSize <= 0) {
    console.error("Missing required arg: --payload (or provide --payloadSize)");
    process.exit(2);
  }
  // Generate a large payload without putting it into the CLI args (Windows has cmdline length limits).
  payload = "a".repeat(payloadSize);
}

const client = mqtt.connect(mqttUrl, {
  ...(username && password ? { username, password } : {})
});

client.on("connect", () => {
  client.publish(topic, payload, { qos: Number.isFinite(qos) ? qos : 1 }, (err) => {
    if (err) {
      console.error("publish failed:", err);
      process.exitCode = 1;
    } else {
      console.log(`published to ${topic}`);
    }
    client.end(true);
  });
});

client.on("error", (err) => {
  console.error("mqtt error:", err);
  process.exitCode = 1;
  client.end(true);
});
