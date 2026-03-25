const fs = require("node:fs");
const path = require("node:path");

let loadAndCompileSchema = null;
try {
  ({ loadAndCompileSchema } = require("@lsmv2/validation"));
} catch {}

function getArg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function buildLegacyPayload(nodeId, seq, uptimeSec) {
  return {
    node: nodeId,
    seq,
    uptime: uptimeSec,
    temp: 25.6,
    humi: 61.2,
    temp_ok: 1,
    ax: 0.05,
    ay: 0.09,
    az: 1.01,
    gx: 0.4,
    gy: -0.2,
    gz: 0.1,
    tilt_x: 3.2,
    tilt_y: 1.4,
    imu_ok: 1,
    lat: 22.543012,
    lon: 114.057923,
    gps_ok: 1,
    bat: 83,
    warn: 0
  };
}

function mapLegacyPayloadToTelemetryEnvelope(payload, deviceId, eventTs) {
  const metrics = {};

  if (payload.temp_ok) {
    metrics.temperature_c = payload.temp;
    metrics.humidity_pct = payload.humi;
  }

  if (payload.imu_ok) {
    metrics.accel_x_g = payload.ax;
    metrics.accel_y_g = payload.ay;
    metrics.accel_z_g = payload.az;
    metrics.gyro_x_dps = payload.gx;
    metrics.gyro_y_dps = payload.gy;
    metrics.gyro_z_dps = payload.gz;
    metrics.tilt_x_deg = payload.tilt_x;
    metrics.tilt_y_deg = payload.tilt_y;
  }

  if (payload.gps_ok) {
    metrics.gps_latitude = payload.lat;
    metrics.gps_longitude = payload.lon;
  }

  metrics.battery_pct = payload.bat;
  metrics.warning_flag = Boolean(payload.warn);

  return {
    schema_version: 1,
    device_id: deviceId,
    event_ts: eventTs,
    seq: payload.seq,
    metrics,
    meta: {
      source: "hardware_stable_version_adapter_sim",
      legacy_node: payload.node,
      uptime_s: payload.uptime,
      legacy_valid_flags: {
        temp_ok: payload.temp_ok,
        imu_ok: payload.imu_ok,
        gps_ok: payload.gps_ok
      }
    }
  };
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

async function main() {
  const repoRoot = process.cwd();
  const nodeId = getArg("nodeId", "A");
  const deviceId = getArg("deviceId", "00000000-0000-0000-0000-000000000001");
  const seq = Number(getArg("seq", "1"));
  const uptimeSec = Number(getArg("uptimeSec", "30"));
  const outFile = getArg("outFile");
  const eventTs = nowIso();

  const legacyPayload = buildLegacyPayload(nodeId, seq, uptimeSec);
  const mappedTelemetryEnvelope = mapLegacyPayloadToTelemetryEnvelope(legacyPayload, deviceId, eventTs);

  let schemaValid = null;
  let schemaErrors = [];
  const validator = await loadTelemetryValidator(repoRoot);
  if (validator) {
    schemaValid = Boolean(validator.validate(mappedTelemetryEnvelope));
    schemaErrors = validator.errors ?? [];
  }

  const report = {
    generatedAt: eventTs,
    conclusion: "hardware-stable-version-legacy-payload-can-be-adapted-to-platform-telemetry-envelope-in-software",
    legacyPayload,
    mappedTelemetryEnvelope,
    schemaValidation: {
      available: Boolean(validator),
      valid: schemaValid,
      errors: schemaErrors
    },
    identifiedGaps: [
      "legacy payload still uses node instead of device_id as the primary identity",
      "legacy payload is still flat JSON and needs mapping into metrics/meta structure",
      "legacy string ACK/OK is only a transport-level ack and does not satisfy cmd_ack/{device_id} platform command receipt requirements",
      "GPS/UART current truth is not fully frozen across code and hardware docs"
    ],
    suggestedFirmwareChanges: [
      "replace node with a provisioned device_id/device_secret identity package",
      "emit TelemetryEnvelope v1 directly or make the gateway perform a deterministic legacy->envelope conversion",
      "move temp/humi/lat/lon/bat/warn to canonical metrics keys such as temperature_c, humidity_pct, gps_latitude, gps_longitude, battery_pct, warning_flag",
      "treat ACK/OK as link ack only and emit standard cmd_ack/{device_id} payloads for platform command receipts",
      "freeze one final GPS UART mapping and update code plus docs to the same source of truth"
    ]
  };

  const text = JSON.stringify(report, null, 2);
  if (outFile) {
    const target = path.resolve(outFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text + "\n", "utf8");
  }
  console.log(text);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
