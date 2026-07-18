#include "telemetry_envelope_builder.h"
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include "device_identity.h"
#include "../config/app_config.h"

#ifndef RS485_SOIL_HAS_EC
#define RS485_SOIL_HAS_EC 0
#endif

static int AppendJsonChunk(char *output, int output_size, int *offset, const char *format, ...)
{
    char chunk[160];
    int written;
    va_list args;

    if (output == NULL || offset == NULL || format == NULL || output_size <= 0) {
        return -1;
    }

    if (*offset < 0 || *offset >= output_size) {
        return -1;
    }

    va_start(args, format);
    written = vsnprintf(
        chunk,
        sizeof(chunk),
        format,
        args
    );
    va_end(args);

    if (written < 0 || written >= (int)sizeof(chunk) || (*offset + written) >= output_size) {
        return -1;
    }

    memcpy(output + *offset, chunk, (size_t)written);
    output[*offset + written] = '\0';
    *offset += written;
    return written;
}

static int BeginJsonField(char *output, int output_size, int *offset, int *field_count)
{
    if (output == NULL || offset == NULL || field_count == NULL) {
        return -1;
    }

    if (*field_count > 0) {
        if (AppendJsonChunk(output, output_size, offset, ",") < 0) {
            return -1;
        }
    }

    (*field_count)++;
    return 0;
}

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
)
{
    int len = 0;
    int metric_count = 0;

    if (data == NULL || output == NULL || output_size <= 0) {
        return -1;
    }

    const DeviceIdentity *identity = DeviceIdentity_Get();
    if (identity == NULL || identity->device_id == NULL) {
        return -1;
    }

    if (last_command_type == NULL) {
        last_command_type = "";
    }
    if (last_command_id == NULL) {
        last_command_id = "";
    }
    if (upload_trigger == NULL) {
        upload_trigger = "periodic";
    }
    if (time_source == NULL) {
        time_source = "";
    }

    output[0] = '\0';

    if (AppendJsonChunk(output, output_size, &len, "{\"schema_version\":1,") < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"device_id\":\"%s\",", identity->device_id) < 0 ||
        (event_ts != NULL && event_ts[0] != '\0'
            ? AppendJsonChunk(output, output_size, &len, "\"event_ts\":\"%s\",", event_ts)
            : AppendJsonChunk(output, output_size, &len, "\"event_ts\":null,")) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"seq\":%u,", data->seq) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"metrics\":{") < 0) {
        output[0] = '\0';
        return -1;
    }

    if (data->temp_valid) {
        if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"temperature_c\":%.1f", data->temperature) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"humidity_pct\":%.1f", data->humidity) < 0) {
            output[0] = '\0';
            return -1;
        }
    }

    if (data->soil_valid) {
        if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"soil_temperature_c\":%.*f", RS485_SOIL_TEMPERATURE_DECIMALS, data->soil_temperature) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"soil_moisture_pct\":%.*f", RS485_SOIL_MOISTURE_DECIMALS, data->soil_moisture) < 0) {
            output[0] = '\0';
            return -1;
        }
#if RS485_SOIL_HAS_EC
        if (data->soil_ec_valid) {
            if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
                AppendJsonChunk(output, output_size, &len, "\"electrical_conductivity_us_cm\":%.0f", data->soil_ec) < 0) {
                output[0] = '\0';
                return -1;
            }
        }
#endif
    }

    if (data->imu_valid) {
        if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"accel_x_g\":%.2f", data->accel_x) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"accel_y_g\":%.2f", data->accel_y) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"accel_z_g\":%.2f", data->accel_z) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"gyro_x_dps\":%.1f", data->gyro_x) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"gyro_y_dps\":%.1f", data->gyro_y) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"gyro_z_dps\":%.1f", data->gyro_z) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"tilt_x_deg\":%.*f", RS485_TILT_DECIMALS, data->angle_x) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"tilt_y_deg\":%.*f", RS485_TILT_DECIMALS, data->angle_y) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"warning_flag\":%s", data->warning ? "true" : "false") < 0) {
            output[0] = '\0';
            return -1;
        }
    }

    if (!data->imu_valid && data->tilt_valid) {
        if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"tilt_x_deg\":%.*f", RS485_TILT_DECIMALS, data->angle_x) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"tilt_y_deg\":%.*f", RS485_TILT_DECIMALS, data->angle_y) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"tilt_z_deg\":%.*f", RS485_TILT_DECIMALS, data->angle_z) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"warning_flag\":%s", data->warning ? "true" : "false") < 0) {
            output[0] = '\0';
            return -1;
        }
    }

    if (data->rain_valid) {
        if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"rain_total_mm\":%.1f", data->rain_total) < 0) {
            output[0] = '\0';
            return -1;
        }
    }

    if (data->gps_valid) {
        if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"gps_latitude\":%.6f", data->latitude) < 0 ||
            BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"gps_longitude\":%.6f", data->longitude) < 0) {
            output[0] = '\0';
            return -1;
        }
    }

    if (data->battery_level >= 1 && data->battery_level <= 100) {
        if (BeginJsonField(output, output_size, &len, &metric_count) < 0 ||
            AppendJsonChunk(output, output_size, &len, "\"battery_pct\":%d", data->battery_level) < 0) {
            output[0] = '\0';
            return -1;
        }
    }

    if (metric_count == 0) {
        output[0] = '\0';
        return TELEMETRY_ENVELOPE_ERR_EMPTY_METRICS;
    }

    if (AppendJsonChunk(output, output_size, &len, "},") < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"meta\":{") < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"install_label\":\"%s\",", identity->install_label) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"legacy_node\":\"%s\",", identity->legacy_node_label) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"uptime_s\":%u,", data->uptime) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"last_command_type\":\"%s\",", last_command_type) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"last_command_id\":\"%s\",", last_command_id) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"last_command_uptime_s\":%u,", last_command_uptime_s) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"upload_trigger\":\"%s\",", upload_trigger) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"time_source\":\"%s\",", time_source) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"legacy_valid_flags\":{") < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"temp_ok\":%d,", data->temp_valid) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"imu_ok\":%d,", data->imu_valid) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"gps_ok\":%d,", data->gps_valid) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"soil_ok\":%d,", data->soil_valid) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"tilt_ok\":%d,", data->tilt_valid) < 0 ||
        AppendJsonChunk(output, output_size, &len, "\"rain_ok\":%d", data->rain_valid) < 0 ||
        AppendJsonChunk(output, output_size, &len, "}") < 0 ||
        AppendJsonChunk(output, output_size, &len, "}") < 0 ||
        AppendJsonChunk(output, output_size, &len, "}\n") < 0) {
        output[0] = '\0';
        return -1;
    }

    return len;
}
