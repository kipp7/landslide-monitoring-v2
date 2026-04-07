const fs = require("node:fs");
const path = require("node:path");
const mqtt = require("mqtt");

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function assertOk(resp, text, step) {
  if (!resp.ok) {
    throw new Error(`${step} failed: HTTP ${resp.status} ${text}`);
  }
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { resp, text, json };
}

async function login(apiBaseUrl, username, password) {
  const { resp, text, json } = await fetchJson(`${apiBaseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assertOk(resp, text, "login");
  const token = json?.data?.token;
  if (!token) {
    throw new Error(`login missing token: ${text}`);
  }
  return token;
}

async function createReplayDevice(apiBaseUrl, token, installLabel) {
  const { resp, text, json } = await fetchJson(`${apiBaseUrl}/api/v1/devices`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      deviceName: `field-hardware-replay-${installLabel}`,
      deviceType: "multi_sensor",
      metadata: {
        note: "field_hardware_uplink_replay",
        install_label: installLabel
      }
    })
  });
  assertOk(resp, text, "create device");
  const data = json?.data;
  if (!data?.deviceId || !data?.deviceSecret) {
    throw new Error(`create device missing credentials: ${text}`);
  }
  return data;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildReplayPayload(sourcePayload, deviceId, sourceFile) {
  const payload = deepClone(sourcePayload);
  payload.device_id = deviceId;
  payload.meta = {
    ...(payload.meta || {}),
    replay_source: path.basename(sourceFile),
    replay_kind: "real_hardware_capture",
    replay_generated_at: nowIso()
  };
  return payload;
}

async function publishMqtt(mqttUrl, topic, payload, username, password) {
  await new Promise((resolve, reject) => {
    const client = mqtt.connect(mqttUrl, {
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      username,
      password
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

async function pollDeviceState(apiBaseUrl, token, deviceId, timeoutMs, pollMs) {
  const started = Date.now();
  const url = `${apiBaseUrl}/api/v1/data/state/${deviceId}`;
  const checks = [];

  while (Date.now() - started <= timeoutMs) {
    const { resp, text, json } = await fetchJson(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    const check = {
      at: nowIso(),
      ok: resp.ok,
      status: resp.status,
      hasState: Boolean(json?.data?.state),
      metricsKeys: Object.keys(json?.data?.state?.metrics || {}),
      bodyPreview: text.slice(0, 400)
    };
    checks.push(check);

    if (resp.ok && json?.data?.state?.metrics && Object.keys(json.data.state.metrics).length > 0) {
      return {
        success: true,
        url,
        checks,
        final: json
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    success: false,
    url,
    checks,
    final: null
  };
}

async function fetchAcceptanceSummary(apiBaseUrl, token, deviceId) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`
  };

  const targets = [
    `${apiBaseUrl}/health`,
    `${apiBaseUrl}/api/v1/system/status`,
    `${apiBaseUrl}/api/v1/devices?page=1&pageSize=20`,
    `${apiBaseUrl}/api/v1/data/state/${deviceId}`
  ];

  const results = [];
  for (const url of targets) {
    const { resp, text, json } = await fetchJson(url, { headers: url.includes("/api/") ? headers : { Accept: "application/json" } });
    results.push({
      url,
      ok: resp.ok,
      status: resp.status,
      json,
      bodyPreview: text.slice(0, 400)
    });
  }
  return results;
}

async function main() {
  const repoRoot = process.cwd();
  const apiBaseUrl = getArg("apiBaseUrl", "http://127.0.0.1:8080");
  const mqttUrl = getArg("mqttUrl", "mqtt://127.0.0.1:1883");
  const adminUser = getArg("username", "admin");
  const adminPass = getArg("password", "123456");
  const sourceFileArg = getArg(
    "payloadFile",
    "docs/tools/field-rehearsal/payload-samples/hf-hardware-real-20260406-seq21.json"
  );
  const sourceFile = path.resolve(repoRoot, sourceFileArg);
  const outFile = path.resolve(
    repoRoot,
    getArg("outFile", "docs/unified/reports/field-hardware-uplink-replay-latest.json")
  );
  const timeoutMs = Number(getArg("timeoutMs", "30000"));
  const pollMs = Number(getArg("pollMs", "2000"));
  const stamp = nowStamp();
  const installLabel = `REPLAY-HW-${stamp}`;

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Payload file not found: ${sourceFile}`);
  }

  const sourcePayload = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  const token = await login(apiBaseUrl, adminUser, adminPass);
  const device = await createReplayDevice(apiBaseUrl, token, installLabel);
  const replayPayload = buildReplayPayload(sourcePayload, device.deviceId, sourceFile);
  const topic = `telemetry/${device.deviceId}`;

  await publishMqtt(mqttUrl, topic, replayPayload, device.deviceId, device.deviceSecret);
  const statePoll = await pollDeviceState(apiBaseUrl, token, device.deviceId, timeoutMs, pollMs);
  const acceptance = await fetchAcceptanceSummary(apiBaseUrl, token, device.deviceId);

  const report = {
    generatedAt: nowIso(),
    mode: "field-hardware-uplink-replay",
    apiBaseUrl,
    mqttUrl,
    sourcePayloadFile: path.relative(repoRoot, sourceFile).replace(/\\/g, "/"),
    sourcePayloadDeviceId: sourcePayload.device_id || null,
    replayDevice: {
      deviceId: device.deviceId,
      installLabel,
      schemaVersion: device.schemaVersion || null,
      credVersion: device.credVersion || null
    },
    publish: {
      topic,
      bytes: Buffer.byteLength(JSON.stringify(replayPayload), "utf8"),
      seq: replayPayload.seq ?? null
    },
    statePoll,
    acceptance,
    conclusion: statePoll.success
      ? "real-hardware-uplink-replay-reached-platform-api-state"
      : "real-hardware-uplink-replay-published-but-api-state-not-yet-visible"
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report, null, 2));

  if (!statePoll.success) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

