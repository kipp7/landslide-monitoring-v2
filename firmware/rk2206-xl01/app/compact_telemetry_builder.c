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
    OFFSET_V4_UART_ERRORS = 137
};

typedef char CompactTelemetryPayloadSizeCheck[
    COMPACT_TELEMETRY_V1_PAYLOAD_BYTES == 46 &&
    COMPACT_TELEMETRY_V2_PAYLOAD_BYTES == 46 &&
    COMPACT_TELEMETRY_V3_PAYLOAD_BYTES == 95 &&
    COMPACT_TELEMETRY_V4_PAYLOAD_BYTES == 139 ? 1 : -1
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

static uint16_t SaturateUint16(uint32_t value)
{
    return value > USHRT_MAX ? USHRT_MAX : (uint16_t)value;
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
    queue_drops = rtcm_stats->queue_evictions + rtcm_stats->queue_expired_frames;
    if (UINT32_MAX - queue_drops < rtcm_stats->injection_dropped_frames) {
        queue_drops = UINT32_MAX;
    } else {
        queue_drops += rtcm_stats->injection_dropped_frames;
    }
    WriteUint16Be(output, OFFSET_V4_QUEUE_DROPS, SaturateUint16(queue_drops));
    WriteUint16Be(output, OFFSET_V4_UART_ERRORS,
                  SaturateUint16(rtcm_stats->uart_write_errors));
    return COMPACT_TELEMETRY_V4_PAYLOAD_BYTES;
}
