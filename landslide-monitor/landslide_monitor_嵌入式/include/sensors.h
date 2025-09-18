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

#ifndef __SENSORS_H__
#define __SENSORS_H__

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// I2C配置 (所有传感器共用)
#define SENSORS_I2C_BUS             0           // I2C0总线
#define SENSORS_I2C_FREQ            2           // 100kHz频率 (使用枚举值)

// MPU6050配置
#define MPU6050_I2C_ADDR            0x68
#define MPU6050_REG_PWR_MGMT_1      0x6B
#define MPU6050_REG_ACCEL_XOUT_H    0x3B
#define MPU6050_REG_WHO_AM_I        0x75

// SHT30配置
#define SHT30_I2C_ADDR              0x44
#define SHT30_CMD_MEASURE_HIGH      0x2C06  // 高精度测量命令

// BH1750配置
#define BH1750_I2C_ADDR             0x23
#define BH1750_CMD_POWER_ON         0x01
#define BH1750_CMD_RESET            0x07
#define BH1750_CMD_CONT_H_MODE      0x10    // 连续高分辨率模式

// MPU6050数据结构
typedef struct {
    int16_t accel_x_raw;        // 原始加速度X
    int16_t accel_y_raw;        // 原始加速度Y
    int16_t accel_z_raw;        // 原始加速度Z
    int16_t temp_raw;           // 原始温度
    int16_t gyro_x_raw;         // 原始陀螺仪X
    int16_t gyro_y_raw;         // 原始陀螺仪Y
    int16_t gyro_z_raw;         // 原始陀螺仪Z
    
    float accel_x;              // 加速度X (g)
    float accel_y;              // 加速度Y (g)
    float accel_z;              // 加速度Z (g)
    float temperature;          // 温度 (°C)
    float gyro_x;               // 陀螺仪X (°/s)
    float gyro_y;               // 陀螺仪Y (°/s)
    float gyro_z;               // 陀螺仪Z (°/s)
    float angle_x;              // X轴倾角 (°)
    float angle_y;              // Y轴倾角 (°)
    uint32_t timestamp;         // 时间戳
} MPU6050_Data;

// SHT30数据结构
typedef struct {
    uint16_t temp_raw;          // 原始温度数据
    uint16_t humi_raw;          // 原始湿度数据
    float temperature;          // 温度 (°C)
    float humidity;             // 湿度 (%)
    uint32_t timestamp;         // 时间戳
} SHT30_Data;

// BH1750数据结构
typedef struct {
    uint16_t light_raw;         // 原始光照数据
    float light_intensity;      // 光照强度 (lux)
    uint32_t timestamp;         // 时间戳
} BH1750_Data;

// 传感器状态
typedef enum {
    SENSOR_STATUS_OK = 0,       // 正常
    SENSOR_STATUS_ERROR = -1,   // 错误
    SENSOR_STATUS_NOT_INIT = -2,// 未初始化
    SENSOR_STATUS_TIMEOUT = -3  // 超时
} SensorStatus;

// 函数声明

// 传感器初始化
int Sensors_Init(void);
void Sensors_Deinit(void);

// MPU6050函数
int MPU6050_Init(void);
int MPU6050_ReadData(MPU6050_Data *data);
int MPU6050_ReadAcceleration(float *accel_x, float *accel_y, float *accel_z);
int MPU6050_ReadAngles(float *angle_x, float *angle_y);
int MPU6050_ReadTemperature(float *temperature);
bool MPU6050_IsConnected(void);

// SHT30函数
int SHT30_Init(void);
int SHT30_ReadData(SHT30_Data *data);
int SHT30_ReadTemperature(float *temperature);
int SHT30_ReadHumidity(float *humidity);
bool SHT30_IsConnected(void);

// BH1750函数
int BH1750_Init(void);
int BH1750_ReadData(BH1750_Data *data);
int BH1750_ReadLightIntensity(float *light_intensity);
bool BH1750_IsConnected(void);

// 统一传感器接口
int Sensors_ReadAll(MPU6050_Data *mpu_data, SHT30_Data *sht_data, BH1750_Data *bh_data);
SensorStatus Sensors_GetStatus(void);

// 低级I2C操作
int Sensors_I2C_WriteReg(uint8_t device_addr, uint8_t reg_addr, uint8_t value);
int Sensors_I2C_ReadReg(uint8_t device_addr, uint8_t reg_addr, uint8_t *value);
int Sensors_I2C_ReadMultiReg(uint8_t device_addr, uint8_t reg_addr, uint8_t *buffer, uint8_t length);
int Sensors_I2C_WriteCmd(uint8_t device_addr, uint16_t cmd);

#ifdef __cplusplus
}
#endif

#endif // __SENSORS_H__
