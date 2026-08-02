export const COMPACT_TELEMETRY_V1_BYTES = 46;
export const COMPACT_TELEMETRY_V2_BYTES = 46;
export const COMPACT_TELEMETRY_V3_BYTES = 95;

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
    (version === 3 && payload.length === COMPACT_TELEMETRY_V3_BYTES);
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
      `compact telemetry signature mismatch: expected a valid v1, v2 or v3 payload`
    );
  }
  if (payload.readUInt8(2) === 1) {
    return decodeCompactTelemetryV1(payload);
  }

  if (payload.readUInt8(2) === 3) {
    const { deviceId, nodeLabel } = decodeNode(payload);
    const statusFlags = payload.readUInt8(4);
    const valid = payload.readUInt16BE(6);
    const fixFlags = payload.readUInt16BE(76);
    const metrics: Record<string, number | boolean> = {};

    if ((statusFlags & ~0x03) !== 0 || (valid & ~V3_KNOWN_VALID_MASK) !== 0) {
      throw new Error("compact telemetry v3 status or validity flags contain reserved bits");
    }
    const gnssStatusValid = (valid & V3_VALID_GNSS_STATUS) !== 0;
    const flagMatches = (validMask: number, fixMask: number): boolean =>
      (valid & validMask) !== 0 === ((fixFlags & fixMask) !== 0);
    if (!gnssStatusValid && ((valid & 0x1ff0) !== 0 || fixFlags !== 0)) {
      throw new Error("compact telemetry v3 carries GNSS evidence without a valid GNSS status");
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
      throw new Error("compact telemetry v3 GNSS validity bitmap contradicts its fix flags");
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
    if (gnssStatusValid && (
      ((fixFlags & GNSS_FIX_COORDINATE_FRAME_VALID) !== 0
        ? coordinateFrameCode !== 1 && coordinateFrameCode !== 2
        : coordinateFrameCode !== 0)
    )) {
      throw new Error("compact telemetry v3 coordinate-frame code contradicts its validity flag");
    }
    if (trusted && (
      ggaQuality !== 4 ||
      (valid & V3_VALID_GNSS_POSITION) === 0 ||
      (valid & V3_VALID_CORRECTION_AGE) === 0 ||
      (fixFlags & GNSS_FIX_COORDINATE_FRAME_VALID) === 0 ||
      payload.readUInt32BE(60) > 5000 ||
      payload.readUInt32BE(64) > 2000
    )) {
      throw new Error("compact telemetry v3 trusted RTK evidence violates the production gate");
    }
    if ((valid & V3_VALID_FIXED_STATS) !== 0 && payload.readUInt16BE(89) > 1000) {
      throw new Error("compact telemetry v3 Fixed ratio exceeds 1000 permille");
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
        throw new Error("compact telemetry v3 RTK coordinates are out of range");
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
        compact_payload_version: 3,
        field_sensor_source: simulated ? "simulated" : "hardware",
        battery_estimate_quality_code: batteryQualityCode,
        rtk_coordinate_frame: coordinateFrameName(coordinateFrameCode),
        rtk_coordinate_frame_code: coordinateFrameCode,
        rtk_fix_type: ggaFixType(ggaQuality),
        rtk_fix_flags: fixFlags,
        rtk_displacement_eligible: trusted && coordinateFrameCode !== 0,
        v3_valid_flags: valid
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
