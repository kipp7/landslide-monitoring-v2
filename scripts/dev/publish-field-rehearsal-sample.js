const fs = require("node:fs");
const path = require("node:path");
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

async function loadTelemetryValidator(repoRoot) {
  if (!loadAndCompileSchema) return null;
  const schemaPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "telemetry-envelope.v1.schema.json"
  );
  return loadAndCompileSchema(schemaPath);
}

async function publishMqtt(mqttUrl, topic, payload, username, password) {
  await new Promise((resolve, reject) => {
    const client = mqtt.connect(mqttUrl, {
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      ...(username && password ? { username, password } : {})
    });

    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error(`MQTT connect timeout: ${mqttUrl}`));
    }, 12_000);

    client.on("connect", () => {
      clearTimeout(timer);
      client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
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
}

async function publishHttp(httpUrl, payload, token) {
  const body = {
    deviceId: payload.device_id,
    ...(payload.event_ts ? { eventTs: payload.event_ts } : {}),
    ...(payload.seq !== undefined && payload.seq !== null ? { seq: payload.seq } : {}),
    metrics: payload.metrics,
    ...(payload.meta ? { meta: payload.meta } : {})
  };

  const headers = {
    "content-type": "application/json"
  };
  if (token) headers["x-iot-token"] = token;

  const resp = await fetch(httpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }

  return text;
}

async function main() {
  const repoRoot = process.cwd();
  const sampleName = requireArg("sample");
  const mode = getArg("mode", "mqtt").toLowerCase();
  const samplePath = path.join(
    repoRoot,
    "docs",
    "tools",
    "field-rehearsal",
    "payload-samples",
    sampleName.endsWith(".json") ? sampleName : `${sampleName}.json`
  );

  if (!fs.existsSync(samplePath)) {
    console.error(`Sample not found: ${samplePath}`);
    process.exit(2);
  }

  const payload = JSON.parse(fs.readFileSync(samplePath, "utf8"));
  const validator = await loadTelemetryValidator(repoRoot);
  if (validator) {
    if (!validator.validate(payload)) {
      console.error("sample schema validation failed:", JSON.stringify(validator.errors));
      process.exit(2);
      return;
    }
  } else {
    if (payload.schema_version !== 1 || !payload.device_id || !payload.metrics || typeof payload.metrics !== "object") {
      console.error("minimal payload validation failed");
      process.exit(2);
      return;
    }
  }

  if (mode === "mqtt") {
    const mqttUrl = getArg("mqtt", process.env.MQTT_URL || "mqtt://127.0.0.1:1883");
    const username = getArg("username", process.env.MQTT_USERNAME);
    const password = getArg("password", process.env.MQTT_PASSWORD);
    const topic = getArg("topic", `telemetry/${payload.device_id}`);

    await publishMqtt(mqttUrl, topic, payload, username, password);
    console.log(
      JSON.stringify(
        {
          mode: "mqtt",
          sample: path.basename(samplePath),
          topic,
          mqttUrl,
          bytes: Buffer.byteLength(JSON.stringify(payload), "utf8")
        },
        null,
        2
      )
    );
    return;
  }

  if (mode === "http") {
    const httpUrl = getArg("http", "http://127.0.0.1:8091/iot/huawei/telemetry");
    const token = getArg("token", process.env.IOT_HTTP_TOKEN);
    const responseText = await publishHttp(httpUrl, payload, token);
    console.log(
      JSON.stringify(
        {
          mode: "http",
          sample: path.basename(samplePath),
          httpUrl,
          bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
          response: responseText
        },
        null,
        2
      )
    );
    return;
  }

  console.error(`Unsupported mode: ${mode}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
