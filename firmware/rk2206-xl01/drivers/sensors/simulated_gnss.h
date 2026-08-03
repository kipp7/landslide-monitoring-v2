#ifndef DRIVERS_SENSORS_SIMULATED_GNSS_H
#define DRIVERS_SENSORS_SIMULATED_GNSS_H

#include "../../app/sensor_data.h"

#ifdef __cplusplus
extern "C" {
#endif

void SimulatedGnss_Read(
    SensorData *data,
    unsigned int uptime_seconds,
    char node_label
);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_SIMULATED_GNSS_H
