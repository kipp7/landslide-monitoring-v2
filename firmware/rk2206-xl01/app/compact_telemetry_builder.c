#include "compact_telemetry_builder.h"

#include <limits.h>
#include <stdint.h>
#include <string.h>

enum {
    OFFSET_MAGIC_0 = 0,
    OFFSET_MAGIC_1 = 1,
    OFFSET_VERSION = 2,
    OFFSET_NODE = 3,
    OFFSET_FLAGS = 4,
    OFFSET_TRIGGER = 5,
    OFFSET_VALID = 6,
    OFFSET_SEQ = 8,
    OFFSET_UPTIME = 12,
    OFFSET_COMMAND_TAG = 16,
    OFFSET_BATTERY_VOLTAGE = 20,
    OFFSET_BATTERY_PERCENT = 22,
    OFFSET_BATTERY_QUALITY = 23,
    OFFSET_SOIL_TEMPERATURE = 24,
    OFFSET_SOIL_MOISTURE = 26,
    OFFSET_SOIL_EC = 28,
    OFFSET_TILT_X = 30,
    OFFSET_TILT_Y = 32,
    OFFSET_TILT_Z = 34,
    OFFSET_V12_GPS_LATITUDE = 36,
    OFFSET_V12_GPS_LONGITUDE = 40,
    OFFSET_V12_RAIN_TOTAL = 44,
    OFFSET_V3_LATITUDE_E9 = 36,
    OFFSET_V3_LONGITUDE_E9 = 44,
    OFFSET_V3_ALTITUDE_MSL_MM = 52,
    OFFSET_V3_GEOID_SEPARATION_MM = 56,
    OFFSET_V3_CORRECTION_AGE_MS = 60,
    OFFSET_V3_SOLUTION_AGE_MS = 64,
    OFFSET_V3_GNSS_TOW_MS = 68,
    OFFSET_V3_GNSS_WEEK = 72,
    OFFSET_V3_GGA_QUALITY = 74,
    OFFSET_V3_COORDINATE_FRAME = 75,
    OFFSET_V3_FIX_FLAGS = 76,
    OFFSET_V3_SATELLITES_USED = 78,
    OFFSET_V3_HDOP_X100 = 79,
    OFFSET_V3_GST_SIGMA_LAT_MM = 81,
    OFFSET_V3_GST_SIGMA_LON_MM = 83,
    OFFSET_V3_GST_SIGMA_ALT_MM = 85,
    OFFSET_V3_FIX_STREAK_S = 87,
    OFFSET_V3_FIXED_RATIO_PERMILLE = 89,
    OFFSET_V3_FIX_DROP_COUNT = 91,
    OFFSET_V3_REFERENCE_STATION_ID = 93,
    OFFSET_V4_RTCM_MODE = 95,
    OFFSET_V4_RTCM_STATE_FLAGS = 96,
    OFFSET_V4_QUEUE_PENDING = 97,
    OFFSET_V4_QUEUE_HIGH_WATERMARK = 98,
    OFFSET_V4_SESSION_EPOCH = 99,
    OFFSET_V4_LEASE_REMAINING_MS = 103,
    OFFSET_V4_LAST_FRAGMENT_AGE_MS = 107,
    OFFSET_V4_LAST_COMPLETED_AGE_MS = 111,
    OFFSET_V4_LAST_ACTION_AGE_MS = 115,
    OFFSET_V4_ACCEPTED_FRAGMENTS = 119,
    OFFSET_V4_COMPLETED_FRAMES = 123,
    OFFSET_V4_INJECTED_FRAMES = 127,
    OFFSET_V4_REJECTED_FRAGMENTS = 131,
    OFFSET_V4_CRC_ERRORS = 133,
    OFFSET_V4_QUEUE_DROPS = 135,
    OFFSET_V4_UART_ERRORS = 137,
    OFFSET_V5_RTCM_MODE = 95,
    OFFSET_V5_RTCM_STATE_FLAGS = 96,
    OFFSET_V5_QUEUE_PENDING = 97,
    OFFSET_V5_QUEUE_HIGH_WATERMARK = 98,
    OFFSET_V5_SESSION_EPOCH = 99,
    OFFSET_V5_LEASE_REMAINING_100MS = 103,
    OFFSET_V5_LAST_COMPLETED_AGE_10MS = 105,
    OFFSET_V5_INJECTED_FRAMES = 107,
    OFFSET_V5_ERROR_FLAGS = 109
};

typedef char CompactTelemetryPayloadSizeCheck[
    COMPACT_TELEMETRY_V1_PAYLOAD_BYTES == 46 &&
    COMPACT_TELEMETRY_V2_PAYLOAD_BYTES == 46 &&
    COMPACT_TELEMETRY_V3_PAYLOAD_BYTES == 95 &&
    COMPACT_TELEMETRY_V4_PAYLOAD_BYTES == 139 &&
    COMPACT_TELEMETRY_V5_PAYLOAD_BYTES == 110 &&
    COMPACT_TELEMETRY_V6_PAYLOAD_BYTES == 46 ? 1 : -1
];

static void WriteUint16Be(unsigned char *output, unsigned int offset, unsigned int value)
{
    output[offset] = (unsigned char)((value >> 8) & 0xFFU);
    output[offset + 1U] = (unsigned char)(value & 0xFFU);
}

static void WriteInt16Be(unsigned char *output, unsigned int offset, int value)
{
    WriteUint16Be(output, offset, (unsigned int)(unsigned short)value);
}

static void WriteUint32Be(unsigned char *output, unsigned int offset, unsigned int value)
{
    output[offset] = (unsigned char)((value >> 24) & 0xFFU);
    output[offset + 1U] = (unsigned char)((value >> 16) & 0xFFU);
    output[offset + 2U] = (unsigned char)((value >> 8) & 0xFFU);
    output[offset + 3U] = (unsigned char)(value & 0xFFU);
}

static void WriteInt32Be(unsigned char *output, unsigned int offset, int32_t value)
{
    WriteUint32Be(output, offset, (uint32_t)value);
}

static void WriteInt64Be(unsigned char *output, unsigned int offset, int64_t value)
{
    uint64_t bits = (uint64_t)value;
    unsigned int index;
    for (index = 0U; index < 8U; ++index) {
        output[offset + index] = (unsigned char)(bits >> (56U - index * 8U));
    }
}

static void WriteInt40Be(unsigned char *output, unsigned int offset, int64_t value)
{
    uint64_t bits = (uint64_t)value;
    unsigned int index;
    for (index = 0U; index < 5U; ++index) {
        output[offset + index] = (unsigned char)(bits >> (32U - index * 8U));
    }
}

static void WriteInt24Be(unsigned char *output, unsigned int offset, int32_t value)
{
    uint32_t bits = (uint32_t)value;
    output[offset] = (unsigned char)((bits >> 16) & 0xFFU);
    output[offset + 1U] = (unsigned char)((bits >> 8) & 0xFFU);
    output[offset + 2U] = (unsigned char)(bits & 0xFFU);
}

static uint16_t SaturateUint16(uint32_t value)
{
    return value > USHRT_MAX ? USHRT_MAX : (uint16_t)value;
}

static uint32_t SaturatingAddUint32(uint32_t left, uint32_t right)
{
    return UINT32_MAX - left < right ? UINT32_MAX : left + right;
}

static uint16_t QuantizeCeilUint16(uint32_t value, uint32_t resolution)
{
    uint32_t quantized;
    if (value == 0U) return 0U;
    quantized = value / resolution + (value % resolution != 0U ? 1U : 0U);
    return quantized >= COMPACT_TELEMETRY_V5_AGE_UNAVAILABLE
        ? COMPACT_TELEMETRY_V5_AGE_UNAVAILABLE - 1U
        : (uint16_t)quantized;
}

static uint16_t QuantizeAgeUint16(uint32_t value, uint32_t resolution)
{
    uint32_t quantized;
    if (value == UINT32_MAX) return COMPACT_TELEMETRY_V5_AGE_UNAVAILABLE;
    quantized = value / resolution;
    return quantized >= COMPACT_TELEMETRY_V5_AGE_UNAVAILABLE
        ? COMPACT_TELEMETRY_V5_AGE_UNAVAILABLE - 1U
        : (uint16_t)quantized;
}

static uint8_t QuantizeCeilUint8(uint32_t value, uint32_t resolution)
{
    uint32_t quantized;
    if (value == UINT32_MAX) return 0xFFU;
    quantized = value / resolution + (value % resolution != 0U ? 1U : 0U);
    return quantized >= 0xFFU ? 0xFFU : (uint8_t)quantized;
}

static int FitsInt24(int32_t value)
{
    return value >= -8388608 && value <= 8388607;
}

static int ScaleSigned(float value, float scale, int minimum, int maximum)
{
    float scaled = value * scale;
    if (scaled <= (float)minimum) return minimum;
    if (scaled >= (float)maximum) return maximum;
    return scaled >= 0.0f ? (int)(scaled + 0.5f) : (int)(scaled - 0.5f);
}

static unsigned int ScaleUnsigned(float value, float scale, unsigned int maximum)
{
    float scaled = value * scale;
    if (scaled <= 0.0f) return 0U;
    if (scaled >= (float)maximum) return maximum;
    return (unsigned int)(scaled + 0.5f);
}

static int32_t NanoDegreesToMicroDegrees(int64_t value)
{
    int64_t rounded = value >= 0 ? value + 500LL : value - 500LL;
    rounded /= 1000LL;
    if (rounded < INT32_MIN) return INT32_MIN;
    if (rounded > INT32_MAX) return INT32_MAX;
    return (int32_t)rounded;
}

static unsigned char NodeNumber(const char *legacy_node_label)
{
    if (legacy_node_label == NULL) return 0U;
    if (legacy_node_label[0] == 'A' && legacy_node_label[1] == '\0') return 1U;
    if (legacy_node_label[0] == 'B' && legacy_node_label[1] == '\0') return 2U;
    if (legacy_node_label[0] == 'C' && legacy_node_label[1] == '\0') return 3U;
    return 0U;
}

static unsigned char UploadTriggerCode(const char *upload_trigger)
{
    if (upload_trigger == NULL) return COMPACT_TELEMETRY_TRIGGER_UNKNOWN;
    if (strcmp(upload_trigger, "scheduler_poll") == 0) return COMPACT_TELEMETRY_TRIGGER_SCHEDULER_POLL;
    if (strcmp(upload_trigger, "manual_collect") == 0) return COMPACT_TELEMETRY_TRIGGER_MANUAL_COLLECT;
    if (strcmp(upload_trigger, "periodic") == 0) return COMPACT_TELEMETRY_TRIGGER_PERIODIC;
    return COMPACT_TELEMETRY_TRIGGER_UNKNOWN;
}

static unsigned int StatusFlags(const SensorData *data)
{
    unsigned int flags = 0U;
    if (data->warning) flags |= COMPACT_TELEMETRY_STATUS_WARNING;
    if (data->simulated_field_data) flags |= COMPACT_TELEMETRY_STATUS_FIELD_SENSORS_SIMULATED;
    if (data->simulated_gnss_data) flags |= COMPACT_TELEMETRY_STATUS_GNSS_SIMULATED;
    return flags;
}

static uint16_t SanitizedGnssFixFlags(const SensorData *data)
{
    uint16_t flags = data->gnss.fix_flags;
    if (data->simulated_gnss_data) {
        flags &= (uint16_t)~(
            GNSS_FIX_NMEA_CHECKSUM_VALID |
            GNSS_FIX_TRUSTED |
            GNSS_FIX_TIME_VALID |
            GNSS_FIX_GST_VALID |
            GNSS_FIX_CORRECTION_AGE_VALID |
            GNSS_FIX_STATION_VALID |
            GNSS_FIX_FIXED_STATS_VALID
        );
    }
    return flags;
}

static uint16_t SanitizedV6GnssFixFlags(const SensorData *data)
{
    uint16_t flags = SanitizedGnssFixFlags(data);
    if ((flags & GNSS_FIX_TRUSTED) != 0U &&
        (data->gnss.gga_quality != 4U || !data->gnss.position_valid ||
         (flags & GNSS_FIX_COORDINATE_FRAME_VALID) == 0U ||
         data->gnss.coordinate_frame == GNSS_COORDINATE_FRAME_UNKNOWN ||
         data->gnss.coordinate_frame > GNSS_COORDINATE_FRAME_WGS84 ||
         (flags & GNSS_FIX_CORRECTION_AGE_VALID) == 0U ||
         data->gnss.correction_age_ms > GNSS_TRUST_MAX_CORRECTION_AGE_MS ||
         data->gnss.solution_age_ms > GNSS_TRUST_MAX_SOLUTION_AGE_MS)) {
        flags &= (uint16_t)~GNSS_FIX_TRUSTED;
    }
    return flags;
}

static int BeginPayload(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char version,
    unsigned int valid,
    unsigned char *output,
    int payload_bytes
)
{
    unsigned char node = NodeNumber(legacy_node_label);
    if (data == NULL || output == NULL || node == 0U) return -1;
    memset(output, 0, (size_t)payload_bytes);
    output[OFFSET_MAGIC_0] = 'L';
    output[OFFSET_MAGIC_1] = 'S';
    output[OFFSET_VERSION] = version;
    output[OFFSET_NODE] = node;
    output[OFFSET_FLAGS] = (unsigned char)StatusFlags(data);
    output[OFFSET_TRIGGER] = UploadTriggerCode(upload_trigger);
    WriteUint16Be(output, OFFSET_VALID, valid);
    WriteUint32Be(output, OFFSET_SEQ, data->seq);
    WriteUint32Be(output, OFFSET_UPTIME, data->uptime);
    WriteUint32Be(output, OFFSET_COMMAND_TAG, CompactTelemetry_CommandTag(last_command_id));
    return 0;
}

unsigned int CompactTelemetry_CommandTag(const char *command_id)
{
    unsigned int hash = 2166136261U;
    const unsigned char *cursor = (const unsigned char *)command_id;
    if (command_id == NULL || command_id[0] == '\0') return 0U;
    while (*cursor != 0U) {
        hash ^= (unsigned int)*cursor++;
        hash *= 16777619U;
    }
    return hash;
}

static unsigned int LegacyValidFlags(const SensorData *data, int include_battery)
{
    unsigned int valid = 0U;
    if (data->soil_valid) valid |= COMPACT_TELEMETRY_VALID_SOIL;
    if (data->soil_ec_valid) valid |= COMPACT_TELEMETRY_VALID_SOIL_EC;
    if (data->tilt_valid) valid |= COMPACT_TELEMETRY_VALID_TILT;
    if (data->gnss_status_valid && data->gnss.position_valid) valid |= COMPACT_TELEMETRY_VALID_GPS;
    if (data->rain_valid) valid |= COMPACT_TELEMETRY_VALID_RAIN;
    if (include_battery && data->battery_valid) valid |= COMPACT_TELEMETRY_VALID_BATTERY;
    return valid;
}

static void WriteLegacyMetrics(const SensorData *data, unsigned char *output, int include_battery)
{
    if (include_battery && data->battery_valid) {
        WriteUint16Be(output, OFFSET_BATTERY_VOLTAGE,
                      data->battery_voltage_mv > USHRT_MAX ? USHRT_MAX : data->battery_voltage_mv);
        output[OFFSET_BATTERY_PERCENT] = (unsigned char)(data->battery_level < 0 ? 0 :
            (data->battery_level > 100 ? 100 : data->battery_level));
        output[OFFSET_BATTERY_QUALITY] = (unsigned char)(data->battery_estimate_quality < 0 ? 0 :
            (data->battery_estimate_quality > 255 ? 255 : data->battery_estimate_quality));
    }
    if (data->soil_valid) {
        WriteInt16Be(output, OFFSET_SOIL_TEMPERATURE, ScaleSigned(data->soil_temperature, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteUint16Be(output, OFFSET_SOIL_MOISTURE, ScaleUnsigned(data->soil_moisture, 100.0f, USHRT_MAX - 1U));
    }
    if (data->soil_ec_valid) WriteUint16Be(output, OFFSET_SOIL_EC, ScaleUnsigned(data->soil_ec, 1.0f, USHRT_MAX - 1U));
    if (data->tilt_valid) {
        WriteInt16Be(output, OFFSET_TILT_X, ScaleSigned(data->angle_x, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteInt16Be(output, OFFSET_TILT_Y, ScaleSigned(data->angle_y, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteInt16Be(output, OFFSET_TILT_Z, ScaleSigned(data->angle_z, 100.0f, SHRT_MIN + 1, SHRT_MAX));
    }
    if (data->gnss_status_valid && data->gnss.position_valid) {
        WriteInt32Be(output, OFFSET_V12_GPS_LATITUDE, NanoDegreesToMicroDegrees(data->gnss.latitude_e9));
        WriteInt32Be(output, OFFSET_V12_GPS_LONGITUDE, NanoDegreesToMicroDegrees(data->gnss.longitude_e9));
    }
    if (data->rain_valid) WriteUint16Be(output, OFFSET_V12_RAIN_TOTAL, ScaleUnsigned(data->rain_total, 10.0f, USHRT_MAX - 1U));
}

int BuildCompactTelemetryV1(
    const SensorData *data, const char *legacy_node_label, const char *last_command_id,
    const char *upload_trigger, unsigned char *output, int output_size)
{
    unsigned int valid;
    if (data == NULL || output == NULL || output_size < COMPACT_TELEMETRY_V1_PAYLOAD_BYTES) return -1;
    valid = LegacyValidFlags(data, 0);
    if (valid == 0U) return COMPACT_TELEMETRY_ERR_EMPTY_METRICS;
    if (BeginPayload(data, legacy_node_label, last_command_id, upload_trigger, 1U, valid,
                     output, COMPACT_TELEMETRY_V1_PAYLOAD_BYTES) != 0) return -1;
    WriteLegacyMetrics(data, output, 0);
    return COMPACT_TELEMETRY_V1_PAYLOAD_BYTES;
}

int BuildCompactTelemetryV2(
    const SensorData *data, const char *legacy_node_label, const char *last_command_id,
    const char *upload_trigger, unsigned char *output, int output_size)
{
    unsigned int valid;
    if (data == NULL || output == NULL || output_size < COMPACT_TELEMETRY_V2_PAYLOAD_BYTES) return -1;
    valid = LegacyValidFlags(data, 1);
    if (valid == 0U) return COMPACT_TELEMETRY_ERR_EMPTY_METRICS;
    if (BeginPayload(data, legacy_node_label, last_command_id, upload_trigger, 2U, valid,
                     output, COMPACT_TELEMETRY_V2_PAYLOAD_BYTES) != 0) return -1;
    WriteLegacyMetrics(data, output, 1);
    return COMPACT_TELEMETRY_V2_PAYLOAD_BYTES;
}

int BuildCompactTelemetryV3(
    const SensorData *data, const char *legacy_node_label, const char *last_command_id,
    const char *upload_trigger, unsigned char *output, int output_size)
{
    unsigned int valid = 0U;
    uint16_t fix_flags;
    if (data == NULL || output == NULL || output_size < COMPACT_TELEMETRY_V3_PAYLOAD_BYTES) return -1;
    fix_flags = SanitizedGnssFixFlags(data);
    if (data->battery_valid) valid |= COMPACT_TELEMETRY_V3_VALID_BATTERY;
    if (data->soil_valid) valid |= COMPACT_TELEMETRY_V3_VALID_SOIL;
    if (data->soil_ec_valid) valid |= COMPACT_TELEMETRY_V3_VALID_SOIL_EC;
    if (data->tilt_valid) valid |= COMPACT_TELEMETRY_V3_VALID_TILT;
    if (data->gnss_status_valid) {
        valid |= COMPACT_TELEMETRY_V3_VALID_GNSS_STATUS;
        if (data->gnss.position_valid) valid |= COMPACT_TELEMETRY_V3_VALID_GNSS_POSITION;
        if ((fix_flags & (GNSS_FIX_ALTITUDE_VALID | GNSS_FIX_GEOID_VALID)) != 0U) valid |= COMPACT_TELEMETRY_V3_VALID_GNSS_ALTITUDE;
        if ((fix_flags & GNSS_FIX_TIME_VALID) != 0U) valid |= COMPACT_TELEMETRY_V3_VALID_GNSS_TIME;
        if ((fix_flags & GNSS_FIX_CORRECTION_AGE_VALID) != 0U) valid |= COMPACT_TELEMETRY_V3_VALID_CORRECTION_AGE;
        if ((fix_flags & GNSS_FIX_HDOP_VALID) != 0U) valid |= COMPACT_TELEMETRY_V3_VALID_HDOP;
        if ((fix_flags & GNSS_FIX_GST_VALID) != 0U) valid |= COMPACT_TELEMETRY_V3_VALID_GST;
        if ((fix_flags & GNSS_FIX_FIXED_STATS_VALID) != 0U) valid |= COMPACT_TELEMETRY_V3_VALID_FIXED_STATS;
        if ((fix_flags & GNSS_FIX_STATION_VALID) != 0U) valid |= COMPACT_TELEMETRY_V3_VALID_STATION;
    } else {
        fix_flags = 0U;
    }
    if (valid == 0U) return COMPACT_TELEMETRY_ERR_EMPTY_METRICS;
    if (BeginPayload(data, legacy_node_label, last_command_id, upload_trigger, 3U, valid,
                     output, COMPACT_TELEMETRY_V3_PAYLOAD_BYTES) != 0) return -1;

    WriteLegacyMetrics(data, output, 1);
    if (data->gnss_status_valid) {
        output[OFFSET_V3_GGA_QUALITY] = data->simulated_gnss_data ? 1U : data->gnss.gga_quality;
        output[OFFSET_V3_COORDINATE_FRAME] = data->gnss.coordinate_frame;
        WriteUint16Be(output, OFFSET_V3_FIX_FLAGS, fix_flags);
        output[OFFSET_V3_SATELLITES_USED] = data->gnss.satellites_used;
        WriteUint32Be(output, OFFSET_V3_SOLUTION_AGE_MS, data->gnss.solution_age_ms);
    }
    if (data->gnss_status_valid && data->gnss.position_valid) {
        WriteInt64Be(output, OFFSET_V3_LATITUDE_E9, data->gnss.latitude_e9);
        WriteInt64Be(output, OFFSET_V3_LONGITUDE_E9, data->gnss.longitude_e9);
    }
    if ((fix_flags & GNSS_FIX_ALTITUDE_VALID) != 0U) WriteInt32Be(output, OFFSET_V3_ALTITUDE_MSL_MM, data->gnss.altitude_msl_mm);
    if ((fix_flags & GNSS_FIX_GEOID_VALID) != 0U) WriteInt32Be(output, OFFSET_V3_GEOID_SEPARATION_MM, data->gnss.geoid_separation_mm);
    if ((fix_flags & GNSS_FIX_CORRECTION_AGE_VALID) != 0U) WriteUint32Be(output, OFFSET_V3_CORRECTION_AGE_MS, data->gnss.correction_age_ms);
    if ((fix_flags & GNSS_FIX_TIME_VALID) != 0U) {
        WriteUint32Be(output, OFFSET_V3_GNSS_TOW_MS, data->gnss.gnss_tow_ms);
        WriteUint16Be(output, OFFSET_V3_GNSS_WEEK, data->gnss.gnss_week);
    }
    if ((fix_flags & GNSS_FIX_HDOP_VALID) != 0U) WriteUint16Be(output, OFFSET_V3_HDOP_X100, data->gnss.hdop_x100);
    if ((fix_flags & GNSS_FIX_GST_VALID) != 0U) {
        WriteUint16Be(output, OFFSET_V3_GST_SIGMA_LAT_MM, data->gnss.gst_sigma_lat_mm);
        WriteUint16Be(output, OFFSET_V3_GST_SIGMA_LON_MM, data->gnss.gst_sigma_lon_mm);
        WriteUint16Be(output, OFFSET_V3_GST_SIGMA_ALT_MM, data->gnss.gst_sigma_alt_mm);
    }
    if ((fix_flags & GNSS_FIX_FIXED_STATS_VALID) != 0U) {
        WriteUint16Be(output, OFFSET_V3_FIX_STREAK_S, data->gnss.fix_streak_s);
        WriteUint16Be(output, OFFSET_V3_FIXED_RATIO_PERMILLE, data->gnss.fixed_ratio_1m_permille);
        WriteUint16Be(output, OFFSET_V3_FIX_DROP_COUNT, data->gnss.fix_drop_count);
    }
    if ((fix_flags & GNSS_FIX_STATION_VALID) != 0U) WriteUint16Be(output, OFFSET_V3_REFERENCE_STATION_ID, data->gnss.reference_station_id);
    return COMPACT_TELEMETRY_V3_PAYLOAD_BYTES;
}

int BuildCompactTelemetryV4(
    const SensorData *data,
    const GnssRtcmInjectionStats *rtcm_stats,
    const GnssRtcmRuntimeStatus *rtcm_runtime,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size)
{
    uint32_t queue_drops;
    int base_len;

    if (data == NULL || rtcm_stats == NULL || rtcm_runtime == NULL ||
        output == NULL || output_size < COMPACT_TELEMETRY_V4_PAYLOAD_BYTES) {
        return -1;
    }
    base_len = BuildCompactTelemetryV3(
        data, legacy_node_label, last_command_id, upload_trigger,
        output, output_size
    );
    if (base_len != COMPACT_TELEMETRY_V3_PAYLOAD_BYTES) return base_len;

    memset(output + COMPACT_TELEMETRY_V3_PAYLOAD_BYTES, 0,
           COMPACT_TELEMETRY_V4_PAYLOAD_BYTES - COMPACT_TELEMETRY_V3_PAYLOAD_BYTES);
    output[OFFSET_VERSION] = 4U;
    output[OFFSET_V4_RTCM_MODE] = rtcm_runtime->mode;
    output[OFFSET_V4_RTCM_STATE_FLAGS] = rtcm_runtime->state_flags;
    output[OFFSET_V4_QUEUE_PENDING] = rtcm_runtime->queue_pending;
    output[OFFSET_V4_QUEUE_HIGH_WATERMARK] = rtcm_runtime->queue_high_watermark;
    WriteUint32Be(output, OFFSET_V4_SESSION_EPOCH, rtcm_runtime->session_epoch);
    WriteUint32Be(output, OFFSET_V4_LEASE_REMAINING_MS, rtcm_runtime->lease_remaining_ms);
    WriteUint32Be(output, OFFSET_V4_LAST_FRAGMENT_AGE_MS, rtcm_runtime->last_fragment_age_ms);
    WriteUint32Be(output, OFFSET_V4_LAST_COMPLETED_AGE_MS, rtcm_runtime->last_completed_frame_age_ms);
    WriteUint32Be(output, OFFSET_V4_LAST_ACTION_AGE_MS, rtcm_runtime->last_action_age_ms);
    WriteUint32Be(output, OFFSET_V4_ACCEPTED_FRAGMENTS, rtcm_stats->accepted_fragments);
    WriteUint32Be(output, OFFSET_V4_COMPLETED_FRAMES, rtcm_stats->completed_frames);
    WriteUint32Be(output, OFFSET_V4_INJECTED_FRAMES, rtcm_stats->injected_frames);
    WriteUint16Be(output, OFFSET_V4_REJECTED_FRAGMENTS,
                  SaturateUint16(rtcm_stats->rejected_fragments));
    WriteUint16Be(output, OFFSET_V4_CRC_ERRORS,
                  SaturateUint16(rtcm_stats->crc_errors));
    queue_drops = SaturatingAddUint32(
        rtcm_stats->queue_evictions,
        rtcm_stats->queue_expired_frames
    );
    queue_drops = SaturatingAddUint32(queue_drops, rtcm_stats->injection_dropped_frames);
    WriteUint16Be(output, OFFSET_V4_QUEUE_DROPS, SaturateUint16(queue_drops));
    WriteUint16Be(output, OFFSET_V4_UART_ERRORS,
                  SaturateUint16(rtcm_stats->uart_write_errors));
    return COMPACT_TELEMETRY_V4_PAYLOAD_BYTES;
}

int BuildCompactTelemetryV5(
    const SensorData *data,
    const GnssRtcmInjectionStats *rtcm_stats,
    const GnssRtcmRuntimeStatus *rtcm_runtime,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size)
{
    uint32_t queue_drops;
    unsigned int error_flags = 0U;
    int base_len;

    if (data == NULL || rtcm_stats == NULL || rtcm_runtime == NULL ||
        output == NULL || output_size < COMPACT_TELEMETRY_V5_PAYLOAD_BYTES) {
        return -1;
    }
    base_len = BuildCompactTelemetryV3(
        data, legacy_node_label, last_command_id, upload_trigger,
        output, output_size
    );
    if (base_len != COMPACT_TELEMETRY_V3_PAYLOAD_BYTES) return base_len;

    memset(output + COMPACT_TELEMETRY_V3_PAYLOAD_BYTES, 0,
           COMPACT_TELEMETRY_V5_PAYLOAD_BYTES - COMPACT_TELEMETRY_V3_PAYLOAD_BYTES);
    output[OFFSET_VERSION] = 5U;
    output[OFFSET_V5_RTCM_MODE] = rtcm_runtime->mode;
    output[OFFSET_V5_RTCM_STATE_FLAGS] = rtcm_runtime->state_flags;
    output[OFFSET_V5_QUEUE_PENDING] = rtcm_runtime->queue_pending;
    output[OFFSET_V5_QUEUE_HIGH_WATERMARK] = rtcm_runtime->queue_high_watermark;
    WriteUint32Be(output, OFFSET_V5_SESSION_EPOCH, rtcm_runtime->session_epoch);
    WriteUint16Be(
        output,
        OFFSET_V5_LEASE_REMAINING_100MS,
        QuantizeCeilUint16(
            rtcm_runtime->lease_remaining_ms,
            COMPACT_TELEMETRY_V5_LEASE_RESOLUTION_MS
        )
    );
    WriteUint16Be(
        output,
        OFFSET_V5_LAST_COMPLETED_AGE_10MS,
        QuantizeAgeUint16(
            rtcm_runtime->last_completed_frame_age_ms,
            COMPACT_TELEMETRY_V5_COMPLETION_AGE_RESOLUTION_MS
        )
    );
    WriteUint16Be(
        output,
        OFFSET_V5_INJECTED_FRAMES,
        SaturateUint16(rtcm_stats->injected_frames)
    );

    queue_drops = SaturatingAddUint32(
        rtcm_stats->queue_evictions,
        rtcm_stats->queue_expired_frames
    );
    queue_drops = SaturatingAddUint32(queue_drops, rtcm_stats->injection_dropped_frames);
    if (rtcm_stats->rejected_fragments != 0U) {
        error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_REJECTED_FRAGMENT;
    }
    if (rtcm_stats->crc_errors != 0U) {
        error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_CRC;
    }
    if (queue_drops != 0U) {
        error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_QUEUE_DROP;
    }
    if (rtcm_stats->uart_write_errors != 0U) {
        error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_UART;
    }
    if (rtcm_stats->injected_frames > USHRT_MAX) {
        error_flags |= COMPACT_TELEMETRY_V5_RTCM_INJECTED_COUNT_SATURATED;
    }
    output[OFFSET_V5_ERROR_FLAGS] = (unsigned char)error_flags;
    return COMPACT_TELEMETRY_V5_PAYLOAD_BYTES;
}

static unsigned int V6StatusFlags(const SensorData *data, uint16_t fix_flags)
{
    unsigned int flags = StatusFlags(data);
    if ((fix_flags & GNSS_FIX_TRUSTED) != 0U && !data->simulated_gnss_data) {
        flags |= COMPACT_TELEMETRY_V6_STATUS_RTK_TRUSTED;
    }
    return flags;
}

static int BeginV6Payload(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    unsigned int scope,
    unsigned int valid,
    uint16_t fix_flags,
    unsigned char *output)
{
    unsigned char node = NodeNumber(legacy_node_label);
    if (data == NULL || output == NULL || node == 0U ||
        scope < COMPACT_TELEMETRY_V6_SCOPE_CORE ||
        scope > COMPACT_TELEMETRY_V6_SCOPE_AUDIT) {
        return -1;
    }
    memset(output, 0, COMPACT_TELEMETRY_V6_PAYLOAD_BYTES);
    output[0] = 'L';
    output[1] = 'S';
    output[2] = 6U;
    output[3] = node;
    output[4] = (unsigned char)V6StatusFlags(data, fix_flags);
    output[5] = (unsigned char)scope;
    WriteUint16Be(output, 6U, valid);
    WriteUint32Be(output, 8U, data->seq);
    WriteUint32Be(output, 12U, data->sample_epoch);
    WriteUint32Be(output, 16U, CompactTelemetry_CommandTag(last_command_id));
    return 0;
}

static int BuildCompactTelemetryV6Core(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    uint16_t fix_flags,
    unsigned char *output)
{
    unsigned int valid = 0U;
    uint8_t correction_age;
    uint8_t solution_age;
    uint8_t hdop;
    unsigned int fix_summary = 0U;

    if (data->tilt_valid) valid |= COMPACT_TELEMETRY_V6_CORE_VALID_TILT;
    if (data->gnss_status_valid) {
        valid |= COMPACT_TELEMETRY_V6_CORE_VALID_GNSS_STATUS;
        if (data->gnss.position_valid &&
            data->gnss.latitude_e9 >= -90000000000LL && data->gnss.latitude_e9 <= 90000000000LL &&
            data->gnss.longitude_e9 >= -180000000000LL && data->gnss.longitude_e9 <= 180000000000LL) {
            valid |= COMPACT_TELEMETRY_V6_CORE_VALID_POSITION;
        }
        if ((fix_flags & GNSS_FIX_ALTITUDE_VALID) != 0U && FitsInt24(data->gnss.altitude_msl_mm)) {
            valid |= COMPACT_TELEMETRY_V6_CORE_VALID_ALTITUDE;
        }
        correction_age = QuantizeCeilUint8(data->gnss.correction_age_ms, 100U);
        if ((fix_flags & GNSS_FIX_CORRECTION_AGE_VALID) != 0U && correction_age != 0xFFU) {
            valid |= COMPACT_TELEMETRY_V6_CORE_VALID_CORRECTION_AGE;
        }
        solution_age = QuantizeCeilUint8(data->gnss.solution_age_ms, 20U);
        if (solution_age != 0xFFU) valid |= COMPACT_TELEMETRY_V6_CORE_VALID_SOLUTION_AGE;
        hdop = QuantizeCeilUint8(data->gnss.hdop_x100, 5U);
        if ((fix_flags & GNSS_FIX_HDOP_VALID) != 0U && hdop != 0xFFU) {
            valid |= COMPACT_TELEMETRY_V6_CORE_VALID_HDOP;
        }
        if ((fix_flags & GNSS_FIX_GST_VALID) != 0U && data->gnss.gst_sigma_lat_mm < 0xFFU) {
            valid |= COMPACT_TELEMETRY_V6_CORE_VALID_GST_LAT;
        }
        if ((fix_flags & GNSS_FIX_GST_VALID) != 0U && data->gnss.gst_sigma_lon_mm < 0xFFU) {
            valid |= COMPACT_TELEMETRY_V6_CORE_VALID_GST_LON;
        }
        fix_summary = (unsigned int)(data->simulated_gnss_data ? 1U : data->gnss.gga_quality);
        if (fix_summary > 7U) fix_summary = 7U;
        if ((fix_flags & GNSS_FIX_COORDINATE_FRAME_VALID) != 0U && data->gnss.coordinate_frame <= 2U) {
            fix_summary |= (unsigned int)data->gnss.coordinate_frame << 3;
        }
    }

    if (valid == 0U || BeginV6Payload(
            data, legacy_node_label, last_command_id,
            COMPACT_TELEMETRY_V6_SCOPE_CORE, valid, fix_flags, output) != 0) {
        return valid == 0U ? COMPACT_TELEMETRY_ERR_EMPTY_METRICS : -1;
    }
    if ((valid & COMPACT_TELEMETRY_V6_CORE_VALID_TILT) != 0U) {
        WriteInt16Be(output, 20U, ScaleSigned(data->angle_x, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteInt16Be(output, 22U, ScaleSigned(data->angle_y, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteInt16Be(output, 24U, ScaleSigned(data->angle_z, 100.0f, SHRT_MIN + 1, SHRT_MAX));
    }
    if ((valid & COMPACT_TELEMETRY_V6_CORE_VALID_POSITION) != 0U) {
        WriteInt40Be(output, 26U, data->gnss.latitude_e9);
        WriteInt40Be(output, 31U, data->gnss.longitude_e9);
    }
    if ((valid & COMPACT_TELEMETRY_V6_CORE_VALID_ALTITUDE) != 0U) {
        WriteInt24Be(output, 36U, data->gnss.altitude_msl_mm);
    }
    output[39] = (unsigned char)fix_summary;
    output[40] = data->gnss_status_valid ? data->gnss.satellites_used : 0U;
    output[41] = (valid & COMPACT_TELEMETRY_V6_CORE_VALID_HDOP) != 0U ? hdop : 0xFFU;
    output[42] = (valid & COMPACT_TELEMETRY_V6_CORE_VALID_CORRECTION_AGE) != 0U ? correction_age : 0xFFU;
    output[43] = (valid & COMPACT_TELEMETRY_V6_CORE_VALID_SOLUTION_AGE) != 0U ? solution_age : 0xFFU;
    output[44] = (valid & COMPACT_TELEMETRY_V6_CORE_VALID_GST_LAT) != 0U
        ? (unsigned char)data->gnss.gst_sigma_lat_mm : 0xFFU;
    output[45] = (valid & COMPACT_TELEMETRY_V6_CORE_VALID_GST_LON) != 0U
        ? (unsigned char)data->gnss.gst_sigma_lon_mm : 0xFFU;
    return COMPACT_TELEMETRY_V6_PAYLOAD_BYTES;
}

static int BuildCompactTelemetryV6Environment(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    uint16_t fix_flags,
    unsigned char *output)
{
    unsigned int valid = 0U;
    if (data->battery_valid) valid |= COMPACT_TELEMETRY_V6_ENV_VALID_BATTERY;
    if (data->soil_valid) valid |= COMPACT_TELEMETRY_V6_ENV_VALID_SOIL;
    if (data->soil_ec_valid) valid |= COMPACT_TELEMETRY_V6_ENV_VALID_SOIL_EC;
    if (data->gnss_status_valid && (fix_flags & GNSS_FIX_GEOID_VALID) != 0U &&
        FitsInt24(data->gnss.geoid_separation_mm)) {
        valid |= COMPACT_TELEMETRY_V6_ENV_VALID_GEOID;
    }
    if (data->gnss_status_valid && (fix_flags & GNSS_FIX_TIME_VALID) != 0U) {
        valid |= COMPACT_TELEMETRY_V6_ENV_VALID_GNSS_TIME;
    }
    if (data->gnss_status_valid && (fix_flags & GNSS_FIX_GST_VALID) != 0U) {
        valid |= COMPACT_TELEMETRY_V6_ENV_VALID_GST_ALT;
    }
    if (valid == 0U || BeginV6Payload(
            data, legacy_node_label, last_command_id,
            COMPACT_TELEMETRY_V6_SCOPE_ENVIRONMENT, valid, fix_flags, output) != 0) {
        return valid == 0U ? COMPACT_TELEMETRY_ERR_EMPTY_METRICS : -1;
    }
    WriteUint32Be(output, 20U, data->uptime);
    if ((valid & COMPACT_TELEMETRY_V6_ENV_VALID_BATTERY) != 0U) {
        WriteUint16Be(output, 24U, data->battery_voltage_mv > USHRT_MAX ? USHRT_MAX : data->battery_voltage_mv);
        output[26] = (unsigned char)(data->battery_level < 0 ? 0 :
            (data->battery_level > 100 ? 100 : data->battery_level));
        output[27] = (unsigned char)(data->battery_estimate_quality < 0 ? 0 :
            (data->battery_estimate_quality > 255 ? 255 : data->battery_estimate_quality));
    }
    if ((valid & COMPACT_TELEMETRY_V6_ENV_VALID_SOIL) != 0U) {
        WriteInt16Be(output, 28U, ScaleSigned(data->soil_temperature, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteUint16Be(output, 30U, ScaleUnsigned(data->soil_moisture, 100.0f, USHRT_MAX - 1U));
    }
    if ((valid & COMPACT_TELEMETRY_V6_ENV_VALID_SOIL_EC) != 0U) {
        WriteUint16Be(output, 32U, ScaleUnsigned(data->soil_ec, 1.0f, USHRT_MAX - 1U));
    }
    if ((valid & COMPACT_TELEMETRY_V6_ENV_VALID_GEOID) != 0U) {
        WriteInt24Be(output, 34U, data->gnss.geoid_separation_mm);
    }
    if ((valid & COMPACT_TELEMETRY_V6_ENV_VALID_GNSS_TIME) != 0U) {
        WriteUint16Be(output, 37U, data->gnss.gnss_week);
        WriteUint32Be(output, 39U, data->gnss.gnss_tow_ms);
    }
    if ((valid & COMPACT_TELEMETRY_V6_ENV_VALID_GST_ALT) != 0U) {
        WriteUint16Be(output, 43U, data->gnss.gst_sigma_alt_mm);
    }
    return COMPACT_TELEMETRY_V6_PAYLOAD_BYTES;
}

static int BuildCompactTelemetryV6Audit(
    const SensorData *data,
    const GnssRtcmInjectionStats *rtcm_stats,
    const GnssRtcmRuntimeStatus *rtcm_runtime,
    const char *legacy_node_label,
    const char *last_command_id,
    uint16_t fix_flags,
    unsigned char *output)
{
    unsigned int valid = COMPACT_TELEMETRY_V6_AUDIT_VALID_RTCM_RUNTIME;
    unsigned int error_flags = 0U;
    uint32_t queue_drops;
    uint32_t fixed_packed;
    uint32_t streak = data->gnss.fix_streak_s > 4094U ? 4095U : data->gnss.fix_streak_s;
    uint32_t ratio = data->gnss.fixed_ratio_1m_permille;
    uint32_t drops = data->gnss.fix_drop_count > 1022U ? 1023U : data->gnss.fix_drop_count;

    if (data->gnss_status_valid) valid |= COMPACT_TELEMETRY_V6_AUDIT_VALID_GNSS_FIX;
    if ((fix_flags & GNSS_FIX_FIXED_STATS_VALID) != 0U && ratio <= 1000U) {
        valid |= COMPACT_TELEMETRY_V6_AUDIT_VALID_FIXED_STATS;
    } else {
        ratio = 1023U;
    }
    if ((fix_flags & GNSS_FIX_STATION_VALID) != 0U) {
        valid |= COMPACT_TELEMETRY_V6_AUDIT_VALID_STATION;
    }
    if ((fix_flags & GNSS_FIX_GST_VALID) != 0U) {
        valid |= COMPACT_TELEMETRY_V6_AUDIT_VALID_GST_HORIZONTAL;
    }
    if (BeginV6Payload(
            data, legacy_node_label, last_command_id,
            COMPACT_TELEMETRY_V6_SCOPE_AUDIT, valid, fix_flags, output) != 0) {
        return -1;
    }

    queue_drops = SaturatingAddUint32(rtcm_stats->queue_evictions, rtcm_stats->queue_expired_frames);
    queue_drops = SaturatingAddUint32(queue_drops, rtcm_stats->injection_dropped_frames);
    if (rtcm_stats->rejected_fragments != 0U) error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_REJECTED_FRAGMENT;
    if (rtcm_stats->crc_errors != 0U) error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_CRC;
    if (queue_drops != 0U) error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_QUEUE_DROP;
    if (rtcm_stats->uart_write_errors != 0U) error_flags |= COMPACT_TELEMETRY_V5_RTCM_ERROR_UART;
    if (rtcm_stats->injected_frames > USHRT_MAX) error_flags |= COMPACT_TELEMETRY_V5_RTCM_INJECTED_COUNT_SATURATED;

    output[20] = rtcm_runtime->mode;
    output[21] = rtcm_runtime->state_flags;
    output[22] = (unsigned char)(
        ((rtcm_runtime->queue_pending > 15U ? 15U : rtcm_runtime->queue_pending) << 4) |
        (rtcm_runtime->queue_high_watermark > 15U ? 15U : rtcm_runtime->queue_high_watermark));
    output[23] = (unsigned char)error_flags;
    WriteUint32Be(output, 24U, rtcm_runtime->session_epoch);
    WriteUint16Be(output, 28U, QuantizeCeilUint16(rtcm_runtime->lease_remaining_ms, 100U));
    WriteUint16Be(output, 30U, QuantizeAgeUint16(rtcm_runtime->last_completed_frame_age_ms, 10U));
    WriteUint16Be(output, 32U, SaturateUint16(rtcm_stats->injected_frames));
    WriteUint16Be(output, 34U, fix_flags);
    fixed_packed = (streak << 20) | (ratio << 10) | drops;
    WriteUint32Be(output, 36U, fixed_packed);
    WriteUint16Be(output, 40U, data->gnss.reference_station_id);
    WriteUint16Be(output, 42U, data->gnss.gst_sigma_lat_mm);
    WriteUint16Be(output, 44U, data->gnss.gst_sigma_lon_mm);
    return COMPACT_TELEMETRY_V6_PAYLOAD_BYTES;
}

int BuildCompactTelemetryV6(
    const SensorData *data,
    const GnssRtcmInjectionStats *rtcm_stats,
    const GnssRtcmRuntimeStatus *rtcm_runtime,
    unsigned int scope,
    const char *legacy_node_label,
    const char *last_command_id,
    unsigned char *output,
    int output_size)
{
    uint16_t fix_flags;
    if (data == NULL || rtcm_stats == NULL || rtcm_runtime == NULL || output == NULL ||
        data->seq == 0U || data->sample_epoch == 0U ||
        output_size < COMPACT_TELEMETRY_V6_PAYLOAD_BYTES) {
        return -1;
    }
    fix_flags = SanitizedV6GnssFixFlags(data);
    if (!data->gnss_status_valid) fix_flags = 0U;
    if (scope == COMPACT_TELEMETRY_V6_SCOPE_CORE) {
        return BuildCompactTelemetryV6Core(data, legacy_node_label, last_command_id, fix_flags, output);
    }
    if (scope == COMPACT_TELEMETRY_V6_SCOPE_ENVIRONMENT) {
        return BuildCompactTelemetryV6Environment(data, legacy_node_label, last_command_id, fix_flags, output);
    }
    if (scope == COMPACT_TELEMETRY_V6_SCOPE_AUDIT) {
        return BuildCompactTelemetryV6Audit(
            data, rtcm_stats, rtcm_runtime, legacy_node_label, last_command_id, fix_flags, output);
    }
    return -1;
}
