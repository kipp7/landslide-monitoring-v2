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
#include <stdbool.h>
#include <time.h>
#include "los_task.h"
#include "los_tick.h"
#include "ohos_init.h"
#include "cmsis_os.h"
#include "iot_i2c.h"

// Configuration
#include "../config/app_config.h"

// Some OpenHarmony/WSL build trees have lagged behind the latest app_config.h
// update. Keep a local fallback so the mainline polled-uplink build still
// compiles even if the mounted header is stale.
#ifndef EDGE_UPLINK_MODE_PERIODIC
#define EDGE_UPLINK_MODE_PERIODIC 0
#endif

#ifndef EDGE_UPLINK_MODE_POLLED
#define EDGE_UPLINK_MODE_POLLED 1
#endif

#ifndef EDGE_UPLINK_MODE
#define EDGE_UPLINK_MODE EDGE_UPLINK_MODE_POLLED
#endif

#ifndef PLATFORM_COMMAND_RX_LOG_MODE
#define PLATFORM_COMMAND_RX_LOG_MODE 0
#endif

#ifndef BOOT_SERIAL_DIAG_MODE
#define BOOT_SERIAL_DIAG_MODE 0
#endif

// Utilities
#include "../utils/fifo.h"
#include "../utils/watchdog_mgr.h"

// Drivers
#include "../drivers/xl01/xl01_driver.h"
#if ENABLE_GPS
#include "../drivers/sensors/gps_driver.h"
#endif
#if ENABLE_RS485_BUS
#include "../drivers/sensors/field_sensors_rs485.h"
#include "../drivers/sensors/field_alarm_rs485.h"
#endif
#if ENABLE_BATTERY_MONITOR
#include "../drivers/sensors/battery_monitor.h"
#endif
#if ENABLE_SIMULATED_FIELD_SENSORS
#include "../drivers/sensors/simulated_field_sensors.h"
#endif
#if ENABLE_SIMULATED_GNSS
#include "../drivers/sensors/simulated_gnss.h"
#endif

// Application
#include "../app/sensor_data.h"
#include "../app/device_command_parser.h"
#include "../app/command_ack_builder.h"
#include "../app/device_identity.h"
#include "../app/shared_port_scheduler.h"
#include "../app/telemetry_envelope_builder.h"
#include "../app/compact_telemetry_builder.h"
#include "../app/compact_poll_command.h"
#include "../app/gnss_probe_stats_protocol.h"

// Keep the local command/runtime path decoupled from the legacy monolithic
// header, which defines a conflicting SensorData shape for another sample.
typedef enum {
    MOTOR_DIRECTION_STOP = 0,
    MOTOR_DIRECTION_FORWARD = 1,
    MOTOR_DIRECTION_REVERSE = 2,
} MotorDirection;

#if FIELD_LINK_POSTTX_DIAG_MODE
#define APP_UPLOAD_TASK_STACK_SIZE       12288
#define APP_PROCESS_TASK_STACK_SIZE      16384
#define APP_SHARED_PORT_TASK_STACK_SIZE  12288
#else
// The command hot path now includes JSON dequeue, parse, ACK build and field-link encode.
// Real command traffic has proven the old 4KB worker stacks are no longer sufficient.
#define APP_UPLOAD_TASK_STACK_SIZE       8192
#define APP_PROCESS_TASK_STACK_SIZE      12288
#define APP_SHARED_PORT_TASK_STACK_SIZE  8192
#endif

// ==================== Global State ====================

static SensorData g_sensor_data = {0};
static SensorData g_v6_core_upload_snapshot = {0};
static int g_v6_core_upload_snapshot_valid = 0;
static GnssSensorDiagnostics g_sensor_diagnostics = {0};
static FieldRs485RuntimeDiagnostics g_rs485_runtime_diagnostics = {0};
static osMutexId_t g_sensor_data_mutex = NULL;
static Statistics g_stats = {0};
// Keep the platform command staging buffer off the ProcessTask stack.
static char g_process_command_json[FIELD_LINK_MAX_PAYLOAD_BYTES + 1] = {0};
static int g_system_ready = 0;
static int g_i2c_ready = 0;
static int g_rs485_ready = 0;
#if ENABLE_GPS
static int g_gps_ready = 0;
#endif
static int g_battery_ready = 0;
static unsigned int g_runtime_sampling_interval_ms = 1000;
static unsigned int g_runtime_report_interval_ms = UPLOAD_INTERVAL_MS;
static int g_platform_uplink_enabled = 1;
static volatile int g_platform_manual_collect_requested = 0;
static volatile int g_platform_poll_latest_requested = 0;
static volatile unsigned int g_platform_poll_scope = COMPACT_POLL_SCOPE_CORE;
static volatile unsigned int g_platform_uplink_quiet_remaining_ms = 0;
static char g_last_platform_command_type[32] = "";
static char g_last_platform_command_id[64] = "";
static unsigned int g_last_platform_command_uptime_s = 0;
static char g_last_trusted_time_ts[40] = "";
static char g_last_trusted_time_source[32] = "";
static volatile uint32_t g_last_platform_command_tick = 0;
static CompactPollBroadcastDeduplicator g_compact_poll_broadcast_deduplicator;
static unsigned int g_compact_poll_broadcast_duplicates_suppressed = 0U;
static volatile int g_field_link_recovery_requested = 0;
#define FW_RX_DIAG_MARKER "fw-rk2206-rtk-compact-v6-lowrate-v1-live-20260806"
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

#define ACK_TS_BEIJING_OFFSET_SECONDS (8 * 60 * 60)
#define ACK_TS_MIN_VALID_UNIX_SECONDS ((time_t)1704067200)
#define COMMAND_INTERVAL_MIN_SECONDS 1
#define COMMAND_INTERVAL_MAX_SECONDS 3600
#define COMMAND_REBOOT_DELAY_MS 1000U

static void SensorData_Lock(void)
{
    if (g_sensor_data_mutex != NULL) {
        osMutexAcquire(g_sensor_data_mutex, osWaitForever);
    }
}

static void SensorData_Unlock(void)
{
    if (g_sensor_data_mutex != NULL) {
        osMutexRelease(g_sensor_data_mutex);
    }
}

static uint64_t MainMonotonicMs(void)
{
    uint64_t ticks = (uint64_t)LOS_TickCountGet();
    uint64_t ticks_per_second = (uint64_t)g_ticksPerSec;

    if (ticks_per_second == 0U) return ticks;
    return (ticks / ticks_per_second) * 1000U +
           ((ticks % ticks_per_second) * 1000U) / ticks_per_second;
}

static void SensorData_CopySnapshot(SensorData *snapshot)
{
    if (snapshot == NULL) {
        return;
    }

    SensorData_Lock();
    memcpy(snapshot, &g_sensor_data, sizeof(*snapshot));
    SensorData_Unlock();
}

static void SensorData_StoreSnapshot(const SensorData *snapshot)
{
    unsigned int seq;
    unsigned int sample_epoch;

    if (snapshot == NULL) {
        return;
    }

    SensorData_Lock();
    seq = g_sensor_data.seq;
    sample_epoch = g_sensor_data.sample_epoch + 1U;
    if (sample_epoch == 0U) {
        sample_epoch = 1U;
    }
    memcpy(&g_sensor_data, snapshot, sizeof(g_sensor_data));
    g_sensor_data.seq = seq;
    g_sensor_data.sample_epoch = sample_epoch;
    SensorData_Unlock();
}

static void SensorData_TakeUploadSnapshot(SensorData *snapshot)
{
    unsigned int next_seq;

    if (snapshot == NULL) {
        return;
    }

    memset(snapshot, 0, sizeof(*snapshot));
    SensorData_Lock();
    memcpy(snapshot, &g_sensor_data, sizeof(*snapshot));
    next_seq = g_sensor_data.seq + 1U;
    if (next_seq == 0U) {
        next_seq = 1U;
    }
    snapshot->seq = next_seq;
    g_sensor_data.seq = snapshot->seq;
    SensorData_Unlock();
}

static int SensorData_TakeV6UploadSnapshot(SensorData *snapshot, unsigned int scope)
{
    unsigned int next_seq;
    int snapshot_available = 0;

    if (snapshot == NULL) {
        return 0;
    }

    memset(snapshot, 0, sizeof(*snapshot));
    SensorData_Lock();
    if (scope == COMPACT_POLL_SCOPE_CORE) {
        memcpy(snapshot, &g_sensor_data, sizeof(*snapshot));
        if (snapshot->sample_epoch != 0U) {
            memcpy(&g_v6_core_upload_snapshot, snapshot, sizeof(g_v6_core_upload_snapshot));
            g_v6_core_upload_snapshot_valid = 1;
            snapshot_available = 1;
        }
    } else if ((scope == COMPACT_POLL_SCOPE_ENVIRONMENT || scope == COMPACT_POLL_SCOPE_AUDIT) &&
               g_v6_core_upload_snapshot_valid) {
        memcpy(snapshot, &g_v6_core_upload_snapshot, sizeof(*snapshot));
        snapshot_available = 1;
    }

    if (snapshot_available) {
        next_seq = g_sensor_data.seq + 1U;
        if (next_seq == 0U) {
            next_seq = 1U;
        }
        snapshot->seq = next_seq;
        g_sensor_data.seq = next_seq;
    }
    SensorData_Unlock();
    return snapshot_available;
}

static unsigned int SensorData_GetUptimeSnapshot(void)
{
    unsigned int uptime;

    SensorData_Lock();
    uptime = g_sensor_data.uptime;
    SensorData_Unlock();
    return uptime;
}

static uint8_t SensorDiagnostics_EnabledMask(void)
{
    uint8_t mask = 0U;

#if ENABLE_GPS
    mask |= GNSS_SENSOR_UM220_MASK;
#endif
#if ENABLE_RS485_SOIL_SENSOR
    mask |= GNSS_SENSOR_SOIL_MASK;
#if RS485_SOIL_HAS_EC
    mask |= GNSS_SENSOR_SOIL_EC_MASK;
#endif
#endif
#if ENABLE_RS485_TILT_SENSOR
    mask |= GNSS_SENSOR_TILT_MASK;
#endif
    return mask;
}

static uint8_t SensorDiagnostics_InitializationSuccessMask(void)
{
    uint8_t mask = 0U;

#if ENABLE_GPS
    if (g_gps_ready) {
        mask |= GNSS_SENSOR_UM220_MASK;
    }
#endif
#if ENABLE_RS485_SOIL_SENSOR
    if (g_rs485_ready) {
        mask |= GNSS_SENSOR_SOIL_MASK;
#if RS485_SOIL_HAS_EC
        mask |= GNSS_SENSOR_SOIL_EC_MASK;
#endif
    }
#endif
#if ENABLE_RS485_TILT_SENSOR
    if (g_rs485_ready) {
        mask |= GNSS_SENSOR_TILT_MASK;
    }
#endif
    return mask;
}

static void SensorDiagnostics_RecordCycle(
    uint8_t success_mask,
    uint32_t uptime_s,
    const FieldRs485CycleDiagnostics *rs485_cycle)
{
    uint8_t enabled_mask = SensorDiagnostics_EnabledMask();
    uint8_t sampled_mask = enabled_mask;
    unsigned int index;

    success_mask &= enabled_mask;
    if (rs485_cycle != NULL) {
        sampled_mask = enabled_mask & GNSS_SENSOR_UM220_MASK;
        if ((rs485_cycle->enabled_mask & FIELD_RS485_PATH_SOIL_MASK) != 0U) {
            sampled_mask |= GNSS_SENSOR_SOIL_MASK;
        }
        if ((rs485_cycle->enabled_mask & FIELD_RS485_PATH_SOIL_EC_MASK) != 0U) {
            sampled_mask |= GNSS_SENSOR_SOIL_EC_MASK;
        }
        if ((rs485_cycle->enabled_mask & FIELD_RS485_PATH_TILT_MASK) != 0U) {
            sampled_mask |= GNSS_SENSOR_TILT_MASK;
        }
    }
    success_mask &= sampled_mask;
    SensorData_Lock();
    g_sensor_diagnostics.enabled_mask = enabled_mask;
    g_sensor_diagnostics.initialization_success_mask =
        SensorDiagnostics_InitializationSuccessMask() & enabled_mask;
    g_sensor_diagnostics.current_valid_mask =
        (g_sensor_diagnostics.current_valid_mask & (uint8_t)~sampled_mask) | success_mask;
    g_sensor_diagnostics.ever_success_mask |= success_mask;
    for (index = 0U; index < GNSS_SENSOR_DIAGNOSTIC_COUNT; ++index) {
        uint8_t bit = (uint8_t)(1U << index);
        if ((enabled_mask & bit) == 0U) {
            continue;
        }
        if ((sampled_mask & bit) == 0U) {
            continue;
        }
        if (g_sensor_diagnostics.sample_counts[index] != 0xFFFFFFFFU) {
            g_sensor_diagnostics.sample_counts[index]++;
        }
        if ((success_mask & bit) != 0U) {
            g_sensor_diagnostics.last_success_uptime_s[index] = uptime_s;
            g_sensor_diagnostics.consecutive_failures[index] = 0U;
        } else if (g_sensor_diagnostics.consecutive_failures[index] != 0xFFFFFFFFU) {
            g_sensor_diagnostics.consecutive_failures[index]++;
        }
    }
    if (rs485_cycle != NULL) {
        FieldRs485_RuntimeDiagnosticsRecordCycle(&g_rs485_runtime_diagnostics, rs485_cycle);
    }
    SensorData_Unlock();
}

static void SensorDiagnostics_CopySnapshot(
    GnssSensorDiagnostics *snapshot,
    FieldRs485RuntimeDiagnostics *rs485_snapshot)
{
    uint8_t enabled_mask;

    if (snapshot == NULL || rs485_snapshot == NULL) {
        return;
    }
    enabled_mask = SensorDiagnostics_EnabledMask();
    SensorData_Lock();
    memcpy(snapshot, &g_sensor_diagnostics, sizeof(*snapshot));
    memcpy(rs485_snapshot, &g_rs485_runtime_diagnostics, sizeof(*rs485_snapshot));
    SensorData_Unlock();
    snapshot->enabled_mask = enabled_mask;
    snapshot->initialization_success_mask =
        SensorDiagnostics_InitializationSuccessMask() & enabled_mask;
    snapshot->current_valid_mask &= enabled_mask;
    snapshot->ever_success_mask &= enabled_mask;
}

static int FormatUnixTimeAsBeijingIso8601(time_t unix_seconds, char *output, int output_size)
{
    time_t beijing_seconds;
    struct tm *tm_ptr;
    struct tm tm_value;

    if (output == NULL || output_size <= 0) {
        return -1;
    }

    beijing_seconds = unix_seconds + ACK_TS_BEIJING_OFFSET_SECONDS;
    tm_ptr = gmtime(&beijing_seconds);
    if (tm_ptr == NULL) {
        return -1;
    }
    tm_value = *tm_ptr;

    if (snprintf(
            output,
            (size_t)output_size,
            "%04d-%02d-%02dT%02d:%02d:%02d+08:00",
            tm_value.tm_year + 1900,
            tm_value.tm_mon + 1,
            tm_value.tm_mday,
            tm_value.tm_hour,
            tm_value.tm_min,
            tm_value.tm_sec) >= output_size) {
        return -1;
    }

    return 0;
}

static const char *GetCommandTrustedTimeTs(const DeviceCommandMessage *cmd)
{
    if (cmd == NULL) {
        return NULL;
    }
    if (cmd->has_gateway_sent_ts && cmd->gateway_sent_ts[0] != '\0') {
        return cmd->gateway_sent_ts;
    }
    if (cmd->has_time_sync_sent_ts && cmd->time_sync_sent_ts[0] != '\0') {
        return cmd->time_sync_sent_ts;
    }
    if (cmd->has_sent_ts && cmd->sent_ts[0] != '\0') {
        return cmd->sent_ts;
    }
    return NULL;
}

static const char *GetCommandTrustedTimeSource(const DeviceCommandMessage *cmd)
{
    if (cmd == NULL) {
        return "unknown";
    }
    if (cmd->has_gateway_sent_ts && cmd->gateway_sent_ts[0] != '\0') {
        return "rk3568_gateway_sent_ts";
    }
    if (cmd->has_time_sync_sent_ts && cmd->time_sync_sent_ts[0] != '\0') {
        return "rk3568_time_sync";
    }
    if (cmd->has_sent_ts && cmd->sent_ts[0] != '\0') {
        return "rk3568_sent_ts";
    }
    return "unknown";
}

static int BuildAckTimestamp(
    const DeviceCommandMessage *cmd,
    char *output,
    int output_size,
    const char **time_source
)
{
    time_t now;
    static int g_ack_ts_clock_warned = 0;
    const char *trusted_ts;

    if (output == NULL || output_size <= 0) {
        return 0;
    }

    trusted_ts = GetCommandTrustedTimeTs(cmd);
    if (trusted_ts != NULL && trusted_ts[0] != '\0') {
        strncpy(output, trusted_ts, (size_t)output_size - 1);
        output[output_size - 1] = '\0';
        if (time_source != NULL) {
            *time_source = GetCommandTrustedTimeSource(cmd);
        }
        return 1;
    }

    now = time(NULL);
    if (now >= ACK_TS_MIN_VALID_UNIX_SECONDS &&
        FormatUnixTimeAsBeijingIso8601(now, output, output_size) == 0) {
        if (time_source != NULL) {
            *time_source = "clock_realtime";
        }
        return 1;
    }

    if (!g_ack_ts_clock_warned) {
        g_ack_ts_clock_warned = 1;
#if PLATFORM_COMMAND_RX_LOG_MODE
        printf("[TIME WARN] CLOCK_REALTIME unavailable or unsynced; ack_ts falls back to uptime-derived Beijing placeholder\n");
#endif
    }

    if (FormatUnixTimeAsBeijingIso8601((time_t)SensorData_GetUptimeSnapshot(), output, output_size) != 0) {
        snprintf(output, (size_t)output_size, "1970-01-01T08:00:00+08:00");
    }
    if (time_source != NULL) {
        *time_source = "uptime_fallback";
    }
    return 0;
}

static int BuildAckResultJsonWithTimeSource(
    const char *base_result_json_fragment,
    const char *time_source,
    char *output,
    int output_size
)
{
    int base_len;
    int written;

    if (output == NULL || output_size <= 0) {
        return -1;
    }
    if (time_source == NULL || time_source[0] == '\0') {
        time_source = "unknown";
    }

    if (base_result_json_fragment == NULL || base_result_json_fragment[0] == '\0') {
        written = snprintf(
            output,
            (size_t)output_size,
            "{\"time_source\":\"%s\"}",
            time_source
        );
        return (written > 0 && written < output_size) ? written : -1;
    }

    base_len = (int)strlen(base_result_json_fragment);
    if (base_len >= 2 &&
        base_result_json_fragment[0] == '{' &&
        base_result_json_fragment[base_len - 1] == '}') {
        written = snprintf(
            output,
            (size_t)output_size,
            "%.*s,\"time_source\":\"%s\"}",
            base_len - 1,
            base_result_json_fragment,
            time_source
        );
        return (written > 0 && written < output_size) ? written : -1;
    }

    written = snprintf(
        output,
        (size_t)output_size,
        "{\"detail\":\"unstructured_result_fragment\",\"time_source\":\"%s\"}",
        time_source
    );
    return (written > 0 && written < output_size) ? written : -1;
}

static void RecordAcceptedPlatformCommand(const DeviceCommandMessage *cmd)
{
    const char *trusted_ts;

    if (cmd == NULL) {
        return;
    }

    strncpy(g_last_platform_command_type, cmd->command_type, sizeof(g_last_platform_command_type) - 1);
    g_last_platform_command_type[sizeof(g_last_platform_command_type) - 1] = '\0';

    strncpy(g_last_platform_command_id, cmd->command_id, sizeof(g_last_platform_command_id) - 1);
    g_last_platform_command_id[sizeof(g_last_platform_command_id) - 1] = '\0';

    g_last_platform_command_uptime_s = SensorData_GetUptimeSnapshot();
    g_last_platform_command_tick = (uint32_t)LOS_TickCountGet();

    trusted_ts = GetCommandTrustedTimeTs(cmd);
    if (trusted_ts != NULL && trusted_ts[0] != '\0') {
        strncpy(g_last_trusted_time_ts, trusted_ts, sizeof(g_last_trusted_time_ts) - 1);
        g_last_trusted_time_ts[sizeof(g_last_trusted_time_ts) - 1] = '\0';
        strncpy(g_last_trusted_time_source, GetCommandTrustedTimeSource(cmd), sizeof(g_last_trusted_time_source) - 1);
        g_last_trusted_time_source[sizeof(g_last_trusted_time_source) - 1] = '\0';
    }
}

static void* FieldLinkHealthTask(const char* arg)
{
    (void)arg;

    printf(
        "[Task] Field Link Health started (auto_recovery=%s stale=%u ms)\n",
        ENABLE_FIELD_LINK_AUTO_RECOVERY ? "yes" : "no",
        (unsigned int)FIELD_LINK_STALE_REBOOT_MS
    );

    while (1) {
#if ENABLE_FIELD_LINK_AUTO_RECOVERY && EDGE_UPLINK_MODE == EDGE_UPLINK_MODE_POLLED
        uint32_t now_tick = (uint32_t)LOS_TickCountGet();
        uint32_t last_command_tick = g_last_platform_command_tick;
        uint32_t stale_ticks = LOS_MS2Tick(FIELD_LINK_STALE_REBOOT_MS);

        if (!g_field_link_recovery_requested &&
            stale_ticks > 0U &&
            (uint32_t)(now_tick - last_command_tick) >= stale_ticks &&
            last_command_tick == g_last_platform_command_tick) {
            g_field_link_recovery_requested = 1;
            printf(
                "[LINK RECOVERY] no accepted gateway command for %u ms; rebooting node in %u ms\n",
                (unsigned int)FIELD_LINK_STALE_REBOOT_MS,
                (unsigned int)FIELD_LINK_RECOVERY_REBOOT_DELAY_MS
            );
            Watchdog_RequestReboot(FIELD_LINK_RECOVERY_REBOOT_DELAY_MS);
        }
#endif
        LOS_Msleep(FIELD_LINK_RECOVERY_CHECK_MS);
    }

    return NULL;
}

static void ExtendPlatformUplinkQuietWindow(unsigned int quiet_ms)
{
    if (quiet_ms == 0) {
        return;
    }

    if (quiet_ms > g_platform_uplink_quiet_remaining_ms) {
        g_platform_uplink_quiet_remaining_ms = quiet_ms;
    }
}

static void ArmPlatformCommandQuietWindow(const char *command_type)
{
#if ENABLE_SHARED_PORT_SOURCE_CONTROL
    SharedPortScheduler_BeginQuietWindow(command_type, g_last_platform_command_id);
#else
    unsigned int quiet_ms = PLATFORM_POST_ACK_QUIET_MS;

    if (command_type != NULL &&
        (strcmp(command_type, "manual_collect") == 0 ||
         strcmp(command_type, "poll_latest_telemetry") == 0)) {
        quiet_ms += PLATFORM_MANUAL_COLLECT_DELAY_MS;
    }

    ExtendPlatformUplinkQuietWindow(quiet_ms);
#if PLATFORM_COMMAND_RX_LOG_MODE
    printf(
        "[CMD GUARD] type=%s quiet_ms=%u\n",
        command_type != NULL ? command_type : "(null)",
        quiet_ms
    );
#endif
#endif
}

static int SendPlatformCommandAckWithGuard(
    const DeviceCommandMessage *cmd,
    const char *status,
    const char *result_json_fragment,
    int trigger_manual_collect,
    int trigger_poll_latest
)
{
    char ackTs[32];
    char ackPayload[512];
    char ackResultJson[320];
    const char *effectiveResultJson = NULL;
    int ackLen;
    int sendRet = -1;
    int ackAccepted = 0;
    const char *ackTimeSource = NULL;

    if (cmd == NULL || status == NULL) {
        return -1;
    }

    BuildAckTimestamp(cmd, ackTs, sizeof(ackTs), &ackTimeSource);
    if (BuildAckResultJsonWithTimeSource(
            result_json_fragment,
            ackTimeSource,
            ackResultJson,
            sizeof(ackResultJson)
        ) > 0) {
        effectiveResultJson = ackResultJson;
    } else {
        effectiveResultJson = result_json_fragment;
    }

    ackLen = BuildDeviceCommandAckV1(
        cmd->command_id,
        status,
        effectiveResultJson,
        ackTs,
        ackPayload,
        sizeof(ackPayload)
    );

    if (ackLen <= 0 || ackLen >= (int)sizeof(ackPayload)) {
        printf("[CMD ACK BUILD FAIL] type=%s id=%s len=%d\n", cmd->command_type, cmd->command_id, ackLen);
        sendRet = -1;
    } else {
#if ENABLE_SHARED_PORT_SOURCE_CONTROL
        sendRet = SharedPortScheduler_EnqueueAckOrResult(
            cmd->command_type,
            cmd->command_id,
            ackPayload,
            ackLen
        );
#else
        sendRet = XL01_SendPlatformCommandAck(ackPayload, ackLen);
#endif
        if (sendRet == ackLen) {
            ackAccepted = 1;
        } else {
            printf("[CMD ACK TX FAIL] type=%s id=%s ret=%d len=%d\n",
                   cmd->command_type,
                   cmd->command_id,
                   sendRet,
                   ackLen);
        }
    }

    if (!ackAccepted) {
        if (trigger_manual_collect || trigger_poll_latest) {
            printf("[CMD FOLLOWUP BLOCKED] type=%s id=%s ack_unavailable\n",
                   cmd->command_type,
                   cmd->command_id);
        }
        return sendRet;
    }

    RecordAcceptedPlatformCommand(cmd);
    ArmPlatformCommandQuietWindow(cmd->command_type);
    if (trigger_manual_collect) {
        g_platform_manual_collect_requested = 1;
    }
    if (trigger_poll_latest) {
        g_platform_poll_latest_requested = 1;
    }

    return sendRet;
}

static int BuildRuntimeConfigResultJson(
    int include_sampling_s,
    int include_report_interval_s,
    char *output,
    int output_size
)
{
    int first = 1;
    int len = 0;

    if (output == NULL || output_size <= 0) {
        return -1;
    }

    len = snprintf(output, (size_t)output_size, "{\"applied\":true,\"applied_keys\":[");
    if (len < 0 || len >= output_size) {
        return -1;
    }

    if (include_sampling_s) {
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

    if (include_report_interval_s) {
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
        "],\"effective\":{\"sampling_s\":%u,\"report_interval_s\":%u},\"runtime_config\":{\"sampling_s\":%u,\"report_interval_s\":%u}}",
        g_runtime_sampling_interval_ms / 1000,
        g_runtime_report_interval_ms / 1000,
        g_runtime_sampling_interval_ms / 1000,
        g_runtime_report_interval_ms / 1000
    );
    if (len < 0 || len >= output_size) {
        return -1;
    }

    return len;
}

static int IsRuntimeIntervalValid(int seconds)
{
    return seconds >= COMMAND_INTERVAL_MIN_SECONDS && seconds <= COMMAND_INTERVAL_MAX_SECONDS;
}

static void HandleCompactBroadcastPoll(const char *command)
{
    const DeviceIdentity *identity = DeviceIdentity_Get();
    unsigned int delay_ms;

    if (identity == NULL || identity->legacy_node_label == NULL ||
        !CompactPollCommand_IsValid(command, (int)strlen(command))) {
        return;
    }
    if (!CompactPollCommand_TargetMatches(command, identity->legacy_node_label)) {
        return;
    }
    if (DOWNLINK_ONLY_MODE || !g_platform_uplink_enabled) {
        return;
    }
    if (CompactPollCommand_ShouldSuppressBroadcastDuplicate(
            &g_compact_poll_broadcast_deduplicator,
            command,
            (int)strlen(command))) {
        g_compact_poll_broadcast_duplicates_suppressed += 1U;
        printf("[POLL DEDUP] suppressed=%u\n",
               g_compact_poll_broadcast_duplicates_suppressed);
        return;
    }

    strncpy(g_last_platform_command_type, "poll_latest_telemetry", sizeof(g_last_platform_command_type) - 1);
    g_last_platform_command_type[sizeof(g_last_platform_command_type) - 1] = '\0';
    strncpy(g_last_platform_command_id, command, sizeof(g_last_platform_command_id) - 1);
    g_last_platform_command_id[sizeof(g_last_platform_command_id) - 1] = '\0';
    g_last_platform_command_uptime_s = SensorData_GetUptimeSnapshot();
    g_last_platform_command_tick = (uint32_t)LOS_TickCountGet();

    delay_ms = CompactPollCommand_ResponseDelayMs(command, identity->legacy_node_label);
    if (delay_ms > 0U) {
        LOS_Msleep(delay_ms);
    }
    g_platform_poll_scope = CompactPollCommand_Scope(command);
    g_platform_poll_latest_requested = 1;
}

static uint8_t LocalNodeNumber(void)
{
    const DeviceIdentity *identity = DeviceIdentity_Get();

    if (identity == NULL || identity->legacy_node_label == NULL ||
        identity->legacy_node_label[1] != '\0') {
        return 0U;
    }
    if (identity->legacy_node_label[0] == 'A') {
        return 1U;
    }
    if (identity->legacy_node_label[0] == 'B') {
        return 2U;
    }
    if (identity->legacy_node_label[0] == 'C') {
        return 3U;
    }
    return 0U;
}

static int HandleGnssRtcmModeCommand(const char *command)
{
    GnssRtcmModeCommand mode_command;
    GnssRtcmRuntimeStatus runtime;
    int configure_ret;

    if (command == NULL || GnssRtcmModeCommand_Decode(
            command, (int)strlen(command), &mode_command
        ) != 0) {
        return 0;
    }

    configure_ret = GnssRtcmInjection_ConfigureRuntime(
        &mode_command, MainMonotonicMs()
    );
    if (configure_ret < 0) {
        printf("[RTCM MODE] rejected target=%02X mode=%u session=%08X lease=%us\n",
               (unsigned int)mode_command.target_mask,
               (unsigned int)mode_command.mode,
               (unsigned int)mode_command.session_epoch,
               (unsigned int)mode_command.lease_seconds);
        return 1;
    }
    if (configure_ret == 0) {
        GnssRtcmInjection_GetRuntimeStatus(MainMonotonicMs(), &runtime);
        printf("[RTCM MODE] applied node=%u mode=%u session=%08X lease_remaining=%ums\n",
               (unsigned int)LocalNodeNumber(),
               (unsigned int)runtime.mode,
               (unsigned int)runtime.session_epoch,
               (unsigned int)runtime.lease_remaining_ms);
    }
    return 1;
}

static int HandleGnssProbeStatsQuery(const char *command)
{
    GnssRtcmInjectionStats stats;
    FieldLinkRxStats link_stats;
    GnssSensorDiagnostics sensor_diagnostics;
    Sc16is752Diagnostics sc16is752_diagnostics;
    FieldRs485Diagnostics field_rs485_diagnostics;
    Rs485ModbusDiagnostics modbus_diagnostics;
    GnssRtcmRuntimeStatus runtime;
    FieldRs485RuntimeDiagnostics rs485_runtime_diagnostics;
    GpsUartDiagnostics gps_uart_diagnostics;
    GnssRtcmLatencyDiagnostics latency_diagnostics;
    uint8_t response[GNSS_PROBE_STATS_RESPONSE_V7_BYTES];
    uint8_t target_node = 0U;
    uint8_t local_node;
    uint32_t nonce = 0U;
    int response_len;
    int send_ret;

    if (command == NULL || GnssProbeStatsQueryV1_Decode(
            command, (int)strlen(command), &target_node, &nonce
        ) != 0) {
        return 0;
    }

    local_node = LocalNodeNumber();
    if (local_node == 0U || target_node != local_node) {
        return 1;
    }

    GnssRtcmInjection_GetStats(&stats);
    GnssRtcmInjection_GetLatencyDiagnostics(&latency_diagnostics);
    GnssRtcmInjection_GetRuntimeStatus(MainMonotonicMs(), &runtime);
    XL01_GetFieldLinkRxStats(&link_stats);
    SensorDiagnostics_CopySnapshot(&sensor_diagnostics, &rs485_runtime_diagnostics);
    memset(&sc16is752_diagnostics, 0, sizeof(sc16is752_diagnostics));
    memset(&field_rs485_diagnostics, 0, sizeof(field_rs485_diagnostics));
    memset(&modbus_diagnostics, 0, sizeof(modbus_diagnostics));
    memset(&gps_uart_diagnostics, 0, sizeof(gps_uart_diagnostics));
#if ENABLE_GPS
    GPS_GetUartDiagnostics(&gps_uart_diagnostics);
#else
    gps_uart_diagnostics.selected_candidate = GPS_UART_PROBE_NO_SELECTION;
#endif
#if ENABLE_RS485_BUS
    FieldRs485_GetDiagnostics(&field_rs485_diagnostics);
    RS485_ModbusGetDiagnostics(&modbus_diagnostics);
#if RS485_TRANSPORT_SC16IS752
    SC16IS752_GetDiagnostics(&sc16is752_diagnostics);
#endif
#endif
    response_len = GnssProbeStatsResponseV7_Encode(
        &stats,
        &link_stats,
        &sensor_diagnostics,
        &sc16is752_diagnostics,
        &field_rs485_diagnostics,
        &modbus_diagnostics,
        &rs485_runtime_diagnostics,
        &gps_uart_diagnostics,
        &latency_diagnostics,
        local_node,
        runtime.mode,
        nonce,
        (uint32_t)(MainMonotonicMs() / 1000U),
        response,
        sizeof(response)
    );
    if (response_len != GNSS_PROBE_STATS_RESPONSE_V7_BYTES) {
        printf("[RTCM STATS] encode failed node=%u\n", (unsigned int)local_node);
        return 1;
    }

    send_ret = XL01_SendControlPayload(response, response_len);
    printf(
        "[RTCM STATS] node=%u nonce=%08X bytes=%d send=%d\n",
        (unsigned int)local_node,
        (unsigned int)nonce,
        response_len,
        send_ret
    );
    return 1;
}

static int HandleGnssRtcmAckQuery(const char *command)
{
    GnssRtcmAckWindow window;
    GnssRtcmRuntimeStatus runtime;
    uint8_t response[GNSS_RTCM_ACK_RESPONSE_V1_BYTES];
    uint8_t target_node = 0U;
    uint8_t local_node;
    uint32_t nonce = 0U;
    int response_len;
    int send_ret;

    if (command == NULL || GnssRtcmAckQueryV1_Decode(
            command, (int)strlen(command), &target_node, &nonce
        ) != 0) {
        return 0;
    }

    local_node = LocalNodeNumber();
    if (local_node == 0U || target_node != local_node) {
        return 1;
    }

    GnssRtcmInjection_GetAckWindow(&window);
    GnssRtcmInjection_GetRuntimeStatus(MainMonotonicMs(), &runtime);
    response_len = GnssRtcmAckResponseV1_Encode(
        &window,
        local_node,
        runtime.mode,
        nonce,
        response,
        sizeof(response)
    );
    if (response_len != GNSS_RTCM_ACK_RESPONSE_V1_BYTES) {
        printf("[RTCM ACK] encode failed node=%u\n", (unsigned int)local_node);
        return 1;
    }

    send_ret = XL01_SendControlPayload(response, response_len);
    printf(
        "[RTCM ACK] node=%u nonce=%08X session=%08X highest=%u bitmap=%04X send=%d\n",
        (unsigned int)local_node,
        (unsigned int)nonce,
        (unsigned int)window.session_epoch,
        (unsigned int)window.highest_sequence,
        (unsigned int)window.completed_bitmap,
        send_ret
    );
    return 1;
}

static void HandlePlatformCommand(const char *commandJson)
{
    DeviceCommandMessage cmd;
    const DeviceIdentity *identity;
    char resultJson[256];
    int sendRet;

    if (commandJson != NULL &&
        CompactPollCommand_IsValid(commandJson, (int)strlen(commandJson))) {
        HandleCompactBroadcastPoll(commandJson);
        return;
    }

    if (ParseDeviceCommandV1(commandJson, &cmd) != 0) {
        printf("[CMD PARSE FAIL] %s\n", commandJson != NULL ? commandJson : "(null)");
        return;
    }

    identity = DeviceIdentity_Get();
    if (identity == NULL || identity->device_id == NULL) {
        printf("[CMD IGNORE] missing local device identity\n");
        return;
    }
    if (strcmp(cmd.device_id, identity->device_id) != 0) {
#if PLATFORM_COMMAND_RX_LOG_MODE
        printf("[CMD IGNORE] device_id mismatch cmd=%s local=%s\n", cmd.device_id, identity->device_id);
#endif
        return;
    }

#if PLATFORM_COMMAND_RX_LOG_MODE
    printf(
        "[CMD APPLY] type=%s id=%s sampling=%d report=%d intervalSeconds=%d\n",
        cmd.command_type,
        cmd.command_id,
        cmd.has_sampling_s ? cmd.sampling_s : -1,
        cmd.has_report_interval_s ? cmd.report_interval_s : -1,
        cmd.has_interval_seconds ? cmd.interval_seconds : -1
    );
#endif

    if (strcmp(cmd.command_type, "ping") == 0) {
        SendPlatformCommandAckWithGuard(&cmd, "acked", "{\"pong\":true}", 0, 0);
        return;
    }

    if (strcmp(cmd.command_type, "set_config") == 0) {
        if (!cmd.has_sampling_s && !cmd.has_report_interval_s) {
            SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"no_supported_keys\"}", 0, 0);
            return;
        }

        if (cmd.has_sampling_s && !IsRuntimeIntervalValid(cmd.sampling_s)) {
            snprintf(
                resultJson,
                sizeof(resultJson),
                "{\"error\":\"invalid_sampling_s\",\"min\":%d,\"max\":%d,\"received\":%d}",
                COMMAND_INTERVAL_MIN_SECONDS,
                COMMAND_INTERVAL_MAX_SECONDS,
                cmd.sampling_s
            );
            SendPlatformCommandAckWithGuard(&cmd, "failed", resultJson, 0, 0);
            return;
        }

        if (cmd.has_report_interval_s && !IsRuntimeIntervalValid(cmd.report_interval_s)) {
            snprintf(
                resultJson,
                sizeof(resultJson),
                "{\"error\":\"invalid_report_interval_s\",\"min\":%d,\"max\":%d,\"received\":%d}",
                COMMAND_INTERVAL_MIN_SECONDS,
                COMMAND_INTERVAL_MAX_SECONDS,
                cmd.report_interval_s
            );
            SendPlatformCommandAckWithGuard(&cmd, "failed", resultJson, 0, 0);
            return;
        }

        if (cmd.has_sampling_s) {
            g_runtime_sampling_interval_ms = (unsigned int)cmd.sampling_s * 1000;
        }
        if (cmd.has_report_interval_s) {
            g_runtime_report_interval_ms = (unsigned int)cmd.report_interval_s * 1000;
        }
#if PLATFORM_COMMAND_RX_LOG_MODE
        printf(
            "[CMD APPLY RESULT] runtime sampling_s=%u report_interval_s=%u\n",
            g_runtime_sampling_interval_ms / 1000,
            g_runtime_report_interval_ms / 1000
        );
#endif

        if (BuildRuntimeConfigResultJson(
                cmd.has_sampling_s,
                cmd.has_report_interval_s,
                resultJson,
                sizeof(resultJson)
            ) <= 0) {
            strncpy(resultJson, "{\"applied\":true}", sizeof(resultJson) - 1);
            resultJson[sizeof(resultJson) - 1] = '\0';
        }

        SendPlatformCommandAckWithGuard(&cmd, "acked", resultJson, 0, 0);
        return;
    }

    if (strcmp(cmd.command_type, "reboot") == 0) {
        if (!Watchdog_RebootSupported()) {
            SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"reboot_not_supported\"}", 0, 0);
            return;
        }

        snprintf(
            resultJson,
            sizeof(resultJson),
            "{\"scheduled\":true,\"delay_ms\":%u}",
            COMMAND_REBOOT_DELAY_MS
        );
        sendRet = SendPlatformCommandAckWithGuard(&cmd, "acked", resultJson, 0, 0);
        if (sendRet > 0) {
            Watchdog_RequestReboot(COMMAND_REBOOT_DELAY_MS);
        }
        return;
    }

    if (strcmp(cmd.command_type, "restart_device") == 0) {
        if (!Watchdog_RebootSupported()) {
            SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"restart_not_supported\"}", 0, 0);
            return;
        }

        snprintf(
            resultJson,
            sizeof(resultJson),
            "{\"scheduled\":true,\"delay_ms\":%u,\"restart_requested\":true}",
            COMMAND_REBOOT_DELAY_MS
        );
        sendRet = SendPlatformCommandAckWithGuard(&cmd, "acked", resultJson, 0, 0);
        if (sendRet > 0) {
            Watchdog_RequestReboot(COMMAND_REBOOT_DELAY_MS);
        }
        return;
    }

    if (strcmp(cmd.command_type, "set_sampling_interval") == 0) {
        if (cmd.has_interval_seconds && IsRuntimeIntervalValid(cmd.interval_seconds)) {
            g_runtime_sampling_interval_ms = (unsigned int)cmd.interval_seconds * 1000;
            if (BuildRuntimeConfigResultJson(1, 0, resultJson, sizeof(resultJson)) <= 0) {
                snprintf(
                    resultJson,
                    sizeof(resultJson),
                    "{\"applied\":true,\"effective\":{\"sampling_s\":%d},\"runtime_config\":{\"sampling_s\":%u,\"report_interval_s\":%u}}",
                    cmd.interval_seconds,
                    g_runtime_sampling_interval_ms / 1000,
                    g_runtime_report_interval_ms / 1000
                );
            }
            SendPlatformCommandAckWithGuard(&cmd, "acked", resultJson, 0, 0);
        } else {
            snprintf(
                resultJson,
                sizeof(resultJson),
                "{\"error\":\"invalid_interval_seconds\",\"min\":%d,\"max\":%d,\"received\":%d}",
                COMMAND_INTERVAL_MIN_SECONDS,
                COMMAND_INTERVAL_MAX_SECONDS,
                cmd.has_interval_seconds ? cmd.interval_seconds : 0
            );
            SendPlatformCommandAckWithGuard(&cmd, "failed", resultJson, 0, 0);
        }
        return;
    }

    if (strcmp(cmd.command_type, "manual_collect") == 0) {
        if (DOWNLINK_ONLY_MODE) {
            SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"downlink_only_mode\"}", 0, 0);
            return;
        }
        if (!g_platform_uplink_enabled) {
            SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"uplink_disabled\"}", 0, 0);
            return;
        }
#if PLATFORM_COMMAND_RX_LOG_MODE
        printf("[CMD APPLY RESULT] manual_collect_requested=1\n");
#endif
        SendPlatformCommandAckWithGuard(&cmd, "acked", "{\"collect_requested\":true,\"reason\":\"manual_trigger\"}", 1, 0);
        return;
    }

    if (strcmp(cmd.command_type, "poll_latest_telemetry") == 0) {
        if (DOWNLINK_ONLY_MODE) {
            SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"downlink_only_mode\"}", 0, 0);
            return;
        }
        if (!g_platform_uplink_enabled) {
            SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"uplink_disabled\"}", 0, 0);
            return;
        }
#if PLATFORM_COMMAND_RX_LOG_MODE
        printf("[CMD APPLY RESULT] poll_latest_requested=1\n");
#endif
        SendPlatformCommandAckWithGuard(
            &cmd,
            "acked",
            "{\"poll_latest_telemetry\":true,\"reason\":\"gateway_scheduler\"}",
            0,
            1
        );
        return;
    }

    if (strcmp(cmd.command_type, "deactivate_device") == 0) {
        g_platform_uplink_enabled = 0;
        g_cloud_test_mode = false;
        SendPlatformCommandAckWithGuard(&cmd, "acked", "{\"deactivated\":true,\"uplink_suppressed\":true}", 0, 0);
        return;
    }

    if (strcmp(cmd.command_type, "motor_start") == 0) {
        g_cloud_motor_enabled = true;
        g_cloud_motor_direction = MOTOR_DIRECTION_FORWARD;
        SendPlatformCommandAckWithGuard(&cmd, "acked", "{\"motor_state\":\"running\"}", 0, 0);
        return;
    }

    if (strcmp(cmd.command_type, "motor_stop") == 0) {
        g_cloud_motor_enabled = false;
        g_cloud_motor_direction = MOTOR_DIRECTION_STOP;
        SendPlatformCommandAckWithGuard(&cmd, "acked", "{\"motor_state\":\"stopped\"}", 0, 0);
        return;
    }

    if (strcmp(cmd.command_type, "buzzer_on") == 0) {
#if ENABLE_RS485_ALARM
        if (FieldAlarmRs485_SetEnabled(1) != 0) {
            char resultJson[256];
            const FieldAlarmRs485Diag *diag = FieldAlarmRs485_GetLastDiag();
            snprintf(
                resultJson,
                sizeof(resultJson),
                "{\"e\":\"alarm_on\",\"s\":%u,\"ch\":%u,\"baud\":%u,\"reg\":\"%04X\",\"val\":\"%04X\",\"p\":%d,\"pa\":%u,\"pb\":%u,\"ph\":\"%s\",\"f\":%d,\"fa\":%u,\"fb\":%u,\"fh\":\"%s\",\"final\":%d,\"used_fb\":%s}",
                diag->step,
                diag->channel,
                diag->baudrate,
                diag->reg,
                diag->value,
                diag->primary_ret,
                diag->primary_rx_addr,
                diag->primary_rx_bytes,
                diag->primary_rx_hex,
                diag->used_fallback ? diag->fallback_ret : 0,
                diag->fallback_rx_addr,
                diag->fallback_rx_bytes,
                diag->fallback_rx_hex,
                diag->final_ret,
                diag->used_fallback ? "true" : "false");
            SendPlatformCommandAckWithGuard(&cmd, "failed", resultJson, 0, 0);
            return;
        }
#endif
        g_cloud_buzzer_enabled = true;
        SendPlatformCommandAckWithGuard(&cmd, "acked", "{\"buzzer_on\":true,\"alarm_transport\":\"rs485_modbus\"}", 0, 0);
        return;
    }

    if (strcmp(cmd.command_type, "buzzer_off") == 0) {
#if ENABLE_RS485_ALARM
        if (FieldAlarmRs485_SetEnabled(0) != 0) {
            char resultJson[256];
            const FieldAlarmRs485Diag *diag = FieldAlarmRs485_GetLastDiag();
            snprintf(
                resultJson,
                sizeof(resultJson),
                "{\"e\":\"alarm_off\",\"s\":%u,\"ch\":%u,\"baud\":%u,\"reg\":\"%04X\",\"val\":\"%04X\",\"p\":%d,\"pa\":%u,\"pb\":%u,\"ph\":\"%s\",\"f\":%d,\"fa\":%u,\"fb\":%u,\"fh\":\"%s\",\"final\":%d,\"used_fb\":%s}",
                diag->step,
                diag->channel,
                diag->baudrate,
                diag->reg,
                diag->value,
                diag->primary_ret,
                diag->primary_rx_addr,
                diag->primary_rx_bytes,
                diag->primary_rx_hex,
                diag->used_fallback ? diag->fallback_ret : 0,
                diag->fallback_rx_addr,
                diag->fallback_rx_bytes,
                diag->fallback_rx_hex,
                diag->final_ret,
                diag->used_fallback ? "true" : "false");
            SendPlatformCommandAckWithGuard(&cmd, "failed", resultJson, 0, 0);
            return;
        }
#endif
        g_cloud_buzzer_enabled = false;
        SendPlatformCommandAckWithGuard(&cmd, "acked", "{\"buzzer_on\":false,\"alarm_transport\":\"rs485_modbus\"}", 0, 0);
        return;
    }

    if (strcmp(cmd.command_type, "buzzer_raw_on") == 0) {
#if ENABLE_RS485_ALARM
        int ret = FieldAlarmRs485_SendRawDiagnostic(1);
        const FieldAlarmRs485Diag *diag = FieldAlarmRs485_GetLastDiag();
        char resultJson[256];
        snprintf(
            resultJson,
            sizeof(resultJson),
            "{\"buzzer_raw_on\":true,\"tx_only\":true,\"unverified\":true,\"ch\":%u,\"baud\":%u,\"reg\":\"%04X\",\"val\":\"%04X\",\"p\":%d,\"f\":%d,\"final\":%d}",
            diag->channel,
            diag->baudrate,
            diag->reg,
            diag->value,
            diag->primary_ret,
            diag->fallback_ret,
            diag->final_ret);
        SendPlatformCommandAckWithGuard(&cmd, ret == 0 ? "acked" : "failed", resultJson, 0, 0);
        return;
#else
        SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"rs485_alarm_disabled\"}", 0, 0);
        return;
#endif
    }

    if (strcmp(cmd.command_type, "buzzer_raw_off") == 0) {
#if ENABLE_RS485_ALARM
        int ret = FieldAlarmRs485_SendRawDiagnostic(0);
        const FieldAlarmRs485Diag *diag = FieldAlarmRs485_GetLastDiag();
        char resultJson[256];
        snprintf(
            resultJson,
            sizeof(resultJson),
            "{\"buzzer_raw_on\":false,\"tx_only\":true,\"unverified\":true,\"ch\":%u,\"baud\":%u,\"reg\":\"%04X\",\"val\":\"%04X\",\"p\":%d,\"f\":%d,\"final\":%d}",
            diag->channel,
            diag->baudrate,
            diag->reg,
            diag->value,
            diag->primary_ret,
            diag->fallback_ret,
            diag->final_ret);
        SendPlatformCommandAckWithGuard(&cmd, ret == 0 ? "acked" : "failed", resultJson, 0, 0);
        return;
#else
        SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"rs485_alarm_disabled\"}", 0, 0);
        return;
#endif
    }

    SendPlatformCommandAckWithGuard(&cmd, "failed", "{\"error\":\"unknown_command_type\"}", 0, 0);
}

static void PrintTelemetryPreTxDiagnostic(const char *json, int len)
{
#if TELEMETRY_PRETX_DIAG_MODE
    const char *start_ptr = NULL;
    int start_index;
    int end_index;
    int i;

    if (json == NULL || len <= 0) {
        return;
    }

    printf("[TELEMETRY PRETX JSON] len=%d %s\n", len, json);

    start_ptr = strstr(json, "\"rtk_gga_quality\"");
    if (start_ptr == NULL) {
        start_ptr = strstr(json, "\"tilt_x_deg\"");
    }

    if (start_ptr == NULL) {
        printf("[TELEMETRY PRETX HEX] key-range-not-found\n");
        return;
    }

    start_index = (int)(start_ptr - json);
    if (start_index > 16) {
        start_index -= 16;
    } else {
        start_index = 0;
    }

    end_index = start_index + 96;
    if (end_index > len) {
        end_index = len;
    }

    printf("[TELEMETRY PRETX HEX] range=%d..%d bytes=", start_index, end_index);
    for (i = start_index; i < end_index; ++i) {
        printf("%02X", (unsigned char)json[i]);
        if (i + 1 < end_index) {
            printf(" ");
        }
    }
    printf("\n");
#else
    (void)json;
    (void)len;
#endif
}

static void PrintSparseMetricsDiagnostic(const SensorData *data, const char *upload_trigger)
{
#if PLATFORM_COMMAND_RX_LOG_MODE
    static uint32_t last_sparse_diag_tick = 0;
    uint32_t now;

    if (data == NULL) {
        return;
    }

    now = LOS_TickCountGet();
    if (last_sparse_diag_tick != 0U && (now - last_sparse_diag_tick) < 500U) {
        return;
    }
    last_sparse_diag_tick = now;

    printf(
        "[UPLOAD SKIP DETAIL] trigger=%s soil_ok=%d tilt_ok=%d rain_ok=%d gnss_status_ok=%d gnss_position_ok=%u gga_quality=%u battery_ok=%d simulated=%d i2c_ready=%d rs485_ready=%d battery_ready=%d uptime=%u\n",
        upload_trigger != NULL ? upload_trigger : "(null)",
        data->soil_valid,
        data->tilt_valid,
        data->rain_valid,
        data->gnss_status_valid,
        data->gnss.position_valid,
        data->gnss.gga_quality,
        data->battery_valid,
        data->simulated_field_data,
        g_i2c_ready,
        g_rs485_ready,
        g_battery_ready,
        data->uptime
    );
#else
    (void)data;
    (void)upload_trigger;
#endif
}

// ==================== Task 1: Sensor Collection ====================

static void* SensorCollectionTask(const char* arg)
{
    (void)arg;
    SensorData next_sample;
    uint8_t diagnostic_success_mask;
    uint64_t next_environment_sample_ms = 0U;
#if ENABLE_RS485_BUS
    FieldRs485Readings rs485_readings;
    const FieldRs485CycleDiagnostics *rs485_cycle_diagnostics;
    int rs485_diagnostics_pending = 1;
#endif
#if ENABLE_BATTERY_MONITOR
    BatteryReading battery_reading;
#endif
    
    LOS_Msleep(1000);
    printf("[Task] Sensor Collection started\n");
    
    while (1) {
        uint64_t cycle_started_ms = MainMonotonicMs();
        uint64_t cycle_completed_ms;
        unsigned int sleep_ms;
        uint32_t completed_uptime_s;
        int environment_sample_due = 0;
#if ENABLE_RS485_BUS
        uint8_t rs485_read_mask = FIELD_RS485_READ_TILT_MASK;
#endif

        if (next_environment_sample_ms == 0U ||
            cycle_started_ms >= next_environment_sample_ms) {
            environment_sample_due = 1;
#if ENABLE_RS485_BUS
            rs485_read_mask |= FIELD_RS485_READ_SOIL_MASK | FIELD_RS485_READ_RAIN_MASK;
#endif
            next_environment_sample_ms = cycle_started_ms + ENVIRONMENT_SAMPLE_INTERVAL_MS;
        }

        // Read all enabled sensors
        diagnostic_success_mask = 0U;
#if ENABLE_RS485_BUS
        rs485_cycle_diagnostics = NULL;
#endif

        SensorData_CopySnapshot(&next_sample);
#if ENABLE_RS485_BUS
        if (environment_sample_due) {
            next_sample.soil_temperature = 0.0f;
            next_sample.soil_moisture = 0.0f;
            next_sample.soil_ec = 0.0f;
            next_sample.soil_ec_valid = 0;
            next_sample.soil_valid = 0;
        }
#else
        next_sample.soil_temperature = 0.0f;
        next_sample.soil_moisture = 0.0f;
        next_sample.soil_ec = 0.0f;
        next_sample.soil_ec_valid = 0;
        next_sample.soil_valid = 0;
#endif
        memset(&next_sample.gnss, 0, sizeof(next_sample.gnss));
        next_sample.gnss_status_valid = 0;
        next_sample.angle_x = 0.0f;
        next_sample.angle_y = 0.0f;
        next_sample.angle_z = 0.0f;
        next_sample.tilt_valid = 0;
        next_sample.rain_total = 0.0f;
        next_sample.rain_valid = 0;
        next_sample.warning = 0;
        if (environment_sample_due) {
            next_sample.battery_level = 0;
            next_sample.battery_voltage_mv = 0U;
            next_sample.battery_valid = 0;
            next_sample.battery_estimate_quality = 0;
        }
        next_sample.simulated_field_data = 0;
        next_sample.simulated_gnss_data = 0;
        
#if ENABLE_SIMULATED_FIELD_SENSORS
        SimulatedFieldSensors_Read(
            &next_sample,
            (unsigned int)(MainMonotonicMs() / 1000U),
            LEGACY_NODE_LABEL[0]
        );
#endif

#if ENABLE_BATTERY_MONITOR
        if (environment_sample_due && g_battery_ready && BatteryMonitor_Read(&battery_reading) == 0) {
            next_sample.battery_level = (int)battery_reading.percentage;
            next_sample.battery_voltage_mv = battery_reading.pack_voltage_mv;
            next_sample.battery_estimate_quality = (int)battery_reading.estimate_quality;
            next_sample.battery_valid = 1;
        }
#endif

#if ENABLE_RS485_BUS
        if (g_rs485_ready) {
            (void)FieldRs485_ReadSelected(&rs485_readings, rs485_read_mask);
            rs485_cycle_diagnostics = &rs485_readings.cycle_diagnostics;
            if (rs485_readings.soil_valid) {
                next_sample.soil_temperature = rs485_readings.soil_temperature_c;
                next_sample.soil_moisture = rs485_readings.soil_moisture_pct;
                next_sample.soil_ec = rs485_readings.soil_ec_us_cm;
                next_sample.soil_ec_valid = rs485_readings.soil_ec_valid;
                next_sample.soil_valid = 1;
                diagnostic_success_mask |= GNSS_SENSOR_SOIL_MASK;

            }

            if (rs485_readings.soil_ec_valid) {
                diagnostic_success_mask |= GNSS_SENSOR_SOIL_EC_MASK;
            }

            if (rs485_readings.tilt_valid) {
                next_sample.angle_x = rs485_readings.tilt_x_deg;
                next_sample.angle_y = rs485_readings.tilt_y_deg;
                next_sample.angle_z = rs485_readings.tilt_z_deg;
                next_sample.tilt_valid = 1;
                diagnostic_success_mask |= GNSS_SENSOR_TILT_MASK;
            }

            if (rs485_readings.rain_valid) {
                next_sample.rain_total = rs485_readings.rain_total_mm;
                next_sample.rain_valid = 1;
            }
        }
#endif

#if ENABLE_SIMULATED_GNSS
        SimulatedGnss_Read(
            &next_sample,
            (unsigned int)(MainMonotonicMs() / 1000U),
            LEGACY_NODE_LABEL[0]
        );
#endif

#if ENABLE_GPS
        GPS_Poll();
        next_sample.gnss_status_valid = GPS_ReadSolution(&next_sample.gnss) == 0 ? 1 : 0;
        if (next_sample.gnss_status_valid && next_sample.gnss.position_valid) {
            diagnostic_success_mask |= GNSS_SENSOR_UM220_MASK;
        }
#endif

        // Check warnings
        next_sample.warning = 0;
        if (next_sample.tilt_valid) {
            if (fabs(next_sample.angle_x) > RS485_TILT_WARNING_DEG ||
                fabs(next_sample.angle_y) > RS485_TILT_WARNING_DEG ||
                fabs(next_sample.angle_z) > RS485_TILT_WARNING_DEG) {
                next_sample.warning = 1;
            }
        }
        completed_uptime_s = (uint32_t)(MainMonotonicMs() / 1000U);
        next_sample.uptime = completed_uptime_s;
        g_stats.uptime_sec = completed_uptime_s;
#if ENABLE_RS485_BUS
        SensorDiagnostics_RecordCycle(
            diagnostic_success_mask,
            completed_uptime_s,
            rs485_cycle_diagnostics);
#else
        SensorDiagnostics_RecordCycle(diagnostic_success_mask, completed_uptime_s, NULL);
#endif
        SensorData_StoreSnapshot(&next_sample);

#if ENABLE_RS485_BUS
        if (rs485_diagnostics_pending && rs485_cycle_diagnostics != NULL &&
            rs485_cycle_diagnostics->paths[FIELD_RS485_PATH_TILT_INDEX].enabled &&
            rs485_cycle_diagnostics->paths[FIELD_RS485_PATH_TILT_INDEX].attempted &&
            rs485_cycle_diagnostics->paths[FIELD_RS485_PATH_TILT_INDEX].final_status != RS485_MODBUS_OK) {
            rs485_diagnostics_pending = 0;
            printf("[RS485-DIAG] final tilt read failure detected; starting one-time read-only scan\n");
            FieldRs485_RunDiagnostics();
        }
#endif
        
        // Feed watchdog
        Watchdog_Feed();
        
        cycle_completed_ms = MainMonotonicMs();
        sleep_ms = cycle_completed_ms - cycle_started_ms < g_runtime_sampling_interval_ms ?
            g_runtime_sampling_interval_ms - (unsigned int)(cycle_completed_ms - cycle_started_ms) : 1U;
        LOS_Msleep(sleep_ms);
    }
    
    return NULL;
}

// ==================== Task 2: UART RX ====================

static void* UartRxTask(const char* arg)
{
    (void)arg;

    unsigned int idle_loops = 0;

    printf("[Task] UART RX started (Above Normal)\n");

    while (1) {
        XL01_PollReceive();
        Watchdog_Feed();
        idle_loops++;
#if XL01_RAW_UART_DIAG_MODE
        if (idle_loops >= 5000) {
            idle_loops = 0;
            printf(
                "[UART RX TASK ALIVE] route=%s uptime=%u readAny=%u\n",
                XL01_UART_ROUTE_NAME,
                SensorData_GetUptimeSnapshot(),
                XL01_DebugReadAny()
            );
        }
#endif
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

        while (XL01_TryDequeuePlatformCommand(g_process_command_json, sizeof(g_process_command_json)) > 0) {
            if (!HandleGnssRtcmModeCommand(g_process_command_json) &&
                !HandleGnssRtcmAckQuery(g_process_command_json) &&
                !HandleGnssProbeStatsQuery(g_process_command_json)) {
                HandlePlatformCommand(g_process_command_json);
            }
            processed = 1;
        }

        LOS_Msleep(processed > 0 ? 1 : 10);
    }
    
    return NULL;
}

// ==================== Task 4: Data Upload ====================

static void* DataUploadTask(const char* arg)
{
    (void)arg;
#if TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V1 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V2 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V3 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V4 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V5 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V6
    unsigned char compact_payload[COMPACT_TELEMETRY_PAYLOAD_BYTES];
#else
    char json[FIELD_LINK_MAX_PAYLOAD_BYTES + 1];
#endif
    const char *telemetry_payload;
    SensorData telemetry_snapshot;
    GnssRtcmInjectionStats rtcm_stats;
    GnssRtcmRuntimeStatus rtcm_runtime;
    int len;
    unsigned int elapsed_since_upload_ms = UPLOAD_INTERVAL_MS;
    
    LOS_Msleep(3000);
    printf("[Task] Data Upload started\n\n");
    printf("[FW MARK] %s %s\n", FW_RX_DIAG_MARKER, FIRMWARE_SAMPLE_VERSION);
    
    printf("========================================\n");
    printf("  Configuration Summary\n");
    printf("========================================\n");
    printf("  Device ID: %s\n", DEVICE_ID);
    printf("  Install Label: %s\n", INSTALL_LABEL);
    printf("  Sample Version: %s\n", FIRMWARE_SAMPLE_VERSION);
    printf("  XL01 UART: %s\n", XL01_UART_ROUTE_NAME);
#if ENABLE_RS485_BUS
    printf("  RS485 UART: %s baud=%d\n", RS485_UART_ROUTE_NAME, RS485_BAUDRATE);
    printf("  RS485 Sensor Read Retry: max=%u gap=%u ms\n",
           RS485_SENSOR_READ_MAX_RETRIES,
           RS485_SENSOR_READ_RETRY_GAP_MS);
    printf("  Sensor Cadence: tilt/GNSS=1s battery/soil/EC=%ums low_priority_timeout=%ums retries=%u\n",
           ENVIRONMENT_SAMPLE_INTERVAL_MS,
           RS485_LOW_PRIORITY_RESPONSE_TIMEOUT_MS,
           RS485_LOW_PRIORITY_READ_MAX_RETRIES);
#endif
    printf("  Upload Interval: %d ms\n", UPLOAD_INTERVAL_MS);
    printf("  Downlink Only: %s\n", DOWNLINK_ONLY_MODE ? "Enabled" : "Disabled");
    printf("  UART Raw Diag: %s\n", XL01_RAW_UART_DIAG_MODE ? "Enabled" : "Disabled");
    printf("  UART Diag TX Heartbeat: %s\n", XL01_UART_DIAG_TX_HEARTBEAT ? "Enabled" : "Disabled");
    printf("  UART Diag RX Echo: %s\n", XL01_UART_DIAG_RX_ECHO ? "Enabled" : "Disabled");
    printf("  UART TX Chunk Size: %d\n", XL01_UART_TX_CHUNK_SIZE);
    printf("  UART TX Chunk Delay: %d ms\n", XL01_UART_TX_CHUNK_DELAY_MS);
    printf("  Post ACK Quiet: %d ms\n", PLATFORM_POST_ACK_QUIET_MS);
    printf("  Manual Collect Delay: %d ms\n", PLATFORM_MANUAL_COLLECT_DELAY_MS);
    printf("  Poll ACK: %s\n", POLL_LATEST_TELEMETRY_ACK_ENABLED ? "Enabled" : "Telemetry confirms poll");
    printf("  Poll Request Check: %d ms\n", DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS);
    printf("  Compact Poll: layered-v1 P1 core / P3 environment / P4 audit (%s rollback)\n",
           COMPACT_TARGETED_POLL_MARKER);
    printf("  Compact Recovery: P1 dedup depth=256 / P2 diagnostic rollback only\n");
    printf("  Edge Uplink Mode: %s\n", EDGE_UPLINK_MODE == EDGE_UPLINK_MODE_POLLED ? "Polled" : "Periodic");
    printf("  Telemetry Payload: %s\n",
           TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V6 ? "Compact v6 layered (46-byte payload / 64-byte wire frame)" :
           (TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V5 ? "Compact v5 (110-byte field + RTK + injection summary)" :
           (TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V4 ? "Compact v4 (139-byte field + RTK + injection evidence)" :
           (TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V3 ? "Compact v3 (95-byte field + RTK payload)" :
           (TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V2 ? "Compact v2 (46-byte payload)" :
           (TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V1 ? "Compact v1 (46-byte payload)" : "JSON v1"))))));
    printf("  Field Sensor Source: %s\n",
           ENABLE_SIMULATED_FIELD_SENSORS ? "SIMULATED (RS485 values only)" : "HARDWARE");
#if ENABLE_SIMULATED_GNSS
    printf("  GNSS Source: SIMULATED (no PB6/PB7 UART)\n");
#else
    printf("  GNSS Source: HARDWARE (UM220-IV NK on PB6/PB7)\n");
#endif
    printf("  Max Retries: %d\n", MAX_RETRY_COUNT);
    printf("  ACK Check: %s\n", ENABLE_ACK_CHECK ? "Enabled" : "Disabled");
    printf("  ACK Timeout: %d ms\n", ACK_TIMEOUT_MS);
    printf("  Low Power: %s\n", ENABLE_LOW_POWER ? "Enabled" : "Disabled");
    printf("  Watchdog: %s\n", ENABLE_WATCHDOG ? "Enabled" : "Disabled");
    printf("  Field Link Auto Recovery: %s stale=%u ms\n",
           ENABLE_FIELD_LINK_AUTO_RECOVERY ? "Enabled" : "Disabled",
           (unsigned int)FIELD_LINK_STALE_REBOOT_MS);
    printf("----------------------------------------\n");
    printf("  Sensors:\n");
#if ENABLE_GPS
    printf("    - GNSS: HARDWARE ready=%s\n", g_gps_ready ? "yes" : "no");
    printf("    - RTCM Injection: %s runtime-lease=yes queue=%u max_queue_age=%u ms\n",
           GNSS_RTCM_CAPABILITY_MARKER,
           (unsigned int)GNSS_RTCM_QUEUE_DEPTH,
           (unsigned int)GNSS_RTCM_MAX_QUEUE_AGE_MS);
#else
    printf("    - GNSS: SIMULATED trusted=no displacement_eligible=no\n");
    printf("    - RTCM Injection: %s (simulated GNSS)\n",
           GNSS_RTCM_CAPABILITY_MARKER);
#endif
#if ENABLE_BATTERY_MONITOR
    printf("    - Battery: ON ready=%s route=PC0/SARADC-ch0 input-only pack=%uS%uP/%umAh calibration=%s\n",
           g_battery_ready ? "yes" : "no",
           (unsigned int)BATTERY_SERIES_CELLS,
           (unsigned int)BATTERY_PARALLEL_STRINGS,
           (unsigned int)BATTERY_NOMINAL_CAPACITY_MAH,
           BATTERY_CALIBRATION_VERIFIED ? "field" : "default");
#else
    printf("    - Battery: OFF\n");
#endif
    printf("    - RS485 Bus: %s ready=%s\n",
           ENABLE_RS485_BUS ? "ON" : "OFF",
           g_rs485_ready ? "yes" : "no");
#if ENABLE_RS485_BUS
    printf("      - Soil: %s model=%s ch=%d addr=%d ec=%s\n",
           ENABLE_RS485_SOIL_SENSOR ? "ON" : "OFF",
           RS485_SOIL_SENSOR_MODEL,
           RS485_SOIL_CHANNEL,
           RS485_SOIL_ADDR,
           RS485_SOIL_HAS_EC ? "enabled" : "off");
    printf("      - Tilt: %s ch=%d addr=%d\n",
           ENABLE_RS485_TILT_SENSOR ? "ON" : "OFF",
           RS485_TILT_CHANNEL,
           RS485_TILT_ADDR);
    printf("      - Rain: %s addr=%d\n", ENABLE_RS485_RAIN_SENSOR ? "ON" : "OFF", RS485_RAIN_ADDR);
#endif
    printf("========================================\n\n");
    
    while (1) {
        int manual_collect_requested = 0;
        int poll_latest_requested = 0;
        unsigned int poll_scope = COMPACT_POLL_SCOPE_CORE;
        const char *upload_trigger = "periodic";
        unsigned int sleep_ms = DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS;

#if !ENABLE_SHARED_PORT_SOURCE_CONTROL
        unsigned int quiet_remaining_ms = g_platform_uplink_quiet_remaining_ms;

        if (quiet_remaining_ms > 0) {
            if (quiet_remaining_ms < sleep_ms) {
                sleep_ms = quiet_remaining_ms;
            }

            LOS_Msleep(sleep_ms);
            elapsed_since_upload_ms += sleep_ms;

            if (g_platform_uplink_quiet_remaining_ms > sleep_ms) {
                g_platform_uplink_quiet_remaining_ms -= sleep_ms;
            } else {
                g_platform_uplink_quiet_remaining_ms = 0;
            }
            continue;
        }
#endif

        if (g_platform_manual_collect_requested) {
            manual_collect_requested = 1;
            g_platform_manual_collect_requested = 0;
        }
        if (g_platform_poll_latest_requested) {
            poll_latest_requested = 1;
            poll_scope = g_platform_poll_scope;
            g_platform_poll_scope = COMPACT_POLL_SCOPE_CORE;
            g_platform_poll_latest_requested = 0;
        }

        if (manual_collect_requested) {
            upload_trigger = "manual_collect";
        } else if (poll_latest_requested) {
            upload_trigger = "scheduler_poll";
        }

#if EDGE_UPLINK_MODE == EDGE_UPLINK_MODE_POLLED
        if (!manual_collect_requested && !poll_latest_requested) {
            LOS_Msleep(sleep_ms);
            continue;
        }
#else

        if (!manual_collect_requested && !poll_latest_requested &&
            elapsed_since_upload_ms < g_runtime_report_interval_ms) {
            unsigned int remaining_ms = g_runtime_report_interval_ms - elapsed_since_upload_ms;
            if (remaining_ms < sleep_ms) {
                sleep_ms = remaining_ms;
            }

            LOS_Msleep(sleep_ms);
            elapsed_since_upload_ms += sleep_ms;
            continue;
        }
#endif

#if DOWNLINK_ONLY_MODE
        #if XL01_RAW_UART_DIAG_MODE && XL01_UART_DIAG_TX_HEARTBEAT
        {
            char diagHeartbeat[96];
            int diagLen = snprintf(
                diagHeartbeat,
                sizeof(diagHeartbeat),
                "[UART DIAG TX] route=%s uptime=%u\r\n",
                XL01_UART_ROUTE_NAME,
                SensorData_GetUptimeSnapshot()
            );
            if (diagLen > 0) {
                int sendRet = XL01_SendPlatformCommandAck(diagHeartbeat, diagLen);
                if (sendRet > 0) {
                    printf("[UART DIAG TX OK] %s", diagHeartbeat);
                } else {
                    printf("[UART DIAG TX FAIL] route=%s uptime=%u\n", XL01_UART_ROUTE_NAME, SensorData_GetUptimeSnapshot());
                }
            }
        }
        #endif
        if (manual_collect_requested || poll_latest_requested) {
            printf("[UPLOAD SUPPRESSED] uplink trigger requested but DOWNLINK_ONLY_MODE=1\n");
        }
        elapsed_since_upload_ms = 0;
        LOS_Msleep(200);
        elapsed_since_upload_ms += 200;
        continue;
#endif

        if (!g_platform_uplink_enabled) {
            if (manual_collect_requested || poll_latest_requested) {
                printf("[UPLOAD] trigger ignored because uplink is deactivated\n");
            }
            elapsed_since_upload_ms = 0;
            LOS_Msleep(200);
            elapsed_since_upload_ms += 200;
            continue;
        }

#if TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V6
        if (!SensorData_TakeV6UploadSnapshot(&telemetry_snapshot, poll_scope)) {
            printf("[UPLOAD SKIP] V6 scope=%u has no completed core sensor snapshot\n", poll_scope);
            elapsed_since_upload_ms = 0;
            LOS_Msleep(200);
            elapsed_since_upload_ms += 200;
            continue;
        }
#else
        SensorData_TakeUploadSnapshot(&telemetry_snapshot);
#endif
#if TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V1 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V2 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V3 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V4 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V5 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V6
        memset(compact_payload, 0, sizeof(compact_payload));
#if TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V4 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V5 || \
    TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V6
        GnssRtcmInjection_GetStats(&rtcm_stats);
        GnssRtcmInjection_GetRuntimeStatus(MainMonotonicMs(), &rtcm_runtime);
#if TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V6
        len = BuildCompactTelemetryV6(
            &telemetry_snapshot,
            &rtcm_stats,
            &rtcm_runtime,
            poll_scope,
            DeviceIdentity_Get()->legacy_node_label,
            g_last_platform_command_id,
            compact_payload,
            sizeof(compact_payload)
        );
#elif TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V5
        len = BuildCompactTelemetryV5(
#else
        len = BuildCompactTelemetryV4(
#endif
#if TELEMETRY_PAYLOAD_FORMAT != TELEMETRY_PAYLOAD_FORMAT_COMPACT_V6
            &telemetry_snapshot,
            &rtcm_stats,
            &rtcm_runtime,
            DeviceIdentity_Get()->legacy_node_label,
            g_last_platform_command_id,
            upload_trigger,
            compact_payload,
            sizeof(compact_payload)
        );
#endif
#else
#if TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V3
        len = BuildCompactTelemetryV3(
#elif TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_COMPACT_V2
        len = BuildCompactTelemetryV2(
#else
        len = BuildCompactTelemetryV1(
#endif
            &telemetry_snapshot,
            DeviceIdentity_Get()->legacy_node_label,
            g_last_platform_command_id,
            upload_trigger,
            compact_payload,
            sizeof(compact_payload)
        );
#endif
        telemetry_payload = (const char *)compact_payload;
#else
        memset(json, 0, sizeof(json));
        len = BuildTelemetryEnvelopeV1(
            &telemetry_snapshot,
            g_last_platform_command_type,
            g_last_platform_command_id,
            g_last_platform_command_uptime_s,
            upload_trigger,
            g_last_trusted_time_ts,
            g_last_trusted_time_source,
            json,
            sizeof(json)
        );
        telemetry_payload = json;
#endif
        if (len == TELEMETRY_ENVELOPE_ERR_EMPTY_METRICS || len == COMPACT_TELEMETRY_ERR_EMPTY_METRICS) {
#if PLATFORM_COMMAND_RX_LOG_MODE
            printf("[UPLOAD SKIP] no valid metrics for seq=%u trigger=%s\n",
                   telemetry_snapshot.seq,
                   upload_trigger);
#endif
            PrintSparseMetricsDiagnostic(&telemetry_snapshot, upload_trigger);
            elapsed_since_upload_ms = 0;
            LOS_Msleep(200);
            elapsed_since_upload_ms += 200;
            continue;
        }
        if (len <= 0) {
            printf("[ERROR] Failed to build telemetry envelope\n");
            LOS_Msleep(UPLOAD_INTERVAL_MS);
            continue;
        }

#if TELEMETRY_PAYLOAD_FORMAT == TELEMETRY_PAYLOAD_FORMAT_JSON_V1
        PrintTelemetryPreTxDiagnostic(json, len);
#endif

#if ENABLE_SHARED_PORT_SOURCE_CONTROL
        if (SharedPortScheduler_EnqueueNormalTelemetry(
                DeviceIdentity_Get()->device_id,
                telemetry_snapshot.seq,
                telemetry_payload,
                len
            ) <= 0) {
            printf("[SRC CTRL QUEUE FAIL] seq=%u device=%s\n", telemetry_snapshot.seq, DeviceIdentity_Get()->device_id);
        } else {
            printf("[SRC CTRL STAGE] seq=%u device=%s trigger=%s\n",
                   telemetry_snapshot.seq,
                   DeviceIdentity_Get()->device_id,
                   upload_trigger);
        }
#else
        {
            int ret = XL01_SendWithRetry(telemetry_payload, len, &g_stats);
            g_stats.total_sent++;
            g_stats.total_bytes += len;

            printf("[SEND #%u] %d bytes device=%s", telemetry_snapshot.seq, len, DeviceIdentity_Get()->device_id);
            if (ret == 0) {
#if ENABLE_ACK_CHECK
                printf(" ACK");
#else
                printf(" (sent)");
#endif
            } else {
                printf(" FAILED");
            }
            if (telemetry_snapshot.warning) {
                printf(" WARNING!");
            }
            printf("\n");
        }
#endif
        
        // Keep production logs compact and avoid printing field coordinates.
        {
            char battery_buf[32];
            char tilt_buf[48];
            char soil_buf[64];
            char rain_buf[24];

            if (telemetry_snapshot.battery_valid) {
                snprintf(battery_buf, sizeof(battery_buf), "%.3fV/%d%%",
                         telemetry_snapshot.battery_voltage_mv / 1000.0f,
                         telemetry_snapshot.battery_level);
            } else {
                snprintf(battery_buf, sizeof(battery_buf), "N/A");
            }

            if (telemetry_snapshot.tilt_valid) {
                snprintf(
                    tilt_buf,
                    sizeof(tilt_buf),
                    "%.*f/%.*f/%.*fdeg",
                    RS485_TILT_DECIMALS,
                    telemetry_snapshot.angle_x,
                    RS485_TILT_DECIMALS,
                    telemetry_snapshot.angle_y,
                    RS485_TILT_DECIMALS,
                    telemetry_snapshot.angle_z
                );
            } else {
                snprintf(tilt_buf, sizeof(tilt_buf), "N/A");
            }

            if (telemetry_snapshot.soil_valid) {
                if (telemetry_snapshot.soil_ec_valid) {
                    snprintf(
                        soil_buf,
                        sizeof(soil_buf),
                        "%.*fC/%.*f%%/%.0fuS/cm",
                        RS485_SOIL_TEMPERATURE_DECIMALS,
                        telemetry_snapshot.soil_temperature,
                        RS485_SOIL_MOISTURE_DECIMALS,
                        telemetry_snapshot.soil_moisture,
                        telemetry_snapshot.soil_ec
                    );
                } else {
                    snprintf(
                        soil_buf,
                        sizeof(soil_buf),
                        "%.*fC/%.*f%%/EC:N/A",
                        RS485_SOIL_TEMPERATURE_DECIMALS,
                        telemetry_snapshot.soil_temperature,
                        RS485_SOIL_MOISTURE_DECIMALS,
                        telemetry_snapshot.soil_moisture
                    );
                }
            } else {
                snprintf(soil_buf, sizeof(soil_buf), "N/A");
            }

            if (telemetry_snapshot.rain_valid) {
                snprintf(rain_buf, sizeof(rain_buf), "%.1fmm", telemetry_snapshot.rain_total);
            } else {
                snprintf(rain_buf, sizeof(rain_buf), "N/A");
            }

            if (telemetry_snapshot.gnss_status_valid) {
                printf("  Battery:%s Soil:%s Tilt:%s Rain:%s GNSS:q=%u trusted=%s sats=%u age=%ums\n",
                       battery_buf,
                       soil_buf,
                       tilt_buf,
                       rain_buf,
                       telemetry_snapshot.gnss.gga_quality,
                       (telemetry_snapshot.gnss.fix_flags & GNSS_FIX_TRUSTED) != 0U ? "yes" : "no",
                       telemetry_snapshot.gnss.satellites_used,
                       telemetry_snapshot.gnss.solution_age_ms);
            } else {
                printf("  Battery:%s Soil:%s Tilt:%s Rain:%s GNSS:NO\n",
                       battery_buf,
                       soil_buf,
                       tilt_buf,
                       rain_buf);
            }
        }
        
        // Statistics every 10 packets
        if (telemetry_snapshot.seq % 10 == 0) {
            float success_pct = 0.0f;

            if (g_stats.total_sent > 0) {
                success_pct = (float)g_stats.success_count * 100.0f / (float)g_stats.total_sent;
            }

            printf("\n");
            printf("========== Statistics ==========\n");
            printf("  Uptime: %u sec\n", g_stats.uptime_sec);
            printf("  Sent: %u/%u (Success: %.1f%%)\n",
                   g_stats.success_count, g_stats.total_sent,
                   success_pct);
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

static void* SharedPortWriterTask(const char* arg)
{
    SharedPortScheduledMessage message;

    (void)arg;
    SharedPortScheduler_Init();
    printf("[Task] Shared Port Writer started (enabled=%s)\n", SharedPortScheduler_IsEnabled() ? "yes" : "no");

    while (1) {
        if (!SharedPortScheduler_IsEnabled()) {
            LOS_Msleep(200);
            continue;
        }

        SharedPortScheduler_Advance(20);
        if (SharedPortScheduler_DequeueNext(&message) <= 0) {
            LOS_Msleep(20);
            continue;
        }

        if (message.kind == SHARED_PORT_MESSAGE_NORMAL_TELEMETRY) {
            int ret = message.use_retry ? XL01_SendWithRetry(message.payload, message.len, &g_stats)
                                        : XL01_SendRaw(message.payload, message.len);
            g_stats.total_sent++;
            g_stats.total_bytes += (unsigned int)message.len;
            printf("[SRC CTRL SEND] kind=telemetry seq=%u node=%s bytes=%d status=%s\n",
                   message.telemetry_seq,
                   message.node_key,
                   message.len,
                   ret == 0 ? "sent" : "failed");
            continue;
        }

        if (message.kind == SHARED_PORT_MESSAGE_ACK_OR_RESULT ||
            message.kind == SHARED_PORT_MESSAGE_COMMAND) {
            int ret = message.kind == SHARED_PORT_MESSAGE_COMMAND
                          ? XL01_SendPlatformCommand(message.payload, message.len)
                          : XL01_SendPlatformCommandAck(message.payload, message.len);
            printf("[SRC CTRL SEND] kind=%s id=%s type=%s bytes=%d status=%s\n",
                   message.kind == SHARED_PORT_MESSAGE_ACK_OR_RESULT ? "ack_or_result" : "command",
                   message.command_id,
                   message.command_type,
                   message.len,
                   ret > 0 ? "sent" : "failed");
            if (ret > 0 && message.kind == SHARED_PORT_MESSAGE_COMMAND && message.quiet_window_ms > 0) {
                SharedPortScheduler_BeginQuietWindow(message.command_type, message.command_id);
            }
            continue;
        }

        LOS_Msleep(20);
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
    g_last_platform_command_tick = (uint32_t)LOS_TickCountGet();
    g_field_link_recovery_requested = 0;
    
    // Initialize enabled sensors
#if ENABLE_GPS
    if (GPS_Init() == 0) {
        g_gps_ready = 1;
    } else {
        g_gps_ready = 0;
        printf("[WARN] GPS init failed; GPS metrics will stay sparse until the driver reports a valid fix\n");
    }
#endif

#if ENABLE_BATTERY_MONITOR
    if (BatteryMonitor_Init() == 0) {
        g_battery_ready = 1;
        printf("[OK] Battery monitor initialized (PC0/SARADC channel 0 input-only)\n");
    } else {
        g_battery_ready = 0;
        printf("[WARN] Battery monitor init failed; battery metrics will stay sparse\n");
    }
#endif

#if ENABLE_RS485_BUS
    if (FieldRs485_Init() == 0) {
        g_rs485_ready = 1;
        g_i2c_ready = 1;
    } else {
        g_rs485_ready = 0;
        printf("[WARN] RS485 init failed; field sensor metrics will stay sparse\n");
    }
#endif

    if (g_sensor_data_mutex == NULL) {
        g_sensor_data_mutex = osMutexNew(NULL);
        if (g_sensor_data_mutex == NULL) {
            printf("[WARN] Sensor data mutex unavailable; telemetry snapshot consistency degrades to best-effort\n");
        }
    }

    printf("--- Initialization Complete ---\n\n");
    
    g_system_ready = 1;
}

// ==================== Main Entry ====================

static void MainEntry(void)
{
    osThreadAttr_t attr;
    osThreadId_t thread_id;

#if BOOT_SERIAL_DIAG_MODE
    {
        unsigned int beat = 0;

        while (1) {
            printf("[BOOT-DIAG] heartbeat=%u debug_uart=UART1 baud=115200 build=%s\n",
                   beat++,
                   FIRMWARE_SAMPLE_VERSION);
            LOS_Msleep(1000);
        }
    }
#endif

    printf("\n");
    printf("*********************************************\n");
    printf("*  Landslide Monitoring System            *\n");
    printf("*  Modular Production Architecture        *\n");
    printf("*  Version: %s              *\n", FIRMWARE_SAMPLE_VERSION);
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
    thread_id = osThreadNew((osThreadFunc_t)SensorCollectionTask, NULL, &attr);
    if (thread_id == NULL) {
        printf("[ERROR] Failed to create SensorTask\n");
    }

    attr.name = "UartRxTask";
    attr.stack_size = 4096;
    // LiteOS-M maps CMSIS priorities around osPriorityNormal.
    // osPriorityHigh overflows the valid LOS range on this BSP and causes osThreadNew to fail.
    attr.priority = osPriorityAboveNormal;  // Highest valid CMSIS priority on this BSP for this task
    thread_id = osThreadNew((osThreadFunc_t)UartRxTask, NULL, &attr);
    if (thread_id == NULL) {
        printf("[ERROR] Failed to create UartRxTask\n");
    }

    attr.name = "FieldLinkHealth";
    attr.stack_size = 2048;
    attr.priority = osPriorityBelowNormal;
    thread_id = osThreadNew((osThreadFunc_t)FieldLinkHealthTask, NULL, &attr);
    if (thread_id == NULL) {
        printf("[ERROR] Failed to create FieldLinkHealth\n");
    }

    attr.name = "ProcessTask";
    // Command parsing plus ACK/result payload assembly already overruns 2KB on-device.
    // The post-TX field-link loopback diagnostic adds another encode/decode pass,
    // so temporarily widen the workers that can enter XL01_SendTypedPayload.
    attr.stack_size = APP_PROCESS_TASK_STACK_SIZE;
    attr.priority = osPriorityNormal;
    thread_id = osThreadNew((osThreadFunc_t)DataProcessTask, NULL, &attr);
    if (thread_id == NULL) {
        printf("[ERROR] Failed to create ProcessTask\n");
    }

    attr.name = "UploadTask";
    attr.stack_size = APP_UPLOAD_TASK_STACK_SIZE;
    attr.priority = osPriorityBelowNormal;
    thread_id = osThreadNew((osThreadFunc_t)DataUploadTask, NULL, &attr);
    if (thread_id == NULL) {
        printf("[ERROR] Failed to create UploadTask\n");
    }

    attr.name = "SharedPortWriter";
    attr.stack_size = APP_SHARED_PORT_TASK_STACK_SIZE;
    attr.priority = osPriorityBelowNormal;
    thread_id = osThreadNew((osThreadFunc_t)SharedPortWriterTask, NULL, &attr);
    if (thread_id == NULL) {
        printf("[ERROR] Failed to create SharedPortWriter\n");
    }
}

SYS_RUN(MainEntry);
