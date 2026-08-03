#ifndef DRIVERS_SENSORS_FIELD_SENSORS_RS485_H
#define DRIVERS_SENSORS_FIELD_SENSORS_RS485_H

#include <stdint.h>

typedef struct {
    float soil_temperature_c;
    float soil_moisture_pct;
    float soil_ec_us_cm;
    int soil_ec_valid;
    int soil_valid;

    float tilt_x_deg;
    float tilt_y_deg;
    float tilt_z_deg;
    int tilt_valid;

    float rain_total_mm;
    int rain_valid;
} FieldRs485Readings;

#define FIELD_RS485_DIAG_SOIL_MATCH (1U << 0)
#define FIELD_RS485_DIAG_TILT_MATCH (1U << 1)

typedef struct {
    uint8_t found;
    uint8_t channel;
    uint8_t function_code;
    uint8_t slave_addr;
    uint16_t start_reg;
    uint16_t reg_count;
    uint32_t baudrate;
    uint32_t xtal_hz;
} FieldRs485ProbeMatch;

typedef struct {
    uint8_t scan_started;
    uint8_t scan_completed;
    uint8_t restore_ok;
    uint8_t match_mask;
    uint16_t attempts;
    uint16_t successful_probes;
    uint32_t duration_ms;
    FieldRs485ProbeMatch soil;
    FieldRs485ProbeMatch tilt;
} FieldRs485Diagnostics;

int FieldRs485_Init(void);
/* Timeout-based diagnostics require the scheduler tick to be running. */
void FieldRs485_RunDiagnostics(void);
int FieldRs485_Read(FieldRs485Readings *out);
void FieldRs485_GetDiagnostics(FieldRs485Diagnostics *snapshot);

#endif // DRIVERS_SENSORS_FIELD_SENSORS_RS485_H
