/*
 * MPU6050 Sensor Implementation
 */

#include "mpu6050_driver.h"
#include <stdio.h>
#include <stdint.h>
#include "los_task.h"
#include "iot_i2c.h"
#include "iot_errno.h"

// MPU6050 I2C Address (moved from config to avoid dependency)
#ifndef MPU6050_I2C_ADDR
#define MPU6050_I2C_ADDR    0x68
#endif

#ifndef I2C_IDX
#define I2C_IDX             EI2C0_M0  // ✓ 改为PB4=SDA, PB5=SCL（释放PB6/PB7给GPS）
#endif

#ifndef I2C_BAUDRATE
#define I2C_BAUDRATE        EI2C_FRE_100K
#endif

// MPU6050 Register Definitions
#define MPU6050_REG_PWR_MGMT_1      0x6B    // Power management 1
#define MPU6050_REG_WHO_AM_I        0x75    // Device ID register
#define MPU6050_REG_ACCEL_CONFIG    0x1C    // Accelerometer config
#define MPU6050_REG_GYRO_CONFIG     0x1B    // Gyroscope config
#define MPU6050_REG_CONFIG          0x1A    // General config
#define MPU6050_REG_ACCEL_XOUT_H    0x3B    // Accelerometer X high byte

// ==================== Private Functions ====================

static int MPU6050_WriteReg(uint8_t reg, uint8_t value)
{
    uint8_t data[2] = {reg, value};
    return IoTI2cWrite(I2C_IDX, MPU6050_I2C_ADDR, data, 2);
}

static int MPU6050_ReadReg(uint8_t reg, uint8_t *value)
{
    unsigned int ret = IoTI2cWrite(I2C_IDX, MPU6050_I2C_ADDR, &reg, 1);
    if (ret != IOT_SUCCESS) return -1;
    
    ret = IoTI2cRead(I2C_IDX, MPU6050_I2C_ADDR, value, 1);
    if (ret != IOT_SUCCESS) return -2;
    
    return 0;
}

static int MPU6050_ReadMultiReg(uint8_t reg, uint8_t *buffer, uint8_t len)
{
    unsigned int ret = IoTI2cWrite(I2C_IDX, MPU6050_I2C_ADDR, &reg, 1);
    if (ret != IOT_SUCCESS) return -1;
    
    ret = IoTI2cRead(I2C_IDX, MPU6050_I2C_ADDR, buffer, len);
    if (ret != IOT_SUCCESS) return -2;
    
    return 0;
}

// ==================== Public Functions ====================

int MPU6050_Init(void)
{
    uint8_t device_id = 0;
    int ret;
    
    printf("[MPU6050] Initializing...\n");
    printf("[DEBUG] I2C_IDX = %d, I2C_ADDR = 0x%02X\n", I2C_IDX, MPU6050_I2C_ADDR);
    
    // Check device ID
    ret = MPU6050_ReadReg(MPU6050_REG_WHO_AM_I, &device_id);
    if (ret != 0) {
        printf("[ERROR] MPU6050 I2C read failed (ret=%d)\n", ret);
        printf("[HINT] Check: 1) SDA/SCL wiring 2) AD0 pin to GND 3) Power supply\n");
        return -1;
    }
    
    printf("[DEBUG] MPU6050 Device ID = 0x%02X (expected 0x68)\n", device_id);
    
    if (device_id != 0x68) {
        printf("[ERROR] MPU6050 ID mismatch!\n");
        printf("[HINT] If ID=0x00: No device on bus, check wiring\n");
        printf("[HINT] If ID=0xFF: Bus error, check pull-up resistors\n");
        printf("[HINT] If ID=0x69: AD0 pin not connected to GND!\n");
        return -1;
    }
    
    // Reset device
    printf("[DEBUG] Resetting MPU6050...\n");
    if (MPU6050_WriteReg(MPU6050_REG_PWR_MGMT_1, 0x80) != 0) {
        printf("[ERROR] MPU6050 reset failed\n");
        return -2;
    }
    LOS_Msleep(100);
    
    // Wake up device, use X-axis gyro as clock source
    printf("[DEBUG] Waking up MPU6050...\n");
    if (MPU6050_WriteReg(MPU6050_REG_PWR_MGMT_1, 0x01) != 0) {
        printf("[ERROR] MPU6050 wake up failed\n");
        return -3;
    }
    LOS_Msleep(10);
    
    // Configure accelerometer range (±2g)
    printf("[DEBUG] Configuring accelerometer (±2g)...\n");
    if (MPU6050_WriteReg(MPU6050_REG_ACCEL_CONFIG, 0x00) != 0) {
        printf("[ERROR] Accel config failed\n");
        return -4;
    }
    
    // Configure gyroscope range (±250°/s)
    printf("[DEBUG] Configuring gyroscope (±250°/s)...\n");
    if (MPU6050_WriteReg(MPU6050_REG_GYRO_CONFIG, 0x00) != 0) {
        printf("[ERROR] Gyro config failed\n");
        return -5;
    }
    
    // Configure digital low-pass filter (44Hz)
    printf("[DEBUG] Configuring low-pass filter (44Hz)...\n");
    if (MPU6050_WriteReg(MPU6050_REG_CONFIG, 0x03) != 0) {
        printf("[ERROR] Filter config failed\n");
        return -6;
    }
    
    printf("[OK] MPU6050 initialized successfully!\n");
    return 0;
}

int MPU6050_Read(float *ax, float *ay, float *az,
                 float *gx, float *gy, float *gz)
{
    uint8_t buffer[14];
    static int read_count = 0;
    
    // Read 14 bytes starting from accelerometer register
    int ret = MPU6050_ReadMultiReg(MPU6050_REG_ACCEL_XOUT_H, buffer, 14);
    if (ret != 0) {
        printf("[ERROR] MPU6050 read failed (ret=%d)\n", ret);
        return -1;
    }
    
    // Parse raw data
    int16_t accel_x_raw = (int16_t)((buffer[0] << 8) | buffer[1]);
    int16_t accel_y_raw = (int16_t)((buffer[2] << 8) | buffer[3]);
    int16_t accel_z_raw = (int16_t)((buffer[4] << 8) | buffer[5]);
    // buffer[6-7] = temperature
    int16_t gyro_x_raw = (int16_t)((buffer[8] << 8) | buffer[9]);
    int16_t gyro_y_raw = (int16_t)((buffer[10] << 8) | buffer[11]);
    int16_t gyro_z_raw = (int16_t)((buffer[12] << 8) | buffer[13]);
    
    // Debug: Print raw values every 10 reads
    read_count++;
    if (read_count % 10 == 1) {
        printf("[DEBUG] MPU6050 Raw: AX=%d AY=%d AZ=%d GX=%d GY=%d GZ=%d\n",
               accel_x_raw, accel_y_raw, accel_z_raw,
               gyro_x_raw, gyro_y_raw, gyro_z_raw);
    }
    
    // Convert to physical values
    float accel_scale = 2.0f / 32768.0f;    // ±2g range
    float gyro_scale = 250.0f / 32768.0f;   // ±250°/s range
    
    *ax = accel_x_raw * accel_scale;
    *ay = accel_y_raw * accel_scale;
    *az = accel_z_raw * accel_scale;
    *gx = gyro_x_raw * gyro_scale;
    *gy = gyro_y_raw * gyro_scale;
    *gz = gyro_z_raw * gyro_scale;
    
    return 0;
}
