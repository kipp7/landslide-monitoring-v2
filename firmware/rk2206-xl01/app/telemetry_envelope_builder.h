#ifndef APP_TELEMETRY_ENVELOPE_BUILDER_H
#define APP_TELEMETRY_ENVELOPE_BUILDER_H

#include "sensor_data.h"

#ifdef __cplusplus
extern "C" {
#endif

#define TELEMETRY_ENVELOPE_ERR_EMPTY_METRICS (-2)

int BuildTelemetryEnvelopeV1(
    const SensorData *data,
    const char *last_command_type,
    const char *last_command_id,
    unsigned int last_command_uptime_s,
    const char *upload_trigger,
    const char *event_ts,
    const char *time_source,
    char *output,
    int output_size
);

#ifdef __cplusplus
}
#endif

#endif // APP_TELEMETRY_ENVELOPE_BUILDER_H
