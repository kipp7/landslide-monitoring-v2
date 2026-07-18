#ifndef DRIVERS_SENSORS_FIELD_SENSORS_RS485_H
#define DRIVERS_SENSORS_FIELD_SENSORS_RS485_H

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

int FieldRs485_Init(void);
int FieldRs485_Read(FieldRs485Readings *out);

#endif // DRIVERS_SENSORS_FIELD_SENSORS_RS485_H
