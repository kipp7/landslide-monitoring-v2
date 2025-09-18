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

#ifndef __LANDSLIDE_MONITOR_H__
#define __LANDSLIDE_MONITOR_H__

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// 系统配置参数（优化响应速度）
#ifndef SENSOR_SAMPLE_RATE_HZ
#define SENSOR_SAMPLE_RATE_HZ       15      // 传感器采样频率 15Hz
#endif
#define DATA_BUFFER_SIZE           100      // 数据缓冲区大小
#define RISK_EVAL_INTERVAL_MS      200      // 风险评估间隔 200ms
#define LCD_UPDATE_INTERVAL_MS     2000     // LCD更新间隔 2秒
#define LCD_DATA_CHANGE_THRESHOLD  0.3f    // 数据变化阈值（更敏感）
#define VOICE_REPORT_INTERVAL_S    15       // 语音播报间隔 15秒

// IoT数据上传间隔配置
#define IOT_UPLOAD_SAFE_INTERVAL_MS     1000   // 安全状态上传间隔 60秒
#define IOT_UPLOAD_LOW_INTERVAL_MS      30000   // 低风险上传间隔 30秒
#define IOT_UPLOAD_MEDIUM_INTERVAL_MS   10000   // 中风险上传间隔 10秒
#define IOT_UPLOAD_HIGH_INTERVAL_MS     5000    // 高风险上传间隔 5秒
#define IOT_UPLOAD_CRITICAL_INTERVAL_MS 2000    // 危急状态上传间隔 2秒

// 线程优先级定义
#define THREAD_PRIO_SENSOR          5       // 传感器采集线程优先级
#define THREAD_PRIO_DATA_PROC       6       // 数据处理线程优先级  
#define THREAD_PRIO_RISK_EVAL       7       // 风险评估线程优先级
#define THREAD_PRIO_DISPLAY         8       // 显示线程优先级
#define THREAD_PRIO_ALARM           9       // 报警线程优先级

// 线程栈大小
#define THREAD_STACK_SIZE          4096     // 线程栈大小 4KB

// 传感器数据结构
typedef struct {
    // MPU6050数据
    float accel_x;              // X轴加速度 (g)
    float accel_y;              // Y轴加速度 (g) 
    float accel_z;              // Z轴加速度 (g)
    float gyro_x;               // X轴角速度 (°/s)
    float gyro_y;               // Y轴角速度 (°/s)
    float gyro_z;               // Z轴角速度 (°/s)
    float angle_x;              // X轴倾角 (度)
    float angle_y;              // Y轴倾角 (度)
    float mpu_temperature;      // MPU6050温度 (°C)
    
    // SHT30数据
    float sht_temperature;      // SHT30温度 (°C)
    float humidity;             // 湿度 (%)
    
    // BH1750数据
    float light_intensity;      // 光照强度 (lux)

    // GPS定位数据
    double gps_latitude;        // GPS纬度
    double gps_longitude;       // GPS经度
    float gps_altitude;         // GPS海拔高度 (米)
    bool gps_valid;             // GPS数据有效性

    uint32_t timestamp;         // 时间戳 (ms)
    bool data_valid;            // 数据有效标志
} SensorData;

// 处理后的数据结构
typedef struct {
    float accel_magnitude;      // 加速度幅值
    float accel_change_rate;    // 加速度变化率
    float angle_magnitude;      // 倾角幅值
    float angle_change_rate;    // 倾角变化率
    float humidity_trend;       // 湿度变化趋势
    float light_change_rate;    // 光照变化率
    float vibration_intensity;  // 振动强度
    uint32_t timestamp;         // 时间戳
} ProcessedData;

// GPS定位数据
typedef struct {
    double latitude;                // 纬度
    double longitude;               // 经度
    float altitude;                 // 海拔高度 (米)
    float accuracy;                 // 定位精度 (米)
    bool valid;                     // 定位数据是否有效
    char raw_data[128];             // 原始NMEA数据
    uint32_t last_update_time;      // 最后更新时间
} GPSData;

// 风险等级枚举
typedef enum {
    RISK_LEVEL_SAFE = 0,        // 安全
    RISK_LEVEL_LOW = 1,         // 低风险
    RISK_LEVEL_MEDIUM = 2,      // 中风险
    RISK_LEVEL_HIGH = 3,        // 高风险
    RISK_LEVEL_CRITICAL = 4     // 危急
} RiskLevel;

// 风险评估结果
typedef struct {
    RiskLevel level;            // 风险等级
    float confidence;           // 置信度 (0.0-1.0)
    uint32_t duration_ms;       // 持续时间 (ms)
    char description[64];       // 风险描述
    uint32_t timestamp;         // 评估时间戳
    
    // 各项风险因子
    float tilt_risk;            // 倾斜风险
    float vibration_risk;       // 振动风险
    float humidity_risk;        // 湿度风险
    float light_risk;           // 光照风险
    float gps_deform_risk;      // GPS形变风险
} RiskAssessment;

// 系统状态枚举
typedef enum {
    SYSTEM_STATE_INIT = 0,      // 初始化状态
    SYSTEM_STATE_RUNNING,       // 正常运行
    SYSTEM_STATE_WARNING,       // 警告状态
    SYSTEM_STATE_ERROR,         // 错误状态
    SYSTEM_STATE_SHUTDOWN       // 关闭状态
} SystemState;

// LCD显示模式
typedef enum {
    LCD_MODE_REALTIME = 0,      // 实时数据模式
    LCD_MODE_RISK_STATUS,       // 风险状态模式
    LCD_MODE_TREND_CHART,       // 趋势图模式
    LCD_MODE_COUNT              // 模式总数
} LcdDisplayMode;

// 系统统计信息
typedef struct {
    uint32_t uptime_seconds;    // 运行时间 (秒)
    uint32_t sensor_errors;     // 传感器错误次数
    uint32_t data_samples;      // 数据采样次数
    uint32_t risk_alerts;       // 风险警报次数
    SystemState current_state;  // 当前系统状态
    LcdDisplayMode lcd_mode;    // 当前LCD显示模式
} SystemStats;

// 全局函数声明

// 系统初始化和控制
int LandslideMonitorInit(void);
int LandslideMonitorStart(void);
int LandslideMonitorStop(void);
void LandslideMonitorShutdown(void);

// 数据获取接口
int GetLatestSensorData(SensorData *data);
int GetLatestProcessedData(ProcessedData *data);
int GetLatestRiskAssessment(RiskAssessment *assessment);
int GetSystemStats(SystemStats *stats);

// 系统状态管理
SystemState GetSystemState(void);
void SetSystemState(SystemState state);

// LCD显示控制
void SwitchLcdMode(void);
LcdDisplayMode GetLcdMode(void);

// 报警控制
void SetAlarmMute(bool mute);
bool IsAlarmMuted(void);

// 配置接口
int SetSensorSampleRate(uint32_t rate_hz);
int SetRiskThresholds(float tilt_threshold, float vibration_threshold, 
                      float humidity_threshold, float light_threshold);

// 错误处理
const char* GetLastErrorMessage(void);
void ClearErrorMessage(void);

// 马达方向枚举
typedef enum {
    MOTOR_DIRECTION_STOP = 0,
    MOTOR_DIRECTION_FORWARD = 1,
    MOTOR_DIRECTION_REVERSE = 2
} MotorDirection;

// 云端控制变量声明
extern bool g_cloud_motor_enabled;
extern int g_cloud_motor_speed;        // 马达转速 (0-100)
extern MotorDirection g_cloud_motor_direction;  // 马达方向
extern int g_cloud_motor_duration;     // 运行时长 (秒)
extern bool g_cloud_buzzer_enabled;
extern bool g_cloud_rgb_enabled;
extern bool g_cloud_voice_enabled;
extern bool g_cloud_test_mode;
extern int g_cloud_rgb_red;
extern int g_cloud_rgb_green;
extern int g_cloud_rgb_blue;

#ifdef __cplusplus
}
#endif

#endif // __LANDSLIDE_MONITOR_H__
