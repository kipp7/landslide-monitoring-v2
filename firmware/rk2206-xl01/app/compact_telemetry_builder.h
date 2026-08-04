#ifndef APP_COMPACT_TELEMETRY_BUILDER_H
#define APP_COMPACT_TELEMETRY_BUILDER_H

#include "sensor_data.h"
#include "../drivers/xl01/gnss_rtcm_injection.h"

#ifdef __cplusplus
extern "C" {
#endif

#define COMPACT_TELEMETRY_V1_PAYLOAD_BYTES 46
#define COMPACT_TELEMETRY_V2_PAYLOAD_BYTES 46
#define COMPACT_TELEMETRY_V3_PAYLOAD_BYTES 95
#define COMPACT_TELEMETRY_V4_PAYLOAD_BYTES 139
#define COMPACT_TELEMETRY_V5_PAYLOAD_BYTES 110
#define COMPACT_TELEMETRY_V6_PAYLOAD_BYTES 46
// Keep the largest supported payload for shared test and task buffers.
#define COMPACT_TELEMETRY_PAYLOAD_BYTES COMPACT_TELEMETRY_V4_PAYLOAD_BYTES
#define COMPACT_TELEMETRY_ERR_EMPTY_METRICS (-2)

#define COMPACT_TELEMETRY_V5_LEASE_RESOLUTION_MS 100U
#define COMPACT_TELEMETRY_V5_COMPLETION_AGE_RESOLUTION_MS 10U
#define COMPACT_TELEMETRY_V5_AGE_UNAVAILABLE 0xFFFFU

enum {
    COMPACT_TELEMETRY_V5_RTCM_ERROR_REJECTED_FRAGMENT = 1U << 0,
    COMPACT_TELEMETRY_V5_RTCM_ERROR_CRC = 1U << 1,
    COMPACT_TELEMETRY_V5_RTCM_ERROR_QUEUE_DROP = 1U << 2,
    COMPACT_TELEMETRY_V5_RTCM_ERROR_UART = 1U << 3,
    COMPACT_TELEMETRY_V5_RTCM_INJECTED_COUNT_SATURATED = 1U << 4
};

enum {
    COMPACT_TELEMETRY_V6_SCOPE_CORE = 1,
    COMPACT_TELEMETRY_V6_SCOPE_ENVIRONMENT = 2,
    COMPACT_TELEMETRY_V6_SCOPE_AUDIT = 3
};

enum {
    COMPACT_TELEMETRY_V6_STATUS_WARNING = 1U << 0,
    COMPACT_TELEMETRY_V6_STATUS_FIELD_SENSORS_SIMULATED = 1U << 1,
    COMPACT_TELEMETRY_V6_STATUS_GNSS_SIMULATED = 1U << 2,
    COMPACT_TELEMETRY_V6_STATUS_RTK_TRUSTED = 1U << 3
};

enum {
    COMPACT_TELEMETRY_V6_CORE_VALID_TILT = 1U << 0,
    COMPACT_TELEMETRY_V6_CORE_VALID_GNSS_STATUS = 1U << 1,
    COMPACT_TELEMETRY_V6_CORE_VALID_POSITION = 1U << 2,
    COMPACT_TELEMETRY_V6_CORE_VALID_ALTITUDE = 1U << 3,
    COMPACT_TELEMETRY_V6_CORE_VALID_CORRECTION_AGE = 1U << 4,
    COMPACT_TELEMETRY_V6_CORE_VALID_SOLUTION_AGE = 1U << 5,
    COMPACT_TELEMETRY_V6_CORE_VALID_HDOP = 1U << 6,
    COMPACT_TELEMETRY_V6_CORE_VALID_GST_LAT = 1U << 7,
    COMPACT_TELEMETRY_V6_CORE_VALID_GST_LON = 1U << 8
};

enum {
    COMPACT_TELEMETRY_V6_ENV_VALID_BATTERY = 1U << 0,
    COMPACT_TELEMETRY_V6_ENV_VALID_SOIL = 1U << 1,
    COMPACT_TELEMETRY_V6_ENV_VALID_SOIL_EC = 1U << 2,
    COMPACT_TELEMETRY_V6_ENV_VALID_GEOID = 1U << 3,
    COMPACT_TELEMETRY_V6_ENV_VALID_GNSS_TIME = 1U << 4,
    COMPACT_TELEMETRY_V6_ENV_VALID_GST_ALT = 1U << 5
};

enum {
    COMPACT_TELEMETRY_V6_AUDIT_VALID_GNSS_FIX = 1U << 0,
    COMPACT_TELEMETRY_V6_AUDIT_VALID_FIXED_STATS = 1U << 1,
    COMPACT_TELEMETRY_V6_AUDIT_VALID_STATION = 1U << 2,
    COMPACT_TELEMETRY_V6_AUDIT_VALID_GST_HORIZONTAL = 1U << 3,
    COMPACT_TELEMETRY_V6_AUDIT_VALID_RTCM_RUNTIME = 1U << 4
};

enum {
    COMPACT_TELEMETRY_TRIGGER_UNKNOWN = 0,
    COMPACT_TELEMETRY_TRIGGER_PERIODIC = 1,
    COMPACT_TELEMETRY_TRIGGER_MANUAL_COLLECT = 2,
    COMPACT_TELEMETRY_TRIGGER_SCHEDULER_POLL = 3
};

enum {
    COMPACT_TELEMETRY_V3_VALID_BATTERY = 1U << 0,
    COMPACT_TELEMETRY_V3_VALID_SOIL = 1U << 1,
    COMPACT_TELEMETRY_V3_VALID_SOIL_EC = 1U << 2,
    COMPACT_TELEMETRY_V3_VALID_TILT = 1U << 3,
    COMPACT_TELEMETRY_V3_VALID_GNSS_STATUS = 1U << 4,
    COMPACT_TELEMETRY_V3_VALID_GNSS_POSITION = 1U << 5,
    COMPACT_TELEMETRY_V3_VALID_GNSS_ALTITUDE = 1U << 6,
    COMPACT_TELEMETRY_V3_VALID_GNSS_TIME = 1U << 7,
    COMPACT_TELEMETRY_V3_VALID_CORRECTION_AGE = 1U << 8,
    COMPACT_TELEMETRY_V3_VALID_HDOP = 1U << 9,
    COMPACT_TELEMETRY_V3_VALID_GST = 1U << 10,
    COMPACT_TELEMETRY_V3_VALID_FIXED_STATS = 1U << 11,
    COMPACT_TELEMETRY_V3_VALID_STATION = 1U << 12
};

enum {
    COMPACT_TELEMETRY_VALID_TEMP = 1U << 0,
    COMPACT_TELEMETRY_VALID_SOIL = 1U << 1,
    COMPACT_TELEMETRY_VALID_SOIL_EC = 1U << 2,
    COMPACT_TELEMETRY_VALID_TILT = 1U << 3,
    COMPACT_TELEMETRY_VALID_GPS = 1U << 4,
    COMPACT_TELEMETRY_VALID_RAIN = 1U << 5,
    COMPACT_TELEMETRY_VALID_IMU = 1U << 6,
    COMPACT_TELEMETRY_VALID_BATTERY = 1U << 7
};

enum {
    COMPACT_TELEMETRY_STATUS_WARNING = 1U << 0,
    COMPACT_TELEMETRY_STATUS_FIELD_SENSORS_SIMULATED = 1U << 1,
    COMPACT_TELEMETRY_STATUS_GNSS_SIMULATED = 1U << 2
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

int BuildCompactTelemetryV2(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size
);

int BuildCompactTelemetryV3(
    const SensorData *data,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size
);

int BuildCompactTelemetryV4(
    const SensorData *data,
    const GnssRtcmInjectionStats *rtcm_stats,
    const GnssRtcmRuntimeStatus *rtcm_runtime,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size
);

int BuildCompactTelemetryV5(
    const SensorData *data,
    const GnssRtcmInjectionStats *rtcm_stats,
    const GnssRtcmRuntimeStatus *rtcm_runtime,
    const char *legacy_node_label,
    const char *last_command_id,
    const char *upload_trigger,
    unsigned char *output,
    int output_size
);

int BuildCompactTelemetryV6(
    const SensorData *data,
    const GnssRtcmInjectionStats *rtcm_stats,
    const GnssRtcmRuntimeStatus *rtcm_runtime,
    unsigned int scope,
    const char *legacy_node_label,
    const char *last_command_id,
    unsigned char *output,
    int output_size
);

#ifdef __cplusplus
}
#endif

#endif // APP_COMPACT_TELEMETRY_BUILDER_H
