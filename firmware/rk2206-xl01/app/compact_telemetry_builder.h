#ifndef APP_COMPACT_TELEMETRY_BUILDER_H
#define APP_COMPACT_TELEMETRY_BUILDER_H

#include "sensor_data.h"

#ifdef __cplusplus
extern "C" {
#endif

#define COMPACT_TELEMETRY_V1_PAYLOAD_BYTES 46
#define COMPACT_TELEMETRY_ERR_EMPTY_METRICS (-2)

enum {
    COMPACT_TELEMETRY_TRIGGER_UNKNOWN = 0,
    COMPACT_TELEMETRY_TRIGGER_PERIODIC = 1,
    COMPACT_TELEMETRY_TRIGGER_MANUAL_COLLECT = 2,
    COMPACT_TELEMETRY_TRIGGER_SCHEDULER_POLL = 3
};

enum {
    COMPACT_TELEMETRY_VALID_TEMP = 1U << 0,
    COMPACT_TELEMETRY_VALID_SOIL = 1U << 1,
    COMPACT_TELEMETRY_VALID_SOIL_EC = 1U << 2,
    COMPACT_TELEMETRY_VALID_TILT = 1U << 3,
    COMPACT_TELEMETRY_VALID_GPS = 1U << 4,
    COMPACT_TELEMETRY_VALID_RAIN = 1U << 5,
    COMPACT_TELEMETRY_VALID_IMU = 1U << 6
};

unsigned int CompactTelemetry_CommandTag(const char *command_id);

int BuildCompactTelemetryV1(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size
);

#ifdef __cplusplus
}
#endif

#endif // APP_COMPACT_TELEMETRY_BUILDER_H
