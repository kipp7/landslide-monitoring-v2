/*
  Dev helper: subscribe to cmd/{deviceId} and wait for a command message.

  Usage (PowerShell):
    node scripts/dev/wait-for-command.js `
      --mqtt mqtt://localhost:1883 `
      --device <deviceId> `
      --username <deviceId> `
      --password <deviceSecret> `
      --timeout 30
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
const topic = getArg("topic", `cmd/${deviceId}`);
const timeoutSeconds = Number(getArg("timeout", "30"));
const commandId = getArg("commandId");

const deadline = Date.now() + (Number.isFinite(timeoutSeconds) ? timeoutSeconds : 30) * 1000;

let validateCommand = null;

const timer = setInterval(() => {
  if (Date.now() > deadline) {
    console.error(`timeout waiting for command on ${topic}`);
    process.exitCode = 1;
    clearInterval(timer);
    client.end(true);
  }
}, 250);

async function main() {
  const schemaPath = path.resolve(
    process.cwd(),
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "device-command.v1.schema.json"
  );
  const v = await loadAndCompileSchema(schemaPath);
  validateCommand = v;

  const client = mqtt.connect(mqttUrl, {
    ...(username && password ? { username, password } : {})
  });

  client.on("connect", () => {
    client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        console.error("subscribe failed:", err);
        process.exitCode = 1;
        clearInterval(timer);
        client.end(true);
        return;
      }
      console.log(`subscribed: ${topic}`);
    });
  });

  client.on("message", (_topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString("utf-8"));
      if (commandId && msg.command_id !== commandId) return;
      if (validateCommand && !validateCommand.validate(msg)) {
        console.error("command schema validation failed:", JSON.stringify(validateCommand.errors));
        process.exitCode = 1;
        clearInterval(timer);
        client.end(true);
        return;
      }
      console.log("received:", JSON.stringify(msg));
      clearInterval(timer);
      client.end(true);
    } catch (err) {
      console.error("invalid json:", err);
      process.exitCode = 1;
      clearInterval(timer);
      client.end(true);
    }
  });

  client.on("error", (err) => {
    console.error("mqtt error:", err);
    process.exitCode = 1;
    clearInterval(timer);
    client.end(true);
  });
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exitCode = 1;
});
