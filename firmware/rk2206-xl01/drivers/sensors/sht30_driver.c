/*
 * SHT30 Sensor Implementation
 */

#include "sht30_driver.h"
#include <stdio.h>
#include <stdint.h>
#include "los_task.h"
#include "iot_i2c.h"
#include "iot_errno.h"

// SHT30 I2C Address (moved from config to avoid dependency)
#ifndef SHT30_I2C_ADDR
#define SHT30_I2C_ADDR      0x44
#endif

#ifndef I2C_IDX
#define I2C_IDX             EI2C0_M0  // ✓ 改为PB4=SDA, PB5=SCL（释放PB6/PB7给GPS）
#endif

#ifndef I2C_BAUDRATE
#define I2C_BAUDRATE        EI2C_FRE_100K
#endif

// SHT30 Commands
#define SHT30_CMD_MEASURE   0x2C06      // High precision measurement
#define SHT30_CMD_RESET     0x30A2      // Soft reset

static uint8_t SHT30_Crc8(const uint8_t *data, unsigned int len)
{
    uint8_t crc = 0xFF;
    unsigned int i;
    unsigned int bit;

    if (data == NULL) {
        return 0;
    }

    for (i = 0; i < len; ++i) {
        crc ^= data[i];
        for (bit = 0; bit < 8; ++bit) {
            if ((crc & 0x80U) != 0U) {
                crc = (uint8_t)((crc << 1) ^ 0x31U);
            } else {
                crc <<= 1;
            }
        }
    }

    return crc;
}

int SHT30_Init(void)
{
    printf("[SHT30] Initializing...\n");
    
    // Send soft reset command
    uint8_t cmd[2] = {(SHT30_CMD_RESET >> 8) & 0xFF, SHT30_CMD_RESET & 0xFF};
    unsigned int ret = IoTI2cWrite(I2C_IDX, SHT30_I2C_ADDR, cmd, 2);
    if (ret != IOT_SUCCESS) {
        printf("[ERROR] SHT30 reset failed: %u\n", ret);
        return -1;
    }
    
    LOS_Msleep(50);  // Wait for reset to complete
    
    printf("[OK] SHT30 initialized\n");
    return 0;
}

int SHT30_Read(float *temp, float *humi)
{
    uint8_t cmd[2] = {(SHT30_CMD_MEASURE >> 8) & 0xFF, SHT30_CMD_MEASURE & 0xFF};
    uint8_t buffer[6];

    if (temp == NULL || humi == NULL) {
        return -10;
    }
    
    // Send measurement command
    unsigned int ret = IoTI2cWrite(I2C_IDX, SHT30_I2C_ADDR, cmd, 2);
    if (ret != IOT_SUCCESS) {
        return -1;
    }
    
    // Wait for measurement to complete
    LOS_Msleep(20);
    
    // Read 6 bytes (temp 2B + CRC 1B + humi 2B + CRC 1B)
    ret = IoTI2cRead(I2C_IDX, SHT30_I2C_ADDR, buffer, 6);
    if (ret != IOT_SUCCESS) {
        return -2;
    }

    if (SHT30_Crc8(&buffer[0], 2) != buffer[2] ||
        SHT30_Crc8(&buffer[3], 2) != buffer[5]) {
        printf("[WARN] SHT30 CRC mismatch\n");
        return -3;
    }
    
    // Parse data
    uint16_t temp_raw = (buffer[0] << 8) | buffer[1];
    uint16_t humi_raw = (buffer[3] << 8) | buffer[4];
    
    // Convert to physical values
    *temp = -45.0f + 175.0f * temp_raw / 65535.0f;
    *humi = 100.0f * humi_raw / 65535.0f;

    return 0;
}
