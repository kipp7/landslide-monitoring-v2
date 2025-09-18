/*
 * Copyright (c) 2024 iSoftStone Education Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "sensors.h"
#include "iot_i2c.h"
#include "iot_errno.h"
#include "los_task.h"

// 静态变量
static bool g_sensors_initialized = false;
static bool g_mpu6050_initialized = false;
static bool g_sht30_initialized = false;
static bool g_bh1750_initialized = false;

// MPU6050比例因子
static float g_accel_scale = 2.0f / 32768.0f;  // ±2g量程
static float g_gyro_scale = 250.0f / 32768.0f; // ±250°/s量程

/**
 * @brief 初始化所有传感器
 * @return 0: 成功, 其他: 失败
 */
int Sensors_Init(void)
{
    int ret;
    
    printf("Initializing sensors...\n");
    
    // 初始化I2C
    ret = IoTI2cInit(SENSORS_I2C_BUS, SENSORS_I2C_FREQ);
    if (ret != IOT_SUCCESS) {
        printf("Failed to initialize I2C: %d\n", ret);
        return -1;
    }
    
    // 延时等待总线稳定
    LOS_Msleep(100);
    
    // 初始化MPU6050
    ret = MPU6050_Init();
    if (ret != 0) {
        printf("MPU6050 initialization failed: %d\n", ret);
    }
    
    // 初始化SHT30
    ret = SHT30_Init();
    if (ret != 0) {
        printf("SHT30 initialization failed: %d\n", ret);
    }
    
    // 初始化BH1750
    ret = BH1750_Init();
    if (ret != 0) {
        printf("BH1750 initialization failed: %d\n", ret);
    }
    
    g_sensors_initialized = true;
    printf("Sensors initialization completed\n");
    
    return 0;
}

/**
 * @brief 反初始化传感器
 */
void Sensors_Deinit(void)
{
    if (g_sensors_initialized) {
        IoTI2cDeinit(SENSORS_I2C_BUS);
        g_sensors_initialized = false;
        g_mpu6050_initialized = false;
        g_sht30_initialized = false;
        g_bh1750_initialized = false;
        printf("Sensors deinitialized\n");
    }
}

/**
 * @brief 初始化MPU6050
 * @return 0: 成功, 其他: 失败
 */
int MPU6050_Init(void)
{
    int ret;
    uint8_t device_id;
    
    printf("Initializing MPU6050...\n");
    
    // 检查设备ID
    ret = Sensors_I2C_ReadReg(MPU6050_I2C_ADDR, MPU6050_REG_WHO_AM_I, &device_id);
    if (ret != 0 || device_id != 0x68) {
        printf("MPU6050 not found or invalid ID: 0x%02X\n", device_id);
        return -1;
    }
    
    // 复位设备
    ret = Sensors_I2C_WriteReg(MPU6050_I2C_ADDR, MPU6050_REG_PWR_MGMT_1, 0x80);
    if (ret != 0) {
        printf("Failed to reset MPU6050\n");
        return -2;
    }
    
    LOS_Msleep(100);
    
    // 唤醒设备，选择X轴陀螺仪作为时钟源
    ret = Sensors_I2C_WriteReg(MPU6050_I2C_ADDR, MPU6050_REG_PWR_MGMT_1, 0x01);
    if (ret != 0) {
        printf("Failed to wake up MPU6050\n");
        return -3;
    }
    
    // 配置加速度计量程 (±2g)
    ret = Sensors_I2C_WriteReg(MPU6050_I2C_ADDR, 0x1C, 0x00);
    if (ret != 0) {
        printf("Failed to configure MPU6050 accelerometer\n");
        return -4;
    }
    
    // 配置陀螺仪量程 (±250°/s)
    ret = Sensors_I2C_WriteReg(MPU6050_I2C_ADDR, 0x1B, 0x00);
    if (ret != 0) {
        printf("Failed to configure MPU6050 gyroscope\n");
        return -5;
    }
    
    // 配置数字低通滤波器 (44Hz)
    ret = Sensors_I2C_WriteReg(MPU6050_I2C_ADDR, 0x1A, 0x03);
    if (ret != 0) {
        printf("Failed to configure MPU6050 DLPF\n");
        return -6;
    }
    
    g_mpu6050_initialized = true;
    printf("MPU6050 initialized successfully\n");
    
    return 0;
}

/**
 * @brief 读取MPU6050数据
 * @param data 数据结构指针
 * @return 0: 成功, 其他: 失败
 */
int MPU6050_ReadData(MPU6050_Data *data)
{
    uint8_t buffer[14];
    int ret;
    
    if (!g_mpu6050_initialized || data == NULL) {
        return -1;
    }
    
    // 从加速度寄存器开始连续读取14个字节
    ret = Sensors_I2C_ReadMultiReg(MPU6050_I2C_ADDR, MPU6050_REG_ACCEL_XOUT_H, buffer, 14);
    if (ret != 0) {
        return -2;
    }
    
    // 解析原始数据
    data->accel_x_raw = (int16_t)((buffer[0] << 8) | buffer[1]);
    data->accel_y_raw = (int16_t)((buffer[2] << 8) | buffer[3]);
    data->accel_z_raw = (int16_t)((buffer[4] << 8) | buffer[5]);
    data->temp_raw = (int16_t)((buffer[6] << 8) | buffer[7]);
    data->gyro_x_raw = (int16_t)((buffer[8] << 8) | buffer[9]);
    data->gyro_y_raw = (int16_t)((buffer[10] << 8) | buffer[11]);
    data->gyro_z_raw = (int16_t)((buffer[12] << 8) | buffer[13]);
    
    // 转换为物理量
    data->accel_x = data->accel_x_raw * g_accel_scale;
    data->accel_y = data->accel_y_raw * g_accel_scale;
    data->accel_z = data->accel_z_raw * g_accel_scale;
    
    data->gyro_x = data->gyro_x_raw * g_gyro_scale;
    data->gyro_y = data->gyro_y_raw * g_gyro_scale;
    data->gyro_z = data->gyro_z_raw * g_gyro_scale;
    
    // 转换温度 (°C)
    data->temperature = (data->temp_raw / 340.0f) + 36.53f;
    
    // 计算倾角
    data->angle_x = atan2f(data->accel_y, sqrtf(data->accel_x * data->accel_x + data->accel_z * data->accel_z)) * 180.0f / M_PI;
    data->angle_y = atan2f(-data->accel_x, data->accel_z) * 180.0f / M_PI;
    
    data->timestamp = LOS_TickCountGet();
    
    return 0;
}

/**
 * @brief 检查MPU6050是否连接
 * @return true: 已连接, false: 未连接
 */
bool MPU6050_IsConnected(void)
{
    uint8_t device_id;
    int ret = Sensors_I2C_ReadReg(MPU6050_I2C_ADDR, MPU6050_REG_WHO_AM_I, &device_id);
    return (ret == 0 && device_id == 0x68);
}

/**
 * @brief 初始化SHT30
 * @return 0: 成功, 其他: 失败
 */
int SHT30_Init(void)
{
    int ret;
    
    printf("Initializing SHT30...\n");
    
    // 发送软复位命令
    ret = Sensors_I2C_WriteCmd(SHT30_I2C_ADDR, 0x30A2);
    if (ret != 0) {
        printf("Failed to reset SHT30\n");
        return -1;
    }
    
    LOS_Msleep(50);
    
    g_sht30_initialized = true;
    printf("SHT30 initialized successfully\n");
    
    return 0;
}

/**
 * @brief 读取SHT30数据
 * @param data 数据结构指针
 * @return 0: 成功, 其他: 失败
 */
int SHT30_ReadData(SHT30_Data *data)
{
    uint8_t buffer[6];
    int ret;
    
    if (!g_sht30_initialized || data == NULL) {
        return -1;
    }
    
    // 发送测量命令
    ret = Sensors_I2C_WriteCmd(SHT30_I2C_ADDR, SHT30_CMD_MEASURE_HIGH);
    if (ret != 0) {
        return -2;
    }
    
    // 等待测量完成
    LOS_Msleep(20);
    
    // 读取数据
    ret = IoTI2cRead(SENSORS_I2C_BUS, SHT30_I2C_ADDR, buffer, 6);
    if (ret != IOT_SUCCESS) {
        return -3;
    }
    
    // 解析数据
    data->temp_raw = (buffer[0] << 8) | buffer[1];
    data->humi_raw = (buffer[3] << 8) | buffer[4];
    
    // 转换为物理量
    data->temperature = -45.0f + 175.0f * data->temp_raw / 65535.0f;
    data->humidity = 100.0f * data->humi_raw / 65535.0f;
    
    data->timestamp = LOS_TickCountGet();
    
    return 0;
}

/**
 * @brief 检查SHT30是否连接
 * @return true: 已连接, false: 未连接
 */
bool SHT30_IsConnected(void)
{
    // 尝试发送状态读取命令
    int ret = Sensors_I2C_WriteCmd(SHT30_I2C_ADDR, 0xF32D);
    return (ret == 0);
}

/**
 * @brief 初始化BH1750
 * @return 0: 成功, 其他: 失败
 */
int BH1750_Init(void)
{
    int ret;
    
    printf("Initializing BH1750...\n");
    
    // 发送上电命令 (BH1750使用单字节命令)
    uint8_t power_on_cmd = BH1750_CMD_POWER_ON;
    ret = IoTI2cWrite(SENSORS_I2C_BUS, BH1750_I2C_ADDR, &power_on_cmd, 1);
    if (ret != IOT_SUCCESS) {
        printf("Failed to power on BH1750\n");
        return -1;
    }
    
    LOS_Msleep(10);
    
    // 复位
    uint8_t reset_cmd = BH1750_CMD_RESET;
    ret = IoTI2cWrite(SENSORS_I2C_BUS, BH1750_I2C_ADDR, &reset_cmd, 1);
    if (ret != IOT_SUCCESS) {
        printf("Failed to reset BH1750\n");
        return -2;
    }

    LOS_Msleep(10);

    // 设置连续高分辨率模式
    uint8_t mode_cmd = BH1750_CMD_CONT_H_MODE;
    ret = IoTI2cWrite(SENSORS_I2C_BUS, BH1750_I2C_ADDR, &mode_cmd, 1);
    if (ret != IOT_SUCCESS) {
        printf("Failed to set BH1750 mode\n");
        return -3;
    }
    
    g_bh1750_initialized = true;
    printf("BH1750 initialized successfully\n");

    return 0;
}

/**
 * @brief 读取BH1750数据
 * @param data 数据结构指针
 * @return 0: 成功, 其他: 失败
 */
int BH1750_ReadData(BH1750_Data *data)
{
    uint8_t buffer[2];
    int ret;

    if (!g_bh1750_initialized || data == NULL) {
        return -1;
    }

    // 读取数据
    ret = IoTI2cRead(SENSORS_I2C_BUS, BH1750_I2C_ADDR, buffer, 2);
    if (ret != IOT_SUCCESS) {
        return -2;
    }

    // 解析数据
    data->light_raw = (buffer[0] << 8) | buffer[1];

    // 转换为光照强度 (lux)
    data->light_intensity = data->light_raw / 1.2f;

    data->timestamp = LOS_TickCountGet();

    return 0;
}

/**
 * @brief 检查BH1750是否连接
 * @return true: 已连接, false: 未连接
 */
bool BH1750_IsConnected(void)
{
    uint8_t buffer[2];
    int ret = IoTI2cRead(SENSORS_I2C_BUS, BH1750_I2C_ADDR, buffer, 2);
    return (ret == IOT_SUCCESS);
}

/**
 * @brief 读取所有传感器数据
 * @param mpu_data MPU6050数据
 * @param sht_data SHT30数据
 * @param bh_data BH1750数据
 * @return 0: 成功, 其他: 失败
 */
int Sensors_ReadAll(MPU6050_Data *mpu_data, SHT30_Data *sht_data, BH1750_Data *bh_data)
{
    int ret;
    int error_count = 0;

    if (!g_sensors_initialized) {
        return -1;
    }

    // 读取MPU6050
    if (mpu_data != NULL) {
        ret = MPU6050_ReadData(mpu_data);
        if (ret != 0) {
            printf("Failed to read MPU6050 data: %d\n", ret);
            error_count++;
        }
    }

    // 读取SHT30
    if (sht_data != NULL) {
        ret = SHT30_ReadData(sht_data);
        if (ret != 0) {
            printf("Failed to read SHT30 data: %d\n", ret);
            error_count++;
        }
    }

    // 读取BH1750
    if (bh_data != NULL) {
        ret = BH1750_ReadData(bh_data);
        if (ret != 0) {
            printf("Failed to read BH1750 data: %d\n", ret);
            error_count++;
        }
    }

    return error_count;
}

/**
 * @brief 获取传感器状态
 * @return 传感器状态
 */
SensorStatus Sensors_GetStatus(void)
{
    if (!g_sensors_initialized) {
        return SENSOR_STATUS_NOT_INIT;
    }

    // 检查各传感器连接状态
    bool mpu_ok = MPU6050_IsConnected();
    bool sht_ok = SHT30_IsConnected();
    bool bh_ok = BH1750_IsConnected();

    if (!mpu_ok || !sht_ok || !bh_ok) {
        return SENSOR_STATUS_ERROR;
    }

    return SENSOR_STATUS_OK;
}

// ========== 低级I2C操作函数 ==========

/**
 * @brief 写寄存器
 */
int Sensors_I2C_WriteReg(uint8_t device_addr, uint8_t reg_addr, uint8_t value)
{
    uint8_t data[2] = {reg_addr, value};
    return IoTI2cWrite(SENSORS_I2C_BUS, device_addr, data, 2);
}

/**
 * @brief 读寄存器
 */
int Sensors_I2C_ReadReg(uint8_t device_addr, uint8_t reg_addr, uint8_t *value)
{
    int ret;

    ret = IoTI2cWrite(SENSORS_I2C_BUS, device_addr, &reg_addr, 1);
    if (ret != IOT_SUCCESS) {
        return -1;
    }

    ret = IoTI2cRead(SENSORS_I2C_BUS, device_addr, value, 1);
    if (ret != IOT_SUCCESS) {
        return -2;
    }

    return 0;
}

/**
 * @brief 读多个寄存器
 */
int Sensors_I2C_ReadMultiReg(uint8_t device_addr, uint8_t reg_addr, uint8_t *buffer, uint8_t length)
{
    int ret;

    ret = IoTI2cWrite(SENSORS_I2C_BUS, device_addr, &reg_addr, 1);
    if (ret != IOT_SUCCESS) {
        return -1;
    }

    ret = IoTI2cRead(SENSORS_I2C_BUS, device_addr, buffer, length);
    if (ret != IOT_SUCCESS) {
        return -2;
    }

    return 0;
}

/**
 * @brief 写命令 (16位)
 */
int Sensors_I2C_WriteCmd(uint8_t device_addr, uint16_t cmd)
{
    uint8_t data[2] = {(cmd >> 8) & 0xFF, cmd & 0xFF};
    return IoTI2cWrite(SENSORS_I2C_BUS, device_addr, data, 2);
}
