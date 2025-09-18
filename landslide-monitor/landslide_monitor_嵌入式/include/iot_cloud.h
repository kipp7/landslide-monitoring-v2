/*
 * Copyright (c) 2023 iSoftStone Information Technology (Group) Co.,Ltd.
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

#ifndef IOT_CLOUD_H
#define IOT_CLOUD_H

#include <stdbool.h>
#include <stdint.h>
#include "landslide_monitor.h"  // 使用主头文件中的RiskLevel定义

#ifdef __cplusplus
extern "C" {
#endif

// 华为云IoT平台配置（修复设备ID匹配问题）
#define MQTT_DEVICES_PWD "d3adc9f470a17901725ba4417b127281d966068a7965d02b07791e067bfb424a"//"8ebe8b17e8464208b73064df53d68e15f7ab038713ab3ef6a1996227e63ae45e"
#define HOST_ADDR "361017cfc6.st1.iotda-device.cn-north-4.myhuaweicloud.com"
#define HOST_PORT 1883  // MQTT标准端口
#define DEVICE_ID "6815a14f9314d118511807c6_rk2206"  // 修复：使用华为云平台上的正确设备ID
#define DEVICE_USERNAME "6815a14f9314d118511807c6_rk2206"
#define CLIENT_ID "6815a14f9314d118511807c6_rk2206_0_0_2025080507"//"6815a14f9314d118511807c6_rk2206_0_0_2025070314"  // MQTT连接使用的ClientID

// MQTT主题定义
#define PUBLISH_TOPIC "$oc/devices/" DEVICE_ID "/sys/properties/report"
#define SUBSCRIBE_TOPIC "$oc/devices/" DEVICE_ID "/sys/commands/+"
#define RESPONSE_TOPIC "$oc/devices/" DEVICE_ID "/sys/commands/response"

// WiFi配置（基于用户偏好设置）
#define WIFI_SSID "188"
#define WIFI_PASSWORD "88888888"

// 兼容性数据结构（原有的LandslideIotData）
typedef struct {
    // 基础传感器数据
    float temperature;      // 温度 (°C)
    float humidity;         // 湿度 (%)
    float light;           // 光照强度 (lux)

    // MPU6050 数据
    float accel_x;         // X轴加速度 (g)
    float accel_y;         // Y轴加速度 (g)
    float accel_z;         // Z轴加速度 (g)
    float gyro_x;          // X轴陀螺仪 (°/s)
    float gyro_y;          // Y轴陀螺仪 (°/s)
    float gyro_z;          // Z轴陀螺仪 (°/s)
    float angle_x;         // X轴倾斜角度 (°)
    float angle_y;         // Y轴倾斜角度 (°)
    float angle_z;         // Z轴倾斜角度 (°)
    float vibration;       // 振动强度

    // 系统状态
    int risk_level;        // 风险等级 (0-4)
    bool alarm_active;     // 报警状态
    uint32_t uptime;       // 系统运行时间 (秒)

    // GPS定位数据
    double gps_latitude;   // GPS纬度
    double gps_longitude;  // GPS经度
    float gps_altitude;    // GPS海拔高度 (米)
    bool gps_valid;        // GPS数据有效性

    // GPS形变分析数据
    float deformation_distance_3d;      // 3D总位移距离 (米)
    float deformation_horizontal;       // 水平位移距离 (米)
    float deformation_vertical;         // 垂直位移距离 (米)
    float deformation_velocity;         // 形变速度 (米/小时)
    int deformation_risk_level;         // 形变风险等级 (0-4)
    int deformation_type;               // 形变类型 (0-4)
    float deformation_confidence;       // 形变分析置信度 (0.0-1.0)
    bool baseline_established;          // 基准位置是否建立

    // 扩展字段
    bool rgb_enabled;      // RGB LED使能
    bool buzzer_enabled;   // 蜂鸣器使能
    bool motor_enabled;    // 电机使能
    bool voice_enabled;    // 语音使能
} LandslideIotData;

// 华为云IoT平台数据结构（完全匹配云端字段定义）
typedef struct {
    // 基础环境传感器数据（decimal类型）
    double temperature;        // 温度 (°C) - decimal
    double illumination;       // 光照强度 (lux) - decimal
    double humidity;          // 湿度 (%) - decimal

    // MPU6050加速度数据（long类型 - 云端单位：g）
    long acceleration_x;      // X轴加速度(g×1000) - 云端除以1000显示为g
    long acceleration_y;      // Y轴加速度(g×1000) - 云端除以1000显示为g
    long acceleration_z;      // Z轴加速度(g×1000) - 云端除以1000显示为g

    // MPU6050陀螺仪数据（long类型 - 云端单位：°/s）
    long gyroscope_x;         // X轴陀螺仪(°/s×100) - 云端除以100显示为°/s
    long gyroscope_y;         // Y轴陀螺仪(°/s×100) - 云端除以100显示为°/s
    long gyroscope_z;         // Z轴陀螺仪(°/s×100) - 云端除以100显示为°/s

    // MPU6050温度（decimal类型）
    double mpu_temperature;   // MPU6050温度 - decimal

    // GPS定位数据（decimal类型）
    double latitude;          // 纬度 - decimal
    double longitude;         // 经度 - decimal

    // 振动传感器数据（decimal类型）
    double vibration;         // 振动传感器数值 - decimal

    // 滑坡监测专用数据
    int risk_level;           // 山体滑坡风险等级 (0安全,1低风险,2中风险,3高风险,4极高风险) - int
    bool alarm_active;        // 当前报警状态 (true=激活) - boolean
    long uptime;              // 系统运行时间 (秒) - long

    // 倾角数据（decimal类型）
    double angle_x;           // X轴倾角 (°) - decimal
    double angle_y;           // Y轴倾角 (°) - decimal
    double angle_z;           // 总倾斜角度（基于X、Y轴计算） - decimal

    // GPS形变分析数据
    double deformation_distance_3d;      // 3D总位移距离 (米) - decimal
    double deformation_horizontal;       // 水平位移距离 (米) - decimal
    double deformation_vertical;         // 垂直位移距离 (米) - decimal
    double deformation_velocity;         // 形变速度 (米/小时) - decimal
    int deformation_risk_level;          // 形变风险等级 (0-4) - int
    int deformation_type;                // 形变类型 (0-4) - int
    double deformation_confidence;       // 形变分析置信度 (0.0-1.0) - decimal
    bool baseline_established;           // 基准位置是否建立 - boolean
} e_iot_data;

// MQTT 核心功能（基于成熟版本）
void mqtt_init(void);
int wait_message(void);
unsigned int mqtt_is_connected(void);
void send_msg_to_mqtt(e_iot_data *iot_data);

// 扩展功能
int IoTCloud_Init(void);
void IoTCloud_Deinit(void);
bool IoTCloud_IsConnected(void);
int IoTCloud_SendData(const LandslideIotData *data);
int IoTCloud_StartTask(void);

// 网络任务函数
void IoTNetworkTask(void);

// 命令处理函数
void IoTCloud_ProcessCommand(const char *command_name, const char *payload);
void IoTCloud_HandleResetCommand(void);
void IoTCloud_HandleConfigCommand(const char *config_data);

// 新增设备控制命令处理函数
void IoTCloud_HandleMotorCommand(bool enable, int speed, int direction, int duration);
void IoTCloud_HandleBuzzerCommand(bool enable, int frequency, int duration, int pattern);
void IoTCloud_HandleRGBCommand(bool enable, int red, int green, int blue);
void IoTCloud_HandleVoiceCommand(bool enable);
void IoTCloud_HandleSystemRebootCommand(void);
void IoTCloud_HandleConfigUpdateCommand(const char *config_json);
void IoTCloud_HandleCalibrationCommand(void);
void IoTCloud_HandleTestModeCommand(bool enable);

// 数据缓存和重发配置
#define MAX_CACHE_SIZE 100              // 最大缓存数据条数
#define CACHE_FILE_PATH "/data/iot_cache.dat"  // 缓存文件路径
#define MAX_RETRY_COUNT 3               // 最大重试次数
#define RETRY_INTERVAL_MS 5000          // 重试间隔(毫秒)

// 缓存数据项结构
typedef struct {
    e_iot_data data;                    // IoT数据
    uint32_t timestamp;                 // 时间戳
    uint8_t retry_count;                // 重试次数
    bool is_valid;                      // 数据有效标志
} CachedDataItem;

// 数据缓存管理结构
typedef struct {
    CachedDataItem items[MAX_CACHE_SIZE];  // 缓存数据数组
    uint16_t head;                      // 队列头指针
    uint16_t tail;                      // 队列尾指针
    uint16_t count;                     // 当前缓存数量
    bool is_full;                       // 缓存满标志
    uint32_t total_cached;              // 总缓存数量统计
    uint32_t total_sent;                // 总发送成功数量统计
    uint32_t total_failed;              // 总发送失败数量统计
} DataCache;

// 连接状态和统计信息
typedef struct {
    bool mqtt_connected;                // MQTT连接状态
    bool wifi_connected;                // WiFi连接状态
    uint32_t last_connect_time;         // 上次连接时间
    uint32_t disconnect_count;          // 断线次数
    uint32_t reconnect_count;           // 重连次数
    uint32_t last_data_send_time;       // 上次数据发送时间
    uint32_t network_error_count;       // 网络错误次数
} ConnectionStatus;

// 数据缓存和重发功能
int DataCache_Init(void);
int DataCache_Add(const e_iot_data *data);
int DataCache_SendPending(void);
int DataCache_SaveToFile(void);
int DataCache_LoadFromFile(void);
int DataCache_LoadFromFlash(void);  // 从Flash加载数据到内存缓存
void DataCache_Clear(void);
void DataCache_PrintStats(void);

// 连接状态管理
void ConnectionStatus_Update(void);
void ConnectionStatus_PrintStats(void);
bool ConnectionStatus_IsStable(void);

// 测试和演示功能
void IoTCloud_TestCacheSystem(void);
void IoTCloud_SimulateNetworkFailure(int duration_seconds);
void IoTCloud_ForceResendCache(void);

// 系统健康检查
void IoTCloud_HealthCheck(void);
void IoTCloud_PrintSystemStatus(void);
bool IoTCloud_IsSystemHealthy(void);

#ifdef __cplusplus
}
#endif

#endif // IOT_CLOUD_H
