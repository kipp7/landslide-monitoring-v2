#ifndef DRIVERS_SENSORS_BATTERY_MONITOR_H
#define DRIVERS_SENSORS_BATTERY_MONITOR_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    BATTERY_ESTIMATE_QUALITY_UNAVAILABLE = 0,
    BATTERY_ESTIMATE_QUALITY_DEFAULT_CALIBRATION = 1,
    BATTERY_ESTIMATE_QUALITY_FIELD_CALIBRATED = 2
};

typedef struct {
    uint16_t raw_adc;
    uint32_t pack_voltage_mv;
    uint8_t percentage;
    uint8_t estimate_quality;
} BatteryReading;

int BatteryMonitor_Init(void);
int BatteryMonitor_Read(BatteryReading *reading);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_BATTERY_MONITOR_H
