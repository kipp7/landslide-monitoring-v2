#include "telemetry_envelope_builder.h"
#include <stdio.h>
#include "device_identity.h"

int BuildTelemetryEnvelopeV1(const SensorData *data, char *output, int output_size)
{
    if (data == NULL || output == NULL || output_size <= 0) {
        return -1;
    }

    const DeviceIdentity *identity = DeviceIdentity_Get();
    if (identity == NULL || identity->device_id == NULL) {
        return -1;
    }

    return snprintf(
        output,
        (size_t)output_size,
        "{\"schema_version\":1,"
        "\"device_id\":\"%s\","
        "\"event_ts\":null,"
        "\"seq\":%u,"
        "\"metrics\":{"
        "\"temperature_c\":%.1f,"
        "\"humidity_pct\":%.1f,"
        "\"accel_x_g\":%.2f,"
        "\"accel_y_g\":%.2f,"
        "\"accel_z_g\":%.2f,"
        "\"gyro_x_dps\":%.1f,"
        "\"gyro_y_dps\":%.1f,"
        "\"gyro_z_dps\":%.1f,"
        "\"tilt_x_deg\":%.2f,"
        "\"tilt_y_deg\":%.2f,"
        "\"gps_latitude\":%.6f,"
        "\"gps_longitude\":%.6f,"
        "\"battery_pct\":%d,"
        "\"warning_flag\":%s"
        "},"
        "\"meta\":{"
        "\"install_label\":\"%s\","
        "\"legacy_node\":\"%s\","
        "\"uptime_s\":%u,"
        "\"legacy_valid_flags\":{"
        "\"temp_ok\":%d,"
        "\"imu_ok\":%d,"
        "\"gps_ok\":%d"
        "}"
        "}"
        "}\n",
        identity->device_id,
        data->seq,
        data->temperature,
        data->humidity,
        data->accel_x,
        data->accel_y,
        data->accel_z,
        data->gyro_x,
        data->gyro_y,
        data->gyro_z,
        data->angle_x,
        data->angle_y,
        data->latitude,
        data->longitude,
        data->battery_level,
        data->warning ? "true" : "false",
        identity->install_label,
        identity->legacy_node_label,
        data->uptime,
        data->temp_valid,
        data->imu_valid,
        data->gps_valid
    );
}
