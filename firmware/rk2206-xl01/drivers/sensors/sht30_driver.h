/*
 * SHT30 Temperature & Humidity Sensor Driver
 * I2C-based sensor driver
 */

#ifndef DRIVERS_SENSORS_SHT30_DRIVER_H
#define DRIVERS_SENSORS_SHT30_DRIVER_H

/**
 * Initialize SHT30 sensor
 * @return 0 on success, negative on error
 */
int SHT30_Init(void);

/**
 * Read temperature and humidity
 * @param temp Output: temperature in °C
 * @param humi Output: humidity in %
 * @return 0 on success, negative on error
 */
int SHT30_Read(float *temp, float *humi);

#endif // DRIVERS_SENSORS_SHT30_DRIVER_H
