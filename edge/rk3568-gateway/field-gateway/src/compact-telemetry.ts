export const COMPACT_TELEMETRY_V1_BYTES = 46;

const VALID_TEMPERATURE = 1 << 0;
const VALID_SOIL = 1 << 1;
const VALID_SOIL_EC = 1 << 2;
const VALID_TILT = 1 << 3;
const VALID_GPS = 1 << 4;
const VALID_RAIN = 1 << 5;
const VALID_IMU = 1 << 6;

const DEVICE_IDS = [
  "",
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003"
] as const;

export type CompactTelemetryV1 = {
  schema_version: 1;
  device_id: string;
  event_ts: null;
  seq: number;
  metrics: Record<string, number | boolean>;
  meta: Record<string, unknown> & {
    last_command_tag: number;
  };
};

export function compactCommandTag(command: string): number {
  let value = 2166136261;
  for (const byte of Buffer.from(command, "ascii")) {
    value ^= byte;
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value >>> 0;
}

export function buildCompactBroadcastPollCommand(nonce: string): { command: string; commandTag: number } {
  const normalizedNonce = nonce.toUpperCase();
  if (!/^[0-9A-F]{8}$/u.test(normalizedNonce)) {
    throw new Error("compact broadcast nonce must contain exactly 8 hexadecimal characters");
  }

  const command = `P1${normalizedNonce}`;
  return { command, commandTag: compactCommandTag(command) };
}

export function isCompactTelemetryV1(payload: Buffer): boolean {
  return (
    payload.length === COMPACT_TELEMETRY_V1_BYTES &&
    payload.readUInt8(0) === 0x4c &&
    payload.readUInt8(1) === 0x53 &&
    payload.readUInt8(2) === 0x01
  );
}

export function decodeCompactTelemetryV1(payload: Buffer): CompactTelemetryV1 {
  if (!isCompactTelemetryV1(payload)) {
    throw new Error(
      `compact telemetry v1 signature mismatch: expected=${String(COMPACT_TELEMETRY_V1_BYTES)} bytes`
    );
  }

  const nodeNumber = payload.readUInt8(3);
  const deviceId = DEVICE_IDS[nodeNumber];
  if (!deviceId) {
    throw new Error(`compact telemetry node out of range: ${String(nodeNumber)}`);
  }

  const nodeLabel = String.fromCharCode("A".charCodeAt(0) + nodeNumber - 1);
  const statusFlags = payload.readUInt8(4);
  const triggerCode = payload.readUInt8(5);
  const valid = payload.readUInt16BE(6);
  const metrics: Record<string, number | boolean> = {};

  if ((valid & VALID_TEMPERATURE) !== 0) {
    metrics.temperature_c = payload.readInt16BE(20) / 100;
    metrics.humidity_pct = payload.readUInt16BE(22) / 100;
  }
  if ((valid & VALID_SOIL) !== 0) {
    metrics.soil_temperature_c = payload.readInt16BE(24) / 100;
    metrics.soil_moisture_pct = payload.readUInt16BE(26) / 100;
  }
  if ((valid & VALID_SOIL_EC) !== 0) {
    metrics.electrical_conductivity_us_cm = payload.readUInt16BE(28);
  }
  if ((valid & VALID_TILT) !== 0) {
    metrics.tilt_x_deg = payload.readInt16BE(30) / 100;
    metrics.tilt_y_deg = payload.readInt16BE(32) / 100;
    metrics.tilt_z_deg = payload.readInt16BE(34) / 100;
    metrics.warning_flag = (statusFlags & 1) !== 0;
  }
  if ((valid & VALID_GPS) !== 0) {
    metrics.gps_latitude = payload.readInt32BE(36) / 1_000_000;
    metrics.gps_longitude = payload.readInt32BE(40) / 1_000_000;
  }
  if ((valid & VALID_RAIN) !== 0) {
    metrics.rain_total_mm = payload.readUInt16BE(44) / 10;
  }

  const uploadTrigger =
    triggerCode === 1 ? "periodic" : triggerCode === 2 ? "manual_collect" : triggerCode === 3 ? "scheduler_poll" : "unknown";

  return {
    schema_version: 1,
    device_id: deviceId,
    event_ts: null,
    seq: payload.readUInt32BE(8),
    metrics,
    meta: {
      install_label: `FIELD-NODE-${nodeLabel}`,
      legacy_node: nodeLabel,
      uptime_s: payload.readUInt32BE(12),
      last_command_tag: payload.readUInt32BE(16),
      upload_trigger: uploadTrigger,
      compact_payload_version: 1,
      legacy_valid_flags: {
        temp_ok: Number((valid & VALID_TEMPERATURE) !== 0),
        imu_ok: Number((valid & VALID_IMU) !== 0),
        gps_ok: Number((valid & VALID_GPS) !== 0),
        soil_ok: Number((valid & VALID_SOIL) !== 0),
        soil_ec_ok: Number((valid & VALID_SOIL_EC) !== 0),
        tilt_ok: Number((valid & VALID_TILT) !== 0),
        rain_ok: Number((valid & VALID_RAIN) !== 0)
      }
    }
  };
}
