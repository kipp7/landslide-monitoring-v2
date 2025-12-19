/*
  Dev helper: publish a single DeviceCommandAck v1 message to MQTT.

  Usage (PowerShell):
    node scripts/dev/publish-command-ack.js `
      --mqtt mqtt://localhost:1883 `
      --device <deviceId> `
      --commandId <commandId> `
      --username <deviceId> `
      --password <deviceSecret> `
      --status acked
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
const commandId = requireArg("commandId");
const status = getArg("status", "acked");
const topic = getArg("topic", `cmd_ack/${deviceId}`);
const resultJson = getArg("result");

let result = undefined;
if (resultJson) {
  try {
    result = JSON.parse(resultJson);
  } catch (err) {
    console.error("invalid --result json:", err);
    process.exit(2);
  }
}

const payload = {
  schema_version: 1,
  command_id: commandId,
  device_id: deviceId,
  ack_ts: new Date().toISOString(),
  status: status === "failed" ? "failed" : "acked",
  ...(result ? { result } : {})
};

async function main() {
  const schemaPath = path.resolve(
    process.cwd(),
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "device-command-ack.v1.schema.json"
  );
  const validator = await loadAndCompileSchema(schemaPath);
  if (!validator.validate(payload)) {
    console.error("ack schema validation failed:", JSON.stringify(validator.errors));
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
        console.log(`published ack to ${topic}`);
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
