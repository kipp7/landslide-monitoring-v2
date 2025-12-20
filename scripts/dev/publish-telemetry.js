/*
  Dev helper: publish a single TelemetryEnvelope v1 message to MQTT.

  Usage (PowerShell):
    node scripts/dev/publish-telemetry.js `
      --mqtt mqtt://localhost:1883 `
      --topic telemetry/2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c `
      --device 2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c
*/

const mqtt = require("mqtt");
const path = require("node:path");
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

const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://localhost:1883");
const username = getArg("username", process.env.MQTT_USERNAME);
const password = getArg("password", process.env.MQTT_PASSWORD);
const deviceId = requireArg("device");
const topic = getArg("topic", `telemetry/${deviceId}`);
const seq = Number(getArg("seq", "1"));

const payload = {
  schema_version: 1,
  device_id: deviceId,
  event_ts: new Date().toISOString(),
  seq: Number.isFinite(seq) ? seq : 1,
  metrics: {
    displacement_mm: 1.23,
    tilt_x_deg: 0.18,
    battery_v: 3.92,
    online: true,
    note: "smoke_test"
  },
  meta: {
    fw: "dev",
    sampling_s: 5
  }
};

async function main() {
  const schemaPath = path.resolve(
    process.cwd(),
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "telemetry-envelope.v1.schema.json"
  );
  const validator = await loadAndCompileSchema(schemaPath);
  if (!validator.validate(payload)) {
    console.error("telemetry schema validation failed:", JSON.stringify(validator.errors));
    process.exitCode = 2;
    return;
  }

  const client = mqtt.connect(mqttUrl, {
    ...(username && password ? { username, password } : {})
  });

  client.on("connect", () => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
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
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exitCode = 1;
});
