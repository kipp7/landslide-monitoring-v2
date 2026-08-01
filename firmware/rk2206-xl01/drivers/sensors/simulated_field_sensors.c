#include "simulated_field_sensors.h"

#include <stddef.h>

static int Triangle(unsigned int phase, unsigned int period, int amplitude)
{
    unsigned int half;
    unsigned int position;
    int rising;

    if (period < 2U || amplitude <= 0) {
        return 0;
    }
    half = period / 2U;
    position = phase % period;
    rising = position < half ? (int)position : (int)(period - position);
    return (rising * amplitude * 2) / (int)half - amplitude;
}

void SimulatedFieldSensors_Read(
    SensorData *data,
    unsigned int uptime_seconds,
    char node_label
)
{
    int node_offset;

    if (data == NULL) {
        return;
    }
    node_offset = node_label >= 'A' && node_label <= 'C' ? (int)(node_label - 'A') : 0;

    data->soil_temperature = 22.5f + (float)node_offset * 0.4f +
                             (float)Triangle(uptime_seconds, 120U, 20) / 100.0f;
    data->soil_moisture = 46.0f + (float)node_offset * 1.5f +
                          (float)Triangle(uptime_seconds + 13U, 180U, 80) / 100.0f;
    data->soil_ec = 620.0f + (float)(node_offset * 25) +
                    (float)Triangle(uptime_seconds + 29U, 90U, 12);
    data->soil_valid = 1;
    data->soil_ec_valid = 1;

    data->angle_x = 1.10f + (float)node_offset * 0.12f +
                    (float)Triangle(uptime_seconds + 7U, 80U, 18) / 100.0f;
    data->angle_y = -0.45f + (float)node_offset * 0.08f +
                    (float)Triangle(uptime_seconds + 19U, 100U, 12) / 100.0f;
    data->angle_z = (float)Triangle(uptime_seconds + 31U, 140U, 8) / 100.0f;
    data->tilt_valid = 1;
    data->simulated_field_data = 1;
}
