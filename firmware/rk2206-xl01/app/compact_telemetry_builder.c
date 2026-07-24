#include "compact_telemetry_builder.h"

#include <limits.h>
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
    OFFSET_TEMPERATURE = 20,
    OFFSET_HUMIDITY = 22,
    OFFSET_SOIL_TEMPERATURE = 24,
    OFFSET_SOIL_MOISTURE = 26,
    OFFSET_SOIL_EC = 28,
    OFFSET_TILT_X = 30,
    OFFSET_TILT_Y = 32,
    OFFSET_TILT_Z = 34,
    OFFSET_GPS_LATITUDE = 36,
    OFFSET_GPS_LONGITUDE = 40,
    OFFSET_RAIN_TOTAL = 44
};

typedef char CompactTelemetryPayloadSizeCheck[
    COMPACT_TELEMETRY_V1_PAYLOAD_BYTES == 46 ? 1 : -1
];

static void WriteUint16Be(unsigned char *output, unsigned int offset, unsigned int value)
{
    output[offset] = (unsigned char)((value >> 8) & 0xFFU);
    output[offset + 1U] = (unsigned char)(value & 0xFFU);
}

static void WriteInt16Be(unsigned char *output, unsigned int offset, int value)
{
    WriteUint16Be(output, offset, (unsigned int)((unsigned short)value));
}

static void WriteUint32Be(unsigned char *output, unsigned int offset, unsigned int value)
{
    output[offset] = (unsigned char)((value >> 24) & 0xFFU);
    output[offset + 1U] = (unsigned char)((value >> 16) & 0xFFU);
    output[offset + 2U] = (unsigned char)((value >> 8) & 0xFFU);
    output[offset + 3U] = (unsigned char)(value & 0xFFU);
}

static void WriteInt32Be(unsigned char *output, unsigned int offset, int value)
{
    WriteUint32Be(output, offset, (unsigned int)value);
}

static int ScaleSigned(float value, float scale, int minimum, int maximum)
{
    float scaled = value * scale;

    if (scaled <= (float)minimum) {
        return minimum;
    }
    if (scaled >= (float)maximum) {
        return maximum;
    }
    return scaled >= 0.0f ? (int)(scaled + 0.5f) : (int)(scaled - 0.5f);
}

static unsigned int ScaleUnsigned(float value, float scale, unsigned int maximum)
{
    float scaled = value * scale;

    if (scaled <= 0.0f) {
        return 0U;
    }
    if (scaled >= (float)maximum) {
        return maximum;
    }
    return (unsigned int)(scaled + 0.5f);
}

static unsigned char NodeNumber(const char *legacy_node_label)
{
    if (legacy_node_label == NULL) {
        return 0U;
    }
    if (legacy_node_label[0] == 'A' && legacy_node_label[1] == '\0') {
        return 1U;
    }
    if (legacy_node_label[0] == 'B' && legacy_node_label[1] == '\0') {
        return 2U;
    }
    if (legacy_node_label[0] == 'C' && legacy_node_label[1] == '\0') {
        return 3U;
    }
    return 0U;
}

static unsigned char UploadTriggerCode(const char *upload_trigger)
{
    if (upload_trigger == NULL) {
        return COMPACT_TELEMETRY_TRIGGER_UNKNOWN;
    }
    if (strcmp(upload_trigger, "scheduler_poll") == 0) {
        return COMPACT_TELEMETRY_TRIGGER_SCHEDULER_POLL;
    }
    if (strcmp(upload_trigger, "manual_collect") == 0) {
        return COMPACT_TELEMETRY_TRIGGER_MANUAL_COLLECT;
    }
    if (strcmp(upload_trigger, "periodic") == 0) {
        return COMPACT_TELEMETRY_TRIGGER_PERIODIC;
    }
    return COMPACT_TELEMETRY_TRIGGER_UNKNOWN;
}

unsigned int CompactTelemetry_CommandTag(const char *command_id)
{
    unsigned int hash = 2166136261U;
    const unsigned char *cursor = (const unsigned char *)command_id;

    if (command_id == NULL || command_id[0] == '\0') {
        return 0U;
    }

    while (*cursor != 0U) {
        hash ^= (unsigned int)(*cursor);
        hash *= 16777619U;
        cursor++;
    }

    return hash;
}

int BuildCompactTelemetryV1(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size
)
{
    unsigned int valid_flags = 0U;
    unsigned char node_number;

    if (data == NULL || output == NULL || output_size < COMPACT_TELEMETRY_V1_PAYLOAD_BYTES) {
        return -1;
    }

    node_number = NodeNumber(legacy_node_label);
    if (node_number == 0U) {
        return -1;
    }

    if (data->temp_valid) {
        valid_flags |= COMPACT_TELEMETRY_VALID_TEMP;
    }
    if (data->soil_valid) {
        valid_flags |= COMPACT_TELEMETRY_VALID_SOIL;
    }
    if (data->soil_ec_valid) {
        valid_flags |= COMPACT_TELEMETRY_VALID_SOIL_EC;
    }
    if (data->tilt_valid || data->imu_valid) {
        valid_flags |= COMPACT_TELEMETRY_VALID_TILT;
    }
    if (data->gps_valid) {
        valid_flags |= COMPACT_TELEMETRY_VALID_GPS;
    }
    if (data->rain_valid) {
        valid_flags |= COMPACT_TELEMETRY_VALID_RAIN;
    }
    if (data->imu_valid) {
        valid_flags |= COMPACT_TELEMETRY_VALID_IMU;
    }
    if (valid_flags == 0U) {
        return COMPACT_TELEMETRY_ERR_EMPTY_METRICS;
    }

    memset(output, 0, COMPACT_TELEMETRY_V1_PAYLOAD_BYTES);
    output[OFFSET_MAGIC_0] = 'L';
    output[OFFSET_MAGIC_1] = 'S';
    output[OFFSET_VERSION] = 1U;
    output[OFFSET_NODE] = node_number;
    output[OFFSET_FLAGS] = data->warning ? 1U : 0U;
    output[OFFSET_TRIGGER] = UploadTriggerCode(upload_trigger);
    WriteUint16Be(output, OFFSET_VALID, valid_flags);
    WriteUint32Be(output, OFFSET_SEQ, data->seq);
    WriteUint32Be(output, OFFSET_UPTIME, data->uptime);
    WriteUint32Be(output, OFFSET_COMMAND_TAG, CompactTelemetry_CommandTag(last_command_id));

    if (data->temp_valid) {
        WriteInt16Be(output, OFFSET_TEMPERATURE, ScaleSigned(data->temperature, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteUint16Be(output, OFFSET_HUMIDITY, ScaleUnsigned(data->humidity, 100.0f, USHRT_MAX - 1U));
    }
    if (data->soil_valid) {
        WriteInt16Be(output, OFFSET_SOIL_TEMPERATURE, ScaleSigned(data->soil_temperature, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteUint16Be(output, OFFSET_SOIL_MOISTURE, ScaleUnsigned(data->soil_moisture, 100.0f, USHRT_MAX - 1U));
    }
    if (data->soil_ec_valid) {
        WriteUint16Be(output, OFFSET_SOIL_EC, ScaleUnsigned(data->soil_ec, 1.0f, USHRT_MAX - 1U));
    }
    if (data->tilt_valid || data->imu_valid) {
        WriteInt16Be(output, OFFSET_TILT_X, ScaleSigned(data->angle_x, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteInt16Be(output, OFFSET_TILT_Y, ScaleSigned(data->angle_y, 100.0f, SHRT_MIN + 1, SHRT_MAX));
        WriteInt16Be(output, OFFSET_TILT_Z, ScaleSigned(data->angle_z, 100.0f, SHRT_MIN + 1, SHRT_MAX));
    }
    if (data->gps_valid) {
        WriteInt32Be(output, OFFSET_GPS_LATITUDE, ScaleSigned(data->latitude, 1000000.0f, INT_MIN + 1, INT_MAX));
        WriteInt32Be(output, OFFSET_GPS_LONGITUDE, ScaleSigned(data->longitude, 1000000.0f, INT_MIN + 1, INT_MAX));
    }
    if (data->rain_valid) {
        WriteUint16Be(output, OFFSET_RAIN_TOTAL, ScaleUnsigned(data->rain_total, 10.0f, USHRT_MAX - 1U));
    }

    return COMPACT_TELEMETRY_V1_PAYLOAD_BYTES;
}
