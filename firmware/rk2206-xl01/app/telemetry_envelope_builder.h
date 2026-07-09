#ifndef APP_TELEMETRY_ENVELOPE_BUILDER_H
#define APP_TELEMETRY_ENVELOPE_BUILDER_H

#include "sensor_data.h"

#ifdef __cplusplus
extern "C" {
#endif

int BuildTelemetryEnvelopeV1(const SensorData *data, char *output, int output_size);

#ifdef __cplusplus
}
#endif

#endif // APP_TELEMETRY_ENVELOPE_BUILDER_H
