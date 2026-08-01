#ifndef DRIVERS_SENSORS_SIMULATED_FIELD_SENSORS_H
#define DRIVERS_SENSORS_SIMULATED_FIELD_SENSORS_H

#include "../../app/sensor_data.h"

#ifdef __cplusplus
extern "C" {
#endif

// Generates only the values normally supplied by the two RS485 channels.
// It does not initialize or access GPIO, I2C, UART or ADC hardware.
void SimulatedFieldSensors_Read(
    SensorData *data,
    unsigned int uptime_seconds,
    char node_label
);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_SIMULATED_FIELD_SENSORS_H
