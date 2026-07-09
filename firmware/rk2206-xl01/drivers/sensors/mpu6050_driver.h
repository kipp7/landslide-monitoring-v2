/*
 * MPU6050 6-Axis IMU Sensor Driver
 * I2C-based accelerometer and gyroscope
 */

#ifndef DRIVERS_SENSORS_MPU6050_DRIVER_H
#define DRIVERS_SENSORS_MPU6050_DRIVER_H

/**
 * Initialize MPU6050 sensor
 * @return 0 on success, negative on error
 */
int MPU6050_Init(void);

/**
 * Read accelerometer and gyroscope data
 * @param ax, ay, az Output: acceleration in g
 * @param gx, gy, gz Output: angular velocity in °/s
 * @return 0 on success, negative on error
 */
int MPU6050_Read(float *ax, float *ay, float *az,
                 float *gx, float *gy, float *gz);

#endif // DRIVERS_SENSORS_MPU6050_DRIVER_H
