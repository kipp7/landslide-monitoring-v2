export const COMPACT_TELEMETRY_V1_BYTES = 46;
export const COMPACT_TELEMETRY_V2_BYTES = 46;
export const COMPACT_TELEMETRY_V3_BYTES = 95;
export const COMPACT_TELEMETRY_V4_BYTES = 139;
export const COMPACT_TELEMETRY_V5_BYTES = 110;
export const COMPACT_TELEMETRY_V6_BYTES = 46;

export type CompactTelemetryV6Scope = "core" | "environment" | "audit";

const VALID_TEMPERATURE = 1 << 0;
const VALID_SOIL = 1 << 1;
const VALID_SOIL_EC = 1 << 2;
const VALID_TILT = 1 << 3;
const VALID_GPS = 1 << 4;
const VALID_RAIN = 1 << 5;
const VALID_IMU = 1 << 6;
const VALID_BATTERY = 1 << 7;

const STATUS_WARNING = 1 << 0;
const STATUS_FIELD_SENSORS_SIMULATED = 1 << 1;
const STATUS_GNSS_SIMULATED = 1 << 2;
const V6_STATUS_RTK_TRUSTED = 1 << 3;

const V6_SCOPE_CORE = 1;
const V6_SCOPE_ENVIRONMENT = 2;
const V6_SCOPE_AUDIT = 3;
const V6_CORE_KNOWN_VALID_MASK = (1 << 9) - 1;
const V6_ENV_KNOWN_VALID_MASK = (1 << 6) - 1;
const V6_AUDIT_KNOWN_VALID_MASK = (1 << 5) - 1;

const V3_VALID_BATTERY = 1 << 0;
const V3_VALID_SOIL = 1 << 1;
const V3_VALID_SOIL_EC = 1 << 2;
const V3_VALID_TILT = 1 << 3;
const V3_VALID_GNSS_STATUS = 1 << 4;
const V3_VALID_GNSS_POSITION = 1 << 5;
const V3_VALID_GNSS_ALTITUDE = 1 << 6;
const V3_VALID_GNSS_TIME = 1 << 7;
const V3_VALID_CORRECTION_AGE = 1 << 8;
const V3_VALID_HDOP = 1 << 9;
const V3_VALID_GST = 1 << 10;
const V3_VALID_FIXED_STATS = 1 << 11;
const V3_VALID_STATION = 1 << 12;

const GNSS_FIX_TRUSTED = 1 << 1;
const GNSS_FIX_TIME_VALID = 1 << 2;
const GNSS_FIX_GST_VALID = 1 << 3;
const GNSS_FIX_CORRECTION_AGE_VALID = 1 << 5;
const GNSS_FIX_HDOP_VALID = 1 << 6;
const GNSS_FIX_ALTITUDE_VALID = 1 << 9;
const GNSS_FIX_GEOID_VALID = 1 << 10;
const GNSS_FIX_STATION_VALID = 1 << 11;
const GNSS_FIX_POSITION_VALID = 1 << 12;
const GNSS_FIX_FIXED_STATS_VALID = 1 << 13;
const GNSS_FIX_COORDINATE_FRAME_VALID = 1 << 14;
const V3_KNOWN_VALID_MASK = (1 << 13) - 1;
const V4_RTCM_KNOWN_STATE_MASK = 0x3f;
const V4_RTCM_MODE_DISABLED = 0;
const V4_RTCM_STATE_READY = 1 << 0;
const V4_RTCM_STATE_SESSION_ARMED = 1 << 1;
const V4_RTCM_STATE_LEASE_VALID = 1 << 2;
const V4_RTCM_STATE_FRAME_RECENT = 1 << 4;
const V4_AGE_UNAVAILABLE = 0xffff_ffff;
const V5_RTCM_KNOWN_ERROR_MASK = 0x1f;
const V5_RTCM_ERROR_REJECTED_FRAGMENT = 1 << 0;
const V5_RTCM_ERROR_CRC = 1 << 1;
const V5_RTCM_ERROR_QUEUE_DROP = 1 << 2;
const V5_RTCM_ERROR_UART = 1 << 3;
const V5_RTCM_INJECTED_COUNT_SATURATED = 1 << 4;
const V5_AGE_UNAVAILABLE = 0xffff;
const V5_LEASE_RESOLUTION_MS = 100;
const V5_COMPLETION_AGE_RESOLUTION_MS = 10;
const RTK_TRUST_MAX_CORRECTION_AGE_MS = 6000;
const RTK_TRUST_MAX_SOLUTION_AGE_MS = 2000;

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

export type CompactTelemetry = CompactTelemetryV1;

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

export function buildCompactTargetedPollCommand(
  nodeLabel: "A" | "B" | "C",
  nonce: string
): { command: string; commandTag: number } {
  const normalizedNonce = nonce.toUpperCase();
  if (!/^[0-9A-F]{8}$/u.test(normalizedNonce)) {
    throw new Error("compact targeted nonce must contain exactly 8 hexadecimal characters");
  }

  const command = `P2${nodeLabel}${normalizedNonce}`;
  return { command, commandTag: compactCommandTag(command) };
}

export function buildCompactScopedPollCommand(
  scope: Exclude<CompactTelemetryV6Scope, "core">,
  nodeLabel: "A" | "B" | "C",
  nonce: string
): { command: string; commandTag: number } {
  const normalizedNonce = nonce.toUpperCase();
  if (!/^[0-9A-F]{8}$/u.test(normalizedNonce)) {
    throw new Error("compact scoped nonce must contain exactly 8 hexadecimal characters");
  }
  const kind = scope === "environment" ? "3" : "4";
  const command = `P${kind}${nodeLabel}${normalizedNonce}`;
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

export function isCompactTelemetry(payload: Buffer): boolean {
  if (payload.length < 3 || payload.readUInt8(0) !== 0x4c || payload.readUInt8(1) !== 0x53) return false;
  const version = payload.readUInt8(2);
  return (version === 1 && payload.length === COMPACT_TELEMETRY_V1_BYTES) ||
    (version === 2 && payload.length === COMPACT_TELEMETRY_V2_BYTES) ||
    (version === 3 && payload.length === COMPACT_TELEMETRY_V3_BYTES) ||
    (version === 4 && payload.length === COMPACT_TELEMETRY_V4_BYTES) ||
    (version === 5 && payload.length === COMPACT_TELEMETRY_V5_BYTES) ||
    (version === 6 && payload.length === COMPACT_TELEMETRY_V6_BYTES);
}

function decodeNode(payload: Buffer): { deviceId: string; nodeLabel: string } {
  const nodeNumber = payload.readUInt8(3);
  const deviceId = DEVICE_IDS[nodeNumber];
  if (!deviceId) throw new Error(`compact telemetry node out of range: ${String(nodeNumber)}`);
  return {
    deviceId,
    nodeLabel: String.fromCharCode("A".charCodeAt(0) + nodeNumber - 1)
  };
}

function uploadTriggerName(triggerCode: number): string {
  return triggerCode === 1
    ? "periodic"
    : triggerCode === 2
      ? "manual_collect"
      : triggerCode === 3
        ? "scheduler_poll"
        : "unknown";
}

function coordinateFrameName(value: number): "CGCS2000" | "WGS84" | "unknown" {
  return value === 1 ? "CGCS2000" : value === 2 ? "WGS84" : "unknown";
}

function ggaFixType(value: number): "invalid" | "single" | "dgps" | "rtk_fixed" | "rtk_float" | "other" {
  if (value === 0) return "invalid";
  if (value === 1) return "single";
  if (value === 2) return "dgps";
  if (value === 4) return "rtk_fixed";
  if (value === 5) return "rtk_float";
  return "other";
}

function readSafeInt64(input: Buffer, offset: number, field: string): number {
  const value = input.readBigInt64BE(offset);
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error(`${field} exceeds the JavaScript safe integer range`);
  return numeric;
}

function readInt40Be(input: Buffer, offset: number): number {
  let value = 0;
  for (let index = 0; index < 5; index += 1) value = value * 256 + input.readUInt8(offset + index);
  return value >= 2 ** 39 ? value - 2 ** 40 : value;
}

function readInt24Be(input: Buffer, offset: number): number {
  const value = input.readUIntBE(offset, 3);
  return value >= 2 ** 23 ? value - 2 ** 24 : value;
}

function compactV6Base(payload: Buffer, scope: CompactTelemetryV6Scope): CompactTelemetry {
  const { deviceId, nodeLabel } = decodeNode(payload);
  const statusFlags = payload.readUInt8(4);
  const seq = payload.readUInt32BE(8);
  const sampleEpoch = payload.readUInt32BE(12);
  if ((statusFlags & ~0x0f) !== 0 || seq === 0 || sampleEpoch === 0) {
    throw new Error("compact telemetry v6 common header is malformed");
  }
  return {
    schema_version: 1,
    device_id: deviceId,
    event_ts: null,
    seq,
    metrics: {},
    meta: {
      install_label: `FIELD-NODE-${nodeLabel}`,
      legacy_node: nodeLabel,
      last_command_tag: payload.readUInt32BE(16),
      upload_trigger: "scheduler_poll",
      compact_payload_version: 6,
      compact_scope: scope,
      sample_epoch: sampleEpoch,
      packet_class:
        scope === "core" ? "hf_displacement_core" : scope === "environment" ? "lf_environment" : "lf_rtk_audit",
      field_sensor_source: (statusFlags & STATUS_FIELD_SENSORS_SIMULATED) !== 0 ? "simulated" : "hardware",
      gnss_source: (statusFlags & STATUS_GNSS_SIMULATED) !== 0 ? "simulated" : "hardware",
      v6_valid_flags: payload.readUInt16BE(6)
    }
  };
}

function decodeCompactTelemetryV6(payload: Buffer): CompactTelemetry {
  const scopeCode = payload.readUInt8(5);
  const scope: CompactTelemetryV6Scope =
    scopeCode === V6_SCOPE_CORE ? "core" :
      scopeCode === V6_SCOPE_ENVIRONMENT ? "environment" :
        scopeCode === V6_SCOPE_AUDIT ? "audit" : (() => { throw new Error("compact telemetry v6 scope is invalid"); })();
  const decoded = compactV6Base(payload, scope);
  const metrics = decoded.metrics;
  const meta = decoded.meta;
  const statusFlags = payload.readUInt8(4);
  const valid = payload.readUInt16BE(6);
  const gnssSimulated = (statusFlags & STATUS_GNSS_SIMULATED) !== 0;

  if (scope === "core") {
    if ((valid & ~V6_CORE_KNOWN_VALID_MASK) !== 0) throw new Error("compact telemetry v6 core validity is malformed");
    const gnssStatusValid = (valid & (1 << 1)) !== 0;
    const summary = payload.readUInt8(39);
    const ggaQuality = summary & 0x07;
    const coordinateFrameCode = (summary >> 3) & 0x03;
    let trusted = (statusFlags & V6_STATUS_RTK_TRUSTED) !== 0;
    const quantizedValidity = [
      [1 << 6, 41],
      [1 << 4, 42],
      [1 << 5, 43],
      [1 << 7, 44],
      [1 << 8, 45]
    ] as const;
    if ((summary & 0xe0) !== 0 ||
        (!gnssStatusValid && ((valid & 0x1fe) !== 0 || summary !== 0 || payload.readUInt8(40) !== 0 || trusted)) ||
        quantizedValidity.some(([mask, offset]) => ((valid & mask) !== 0) !== (payload.readUInt8(offset) !== 0xff))) {
      throw new Error("compact telemetry v6 core GNSS evidence is inconsistent");
    }
    if (gnssSimulated && trusted) throw new Error("compact telemetry v6 simulated GNSS cannot be trusted");
    if (coordinateFrameCode > 2) throw new Error("compact telemetry v6 coordinate frame is invalid");

    if ((valid & (1 << 0)) !== 0) {
      metrics.tilt_x_deg = payload.readInt16BE(20) / 100;
      metrics.tilt_y_deg = payload.readInt16BE(22) / 100;
      metrics.tilt_z_deg = payload.readInt16BE(24) / 100;
      metrics.warning_flag = (statusFlags & STATUS_WARNING) !== 0;
    }
    if (gnssStatusValid) {
      metrics.rtk_gga_quality = ggaQuality;
      metrics.rtk_trusted = trusted;
      metrics.rtk_satellites_used = payload.readUInt8(40);
    }
    if ((valid & (1 << 2)) !== 0) {
      const latitudeE9 = readInt40Be(payload, 26);
      const longitudeE9 = readInt40Be(payload, 31);
      if (latitudeE9 < -90_000_000_000 || latitudeE9 > 90_000_000_000 ||
          longitudeE9 < -180_000_000_000 || longitudeE9 > 180_000_000_000) {
        throw new Error("compact telemetry v6 RTK coordinates are out of range");
      }
      metrics.rtk_latitude_deg = latitudeE9 / 1_000_000_000;
      metrics.rtk_longitude_deg = longitudeE9 / 1_000_000_000;
    }
    if ((valid & (1 << 3)) !== 0) metrics.rtk_altitude_msl_m = readInt24Be(payload, 36) / 1000;
    if ((valid & (1 << 4)) !== 0) metrics.rtk_correction_age_ms = payload.readUInt8(42) * 100;
    if ((valid & (1 << 5)) !== 0) metrics.rtk_solution_age_ms = payload.readUInt8(43) * 20;
    if ((valid & (1 << 6)) !== 0) metrics.rtk_hdop = payload.readUInt8(41) * 0.05;
    if ((valid & (1 << 7)) !== 0) metrics.rtk_gst_sigma_lat_mm = payload.readUInt8(44);
    if ((valid & (1 << 8)) !== 0) metrics.rtk_gst_sigma_lon_mm = payload.readUInt8(45);
    const trustClaimRejected = trusted &&
      (ggaQuality !== 4 || coordinateFrameCode === 0 || (valid & (1 << 2)) === 0 ||
        (valid & (1 << 4)) === 0 || (valid & (1 << 5)) === 0 ||
        Number(metrics.rtk_correction_age_ms) > RTK_TRUST_MAX_CORRECTION_AGE_MS ||
        Number(metrics.rtk_solution_age_ms) > RTK_TRUST_MAX_SOLUTION_AGE_MS);
    if (trustClaimRejected) {
      // Preserve the poll response and non-displacement measurements while failing
      // the professional displacement gate closed.
      trusted = false;
      metrics.rtk_trusted = false;
      meta.rtk_trust_claim_rejected = true;
    }
    meta.rtk_coordinate_frame = coordinateFrameName(coordinateFrameCode);
    meta.rtk_coordinate_frame_code = coordinateFrameCode;
    meta.rtk_fix_type = ggaFixType(ggaQuality);
    meta.rtk_displacement_eligible = !gnssSimulated && trusted && coordinateFrameCode !== 0;
    meta.v6_quantization = { hdop: 0.05, correction_age_ms: 100, solution_age_ms: 20 };
    return decoded;
  }

  if (scope === "environment") {
    if ((valid & ~V6_ENV_KNOWN_VALID_MASK) !== 0) throw new Error("compact telemetry v6 environment validity is malformed");
    meta.uptime_s = payload.readUInt32BE(20);
    if ((valid & (1 << 0)) !== 0) {
      metrics.battery_v = payload.readUInt16BE(24) / 1000;
      metrics.battery_pct = payload.readUInt8(26);
      meta.battery_estimate_quality_code = payload.readUInt8(27);
    }
    if ((valid & (1 << 1)) !== 0) {
      metrics.soil_temperature_c = payload.readInt16BE(28) / 100;
      metrics.soil_moisture_pct = payload.readUInt16BE(30) / 100;
    }
    if ((valid & (1 << 2)) !== 0) metrics.electrical_conductivity_us_cm = payload.readUInt16BE(32);
    if ((valid & (1 << 3)) !== 0) metrics.rtk_geoid_separation_m = readInt24Be(payload, 34) / 1000;
    if ((valid & (1 << 4)) !== 0) {
      metrics.rtk_gnss_week = payload.readUInt16BE(37);
      metrics.rtk_tow_ms = payload.readUInt32BE(39);
    }
    if ((valid & (1 << 5)) !== 0) metrics.rtk_gst_sigma_alt_mm = payload.readUInt16BE(43);
    return decoded;
  }

  if ((valid & ~V6_AUDIT_KNOWN_VALID_MASK) !== 0) throw new Error("compact telemetry v6 audit validity is malformed");
  const rtcmMode = payload.readUInt8(20);
  const rtcmStateFlags = payload.readUInt8(21);
  const queue = payload.readUInt8(22);
  const queuePending = queue >> 4;
  const queueHighWatermark = queue & 0x0f;
  const errorFlags = payload.readUInt8(23);
  const sessionEpoch = payload.readUInt32BE(24);
  const leaseUnits = payload.readUInt16BE(28);
  const completedAgeUnits = payload.readUInt16BE(30);
  const injectedFrames = payload.readUInt16BE(32);
  const fixFlags = payload.readUInt16BE(34);
  const sessionArmed = (rtcmStateFlags & V4_RTCM_STATE_SESSION_ARMED) !== 0;
  const leaseValid = (rtcmStateFlags & V4_RTCM_STATE_LEASE_VALID) !== 0;
  const saturated = (errorFlags & V5_RTCM_INJECTED_COUNT_SATURATED) !== 0;
  const completedFrameRecent = (rtcmStateFlags & V4_RTCM_STATE_FRAME_RECENT) !== 0;
  const gnssFixValid = (valid & (1 << 0)) !== 0;
  const fixedStatsValid = (valid & (1 << 1)) !== 0;
  const stationValid = (valid & (1 << 2)) !== 0;
  const gstHorizontalValid = (valid & (1 << 3)) !== 0;
  const rtcmRuntimeValid = (valid & (1 << 4)) !== 0;
  const trusted = (statusFlags & V6_STATUS_RTK_TRUSTED) !== 0;
  if (rtcmMode > 2 || (rtcmStateFlags & ~V4_RTCM_KNOWN_STATE_MASK) !== 0 ||
      (rtcmStateFlags & V4_RTCM_STATE_READY) === 0 || queuePending > queueHighWatermark ||
      (errorFlags & ~V5_RTCM_KNOWN_ERROR_MASK) !== 0 || (saturated && injectedFrames !== 0xffff) ||
      (completedFrameRecent && completedAgeUnits === V5_AGE_UNAVAILABLE) || !rtcmRuntimeValid) {
    throw new Error("compact telemetry v6 RTCM audit is malformed");
  }
  if (rtcmMode === V4_RTCM_MODE_DISABLED) {
    if (sessionEpoch !== 0 || leaseUnits !== 0 || sessionArmed || leaseValid || queuePending !== 0) {
      throw new Error("compact telemetry v6 disabled RTCM state is not fail-closed");
    }
  } else if (sessionEpoch === 0 || leaseUnits === 0 || !sessionArmed || !leaseValid) {
    throw new Error("compact telemetry v6 active RTCM state lacks a valid lease");
  }
  if ((!gnssFixValid && fixFlags !== 0) ||
      fixedStatsValid !== ((fixFlags & GNSS_FIX_FIXED_STATS_VALID) !== 0) ||
      stationValid !== ((fixFlags & GNSS_FIX_STATION_VALID) !== 0) ||
      gstHorizontalValid !== ((fixFlags & GNSS_FIX_GST_VALID) !== 0) ||
      trusted !== (!gnssSimulated && (fixFlags & GNSS_FIX_TRUSTED) !== 0)) {
    throw new Error("compact telemetry v6 audit GNSS validity is inconsistent");
  }
  metrics.rtcm_injection_mode_code = rtcmMode;
  metrics.rtcm_session_epoch = sessionEpoch;
  metrics.rtcm_lease_remaining_ms = leaseUnits * 100;
  metrics.rtcm_queue_pending = queuePending;
  metrics.rtcm_queue_high_watermark = queueHighWatermark;
  if (completedAgeUnits !== V5_AGE_UNAVAILABLE) metrics.rtcm_last_completed_frame_age_ms = completedAgeUnits * 10;
  metrics.rtcm_injected_frames_total = injectedFrames;
  metrics.rtcm_error_summary_flags = errorFlags & 0x0f;
  metrics.rtcm_rejected_fragment_error = (errorFlags & V5_RTCM_ERROR_REJECTED_FRAGMENT) !== 0;
  metrics.rtcm_crc_error = (errorFlags & V5_RTCM_ERROR_CRC) !== 0;
  metrics.rtcm_queue_drop_error = (errorFlags & V5_RTCM_ERROR_QUEUE_DROP) !== 0;
  metrics.rtcm_uart_error = (errorFlags & V5_RTCM_ERROR_UART) !== 0;
  if (fixedStatsValid) {
    const packed = payload.readUInt32BE(36);
    const streak = packed >>> 20;
    const ratio = (packed >>> 10) & 0x03ff;
    const drops = packed & 0x03ff;
    if (ratio > 1000) throw new Error("compact telemetry v6 fixed ratio is malformed");
    if (streak !== 4095) metrics.rtk_fixed_streak_s = streak;
    if (drops !== 1023) metrics.rtk_fix_drop_count = drops;
    metrics.rtk_fixed_ratio_1m_pct = ratio / 10;
    meta.rtk_fixed_streak_saturated = streak === 4095;
    meta.rtk_fix_drop_count_saturated = drops === 1023;
  }
  if (stationValid) metrics.rtk_reference_station_id = payload.readUInt16BE(40);
  if (gstHorizontalValid) {
    metrics.rtk_gst_sigma_lat_mm = payload.readUInt16BE(42);
    metrics.rtk_gst_sigma_lon_mm = payload.readUInt16BE(44);
  }
  meta.rtk_fix_flags = fixFlags;
  meta.rtcm_injection_mode = rtcmMode === 2 ? "live" : rtcmMode === 1 ? "probe" : "disabled";
  meta.rtcm_state_flags = rtcmStateFlags;
  meta.rtcm_lease_resolution_ms = 100;
  meta.rtcm_completion_age_resolution_ms = 10;
  meta.rtcm_injected_frames_counter_saturated = saturated;
  return decoded;
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

export function decodeCompactTelemetry(payload: Buffer): CompactTelemetry {
  if (!isCompactTelemetry(payload)) {
    throw new Error(
      `compact telemetry signature mismatch: expected a valid v1, v2, v3, v4, v5 or v6 payload`
    );
  }
  if (payload.readUInt8(2) === 6) {
    return decodeCompactTelemetryV6(payload);
  }
  if (payload.readUInt8(2) === 1) {
    return decodeCompactTelemetryV1(payload);
  }

  if (payload.readUInt8(2) === 3 || payload.readUInt8(2) === 4 || payload.readUInt8(2) === 5) {
    const compactVersion = payload.readUInt8(2);
    const versionLabel = `v${String(compactVersion)}`;
    const { deviceId, nodeLabel } = decodeNode(payload);
    const statusFlags = payload.readUInt8(4);
    const valid = payload.readUInt16BE(6);
    const fixFlags = payload.readUInt16BE(76);
    const metrics: Record<string, number | boolean> = {};

    if ((statusFlags & ~0x07) !== 0 || (valid & ~V3_KNOWN_VALID_MASK) !== 0) {
      throw new Error(`compact telemetry ${versionLabel} status or validity flags contain reserved bits`);
    }
    const gnssStatusValid = (valid & V3_VALID_GNSS_STATUS) !== 0;
    const flagMatches = (validMask: number, fixMask: number): boolean =>
      (valid & validMask) !== 0 === ((fixFlags & fixMask) !== 0);
    if (!gnssStatusValid && ((valid & 0x1ff0) !== 0 || fixFlags !== 0)) {
      throw new Error(`compact telemetry ${versionLabel} carries GNSS evidence without a valid GNSS status`);
    }
    if (gnssStatusValid && (
      !flagMatches(V3_VALID_GNSS_POSITION, GNSS_FIX_POSITION_VALID) ||
      !flagMatches(V3_VALID_GNSS_TIME, GNSS_FIX_TIME_VALID) ||
      !flagMatches(V3_VALID_CORRECTION_AGE, GNSS_FIX_CORRECTION_AGE_VALID) ||
      !flagMatches(V3_VALID_HDOP, GNSS_FIX_HDOP_VALID) ||
      !flagMatches(V3_VALID_GST, GNSS_FIX_GST_VALID) ||
      !flagMatches(V3_VALID_FIXED_STATS, GNSS_FIX_FIXED_STATS_VALID) ||
      !flagMatches(V3_VALID_STATION, GNSS_FIX_STATION_VALID) ||
      ((valid & V3_VALID_GNSS_ALTITUDE) !== 0) !==
        ((fixFlags & (GNSS_FIX_ALTITUDE_VALID | GNSS_FIX_GEOID_VALID)) !== 0)
    )) {
      throw new Error(`compact telemetry ${versionLabel} GNSS validity bitmap contradicts its fix flags`);
    }

    if ((valid & V3_VALID_BATTERY) !== 0) {
      metrics.battery_v = payload.readUInt16BE(20) / 1000;
      metrics.battery_pct = payload.readUInt8(22);
    }
    if ((valid & V3_VALID_SOIL) !== 0) {
      metrics.soil_temperature_c = payload.readInt16BE(24) / 100;
      metrics.soil_moisture_pct = payload.readUInt16BE(26) / 100;
    }
    if ((valid & V3_VALID_SOIL_EC) !== 0) {
      metrics.electrical_conductivity_us_cm = payload.readUInt16BE(28);
    }
    if ((valid & V3_VALID_TILT) !== 0) {
      metrics.tilt_x_deg = payload.readInt16BE(30) / 100;
      metrics.tilt_y_deg = payload.readInt16BE(32) / 100;
      metrics.tilt_z_deg = payload.readInt16BE(34) / 100;
      metrics.warning_flag = (statusFlags & STATUS_WARNING) !== 0;
    }

    const ggaQuality = payload.readUInt8(74);
    const coordinateFrameCode = payload.readUInt8(75);
    const trusted = (fixFlags & GNSS_FIX_TRUSTED) !== 0;
    const gnssSimulated = (statusFlags & STATUS_GNSS_SIMULATED) !== 0;
    if (gnssSimulated && trusted) {
      throw new Error(`compact telemetry ${versionLabel} simulated GNSS cannot be trusted RTK evidence`);
    }
    if (gnssStatusValid && (
      ((fixFlags & GNSS_FIX_COORDINATE_FRAME_VALID) !== 0
        ? coordinateFrameCode !== 1 && coordinateFrameCode !== 2
        : coordinateFrameCode !== 0)
    )) {
      throw new Error(`compact telemetry ${versionLabel} coordinate-frame code contradicts its validity flag`);
    }
    if (trusted && (
      ggaQuality !== 4 ||
      (valid & V3_VALID_GNSS_POSITION) === 0 ||
      (valid & V3_VALID_CORRECTION_AGE) === 0 ||
      (fixFlags & GNSS_FIX_COORDINATE_FRAME_VALID) === 0 ||
      payload.readUInt32BE(60) > RTK_TRUST_MAX_CORRECTION_AGE_MS ||
      payload.readUInt32BE(64) > RTK_TRUST_MAX_SOLUTION_AGE_MS
    )) {
      throw new Error(`compact telemetry ${versionLabel} trusted RTK evidence violates the production gate`);
    }
    if ((valid & V3_VALID_FIXED_STATS) !== 0 && payload.readUInt16BE(89) > 1000) {
      throw new Error(`compact telemetry ${versionLabel} Fixed ratio exceeds 1000 permille`);
    }
    if ((valid & V3_VALID_GNSS_STATUS) !== 0) {
      metrics.rtk_gga_quality = ggaQuality;
      metrics.rtk_trusted = trusted;
      metrics.rtk_satellites_used = payload.readUInt8(78);
      metrics.rtk_solution_age_ms = payload.readUInt32BE(64);
    }
    if ((valid & V3_VALID_GNSS_POSITION) !== 0) {
      const latitudeE9 = readSafeInt64(payload, 36, "rtk latitude");
      const longitudeE9 = readSafeInt64(payload, 44, "rtk longitude");
      if (latitudeE9 < -90_000_000_000 || latitudeE9 > 90_000_000_000 ||
          longitudeE9 < -180_000_000_000 || longitudeE9 > 180_000_000_000) {
        throw new Error(`compact telemetry ${versionLabel} RTK coordinates are out of range`);
      }
      metrics.rtk_latitude_deg = latitudeE9 / 1_000_000_000;
      metrics.rtk_longitude_deg = longitudeE9 / 1_000_000_000;
    }
    if ((valid & V3_VALID_GNSS_ALTITUDE) !== 0) {
      const altitudeValid = (fixFlags & GNSS_FIX_ALTITUDE_VALID) !== 0;
      const geoidValid = (fixFlags & GNSS_FIX_GEOID_VALID) !== 0;
      if (altitudeValid) metrics.rtk_altitude_msl_m = payload.readInt32BE(52) / 1000;
      if (geoidValid) metrics.rtk_geoid_separation_m = payload.readInt32BE(56) / 1000;
      if (altitudeValid && geoidValid) {
        metrics.rtk_ellipsoid_height_m = (payload.readInt32BE(52) + payload.readInt32BE(56)) / 1000;
      }
    }
    if ((valid & V3_VALID_CORRECTION_AGE) !== 0) {
      metrics.rtk_correction_age_ms = payload.readUInt32BE(60);
    }
    if ((valid & V3_VALID_GNSS_TIME) !== 0) {
      metrics.rtk_gnss_week = payload.readUInt16BE(72);
      metrics.rtk_tow_ms = payload.readUInt32BE(68);
    }
    if ((valid & V3_VALID_HDOP) !== 0) metrics.rtk_hdop = payload.readUInt16BE(79) / 100;
    if ((valid & V3_VALID_GST) !== 0) {
      metrics.rtk_gst_sigma_lat_mm = payload.readUInt16BE(81);
      metrics.rtk_gst_sigma_lon_mm = payload.readUInt16BE(83);
      metrics.rtk_gst_sigma_alt_mm = payload.readUInt16BE(85);
    }
    if ((valid & V3_VALID_FIXED_STATS) !== 0) {
      metrics.rtk_fixed_streak_s = payload.readUInt16BE(87);
      metrics.rtk_fixed_ratio_1m_pct = payload.readUInt16BE(89) / 10;
      metrics.rtk_fix_drop_count = payload.readUInt16BE(91);
    }
    if ((valid & V3_VALID_STATION) !== 0) {
      metrics.rtk_reference_station_id = payload.readUInt16BE(93);
    }

    let rtcmMode = 0;
    let rtcmStateFlags = 0;
    let rtcmErrorFlags = 0;
    let rtcmInjectedFramesCounterSaturated = false;
    if (compactVersion === 4) {
      rtcmMode = payload.readUInt8(95);
      rtcmStateFlags = payload.readUInt8(96);
      const queuePending = payload.readUInt8(97);
      const queueHighWatermark = payload.readUInt8(98);
      const sessionEpoch = payload.readUInt32BE(99);
      const leaseRemainingMs = payload.readUInt32BE(103);
      const sessionArmed = (rtcmStateFlags & V4_RTCM_STATE_SESSION_ARMED) !== 0;
      const leaseValid = (rtcmStateFlags & V4_RTCM_STATE_LEASE_VALID) !== 0;
      if (rtcmMode > 2 || (rtcmStateFlags & ~V4_RTCM_KNOWN_STATE_MASK) !== 0 ||
          (rtcmStateFlags & V4_RTCM_STATE_READY) === 0 || queuePending > queueHighWatermark) {
        throw new Error("compact telemetry v4 RTCM runtime state is malformed");
      }
      if (rtcmMode === V4_RTCM_MODE_DISABLED) {
        if (sessionEpoch !== 0 || leaseRemainingMs !== 0 || sessionArmed || leaseValid || queuePending !== 0) {
          throw new Error("compact telemetry v4 disabled RTCM state is not fail-closed");
        }
      } else if (sessionEpoch === 0 || leaseRemainingMs === 0 || !sessionArmed || !leaseValid) {
        throw new Error("compact telemetry v4 active RTCM state lacks a valid session lease");
      }

      metrics.rtcm_injection_mode_code = rtcmMode;
      metrics.rtcm_session_epoch = sessionEpoch;
      metrics.rtcm_lease_remaining_ms = leaseRemainingMs;
      metrics.rtcm_queue_pending = queuePending;
      metrics.rtcm_queue_high_watermark = queueHighWatermark;
      const ageFields = [
        ["rtcm_last_fragment_age_ms", payload.readUInt32BE(107)],
        ["rtcm_last_completed_frame_age_ms", payload.readUInt32BE(111)],
        ["rtcm_last_action_age_ms", payload.readUInt32BE(115)]
      ] as const;
      for (const [name, age] of ageFields) {
        if (age !== V4_AGE_UNAVAILABLE) metrics[name] = age;
      }
      metrics.rtcm_accepted_fragments_total = payload.readUInt32BE(119);
      metrics.rtcm_completed_frames_total = payload.readUInt32BE(123);
      metrics.rtcm_injected_frames_total = payload.readUInt32BE(127);
      metrics.rtcm_rejected_fragments_total = payload.readUInt16BE(131);
      metrics.rtcm_crc_errors_total = payload.readUInt16BE(133);
      metrics.rtcm_queue_drops_total = payload.readUInt16BE(135);
      metrics.rtcm_uart_errors_total = payload.readUInt16BE(137);
    } else if (compactVersion === 5) {
      rtcmMode = payload.readUInt8(95);
      rtcmStateFlags = payload.readUInt8(96);
      const queuePending = payload.readUInt8(97);
      const queueHighWatermark = payload.readUInt8(98);
      const sessionEpoch = payload.readUInt32BE(99);
      const leaseRemainingUnits = payload.readUInt16BE(103);
      const completedAgeUnits = payload.readUInt16BE(105);
      const injectedFrames = payload.readUInt16BE(107);
      rtcmErrorFlags = payload.readUInt8(109);
      const sessionArmed = (rtcmStateFlags & V4_RTCM_STATE_SESSION_ARMED) !== 0;
      const leaseValid = (rtcmStateFlags & V4_RTCM_STATE_LEASE_VALID) !== 0;
      const completedFrameRecent = (rtcmStateFlags & (1 << 4)) !== 0;
      rtcmInjectedFramesCounterSaturated =
        (rtcmErrorFlags & V5_RTCM_INJECTED_COUNT_SATURATED) !== 0;

      if (rtcmMode > 2 || (rtcmStateFlags & ~V4_RTCM_KNOWN_STATE_MASK) !== 0 ||
          (rtcmStateFlags & V4_RTCM_STATE_READY) === 0 || queuePending > queueHighWatermark ||
          (rtcmErrorFlags & ~V5_RTCM_KNOWN_ERROR_MASK) !== 0 ||
          (completedFrameRecent && completedAgeUnits === V5_AGE_UNAVAILABLE) ||
          (rtcmInjectedFramesCounterSaturated && injectedFrames !== 0xffff)) {
        throw new Error("compact telemetry v5 RTCM runtime summary is malformed");
      }
      if (rtcmMode === V4_RTCM_MODE_DISABLED) {
        if (sessionEpoch !== 0 || leaseRemainingUnits !== 0 || sessionArmed || leaseValid || queuePending !== 0) {
          throw new Error("compact telemetry v5 disabled RTCM state is not fail-closed");
        }
      } else if (sessionEpoch === 0 || leaseRemainingUnits === 0 || !sessionArmed || !leaseValid) {
        throw new Error("compact telemetry v5 active RTCM state lacks a valid session lease");
      }

      metrics.rtcm_injection_mode_code = rtcmMode;
      metrics.rtcm_session_epoch = sessionEpoch;
      metrics.rtcm_lease_remaining_ms = leaseRemainingUnits * V5_LEASE_RESOLUTION_MS;
      metrics.rtcm_queue_pending = queuePending;
      metrics.rtcm_queue_high_watermark = queueHighWatermark;
      if (completedAgeUnits !== V5_AGE_UNAVAILABLE) {
        metrics.rtcm_last_completed_frame_age_ms =
          completedAgeUnits * V5_COMPLETION_AGE_RESOLUTION_MS;
      }
      metrics.rtcm_injected_frames_total = injectedFrames;
      metrics.rtcm_error_summary_flags = rtcmErrorFlags & 0x0f;
      metrics.rtcm_rejected_fragment_error =
        (rtcmErrorFlags & V5_RTCM_ERROR_REJECTED_FRAGMENT) !== 0;
      metrics.rtcm_crc_error = (rtcmErrorFlags & V5_RTCM_ERROR_CRC) !== 0;
      metrics.rtcm_queue_drop_error = (rtcmErrorFlags & V5_RTCM_ERROR_QUEUE_DROP) !== 0;
      metrics.rtcm_uart_error = (rtcmErrorFlags & V5_RTCM_ERROR_UART) !== 0;
    }

    const batteryQualityCode = payload.readUInt8(23);
    const simulated = (statusFlags & STATUS_FIELD_SENSORS_SIMULATED) !== 0;
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
        upload_trigger: uploadTriggerName(payload.readUInt8(5)),
        compact_payload_version: compactVersion,
        field_sensor_source: simulated ? "simulated" : "hardware",
        gnss_source: gnssSimulated ? "simulated" : "hardware",
        battery_estimate_quality_code: batteryQualityCode,
        rtk_coordinate_frame: coordinateFrameName(coordinateFrameCode),
        rtk_coordinate_frame_code: coordinateFrameCode,
        rtk_fix_type: ggaFixType(ggaQuality),
        rtk_fix_flags: fixFlags,
        rtk_displacement_eligible: !gnssSimulated && trusted && coordinateFrameCode !== 0,
        v3_valid_flags: valid,
        ...(compactVersion >= 4
          ? {
              rtcm_injection_mode: rtcmMode === 2 ? "live" : rtcmMode === 1 ? "probe" : "disabled",
              rtcm_state_flags: rtcmStateFlags,
              ...(compactVersion === 4 ? { v4_valid_flags: valid } : {
                v5_valid_flags: valid,
                rtcm_lease_resolution_ms: V5_LEASE_RESOLUTION_MS,
                rtcm_completion_age_resolution_ms: V5_COMPLETION_AGE_RESOLUTION_MS,
                rtcm_injected_frames_counter_saturated: rtcmInjectedFramesCounterSaturated
              })
            }
          : {})
      }
    };
  }

  const { deviceId, nodeLabel } = decodeNode(payload);
  const statusFlags = payload.readUInt8(4);
  const triggerCode = payload.readUInt8(5);
  const valid = payload.readUInt16BE(6);
  const metrics: Record<string, number | boolean> = {};

  if ((valid & VALID_BATTERY) !== 0) {
    metrics.battery_v = payload.readUInt16BE(20) / 1000;
    metrics.battery_pct = payload.readUInt8(22);
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
    metrics.warning_flag = (statusFlags & STATUS_WARNING) !== 0;
  }
  if ((valid & VALID_GPS) !== 0) {
    metrics.gps_latitude = payload.readInt32BE(36) / 1_000_000;
    metrics.gps_longitude = payload.readInt32BE(40) / 1_000_000;
  }
  if ((valid & VALID_RAIN) !== 0) {
    metrics.rain_total_mm = payload.readUInt16BE(44) / 10;
  }

  const triggerCodeValue =
    triggerCode === 1 ? "periodic" : triggerCode === 2 ? "manual_collect" : triggerCode === 3 ? "scheduler_poll" : "unknown";
  const batteryQualityCode = payload.readUInt8(23);
  const batteryQuality =
    batteryQualityCode === 1
      ? "default-calibration"
      : batteryQualityCode === 2
        ? "field-calibrated"
        : batteryQualityCode === 0
          ? "unavailable"
          : "unknown";
  const simulated = (statusFlags & STATUS_FIELD_SENSORS_SIMULATED) !== 0;

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
      upload_trigger: triggerCodeValue,
      compact_payload_version: 2,
      field_sensor_source: simulated ? "simulated" : "hardware",
      battery_estimate_quality: batteryQuality,
      battery_estimate_quality_code: batteryQualityCode,
      legacy_valid_flags: {
        temp_ok: 0,
        imu_ok: Number((valid & VALID_IMU) !== 0),
        gps_ok: Number((valid & VALID_GPS) !== 0),
        soil_ok: Number((valid & VALID_SOIL) !== 0),
        soil_ec_ok: Number((valid & VALID_SOIL_EC) !== 0),
        tilt_ok: Number((valid & VALID_TILT) !== 0),
        rain_ok: Number((valid & VALID_RAIN) !== 0),
        battery_ok: Number((valid & VALID_BATTERY) !== 0)
      }
    }
  };
}
