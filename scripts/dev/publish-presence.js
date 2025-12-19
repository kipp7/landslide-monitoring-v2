/*
  Dev helper: publish a single PresenceEvent v1 message to MQTT.

  Usage (PowerShell):
    node scripts/dev/publish-presence.js `
      --mqtt mqtt://localhost:1883 `
      --device 2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c `
      --status online `
      --username <deviceId> `
      --password <deviceSecret>
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

async function main() {
  const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://localhost:1883");
  const username = getArg("username", process.env.MQTT_USERNAME);
  const password = getArg("password", process.env.MQTT_PASSWORD);
  const deviceId = requireArg("device");
  const status = getArg("status", "online");
  const topic = getArg("topic", `presence/${deviceId}`);

  const payload = {
    schema_version: 1,
    device_id: deviceId,
    event_ts: new Date().toISOString(),
    status: status === "offline" ? "offline" : "online",
    meta: { fw: "dev", reason: "manual" }
  };

  const schemaPath = path.resolve(
    process.cwd(),
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "presence-event.v1.schema.json"
  );
  const validator = await loadAndCompileSchema(schemaPath);
  if (!validator.validate(payload)) {
    console.error("presence schema validation failed:", JSON.stringify(validator.errors));
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

