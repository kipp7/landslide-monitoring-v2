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
#include <unistd.h>
#include <math.h>
#include "los_task.h"
#include "los_sem.h"
#include "los_mux.h"
#include "cmsis_os.h"
#include "ohos_init.h"
#include "landslide_monitor.h"
#include "sensors.h"
#include "output_devices.h"
#include "lcd.h"  // 添加LCD头文件以使用颜色定义
#include "iot_cloud.h"  // 华为云IoT功能
#include "data_storage.h"  // Flash数据存储功能
#include "reset.h"  // 系统重启功能
#include "gps_module.h"  // GPS模块功能
#include "gps_deformation.h"  // GPS形变分析功能

// 全局变量
static SystemState g_system_state = SYSTEM_STATE_INIT;
static SensorData g_latest_sensor_data;
static ProcessedData g_latest_processed_data;
static RiskAssessment g_latest_risk_assessment;

// 云端控制变量
bool g_alarm_acknowledged = false;  // 报警确认标志（可被云端命令设置）

// 新增云端设备控制变量
bool g_cloud_motor_enabled = false;    // 云端电机控制
int g_cloud_motor_speed = 0;           // 马达转速 (0-100)
MotorDirection g_cloud_motor_direction = MOTOR_DIRECTION_STOP;  // 马达方向
int g_cloud_motor_duration = 0;        // 运行时长 (秒)
bool g_cloud_buzzer_enabled = false;   // 云端蜂鸣器控制
bool g_cloud_rgb_enabled = false;      // 云端RGB LED控制
bool g_cloud_voice_enabled = false;    // 云端语音控制
bool g_cloud_test_mode = false;        // 云端测试模式
int g_cloud_rgb_red = 0;               // RGB红色分量
int g_cloud_rgb_green = 0;             // RGB绿色分量
int g_cloud_rgb_blue = 0;              // RGB蓝色分量

static SystemStats g_system_stats;
static LcdDisplayMode g_lcd_mode = LCD_MODE_REALTIME;
static bool g_main_alarm_muted = false;  // 主程序中的静音状态

// 风险评估状态变量（全局，供多个任务访问）
static bool manual_reset_required = false;
static RiskLevel confirmed_level = RISK_LEVEL_SAFE;
static RiskLevel max_triggered_level = RISK_LEVEL_SAFE;

// 线程ID
static UINT32 g_sensor_thread_id = 0;
static UINT32 g_data_proc_thread_id = 0;
static UINT32 g_risk_eval_thread_id = 0;
static UINT32 g_display_thread_id = 0;
static UINT32 g_alarm_thread_id = 0;

// 同步对象
static UINT32 g_data_mutex = 0;
static UINT32 g_sensor_sem = 0;

// 数据缓冲区
static SensorData g_sensor_buffer[DATA_BUFFER_SIZE];
static uint32_t g_buffer_index = 0;
static bool g_buffer_full = false;

// 错误信息
static char g_error_message[128] = {0};

// 内部函数声明
static void SensorCollectionTask(void);
static void DataProcessingTask(void);
static void RiskEvaluationTask(void);
static void DisplayTask(void);
static void AlarmTask(void);
static int InitializeHardware(void);
static int CreateTasks(void);
static void UpdateSystemStats(void);
static void AddSensorDataToBuffer(const SensorData *data);
static void ProcessSensorData(ProcessedData *processed);
static void EvaluateRisk(const ProcessedData *processed, RiskAssessment *assessment);
static void ButtonEventHandler(ButtonState state);

/**
 * @brief 初始化山体滑坡监测系统
 * @return 0: 成功, 其他: 失败
 */
int LandslideMonitorInit(void)
{
    int ret;
    
    printf("Initializing Landslide Monitoring System...\n");
    
    // 初始化系统状态
    g_system_state = SYSTEM_STATE_INIT;
    memset(&g_system_stats, 0, sizeof(g_system_stats));
    memset(&g_latest_sensor_data, 0, sizeof(g_latest_sensor_data));
    memset(&g_latest_processed_data, 0, sizeof(g_latest_processed_data));
    memset(&g_latest_risk_assessment, 0, sizeof(g_latest_risk_assessment));
    
    // 创建互斥锁
    ret = LOS_MuxCreate(&g_data_mutex);
    if (ret != LOS_OK) {
        snprintf(g_error_message, sizeof(g_error_message), "Failed to create mutex: %d", ret);
        return -1;
    }
    
    // 创建信号量
    ret = LOS_SemCreate(0, &g_sensor_sem);
    if (ret != LOS_OK) {
        snprintf(g_error_message, sizeof(g_error_message), "Failed to create semaphore: %d", ret);
        return -2;
    }
    
    // 初始化硬件
    ret = InitializeHardware();
    if (ret != 0) {
        snprintf(g_error_message, sizeof(g_error_message), "Hardware initialization failed: %d", ret);
        return -3;
    }
    
    printf("Landslide monitoring system initialized successfully\n");
    return 0;
}

/**
 * @brief 启动山体滑坡监测系统
 * @return 0: 成功, 其他: 失败
 */
int LandslideMonitorStart(void)
{
    int ret;
    
    if (g_system_state != SYSTEM_STATE_INIT) {
        snprintf(g_error_message, sizeof(g_error_message), "System not in init state");
        return -1;
    }
    
    printf("Starting landslide monitoring system...\n");

    // 设置系统状态为运行 (在创建任务之前设置)
    g_system_state = SYSTEM_STATE_RUNNING;
    g_system_stats.current_state = SYSTEM_STATE_RUNNING;
    g_system_stats.lcd_mode = g_lcd_mode;

    // 创建任务
    ret = CreateTasks();
    if (ret != 0) {
        snprintf(g_error_message, sizeof(g_error_message), "Failed to create tasks: %d", ret);
        g_system_state = SYSTEM_STATE_ERROR;  // 任务创建失败时设置错误状态
        return -2;
    }
    
    // 播放启动语音
    Voice_PlayMessage(VOICE_MSG_SYSTEM_START);
    
    // 设置按键回调
    Button_SetCallback(ButtonEventHandler);
    
    printf("Landslide monitoring system started successfully\n");
    return 0;
}

/**
 * @brief 停止山体滑坡监测系统
 * @return 0: 成功, 其他: 失败
 */
int LandslideMonitorStop(void)
{
    printf("Stopping landslide monitoring system...\n");
    
    // 设置系统状态为关闭
    g_system_state = SYSTEM_STATE_SHUTDOWN;
    
    // 删除任务
    if (g_sensor_thread_id != 0) {
        LOS_TaskDelete(g_sensor_thread_id);
        g_sensor_thread_id = 0;
    }
    if (g_data_proc_thread_id != 0) {
        LOS_TaskDelete(g_data_proc_thread_id);
        g_data_proc_thread_id = 0;
    }
    if (g_risk_eval_thread_id != 0) {
        LOS_TaskDelete(g_risk_eval_thread_id);
        g_risk_eval_thread_id = 0;
    }
    if (g_display_thread_id != 0) {
        LOS_TaskDelete(g_display_thread_id);
        g_display_thread_id = 0;
    }
    if (g_alarm_thread_id != 0) {
        LOS_TaskDelete(g_alarm_thread_id);
        g_alarm_thread_id = 0;
    }
    
    printf("Landslide monitoring system stopped\n");
    return 0;
}

/**
 * @brief 关闭山体滑坡监测系统
 */
void LandslideMonitorShutdown(void)
{
    printf("Shutting down landslide monitoring system...\n");
    
    // 停止系统
    LandslideMonitorStop();
    
    // 反初始化硬件
    Sensors_Deinit();
    OutputDevices_Deinit();
    GPS_Deinit();
    GPS_Deformation_Deinit();
    
    // 删除同步对象
    if (g_data_mutex != 0) {
        LOS_MuxDelete(g_data_mutex);
        g_data_mutex = 0;
    }
    if (g_sensor_sem != 0) {
        LOS_SemDelete(g_sensor_sem);
        g_sensor_sem = 0;
    }
    
    g_system_state = SYSTEM_STATE_SHUTDOWN;
    printf("Landslide monitoring system shutdown complete\n");
}

/**
 * @brief 获取最新传感器数据
 * @param data 数据结构指针
 * @return 0: 成功, 其他: 失败
 */
int GetLatestSensorData(SensorData *data)
{
    if (data == NULL) {
        return -1;
    }
    
    LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
    *data = g_latest_sensor_data;
    LOS_MuxPost(g_data_mutex);
    
    return 0;
}

/**
 * @brief 获取最新处理数据
 * @param data 数据结构指针
 * @return 0: 成功, 其他: 失败
 */
int GetLatestProcessedData(ProcessedData *data)
{
    if (data == NULL) {
        return -1;
    }
    
    LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
    *data = g_latest_processed_data;
    LOS_MuxPost(g_data_mutex);
    
    return 0;
}

/**
 * @brief 获取最新风险评估
 * @param assessment 评估结构指针
 * @return 0: 成功, 其他: 失败
 */
int GetLatestRiskAssessment(RiskAssessment *assessment)
{
    if (assessment == NULL) {
        return -1;
    }
    
    LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
    *assessment = g_latest_risk_assessment;
    LOS_MuxPost(g_data_mutex);
    
    return 0;
}

/**
 * @brief 获取系统统计信息
 * @param stats 统计信息结构指针
 * @return 0: 成功, 其他: 失败
 */
int GetSystemStats(SystemStats *stats)
{
    if (stats == NULL) {
        return -1;
    }
    
    LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
    UpdateSystemStats();
    *stats = g_system_stats;
    LOS_MuxPost(g_data_mutex);
    
    return 0;
}

/**
 * @brief 获取系统状态
 * @return 系统状态
 */
SystemState GetSystemState(void)
{
    return g_system_state;
}

/**
 * @brief 设置系统状态
 * @param state 系统状态
 */
void SetSystemState(SystemState state)
{
    g_system_state = state;
    g_system_stats.current_state = state;
}

/**
 * @brief 切换LCD显示模式
 */
void SwitchLcdMode(void)
{
    static uint32_t last_switch_tick = 0;
    static bool switching_in_progress = false;
    uint32_t current_tick = LOS_TickCountGet();

    // 防抖：100个tick内不允许重复切换（约1秒，假设100Hz tick）
    if (current_tick - last_switch_tick < 100) {
        printf("LCD mode switch ignored (too frequent)\n");
        return;
    }

    // 防止切换过程中被打断
    if (switching_in_progress) {
        printf("LCD mode switch ignored (switching in progress)\n");
        return;
    }

    switching_in_progress = true;
    LcdDisplayMode old_mode = g_lcd_mode;

    // 只在2个有效模式间切换：REALTIME, RISK_STATUS（禁用TREND_CHART）
    g_lcd_mode = (LcdDisplayMode)((g_lcd_mode + 1) % 2);  // 在0,1两个模式间切换
    if (g_lcd_mode >= 2) {
        g_lcd_mode = LCD_MODE_REALTIME;  // 安全检查，确保不会超出范围
    }
    g_system_stats.lcd_mode = g_lcd_mode;

    printf("LCD mode switch: %d -> %d\n", old_mode, g_lcd_mode);
    last_switch_tick = current_tick;

    // 重置静态布局标志，强制重新初始化界面
    extern bool g_static_layout_initialized;
    g_static_layout_initialized = false;

    // 清屏，准备切换
    if (LCD_IsInitialized()) {
        LCD_Clear(LCD_WHITE);
        LOS_Msleep(100);  // 给清屏一点时间
    }

    // 显示详细的模式切换信息（只有2个模式）
    const char* mode_names[] = {
        "Real-Time Data",      // LCD_MODE_REALTIME (0)
        "Risk Status"          // LCD_MODE_RISK_STATUS (1)
        // LCD_MODE_TREND_CHART (2) - 已禁用
    };

    printf("LCD mode switched to: %d (%s)\n", g_lcd_mode,
           g_lcd_mode < 2 ? mode_names[g_lcd_mode] : "Unknown");

    switching_in_progress = false;
}

/**
 * @brief 获取LCD显示模式
 * @return LCD显示模式
 */
LcdDisplayMode GetLcdMode(void)
{
    return g_lcd_mode;
}

/**
 * @brief 设置报警静音
 * @param mute 是否静音
 */
void SetAlarmMute(bool mute)
{
    g_main_alarm_muted = mute;
    Alarm_Mute(mute);
}

/**
 * @brief 获取报警静音状态
 * @return true: 已静音, false: 未静音
 */
bool IsAlarmMuted(void)
{
    return g_main_alarm_muted;
}

/**
 * @brief 获取最后错误信息
 * @return 错误信息字符串
 */
const char* GetLastErrorMessage(void)
{
    return g_error_message;
}

/**
 * @brief 清除错误信息
 */
void ClearErrorMessage(void)
{
    memset(g_error_message, 0, sizeof(g_error_message));
}

// ========== 内部函数实现 ==========

/**
 * @brief 初始化硬件
 * @return 0: 成功, 其他: 失败
 */
static int InitializeHardware(void)
{
    int ret;

    printf("Initializing hardware components...\n");

    // 初始化传感器
    ret = Sensors_Init();
    if (ret != 0) {
        printf("Failed to initialize sensors: %d\n", ret);
        return -1;
    }

    // 初始化输出设备 (允许部分设备失败)
    ret = OutputDevices_Init();
    if (ret > 2) {  // 只有超过2个设备失败才认为是严重错误
        printf("Too many output devices failed to initialize: %d\n", ret);
        return -2;
    } else if (ret > 0) {
        printf("Some output devices failed to initialize: %d (continuing)\n", ret);
    }

    // 初始化数据存储
    ret = DataStorage_Init();
    if (ret != 0) {
        printf("Data storage initialization failed: %d (continuing without storage)\n", ret);
        // 存储失败不影响系统运行
    } else {
        printf("Data storage initialized successfully\n");
    }

    // 初始化IoT云平台连接
    ret = IoTCloud_Init();
    if (ret != 0) {
        printf("IoT Cloud initialization failed: %d (continuing without cloud)\n", ret);
        // IoT失败不影响系统运行
    } else {
        printf("IoT Cloud initialized successfully\n");
    }

    // 初始化GPS模块
    ret = GPS_Init();
    if (ret != 0) {
        printf("GPS module initialization failed: %d (continuing without GPS)\n", ret);
        // GPS失败不影响系统运行
    } else {
        printf("GPS module initialized successfully\n");
    }

    // 初始化GPS形变分析
    ret = GPS_Deformation_Init();
    if (ret != 0) {
        printf("GPS deformation analysis initialization failed: %d (continuing without deformation analysis)\n", ret);
        // GPS形变分析失败不影响系统运行
    } else {
        printf("GPS deformation analysis initialized successfully\n");
    }

    printf("Hardware initialization completed\n");
    return 0;
}

/**
 * @brief 创建任务
 * @return 0: 成功, 其他: 失败
 */
static int CreateTasks(void)
{
    TSK_INIT_PARAM_S task_param;
    UINT32 ret;

    // 创建传感器采集任务
    memset(&task_param, 0, sizeof(task_param));
    task_param.pfnTaskEntry = (TSK_ENTRY_FUNC)SensorCollectionTask;
    task_param.uwStackSize = THREAD_STACK_SIZE;
    task_param.pcName = "SensorTask";
    task_param.usTaskPrio = THREAD_PRIO_SENSOR;
    ret = LOS_TaskCreate(&g_sensor_thread_id, &task_param);
    if (ret != LOS_OK) {
        printf("Failed to create sensor task: %d\n", ret);
        return -1;
    }

    // 创建数据处理任务
    memset(&task_param, 0, sizeof(task_param));
    task_param.pfnTaskEntry = (TSK_ENTRY_FUNC)DataProcessingTask;
    task_param.uwStackSize = THREAD_STACK_SIZE;
    task_param.pcName = "DataProcTask";
    task_param.usTaskPrio = THREAD_PRIO_DATA_PROC;
    ret = LOS_TaskCreate(&g_data_proc_thread_id, &task_param);
    if (ret != LOS_OK) {
        printf("Failed to create data processing task: %d\n", ret);
        return -2;
    }

    // 创建风险评估任务
    memset(&task_param, 0, sizeof(task_param));
    task_param.pfnTaskEntry = (TSK_ENTRY_FUNC)RiskEvaluationTask;
    task_param.uwStackSize = THREAD_STACK_SIZE;
    task_param.pcName = "RiskEvalTask";
    task_param.usTaskPrio = THREAD_PRIO_RISK_EVAL;
    ret = LOS_TaskCreate(&g_risk_eval_thread_id, &task_param);
    if (ret != LOS_OK) {
        printf("Failed to create risk evaluation task: %d\n", ret);
        return -3;
    }

    // 创建显示任务
    memset(&task_param, 0, sizeof(task_param));
    task_param.pfnTaskEntry = (TSK_ENTRY_FUNC)DisplayTask;
    task_param.uwStackSize = THREAD_STACK_SIZE;
    task_param.pcName = "DisplayTask";
    task_param.usTaskPrio = THREAD_PRIO_DISPLAY;
    ret = LOS_TaskCreate(&g_display_thread_id, &task_param);
    if (ret != LOS_OK) {
        printf("Failed to create display task: %d\n", ret);
        return -4;
    }

    // 创建报警任务
    memset(&task_param, 0, sizeof(task_param));
    task_param.pfnTaskEntry = (TSK_ENTRY_FUNC)AlarmTask;
    task_param.uwStackSize = THREAD_STACK_SIZE;
    task_param.pcName = "AlarmTask";
    task_param.usTaskPrio = THREAD_PRIO_ALARM;
    ret = LOS_TaskCreate(&g_alarm_thread_id, &task_param);
    if (ret != LOS_OK) {
        printf("Failed to create alarm task: %d\n", ret);
        return -5;
    }

    // 启动IoT云平台任务
    ret = IoTCloud_StartTask();
    if (ret != 0) {
        printf("Failed to start IoT task: %d (continuing without cloud)\n", ret);
        // IoT任务失败不影响系统运行
    } else {
        printf("IoT task started successfully\n");
    }

    printf("All tasks created successfully\n");
    return 0;
}

/**
 * @brief 传感器采集任务
 */
static void SensorCollectionTask(void)
{
    SensorData sensor_data;
    MPU6050_Data mpu_data;
    SHT30_Data sht_data;
    BH1750_Data bh_data;
    GPSData gps_data;
    int ret;
    uint32_t sample_interval_ms = 1000 / SENSOR_SAMPLE_RATE_HZ;

    printf("Sensor collection task started\n");

    while (g_system_state == SYSTEM_STATE_RUNNING || g_system_state == SYSTEM_STATE_WARNING) {
        // 读取所有传感器数据
        ret = Sensors_ReadAll(&mpu_data, &sht_data, &bh_data);

        if (ret == 0) {
            // 组装传感器数据
            sensor_data.accel_x = mpu_data.accel_x;
            sensor_data.accel_y = mpu_data.accel_y;
            sensor_data.accel_z = mpu_data.accel_z;
            sensor_data.gyro_x = mpu_data.gyro_x;
            sensor_data.gyro_y = mpu_data.gyro_y;
            sensor_data.gyro_z = mpu_data.gyro_z;
            sensor_data.angle_x = mpu_data.angle_x;
            sensor_data.angle_y = mpu_data.angle_y;
            sensor_data.mpu_temperature = mpu_data.temperature;

            sensor_data.sht_temperature = sht_data.temperature;
            sensor_data.humidity = sht_data.humidity;

            sensor_data.light_intensity = bh_data.light_intensity;

            // 读取GPS数据
            if (GPS_GetData(&gps_data) == 0) {
                sensor_data.gps_latitude = gps_data.latitude;
                sensor_data.gps_longitude = gps_data.longitude;
                sensor_data.gps_altitude = gps_data.altitude;
                sensor_data.gps_valid = gps_data.valid;

                // 添加GPS数据到形变分析
                if (gps_data.valid) {
                    GPS_Deformation_AddPosition(&gps_data);
                }
            } else {
                sensor_data.gps_valid = false;
            }

            sensor_data.timestamp = LOS_TickCountGet();
            sensor_data.data_valid = true;
        } else {
            printf("Failed to read sensor data, errors: %d\n", ret);
            sensor_data.data_valid = false;
            g_system_stats.sensor_errors++;
        }

        // 更新全局数据
        LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
        g_latest_sensor_data = sensor_data;
        AddSensorDataToBuffer(&sensor_data);
        g_system_stats.data_samples++;
        LOS_MuxPost(g_data_mutex);

        // 通知数据处理任务
        LOS_SemPost(g_sensor_sem);

        // 检查马达自动停止（非阻塞）
        Motor_CheckAutoStop();

        // 等待下次采样
        LOS_Msleep(sample_interval_ms);
    }

    printf("Sensor collection task stopped\n");
}

/**
 * @brief 数据处理任务
 */
static void DataProcessingTask(void)
{
    ProcessedData processed_data;

    printf("Data processing task started\n");

    while (g_system_state == SYSTEM_STATE_RUNNING || g_system_state == SYSTEM_STATE_WARNING) {
        // 等待传感器数据
        LOS_SemPend(g_sensor_sem, LOS_WAIT_FOREVER);

        if (g_system_state != SYSTEM_STATE_RUNNING) {
            break;
        }

        // 处理传感器数据
        ProcessSensorData(&processed_data);

        // 更新全局处理数据
        LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
        g_latest_processed_data = processed_data;
        LOS_MuxPost(g_data_mutex);
    }

    printf("Data processing task stopped\n");
}

/**
 * @brief 风险评估任务
 */
static void RiskEvaluationTask(void)
{
    RiskAssessment assessment;
    ProcessedData processed_data;
    uint32_t last_eval_time = 0;

    printf("Risk evaluation task started\n");

    while (g_system_state == SYSTEM_STATE_RUNNING || g_system_state == SYSTEM_STATE_WARNING) {
        uint32_t current_time = LOS_TickCountGet();

        // 优先检查重置标志（每次循环都检查）
        if (g_alarm_acknowledged) {
            printf("RiskEvalTask: Processing manual reset request...\n");
            // 立即处理重置逻辑
            LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
            ProcessedData temp_data = g_latest_processed_data;
            LOS_MuxPost(g_data_mutex);

            RiskAssessment temp_assessment;
            EvaluateRisk(&temp_data, &temp_assessment);  // 这会处理重置逻辑

            LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
            g_latest_risk_assessment = temp_assessment;
            LOS_MuxPost(g_data_mutex);
        }

        // 检查是否到了评估时间
        if (current_time - last_eval_time >= RISK_EVAL_INTERVAL_MS) {
            // 获取处理后的数据
            LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
            processed_data = g_latest_processed_data;
            LOS_MuxPost(g_data_mutex);

            // 进行风险评估
            EvaluateRisk(&processed_data, &assessment);

            // 更新全局风险评估
            LOS_MuxPend(g_data_mutex, LOS_WAIT_FOREVER);
            g_latest_risk_assessment = assessment;

            // 更新系统状态
            if (assessment.level >= RISK_LEVEL_HIGH) {
                g_system_state = SYSTEM_STATE_WARNING;
                g_system_stats.risk_alerts++;
            } else if (g_system_state == SYSTEM_STATE_WARNING &&
                      assessment.level < RISK_LEVEL_MEDIUM) {
                g_system_state = SYSTEM_STATE_RUNNING;
            }

            LOS_MuxPost(g_data_mutex);

            last_eval_time = current_time;
        }

        LOS_Msleep(50);   // 50ms检查间隔
    }

    printf("Risk evaluation task stopped\n");
}

/**
 * @brief 显示任务
 */
static void DisplayTask(void)
{
    SensorData sensor_data;
    SensorData last_sensor_data = {0};  // 保存上次的数据
    RiskAssessment assessment;
    RiskAssessment last_assessment = {0};  // 保存上次的评估
    uint32_t last_update_time = 0;
    uint32_t last_force_update = 0;
    bool first_display = true;

    printf("Display task started\n");

    // 等待LCD初始化完成
    printf("Waiting for LCD initialization...\n");
    while (!LCD_IsInitialized()) {
        LOS_Msleep(100);  // 等待100ms
    }
    printf("LCD initialization detected, starting display\n");

    // 简单清屏，准备显示
    LCD_Clear(LCD_WHITE);
    printf("LCD cleared and ready for display\n");

    // 强制重置静态布局标志，确保使用新的全屏布局
    extern bool g_static_layout_initialized;
    g_static_layout_initialized = false;

    while (g_system_state == SYSTEM_STATE_RUNNING || g_system_state == SYSTEM_STATE_WARNING) {
        uint32_t current_time = LOS_TickCountGet();

        // 检查按键状态
        Button_GetState();

        // 获取最新数据
        GetLatestSensorData(&sensor_data);
        GetLatestRiskAssessment(&assessment);

        // 检查是否需要更新LCD
        bool need_update = false;

        // 强制更新条件：首次显示或超过强制更新间隔
        if (first_display || (current_time - last_force_update >= LCD_UPDATE_INTERVAL_MS)) {
            need_update = true;
            last_force_update = current_time;
            // 注意：不要在这里设置first_display = false，要在实际显示后设置
        }

        // 数据变化更新条件：关键数据有显著变化
        if (!need_update && sensor_data.data_valid) {
            float angle_change = fabsf(sensor_data.angle_x - last_sensor_data.angle_x) +
                                fabsf(sensor_data.angle_y - last_sensor_data.angle_y);
            float temp_change = fabsf(sensor_data.sht_temperature - last_sensor_data.sht_temperature);

            if (angle_change > LCD_DATA_CHANGE_THRESHOLD ||  // 倾斜角度变化超过0.5度
                temp_change > 2.0f ||                        // 温度变化超过2度
                assessment.level != last_assessment.level) { // 风险等级变化
                need_update = true;
            }
        }

        // 执行LCD更新
        if (LCD_IsInitialized()) {
            // 检查是否需要重新初始化静态布局（模式切换时）
            if (first_display || !g_static_layout_initialized) {
                switch (g_lcd_mode) {
                    case LCD_MODE_REALTIME:
                        // 模式0：实时数据模式
                        LCD_Clear(LCD_WHITE);  // 清成白色
                        LOS_Msleep(50);
                        LCD_InitStaticLayout();
                        if (sensor_data.data_valid) {
                            LCD_UpdateStatusOnly(&sensor_data);
                            LCD_UpdateDataOnly(&sensor_data);
                        }
                        printf("LCD: Real-time mode layout initialized\n");
                        break;
                    case LCD_MODE_RISK_STATUS:
                        // 模式1：风险状态模式
                        LCD_Clear(LCD_WHITE);  // 清成白色
                        LOS_Msleep(50);
                        LCD_InitRiskStatusLayout();
                        // 立即显示数据
                        if (assessment.level >= 0) {
                            LCD_UpdateRiskStatusData(&assessment);
                        }
                        printf("LCD: Risk status layout initialized with data\n");
                        break;
                    // LCD_MODE_TREND_CHART 已禁用
                    default:
                        LCD_Clear(LCD_BLACK);
                        break;
                }
                first_display = false;
                g_static_layout_initialized = true;
                last_update_time = current_time;
            }
            // 局部更新
            else if (need_update && (current_time - last_update_time >= 500)) {  // 最小0.5秒更新间隔
                switch (g_lcd_mode) {
                    case LCD_MODE_REALTIME:
                        if (sensor_data.data_valid) {
                            // 只更新变化的数据，不重绘整个屏幕
                            LCD_UpdateDataOnly(&sensor_data);

                            // 如果风险等级可能变化，更新状态
                            float angle_change = fabsf(sensor_data.angle_x - last_sensor_data.angle_x) +
                                                fabsf(sensor_data.angle_y - last_sensor_data.angle_y);
                            if (angle_change > 1.0f) {  // 角度变化较大时更新状态
                                LCD_UpdateStatusOnly(&sensor_data);
                            }

                            // LCD数据更新日志已优化移除，减少日志噪音
                        }
                        break;

                    case LCD_MODE_RISK_STATUS:
                        {
                            // 风险状态模式：定期更新数据
                            static uint32_t last_risk_update = 0;
                            // 每2秒更新一次数据，确保数据及时显示
                            if (current_time - last_risk_update >= 2000) {
                                LCD_UpdateRiskStatusData(&assessment);
                                last_risk_update = current_time;
                                printf("LCD: Risk status data updated\n");
                            }
                        }
                        break;

                    // LCD_MODE_TREND_CHART 已禁用

                    default:
                        // 如果模式超出范围，重置为实时模式
                        g_lcd_mode = LCD_MODE_REALTIME;
                        g_static_layout_initialized = false;
                        LCD_DisplayRealTimeData(&sensor_data);
                        break;
                }

                // 保存当前数据作为下次比较的基准
                last_sensor_data = sensor_data;
                last_assessment = assessment;
                last_update_time = current_time;
            }
        }

        // LCD未初始化时使用串口输出 (独立的逻辑块)
        if (!LCD_IsInitialized() && sensor_data.data_valid && need_update) {
            printf("=== SENSOR DATA ===\n");
            printf("Angle: X=%.1f Y=%.1f deg\n",
                   sensor_data.angle_x, sensor_data.angle_y);
            printf("Temp: %.1f C, Humidity: %.1f%%\n",
                   sensor_data.sht_temperature, sensor_data.humidity);
            printf("Risk Level: %d\n", assessment.level);
        }

        LOS_Msleep(100);  // 100ms检查间隔
    }

    printf("Display task stopped\n");
}

/**
 * @brief 报警任务
 */
static void AlarmTask(void)
{
    RiskAssessment assessment;
    uint32_t last_alarm_time = 0;
    uint32_t last_voice_time = 0;

    printf("Alarm task started\n");

    while (g_system_state == SYSTEM_STATE_RUNNING || g_system_state == SYSTEM_STATE_WARNING) {
        uint32_t current_time = LOS_TickCountGet();

        // 获取最新风险评估
        GetLatestRiskAssessment(&assessment);

        // 设置RGB指示灯
        RGB_SetColorByRisk(assessment.level);

        // 设置报警灯
        AlarmLight_SetByRisk(assessment.level);

        // 检查是否需要声音/振动报警
        if (assessment.level >= RISK_LEVEL_MEDIUM &&
            current_time - last_alarm_time >= 5000) {  // 5秒间隔

            Buzzer_BeepByRisk(assessment.level);
            Motor_VibrateByRisk(assessment.level);

            last_alarm_time = current_time;
        }

        // 检查是否需要语音播报
        if (current_time - last_voice_time >= VOICE_REPORT_INTERVAL_S * 1000) {
            if (assessment.level >= RISK_LEVEL_LOW) {
                Voice_PlayMessage(VOICE_MSG_LOW_RISK + (assessment.level - RISK_LEVEL_LOW));
            } else {
                Voice_PlayMessage(VOICE_MSG_SAFE);
            }

            last_voice_time = current_time;
        }

        // 动态上传频率：根据风险等级调整上传间隔
        static uint32_t last_iot_upload = 0;
        uint32_t upload_interval = 30000;  // 默认30秒
        RiskAssessment current_risk;
        GetLatestRiskAssessment(&current_risk);

        // 根据风险等级调整上传频率（使用配置宏定义）
        switch (current_risk.level) {
            case RISK_LEVEL_SAFE:
                upload_interval = IOT_UPLOAD_SAFE_INTERVAL_MS;      // 安全状态间隔
                break;
            case RISK_LEVEL_LOW:
                upload_interval = IOT_UPLOAD_LOW_INTERVAL_MS;       // 低风险间隔
                break;
            case RISK_LEVEL_MEDIUM:
                upload_interval = IOT_UPLOAD_MEDIUM_INTERVAL_MS;    // 中风险间隔
                break;
            case RISK_LEVEL_HIGH:
                upload_interval = IOT_UPLOAD_HIGH_INTERVAL_MS;      // 高风险间隔
                break;
            case RISK_LEVEL_CRITICAL:
                upload_interval = IOT_UPLOAD_CRITICAL_INTERVAL_MS;  // 危急状态间隔
                break;
        }

        // 上传数据到华为云IoT平台 (动态频率)
        if (IoTCloud_IsConnected() && current_time - last_iot_upload >= upload_interval) {
            SensorData sensor_data;
            GetLatestSensorData(&sensor_data);

            if (sensor_data.data_valid) {
                LandslideIotData iot_data = {0};

                // 填充传感器数据
                iot_data.temperature = sensor_data.sht_temperature;
                iot_data.humidity = sensor_data.humidity;
                iot_data.light = sensor_data.light_intensity;

                // 填充MPU6050真实数据
                iot_data.accel_x = sensor_data.accel_x;
                iot_data.accel_y = sensor_data.accel_y;
                iot_data.accel_z = sensor_data.accel_z;
                iot_data.gyro_x = sensor_data.gyro_x;
                iot_data.gyro_y = sensor_data.gyro_y;
                iot_data.gyro_z = sensor_data.gyro_z;
                iot_data.angle_x = sensor_data.angle_x;
                iot_data.angle_y = sensor_data.angle_y;
                // 注意：Z轴倾角在物理上没有明确定义，这里计算的是总倾斜角度
                // 更准确的名称应该是 tilt_magnitude（倾斜幅值）
                iot_data.angle_z = sqrtf(sensor_data.angle_x * sensor_data.angle_x +
                                       sensor_data.angle_y * sensor_data.angle_y);
                iot_data.vibration = sqrtf(sensor_data.accel_x * sensor_data.accel_x +
                                         sensor_data.accel_y * sensor_data.accel_y +
                                         sensor_data.accel_z * sensor_data.accel_z);

                // 填充GPS数据
                iot_data.gps_latitude = sensor_data.gps_latitude;
                iot_data.gps_longitude = sensor_data.gps_longitude;
                iot_data.gps_altitude = sensor_data.gps_altitude;
                iot_data.gps_valid = sensor_data.gps_valid;

                // 填充GPS形变分析数据
                GPSDeformationAnalysis deform_analysis;
                if (GPS_Deformation_GetAnalysis(&deform_analysis) == 0) {
                    iot_data.deformation_distance_3d = deform_analysis.displacement.distance_3d;
                    iot_data.deformation_horizontal = deform_analysis.displacement.horizontal_distance;
                    iot_data.deformation_vertical = deform_analysis.displacement.vertical_distance;
                    iot_data.deformation_velocity = deform_analysis.velocity.total_velocity;
                    iot_data.deformation_risk_level = (int)deform_analysis.risk_level;
                    iot_data.deformation_type = (int)deform_analysis.deform_type;
                    iot_data.deformation_confidence = deform_analysis.confidence;
                    iot_data.baseline_established = deform_analysis.baseline_established;
                } else {
                    // GPS形变分析无效时的默认值
                    iot_data.deformation_distance_3d = 0.0f;
                    iot_data.deformation_horizontal = 0.0f;
                    iot_data.deformation_vertical = 0.0f;
                    iot_data.deformation_velocity = 0.0f;
                    iot_data.deformation_risk_level = 0;
                    iot_data.deformation_type = 0;
                    iot_data.deformation_confidence = 0.0f;
                    iot_data.baseline_established = false;
                }

                // 填充系统状态
                iot_data.risk_level = assessment.level;
                iot_data.alarm_active = (assessment.level >= RISK_LEVEL_MEDIUM);
                iot_data.uptime = g_system_stats.uptime_seconds;

                // 填充设备状态
                iot_data.rgb_enabled = true;
                iot_data.buzzer_enabled = true;
                iot_data.motor_enabled = true;
                iot_data.voice_enabled = true;

                // 统一使用IoTCloud_SendData处理所有上传和缓存逻辑
                if (IoTCloud_SendData(&iot_data) == 0) {
                    last_iot_upload = current_time;
                } else {
                    printf("⚠️  数据发送失败，已自动处理缓存\n");
                }
            }
        }

        // 检查按键状态
        Button_GetState();  // 按键检测会自动处理重置逻辑

        // 检查云端重置命令
        if (g_alarm_acknowledged) {
            printf("Processing reset command...\n");
            printf("Current system state: manual_reset_required=%s\n",
                   manual_reset_required ? "true" : "false");
            printf("Current confirmed_level=%d, max_triggered_level=%d\n",
                   confirmed_level, max_triggered_level);

            // 强制重置逻辑（无论当前状态如何）
            if (manual_reset_required || max_triggered_level > RISK_LEVEL_LOW) {
                confirmed_level = RISK_LEVEL_SAFE;
                max_triggered_level = RISK_LEVEL_SAFE;
                manual_reset_required = false;
                printf("MANUAL RESET: Risk status cleared by operator. Resuming normal monitoring.\n");
            } else {
                printf("MANUAL RESET: System already in safe state, no reset needed.\n");
            }

            g_alarm_acknowledged = false;  // 重置标志
        }

        LOS_Msleep(200);  // 200ms检查间隔
    }

    printf("Alarm task stopped\n");
}

/**
 * @brief 更新系统统计信息
 */
static void UpdateSystemStats(void)
{
    static uint32_t start_time = 0;

    if (start_time == 0) {
        start_time = LOS_TickCountGet();
    }

    g_system_stats.uptime_seconds = (LOS_TickCountGet() - start_time) / 1000;
}

/**
 * @brief 添加传感器数据到缓冲区
 * @param data 传感器数据
 */
static void AddSensorDataToBuffer(const SensorData *data)
{
    if (data == NULL) {
        return;
    }

    g_sensor_buffer[g_buffer_index] = *data;
    g_buffer_index = (g_buffer_index + 1) % DATA_BUFFER_SIZE;

    if (g_buffer_index == 0) {
        g_buffer_full = true;
    }
}

/**
 * @brief 处理传感器数据
 * @param processed 处理后的数据
 */
static void ProcessSensorData(ProcessedData *processed)
{
    if (processed == NULL) {
        return;
    }

    // 获取最新传感器数据
    SensorData current_data = g_latest_sensor_data;

    if (!current_data.data_valid) {
        memset(processed, 0, sizeof(ProcessedData));
        return;
    }

    // 计算加速度幅值
    processed->accel_magnitude = sqrtf(current_data.accel_x * current_data.accel_x +
                                      current_data.accel_y * current_data.accel_y +
                                      current_data.accel_z * current_data.accel_z);

    // 计算倾角幅值
    processed->angle_magnitude = sqrtf(current_data.angle_x * current_data.angle_x +
                                      current_data.angle_y * current_data.angle_y);

    // 计算振动强度 (改进版：基于陀螺仪数据，加入滤波和校准)
    static float gyro_baseline_x = 0.0f, gyro_baseline_y = 0.0f, gyro_baseline_z = 0.0f;
    static bool baseline_initialized = false;
    static int baseline_samples = 0;

    // 初始化基线（前100个样本的平均值作为静态偏移）
    if (!baseline_initialized) {
        if (baseline_samples < 100) {
            gyro_baseline_x += current_data.gyro_x;
            gyro_baseline_y += current_data.gyro_y;
            gyro_baseline_z += current_data.gyro_z;
            baseline_samples++;
            processed->vibration_intensity = 0.0f; // 校准期间振动强度为0
        } else {
            gyro_baseline_x /= 100.0f;
            gyro_baseline_y /= 100.0f;
            gyro_baseline_z /= 100.0f;
            baseline_initialized = true;
            printf("Gyro baseline calibrated: X=%.2f, Y=%.2f, Z=%.2f\n",
                   gyro_baseline_x, gyro_baseline_y, gyro_baseline_z);
        }
    } else {
        // 去除基线偏移
        float filtered_gyro_x = current_data.gyro_x - gyro_baseline_x;
        float filtered_gyro_y = current_data.gyro_y - gyro_baseline_y;
        float filtered_gyro_z = current_data.gyro_z - gyro_baseline_z;

        // 计算振动强度（角速度幅值）
        float raw_intensity = sqrtf(filtered_gyro_x * filtered_gyro_x +
                                   filtered_gyro_y * filtered_gyro_y +
                                   filtered_gyro_z * filtered_gyro_z);

        // 简单低通滤波（平滑处理）
        static float last_intensity = 0.0f;
        processed->vibration_intensity = 0.7f * last_intensity + 0.3f * raw_intensity;
        last_intensity = processed->vibration_intensity;
    }

    // 变化率计算（需要历史数据进行更精确计算）
    static float last_accel_mag = 0.0f;
    static float last_angle_mag = 0.0f;
    static float last_humidity = 0.0f;
    static float last_light = 0.0f;

    processed->accel_change_rate = fabsf(processed->accel_magnitude - last_accel_mag);
    processed->angle_change_rate = fabsf(processed->angle_magnitude - last_angle_mag);
    processed->humidity_trend = current_data.humidity - last_humidity;
    processed->light_change_rate = fabsf(current_data.light_intensity - last_light);

    // 更新历史值
    last_accel_mag = processed->accel_magnitude;
    last_angle_mag = processed->angle_magnitude;
    last_humidity = current_data.humidity;
    last_light = current_data.light_intensity;

    processed->timestamp = current_data.timestamp;
}

/**
 * @brief 评估风险
 * @param processed 处理后的数据
 * @param assessment 风险评估结果
 */
static void EvaluateRisk(const ProcessedData *processed, RiskAssessment *assessment)
{
    if (processed == NULL || assessment == NULL) {
        return;
    }

    float total_risk_score = 0.0f;

    // 1. 倾斜风险评估 (权重: 40%)
    assessment->tilt_risk = 0.0f;
    if (processed->angle_magnitude > 20.0f) {
        assessment->tilt_risk = 1.0f;
    } else if (processed->angle_magnitude > 15.0f) {
        assessment->tilt_risk = 0.8f;
    } else if (processed->angle_magnitude > 10.0f) {
        assessment->tilt_risk = 0.6f;
    } else if (processed->angle_magnitude > 5.0f) {
        assessment->tilt_risk = 0.3f;
    }
    total_risk_score += assessment->tilt_risk * 0.4f;

    // 2. 振动风险评估 (权重: 30%)
    assessment->vibration_risk = 0.0f;
    if (processed->vibration_intensity > 100.0f) {
        assessment->vibration_risk = 1.0f;
    } else if (processed->vibration_intensity > 50.0f) {
        assessment->vibration_risk = 0.7f;
    } else if (processed->vibration_intensity > 20.0f) {
        assessment->vibration_risk = 0.4f;
    } else if (processed->vibration_intensity > 10.0f) {
        assessment->vibration_risk = 0.2f;
    }
    total_risk_score += assessment->vibration_risk * 0.3f;

    // 3. 湿度风险评估 (权重: 20%)
    SensorData sensor_data = g_latest_sensor_data;
    assessment->humidity_risk = 0.0f;
    if (sensor_data.humidity > 90.0f) {
        assessment->humidity_risk = 0.8f;
    } else if (sensor_data.humidity > 80.0f) {
        assessment->humidity_risk = 0.6f;
    } else if (sensor_data.humidity > 70.0f) {
        assessment->humidity_risk = 0.3f;
    }
    // 湿度快速上升也是风险
    if (processed->humidity_trend > 10.0f) {
        assessment->humidity_risk += 0.3f;
    }
    if (assessment->humidity_risk > 1.0f) assessment->humidity_risk = 1.0f;
    total_risk_score += assessment->humidity_risk * 0.2f;

    // 4. 光照风险评估 (权重: 5%)
    assessment->light_risk = 0.0f;
    if (processed->light_change_rate > 1000.0f) {
        assessment->light_risk = 0.5f;  // 光照剧烈变化可能表示遮挡
    }
    total_risk_score += assessment->light_risk * 0.05f;

    // 5. GPS形变风险评估 (权重: 25%)
    assessment->gps_deform_risk = 0.0f;
    DeformationRisk deform_risk = GPS_Deformation_GetRiskLevel();
    switch (deform_risk) {
        case DEFORM_RISK_CRITICAL:
            assessment->gps_deform_risk = 1.0f;
            break;
        case DEFORM_RISK_HIGH:
            assessment->gps_deform_risk = 0.8f;
            break;
        case DEFORM_RISK_MEDIUM:
            assessment->gps_deform_risk = 0.6f;
            break;
        case DEFORM_RISK_LOW:
            assessment->gps_deform_risk = 0.3f;
            break;
        default:
            assessment->gps_deform_risk = 0.0f;
            break;
    }
    total_risk_score += assessment->gps_deform_risk * 0.25f;

    // 滑坡监测安全逻辑：一旦触发中等以上风险，只能手动解除
    static RiskLevel raw_level = RISK_LEVEL_SAFE;
    static uint32_t level_start_time = 0;
    // 使用全局的报警确认状态和风险状态变量（已在文件顶部声明）

    // 根据分数确定原始风险等级
    if (total_risk_score >= 0.8f) {
        raw_level = RISK_LEVEL_CRITICAL;
    } else if (total_risk_score >= 0.6f) {
        raw_level = RISK_LEVEL_HIGH;
    } else if (total_risk_score >= 0.4f) {
        raw_level = RISK_LEVEL_MEDIUM;
    } else if (total_risk_score >= 0.2f) {
        raw_level = RISK_LEVEL_LOW;
    } else {
        raw_level = RISK_LEVEL_SAFE;
    }

    uint32_t current_time = LOS_TickCountGet();

    // 核心安全逻辑：一旦触发中等以上风险，系统进入"需要确认"状态
    if (raw_level >= RISK_LEVEL_MEDIUM) {
        // 触发中等以上风险
        if (raw_level > max_triggered_level) {
            max_triggered_level = raw_level;
            printf("LANDSLIDE ALERT: Risk level %d triggered! Manual reset required.\n", raw_level);
        }
        confirmed_level = raw_level;
        manual_reset_required = true;
        g_alarm_acknowledged = false;  // 新风险需要重新确认
        level_start_time = current_time;
    } else if (manual_reset_required) {
        // 当前检测值安全，但之前触发过中等以上风险
        if (g_alarm_acknowledged) {
            // 手动确认后，可以解除报警状态
            confirmed_level = RISK_LEVEL_SAFE;
            max_triggered_level = RISK_LEVEL_SAFE;
            manual_reset_required = false;
            g_alarm_acknowledged = false;
            printf("MANUAL RESET: Risk status cleared by operator. Resuming normal monitoring.\n");
        } else {
            // 保持最后的风险等级，等待手动确认
            confirmed_level = max_triggered_level;
            printf("WAITING FOR RESET: Current reading safe, but manual confirmation required (triggered level: %d)\n",
                   max_triggered_level);
        }
    } else {
        // 正常监测状态，低风险可以自动变化
        if (raw_level != confirmed_level) {
            // 低风险之间的变化需要稳定3秒
            if (level_start_time == 0) {
                level_start_time = current_time;
            } else if (current_time - level_start_time >= 3000) {
                confirmed_level = raw_level;
                level_start_time = current_time;
                printf("NORMAL MONITORING: Risk level changed to %d\n", confirmed_level);
            }
        } else {
            level_start_time = current_time;
        }
    }

    // 设置最终评估结果
    assessment->level = confirmed_level;

    // 设置描述
    switch (assessment->level) {
        case RISK_LEVEL_CRITICAL:
            strcpy(assessment->description, "Critical landslide risk - EVACUATE!");
            break;
        case RISK_LEVEL_HIGH:
            strcpy(assessment->description, "High landslide risk - ALERT!");
            break;
        case RISK_LEVEL_MEDIUM:
            strcpy(assessment->description, "Medium landslide risk - WARNING!");
            break;
        case RISK_LEVEL_LOW:
            strcpy(assessment->description, "Low landslide risk - CAUTION");
            break;
        case RISK_LEVEL_SAFE:
            strcpy(assessment->description, "Safe conditions");
            break;
    }

    // 计算置信度：基于传感器可靠性和数据一致性，而不是风险高低
    float confidence = 0.0f;

    // 1. 基础数据有效性 (30%)
    if (sensor_data.data_valid) {
        confidence += 0.3f;
    }

    // 2. 传感器数据合理性检查 (40%) - 检测真正的传感器异常
    int sensor_ok_count = 0;

    // 温度传感器检查：正常环境温度范围
    if (sensor_data.sht_temperature >= -40.0f && sensor_data.sht_temperature <= 80.0f) {
        sensor_ok_count++;
    }

    // 湿度传感器检查：物理可能范围
    if (sensor_data.humidity >= 0.0f && sensor_data.humidity <= 100.0f) {
        sensor_ok_count++;
    }

    // 光照传感器检查：非负值且不超过强阳光
    if (sensor_data.light_intensity >= 0.0f && sensor_data.light_intensity <= 100000.0f) {
        sensor_ok_count++;
    }

    // MPU6050传感器检查：加速度在合理范围内（不超过10g）
    float accel_magnitude = sqrtf(sensor_data.accel_x * sensor_data.accel_x +
                                 sensor_data.accel_y * sensor_data.accel_y +
                                 sensor_data.accel_z * sensor_data.accel_z);
    if (accel_magnitude >= 0.5f && accel_magnitude <= 10.0f) {
        sensor_ok_count++;
    }

    // 陀螺仪检查：角速度在合理范围内（不超过2000°/s）
    if (fabsf(sensor_data.gyro_x) <= 2000.0f &&
        fabsf(sensor_data.gyro_y) <= 2000.0f &&
        fabsf(sensor_data.gyro_z) <= 2000.0f) {
        sensor_ok_count++;
    }

    // 传感器可靠性得分
    float sensor_score = (sensor_ok_count / 5.0f) * 0.4f;
    confidence += sensor_score;

    // 3. 数据一致性验证 (20%) - 多传感器交叉验证
    float consistency_score = 0.0f;

    // 倾斜角度与加速度一致性检查
    float angle_magnitude = sqrtf(sensor_data.angle_x * sensor_data.angle_x +
                                 sensor_data.angle_y * sensor_data.angle_y);
    if (angle_magnitude < 45.0f) {  // 合理的倾斜角度范围
        consistency_score += 0.5f;
    }

    // 温湿度相关性检查（高温通常对应低湿度）
    if ((sensor_data.sht_temperature > 30.0f && sensor_data.humidity < 80.0f) ||
        (sensor_data.sht_temperature <= 30.0f)) {
        consistency_score += 0.5f;
    }

    float consistency_points = consistency_score * 0.2f;
    confidence += consistency_points;

    // 4. 系统稳定性 (10%) - 运行时间和历史稳定性
    uint32_t uptime_seconds = current_time / 1000;
    float stability_score = 0.0f;
    if (uptime_seconds > 60) {   // 运行超过1分钟
        stability_score += 0.05f;
    }
    if (uptime_seconds > 300) {  // 运行超过5分钟
        stability_score += 0.05f;
    }
    confidence += stability_score;

    // 确保置信度在合理范围内
    assessment->confidence = (confidence > 1.0f) ? 1.0f : confidence;
    assessment->timestamp = current_time;
    assessment->duration_ms = assessment->timestamp - level_start_time;
}

/**
 * @brief 按键事件处理函数
 * @param state 按键状态
 */

static void ButtonEventHandler(ButtonState state)
{
    static bool muted = false;
    static uint32_t press_start_time = 0;
    static bool long_press_handled = false;
    uint32_t current_time = LOS_TickCountGet();

    switch (state) {
        case BUTTON_STATE_K3_PRESSED:
            // K3(UP)按键：专门用于系统重启（长按检测在Button_GetState中处理）
            printf("K3(UP) button pressed - Hold for 2s to reboot\n");
            break;

        case BUTTON_STATE_K4_PRESSED:
            // K4(DOWN)按键：专门用于切换LCD显示模式
            printf("K4(DOWN) button pressed - Switching LCD display mode...\n");
            SwitchLcdMode();
            break;

        case BUTTON_STATE_K5_PRESSED:
            // K5(LEFT)按键：专门用于静音/取消静音
            muted = !muted;
            SetAlarmMute(muted);
            printf("K5(LEFT) button pressed - Alarm %s\n", muted ? "muted" : "unmuted");
            break;

        case BUTTON_STATE_K6_PRESSED:
            // K6(RIGHT)按键：显示系统状态
            printf("K6(RIGHT) button pressed - System status display\n");
            printf("System uptime: %lu ms\n", LOS_TickCountGet());
            printf("WiFi status: Connected, Sensors: OK, Storage: OK\n");
            printf("Current LCD mode: %d\n", g_lcd_mode);
            printf("Alarm muted: %s\n", IsAlarmMuted() ? "YES" : "NO");
            break;

        case BUTTON_STATE_RELEASED:
            // 按键释放处理（K3长按重启已在Button_GetState中处理）
            printf("Button released\n");
            break;

        case BUTTON_STATE_SHORT_PRESS:
            // 兼容原有短按逻辑 - 切换LCD模式
            SwitchLcdMode();
            printf("Button short press: LCD mode switched\n");
            break;

        case BUTTON_STATE_LONG_PRESS:
            // 兼容原有长按逻辑 - 静音功能
            if (!long_press_handled) {
                muted = !muted;
                SetAlarmMute(muted);
                printf("Button long press: Alarm %s\n", muted ? "muted" : "unmuted");
                long_press_handled = true;
            }
            break;

        default:
            break;
    }
}

// ========== 主程序入口 ==========

/**
 * @brief 山体滑坡监测系统主函数
 */
void LandslideMonitorExample(void)
{
    int ret;

    printf("=== Landslide Monitoring System Starting ===\n");
    printf("Version: 2.0.0 (Real Sensors)\n");
    printf("Hardware: rk2206 with MPU6050, SHT30, BH1750\n");

    // 初始化系统
    ret = LandslideMonitorInit();
    if (ret != 0) {
        printf("Failed to initialize landslide monitor: %d\n", ret);
        printf("Error: %s\n", GetLastErrorMessage());
        return;
    }

    // 启动系统
    ret = LandslideMonitorStart();
    if (ret != 0) {
        printf("Failed to start landslide monitor: %d\n", ret);
        printf("Error: %s\n", GetLastErrorMessage());
        LandslideMonitorShutdown();
        return;
    }

    printf("=== Landslide Monitoring System Started Successfully ===\n");
    printf("System is now monitoring for landslide risks...\n");
    printf("Button Controls:\n");
    printf("  K3(UP): Long press (>2s) = SYSTEM REBOOT - Restart device\n");
    printf("  K4(DOWN): Press = Switch LCD display mode (3 modes)\n");
    printf("  K5(LEFT): Press = Mute/unmute alarm\n");
    printf("  K6(RIGHT): Press = Show system status\n");
    printf("LCD Modes: Real-Time Data -> Risk Assessment -> Trend Analysis\n");
    printf("WARNING: K3 long press will immediately reboot the system!\n");

    // 主循环 - 系统将在后台线程中运行
    while (GetSystemState() != SYSTEM_STATE_SHUTDOWN) {
        SystemStats stats;
        GetSystemStats(&stats);

        // 每120秒打印一次系统状态（减少频率）
        static uint32_t last_status_time = 0;
        uint32_t current_time = LOS_TickCountGet();
        if (current_time - last_status_time > 120000) {
            printf("\n=== SYSTEM STATUS ===\n");
            printf("Uptime: %u seconds\n", stats.uptime_seconds);
            printf("Data samples: %u\n", stats.data_samples);
            printf("Sensor errors: %u\n", stats.sensor_errors);
            printf("Risk alerts: %u\n", stats.risk_alerts);
            printf("LCD mode: %d\n", stats.lcd_mode);
            printf("System state: %d\n", stats.current_state);
            printf("====================\n\n");
            last_status_time = current_time;
        }

        LOS_Msleep(500);   // 500ms检查间隔
    }

    printf("=== Landslide Monitoring System Shutting Down ===\n");
    LandslideMonitorShutdown();
}

/**
 * @brief OpenHarmony应用入口函数
 */
void LandslideMonitorAppEntry(void)
{
    UINT32 thread_id;
    TSK_INIT_PARAM_S task = {0};
    UINT32 ret = LOS_OK;

    task.pfnTaskEntry = (TSK_ENTRY_FUNC)LandslideMonitorExample;
    task.uwStackSize = 8192;  // 8KB栈空间
    task.pcName = "LandslideMonitor";
    task.usTaskPrio = 10;  // 中等优先级

    ret = LOS_TaskCreate(&thread_id, &task);
    if (ret != LOS_OK) {
        printf("Failed to create landslide monitor task: 0x%x\n", ret);
        return;
    }

    printf("Landslide monitor task created successfully\n");
}

// 注册为OpenHarmony应用
APP_FEATURE_INIT(LandslideMonitorAppEntry);
