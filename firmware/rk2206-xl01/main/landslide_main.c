/*
 * Landslide Monitoring System - Main Application
 * RK2206 + XL01 Wireless Module
 * 
 * Architecture: Production-grade modular design
 * - Separation of concerns (drivers, utils, app, config)
 * - Hardware abstraction layer
 * - Resource management
 * - Multi-tasking with priority
 */

#include <stdio.h>
#include <math.h>
#include <string.h>
#include "los_task.h"
#include "ohos_init.h"
#include "cmsis_os.h"
#include "iot_i2c.h"

// Configuration
#include "../config/app_config.h"

// Utilities
#include "../utils/fifo.h"
#include "../utils/watchdog_mgr.h"

// Drivers
#include "../drivers/xl01/xl01_driver.h"
#if ENABLE_SHT30
#include "../drivers/sensors/sht30_driver.h"
#endif
#if ENABLE_MPU6050
#include "../drivers/sensors/mpu6050_driver.h"
#endif
#if ENABLE_GPS
#include "../drivers/sensors/gps_driver.h"
#endif

// Application
#include "../app/sensor_data.h"
#include "../app/device_command_parser.h"
#include "../app/command_ack_builder.h"
#include "../app/device_identity.h"
#include "../app/telemetry_envelope_builder.h"

// ==================== Global State ====================

static SensorData g_sensor_data = {0};
static Statistics g_stats = {0};
static int g_system_ready = 0;
static unsigned int g_runtime_sampling_interval_ms = 1000;
static unsigned int g_runtime_report_interval_ms = UPLOAD_INTERVAL_MS;
static int g_platform_uplink_enabled = 1;
static volatile int g_platform_manual_collect_requested = 0;
bool g_cloud_motor_enabled = false;
int g_cloud_motor_speed = 0;
MotorDirection g_cloud_motor_direction = MOTOR_DIRECTION_STOP;
int g_cloud_motor_duration = 0;
bool g_cloud_buzzer_enabled = false;
bool g_cloud_rgb_enabled = false;
bool g_cloud_voice_enabled = false;
bool g_cloud_test_mode = false;
int g_cloud_rgb_red = 0;
int g_cloud_rgb_green = 0;
int g_cloud_rgb_blue = 0;

static void BuildAckTimestamp(char *output, int output_size)
{
    if (output == NULL || output_size <= 0) {
        return;
    }

    unsigned int sec = g_sensor_data.uptime % 60;
    snprintf(output, (size_t)output_size, "1970-01-01T00:00:%02uZ", sec);
}

static int BuildRuntimeConfigResultJson(
    const DeviceCommandMessage *cmd,
    char *output,
    int output_size
)
{
    int first = 1;
    int len = 0;

    if (cmd == NULL || output == NULL || output_size <= 0) {
        return -1;
    }

    len = snprintf(output, (size_t)output_size, "{\"applied\":true,\"applied_keys\":[");
    if (len < 0 || len >= output_size) {
        return -1;
    }

    if (cmd->has_sampling_s) {
        len += snprintf(
            output + len,
            (size_t)(output_size - len),
            "%s\"sampling_s\"",
            first ? "" : ","
        );
        if (len < 0 || len >= output_size) {
            return -1;
        }
        first = 0;
    }

    if (cmd->has_report_interval_s) {
        len += snprintf(
            output + len,
            (size_t)(output_size - len),
            "%s\"report_interval_s\"",
            first ? "" : ","
        );
        if (len < 0 || len >= output_size) {
            return -1;
        }
    }

    len += snprintf(
        output + len,
        (size_t)(output_size - len),
        "],\"runtime_config\":{\"sampling_s\":%u,\"report_interval_s\":%u}}",
        g_runtime_sampling_interval_ms / 1000,
        g_runtime_report_interval_ms / 1000
    );
    if (len < 0 || len >= output_size) {
        return -1;
    }

    return len;
}

static void HandlePlatformCommand(const char *commandJson)
{
    DeviceCommandMessage cmd;
    const DeviceIdentity *identity;
    char ackTs[32];
    char ackPayload[512];
    char resultJson[256];
    int ackLen;

    if (ParseDeviceCommandV1(commandJson, &cmd) != 0) {
        return;
    }

    identity = DeviceIdentity_Get();
    if (identity == NULL || identity->device_id == NULL) {
        return;
    }
    if (strcmp(cmd.device_id, identity->device_id) != 0) {
        printf("[CMD IGNORE] device_id mismatch cmd=%s local=%s\n", cmd.device_id, identity->device_id);
        return;
    }

    BuildAckTimestamp(ackTs, sizeof(ackTs));

    if (strcmp(cmd.command_type, "ping") == 0) {
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"pong\":true}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "set_config") == 0) {
        if (cmd.has_sampling_s && cmd.sampling_s > 0) {
            g_runtime_sampling_interval_ms = (unsigned int)cmd.sampling_s * 1000;
        }
        if (cmd.has_report_interval_s && cmd.report_interval_s > 0) {
            g_runtime_report_interval_ms = (unsigned int)cmd.report_interval_s * 1000;
        }

        if (BuildRuntimeConfigResultJson(&cmd, resultJson, sizeof(resultJson)) <= 0) {
            strncpy(resultJson, "{\"applied\":true}", sizeof(resultJson) - 1);
            resultJson[sizeof(resultJson) - 1] = '\0';
        }

        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            resultJson,
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "reboot") == 0) {
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"rebooting\":true}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "restart_device") == 0) {
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"restart_requested\":true,\"rebooting\":true}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "set_sampling_interval") == 0) {
        if (cmd.has_interval_seconds && cmd.interval_seconds > 0) {
            g_runtime_sampling_interval_ms = (unsigned int)cmd.interval_seconds * 1000;
            snprintf(
                resultJson,
                sizeof(resultJson),
                "{\"applied\":true,\"sampling_s\":%d}",
                cmd.interval_seconds
            );
            ackLen = BuildDeviceCommandAckV1(
                cmd.command_id,
                "acked",
                resultJson,
                ackTs,
                ackPayload,
                sizeof(ackPayload)
            );
        } else {
            ackLen = BuildDeviceCommandAckV1(
                cmd.command_id,
                "failed",
                "{\"error\":\"invalid_interval_seconds\"}",
                ackTs,
                ackPayload,
                sizeof(ackPayload)
            );
        }
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "manual_collect") == 0) {
        g_platform_manual_collect_requested = 1;
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"collect_requested\":true,\"reason\":\"manual_trigger\"}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "deactivate_device") == 0) {
        g_platform_uplink_enabled = 0;
        g_cloud_test_mode = false;
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"deactivated\":true,\"uplink_suppressed\":true}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "motor_start") == 0) {
        g_cloud_motor_enabled = true;
        g_cloud_motor_direction = MOTOR_DIRECTION_FORWARD;
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"motor_state\":\"running\"}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "motor_stop") == 0) {
        g_cloud_motor_enabled = false;
        g_cloud_motor_direction = MOTOR_DIRECTION_STOP;
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"motor_state\":\"stopped\"}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "buzzer_on") == 0) {
        g_cloud_buzzer_enabled = true;
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"buzzer_on\":true}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    if (strcmp(cmd.command_type, "buzzer_off") == 0) {
        g_cloud_buzzer_enabled = false;
        ackLen = BuildDeviceCommandAckV1(
            cmd.command_id,
            "acked",
            "{\"buzzer_on\":false}",
            ackTs,
            ackPayload,
            sizeof(ackPayload)
        );
        if (ackLen > 0) {
            XL01_SendPlatformCommandAck(ackPayload, ackLen);
        }
        return;
    }

    ackLen = BuildDeviceCommandAckV1(
        cmd.command_id,
        "failed",
        "{\"error\":\"unknown_command_type\"}",
        ackTs,
        ackPayload,
        sizeof(ackPayload)
    );
    if (ackLen > 0) {
        XL01_SendPlatformCommandAck(ackPayload, ackLen);
    }
}

// ==================== Virtual Sensor (for testing) ====================

#if ENABLE_VIRTUAL
#include <math.h>

static void VirtualSensor_Read(SensorData *data)
{
    static float temp_base = 25.0f;
    static float angle_base = 0.0f;
    
    // Temperature: 25°C ± 5°C
    data->temperature = temp_base + 5.0f * sinf(data->seq * 0.1f);
    data->humidity = 60.0f + 10.0f * cosf(data->seq * 0.15f);
    data->temp_valid = 1;
    
    // GPS: Fixed location (example)
    data->latitude = 22.5430f + data->seq * 0.00001f;
    data->longitude = 114.0579f + data->seq * 0.00001f;
    data->gps_valid = 1;
    
    // Accelerometer: Simulate tilt
    angle_base += 0.05f;
    data->angle_x = angle_base + 0.5f * sinf(data->seq * 0.2f);
    data->angle_y = angle_base * 0.6f + 0.3f * cosf(data->seq * 0.25f);
    data->accel_x = sinf(data->angle_x * 3.14159f / 180.0f);
    data->accel_y = sinf(data->angle_y * 3.14159f / 180.0f);
    data->accel_z = 1.0f;
    data->gyro_x = 0.5f;
    data->gyro_y = -0.3f;
    data->gyro_z = 0.1f;
    data->imu_valid = 1;
    
    // Warning: tilt > 5°
    data->warning = (fabs(data->angle_x) > 5.0f || fabs(data->angle_y) > 5.0f) ? 1 : 0;
    
    // Battery: Simulate discharge
    data->battery_level = 100 - (data->seq % 100);
}
#endif

// ==================== Task 1: Sensor Collection ====================

static void* SensorCollectionTask(const char* arg)
{
    (void)arg;
    
    LOS_Msleep(1000);
    printf("[Task] Sensor Collection started\n");
    
    while (1) {
        // Read all enabled sensors
        
#if ENABLE_VIRTUAL
        VirtualSensor_Read(&g_sensor_data);
#else
        // Real sensors
        g_sensor_data.temp_valid = 0;
        g_sensor_data.gps_valid = 0;
        g_sensor_data.imu_valid = 0;
        
#if ENABLE_SHT30
        if (SHT30_Read(&g_sensor_data.temperature, &g_sensor_data.humidity) == 0) {
            g_sensor_data.temp_valid = 1;
        }
#endif

#if ENABLE_MPU6050
        float ax, ay, az, gx, gy, gz;
        if (MPU6050_Read(&ax, &ay, &az, &gx, &gy, &gz) == 0) {
            g_sensor_data.accel_x = ax;
            g_sensor_data.accel_y = ay;
            g_sensor_data.accel_z = az;
            g_sensor_data.gyro_x = gx;
            g_sensor_data.gyro_y = gy;
            g_sensor_data.gyro_z = gz;
            
            // Calculate tilt angles
            g_sensor_data.angle_x = atan2(ay, sqrt(ax*ax + az*az)) * 180.0f / 3.14159f;
            g_sensor_data.angle_y = atan2(-ax, sqrt(ay*ay + az*az)) * 180.0f / 3.14159f;
            
            g_sensor_data.imu_valid = 1;
        }
#endif

#if ENABLE_GPS
        // GPS使用中断接收，这里只需要处理缓冲区数据
        GPS_Poll();  // 处理中断接收到的数据
        
        // 读取最新的GPS坐标（无论fix状态如何，都更新坐标）
        int gps_ret = GPS_Read(&g_sensor_data.latitude, &g_sensor_data.longitude);
        
        // 只有当GPS返回成功时，才标记为有效
        g_sensor_data.gps_valid = (gps_ret == 0) ? 1 : 0;
#endif

        // Check warnings
        g_sensor_data.warning = 0;
        if (g_sensor_data.imu_valid) {
            if (fabs(g_sensor_data.angle_x) > 5.0f || fabs(g_sensor_data.angle_y) > 5.0f) {
                g_sensor_data.warning = 1;
            }
        }
#endif
        
        // Feed watchdog
        Watchdog_Feed();
        
        // Update every 1 second
        LOS_Msleep(g_runtime_sampling_interval_ms);
        g_stats.uptime_sec += (g_runtime_sampling_interval_ms / 1000) > 0 ? (g_runtime_sampling_interval_ms / 1000) : 1;
        g_sensor_data.uptime = g_stats.uptime_sec;
    }
    
    return NULL;
}

// ==================== Task 2: UART RX ====================

static void* UartRxTask(const char* arg)
{
    (void)arg;
    
    printf("[Task] UART RX started (High Priority)\n");
    
    while (1) {
        XL01_PollReceive();
        Watchdog_Feed();
        LOS_Msleep(1);  // 1ms polling
    }
    
    return NULL;
}

// ==================== Task 3: Data Process ====================

static void* DataProcessTask(const char* arg)
{
    (void)arg;
    
    printf("[Task] Data Process started\n");
    LOS_Msleep(100);
    
    while (1) {
        int processed = XL01_ProcessReceivedData(&g_stats);
        if (processed > 0) {
            char commandJson[512];
            if (XL01_TryDequeuePlatformCommand(commandJson, sizeof(commandJson)) > 0) {
                HandlePlatformCommand(commandJson);
            }
        }
        LOS_Msleep(10);
    }
    
    return NULL;
}

// ==================== Task 4: Data Upload ====================

static void* DataUploadTask(const char* arg)
{
    (void)arg;
    char json[512];
    int len;
    unsigned int elapsed_since_upload_ms = UPLOAD_INTERVAL_MS;
    
    LOS_Msleep(3000);
    printf("[Task] Data Upload started\n\n");
    
    printf("========================================\n");
    printf("  Configuration Summary\n");
    printf("========================================\n");
    printf("  Device ID: %s\n", DEVICE_ID);
    printf("  Install Label: %s\n", INSTALL_LABEL);
    printf("  Upload Interval: %d ms\n", UPLOAD_INTERVAL_MS);
    printf("  Max Retries: %d\n", MAX_RETRY_COUNT);
    printf("  ACK Check: %s\n", ENABLE_ACK_CHECK ? "Enabled" : "Disabled");
    printf("  ACK Timeout: %d ms\n", ACK_TIMEOUT_MS);
    printf("  Low Power: %s\n", ENABLE_LOW_POWER ? "Enabled" : "Disabled");
    printf("  Watchdog: %s\n", ENABLE_WATCHDOG ? "Enabled" : "Disabled");
    printf("----------------------------------------\n");
    printf("  Sensors:\n");
    printf("    - Virtual: %s\n", ENABLE_VIRTUAL ? "✓" : "✗");
    printf("    - GPS: %s\n", ENABLE_GPS ? "✓" : "✗");
    printf("    - SHT30: %s\n", ENABLE_SHT30 ? "✓" : "✗");
    printf("    - MPU6050: %s\n", ENABLE_MPU6050 ? "✓" : "✗");
    printf("========================================\n\n");
    
    while (1) {
        int manual_collect_requested = 0;
        unsigned int sleep_ms = 200;

        if (g_platform_manual_collect_requested) {
            manual_collect_requested = 1;
            g_platform_manual_collect_requested = 0;
        }

        if (!manual_collect_requested && elapsed_since_upload_ms < g_runtime_report_interval_ms) {
            unsigned int remaining_ms = g_runtime_report_interval_ms - elapsed_since_upload_ms;
            if (remaining_ms < sleep_ms) {
                sleep_ms = remaining_ms;
            }

            LOS_Msleep(sleep_ms);
            elapsed_since_upload_ms += sleep_ms;
            continue;
        }

        if (!g_platform_uplink_enabled) {
            if (manual_collect_requested) {
                printf("[UPLOAD] manual collect ignored because uplink is deactivated\n");
            }
            elapsed_since_upload_ms = 0;
            LOS_Msleep(200);
            elapsed_since_upload_ms += 200;
            continue;
        }

        g_sensor_data.seq++;
        g_stats.total_sent++;
        
        len = BuildTelemetryEnvelopeV1(&g_sensor_data, json, sizeof(json));
        if (len <= 0 || len >= (int)sizeof(json)) {
            printf("[ERROR] Failed to build telemetry envelope\n");
            LOS_Msleep(UPLOAD_INTERVAL_MS);
            continue;
        }
        
        // Send with retry mechanism
        int ret = XL01_SendWithRetry(json, len, &g_stats);
        g_stats.total_bytes += len;
        
        // Print summary
        printf("[SEND #%u] %d bytes device=%s", g_sensor_data.seq, len, DeviceIdentity_Get()->device_id);
        if (ret == 0) {
#if ENABLE_ACK_CHECK
            printf(" ✓ ACK");
#else
            printf(" (sent)");
#endif
        } else {
            printf(" ✗ FAILED");
        }
        if (g_sensor_data.warning) {
            printf(" ⚠️ WARNING!");
        }
        printf("\n");
        
        // 显示GPS坐标而不只是状态（删除电池显示）
        if (g_sensor_data.gps_valid && 
            (g_sensor_data.latitude != 0.0f || g_sensor_data.longitude != 0.0f)) {
            printf("  Temp:%.1f°C Humi:%.1f%% Tilt:%.2f°/%.2f° GPS:(%.6f,%.6f)\n",
                   g_sensor_data.temperature,
                   g_sensor_data.humidity,
                   g_sensor_data.angle_x,
                   g_sensor_data.angle_y,
                   g_sensor_data.latitude,
                   g_sensor_data.longitude);
        } else {
            printf("  Temp:%.1f°C Humi:%.1f%% Tilt:%.2f°/%.2f° GPS:NO\n",
                   g_sensor_data.temperature,
                   g_sensor_data.humidity,
                   g_sensor_data.angle_x,
                   g_sensor_data.angle_y);
        }
        
        // Statistics every 10 packets
        if (g_sensor_data.seq % 10 == 0) {
            printf("\n");
            printf("========== Statistics ==========\n");
            printf("  Uptime: %u sec\n", g_stats.uptime_sec);
            printf("  Sent: %u/%u (Success: %.1f%%)\n",
                   g_stats.success_count, g_stats.total_sent,
                   (float)g_stats.success_count * 100 / g_stats.total_sent);
            printf("  Retries: %u, Failed: %u\n",
                   g_stats.retry_count, g_stats.failed_count);
            printf("  Total bytes: %u\n", g_stats.total_bytes);
            printf("  RX packets: %u\n", g_stats.rx_packets);
            printf("================================\n\n");
        }
        
        // Feed watchdog
        Watchdog_Feed();
        
        // Wait for next upload interval
        elapsed_since_upload_ms = 0;
    }
    
    return NULL;
}

// ==================== System Initialization ====================

static void App_SystemInit(void)
{
    printf("--- System Initialization ---\n");
    
    // Initialize watchdog
    Watchdog_Init();
    
    // Initialize XL01 driver
    XL01_Init();
    
    // Initialize enabled sensors
#if ENABLE_GPS
    GPS_Init();
#endif

#if ENABLE_SHT30 || ENABLE_MPU6050
    // Initialize I2C bus
    IoTI2cInit(I2C_IDX, I2C_BAUDRATE);
    printf("[OK] I2C initialized\n");
#endif

#if ENABLE_SHT30
    SHT30_Init();
#endif

#if ENABLE_MPU6050
    MPU6050_Init();
#endif
    
    printf("--- Initialization Complete ---\n\n");
    
    g_system_ready = 1;
}

// ==================== Main Entry ====================

static void MainEntry(void)
{
    osThreadAttr_t attr;

    printf("\n");
    printf("*********************************************\n");
    printf("*  Landslide Monitoring System            *\n");
    printf("*  Modular Production Architecture        *\n");
    printf("*  Version: 2.0                           *\n");
    printf("*********************************************\n");
    printf("\n");

    // Initialize all subsystems
    App_SystemInit();

    // Create tasks with appropriate priorities
    attr.name = "SensorTask";
    attr.attr_bits = 0U;
    attr.cb_mem = NULL;
    attr.cb_size = 0U;
    attr.stack_mem = NULL;
    attr.stack_size = 4096;
    attr.priority = osPriorityNormal;
    osThreadNew((osThreadFunc_t)SensorCollectionTask, NULL, &attr);

    attr.name = "UartRxTask";
    attr.stack_size = 2048;
    attr.priority = osPriorityHigh;  // High priority for UART RX
    osThreadNew((osThreadFunc_t)UartRxTask, NULL, &attr);

    attr.name = "ProcessTask";
    attr.stack_size = 2048;
    attr.priority = osPriorityNormal;
    osThreadNew((osThreadFunc_t)DataProcessTask, NULL, &attr);

    attr.name = "UploadTask";
    attr.stack_size = 4096;
    attr.priority = osPriorityBelowNormal;
    osThreadNew((osThreadFunc_t)DataUploadTask, NULL, &attr);
}

SYS_RUN(MainEntry);
