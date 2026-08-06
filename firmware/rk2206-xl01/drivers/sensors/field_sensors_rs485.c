#include "../../config/app_config.h"

#if ENABLE_RS485_BUS

#include "field_sensors_rs485.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "los_task.h"
#include "los_tick.h"
#include "../../utils/watchdog_mgr.h"
#include "rs485_modbus.h"
#include "rs485_read_retry_policy.h"
#if RS485_TRANSPORT_SC16IS752
#include "sc16is752_driver.h"
#endif

#ifndef RS485_SOIL_CHANNEL
#define RS485_SOIL_CHANNEL RS485_CHANNEL_1
#endif

#ifndef RS485_TILT_CHANNEL
#define RS485_TILT_CHANNEL RS485_CHANNEL_1
#endif

#ifndef RS485_RAIN_CHANNEL
#define RS485_RAIN_CHANNEL RS485_CHANNEL_1
#endif

#ifndef RS485_TILT_PROBE_TIMEOUT_MS
#define RS485_TILT_PROBE_TIMEOUT_MS 1500U
#endif

#ifndef RS485_TILT_PROBE_DIAG
#define RS485_TILT_PROBE_DIAG 0
#endif

#ifndef RS485_TILT_AUTO_PROBE
#define RS485_TILT_AUTO_PROBE 0
#endif

#ifndef RS485_SENSOR_RESULT_LOG
#define RS485_SENSOR_RESULT_LOG 1
#endif

#ifndef RS485_STRUCTURED_DIAG
#define RS485_STRUCTURED_DIAG 0
#endif

#ifndef RS485_DIAGNOSTIC_PROBE_TIMEOUT_MS
#define RS485_DIAGNOSTIC_PROBE_TIMEOUT_MS 300U
#endif

#ifndef RS485_DIAGNOSTIC_PROBE_GAP_MS
#define RS485_DIAGNOSTIC_PROBE_GAP_MS 20U
#endif

#ifndef SC16IS752_ALT_XTAL_HZ
#define SC16IS752_ALT_XTAL_HZ 14745600UL
#endif

#define MODBUS_FC_READ_HOLDING_REGISTERS 0x03U
#define MODBUS_FC_READ_INPUT_REGISTERS   0x04U

typedef struct {
    unsigned int baudrate;
    unsigned long xtal_hz;
} Rs485ProbeUartConfig;

static FieldRs485Diagnostics g_field_rs485_diagnostics = {0};
static uint32_t g_path_final_failure_streaks[FIELD_RS485_PATH_COUNT] = {0};
static uint8_t g_path_success_seen[FIELD_RS485_PATH_COUNT] = {0};

static uint64_t FieldRs485MonotonicMs(void)
{
    uint64_t ticks = (uint64_t)LOS_TickCountGet();
    uint64_t ticks_per_second = (uint64_t)LOS_MS2Tick(1000U);

    if (ticks_per_second == 0U) {
        return ticks;
    }
    return ((ticks / ticks_per_second) * 1000U) +
           (((ticks % ticks_per_second) * 1000U) / ticks_per_second);
}

static const char *FieldRs485PathName(unsigned int path_index)
{
    static const char *const names[FIELD_RS485_PATH_COUNT] = {
        "soil",
        "soil_ec",
        "tilt",
        "rain",
    };

    return path_index < FIELD_RS485_PATH_COUNT ? names[path_index] : "unknown";
}

static int ShouldLogFailureStreak(uint32_t streak)
{
    return streak <= 2U || (streak & (streak - 1U)) == 0U || (streak % 60U) == 0U;
}

static void LogPathReadResult(
    unsigned int path_index,
    uint8_t channel,
    const FieldRs485PathCycleDiagnostics *result)
{
    uint32_t previous_streak;

    if (result == NULL || path_index >= FIELD_RS485_PATH_COUNT || !result->attempted) {
        return;
    }

    previous_streak = g_path_final_failure_streaks[path_index];
    if (result->final_status == RS485_MODBUS_OK) {
        if (!g_path_success_seen[path_index] && previous_streak == 0U &&
            result->first_status == RS485_MODBUS_OK) {
            printf("[RS485 PATH] state=READY path=%s ch=%u attempts=%u\n",
                   FieldRs485PathName(path_index), channel, result->attempts);
        }
        g_path_success_seen[path_index] = 1U;
        if (result->first_status != RS485_MODBUS_OK) {
            printf("[RS485 PATH] state=RETRY_RECOVERED path=%s ch=%u first=%s attempts=%u\n",
                   FieldRs485PathName(path_index),
                   channel,
                   RS485_ModbusStatusName(result->first_status),
                   result->attempts);
        }
        if (previous_streak > 0U) {
            printf("[RS485 PATH] state=RECOVERED path=%s ch=%u prior_final_failures=%u\n",
                   FieldRs485PathName(path_index), channel, previous_streak);
        }
        g_path_final_failure_streaks[path_index] = 0U;
        return;
    }

    g_path_final_failure_streaks[path_index] =
        FieldRs485_SaturatingAddU32(previous_streak, 1U);
    if (ShouldLogFailureStreak(g_path_final_failure_streaks[path_index])) {
        printf("[RS485 PATH] state=FAILED path=%s ch=%u first=%s final=%s attempts=%u streak=%u\n",
               FieldRs485PathName(path_index),
               channel,
               RS485_ModbusStatusName(result->first_status),
               RS485_ModbusStatusName(result->final_status),
               result->attempts,
               g_path_final_failure_streaks[path_index]);
    }
}

static float SignedRegisterToScaledFloat(uint16_t value, float scale)
{
    return (float)((int16_t)value) * scale;
}

static int ReadRegistersWithRetry(
    unsigned int path_index,
    uint8_t channel,
    uint8_t function_code,
    uint8_t addr,
    uint16_t start_reg,
    uint16_t reg_count,
    uint16_t *regs,
    unsigned int reg_capacity,
    unsigned int timeout_ms,
    unsigned int max_retries,
    FieldRs485PathCycleDiagnostics *path_diagnostics)
{
    unsigned int retries_used = 0U;
    int status;

    do {
        status = RS485_ModbusReadRegistersWithTimeoutOnChannel(
            channel,
            function_code,
            addr,
            start_reg,
            reg_count,
            regs,
            reg_capacity,
            timeout_ms);
        FieldRs485_PathCycleRecordAttempt(path_diagnostics, status);
        if (status == RS485_MODBUS_OK) {
            LogPathReadResult(path_index, channel, path_diagnostics);
            return status;
        }
        if (!RS485_ReadShouldRetry(status, retries_used, max_retries)) {
            LogPathReadResult(path_index, channel, path_diagnostics);
            return status;
        }
        retries_used++;
        Watchdog_Feed();
#if RS485_TRANSPORT_SC16IS752
        (void)SC16IS752_UartReconfigureCached((Sc16is752Channel)channel);
#endif
        LOS_Msleep(RS485_SENSOR_READ_RETRY_GAP_MS);
    } while (1);
}

static int ReadTiltRegistersWithFunction(
    uint8_t channel,
    uint8_t function_code,
    uint8_t addr,
    uint16_t *regs,
    unsigned int reg_capacity,
    unsigned int timeout_ms,
    FieldRs485PathCycleDiagnostics *path_diagnostics)
{
    return ReadRegistersWithRetry(
        FIELD_RS485_PATH_TILT_INDEX,
        channel,
        function_code,
        addr,
        RS485_TILT_REG_START,
        RS485_TILT_REG_COUNT,
        regs,
        reg_capacity,
        timeout_ms,
        RS485_SENSOR_READ_MAX_RETRIES,
        path_diagnostics);
}

static int ReadTiltRegisters(
    uint8_t channel,
    uint8_t addr,
    uint16_t *regs,
    unsigned int reg_capacity,
    FieldRs485PathCycleDiagnostics *path_diagnostics)
{
    return ReadTiltRegistersWithFunction(
        channel,
        MODBUS_FC_READ_HOLDING_REGISTERS,
        addr,
        regs,
        reg_capacity,
        RS485_RESPONSE_TIMEOUT_MS,
        path_diagnostics);
}

static int ProbeTiltSingleRegister(
    uint8_t channel,
    uint8_t function_code,
    uint8_t addr,
    uint16_t start_reg,
    uint16_t *value)
{
    uint16_t reg = 0;
    int ret = RS485_ModbusReadRegistersWithTimeoutOnChannel(
        channel,
        function_code,
        addr,
        start_reg,
        1,
        &reg,
        1,
        RS485_TILT_PROBE_TIMEOUT_MS);

    if (ret == 0 && value != NULL) {
        *value = reg;
    }
    return ret;
}

static int ReconfigureRs485Channel(uint8_t channel, unsigned int baudrate)
{
#if RS485_TRANSPORT_SC16IS752
    return SC16IS752_UartEnsureConfigured((Sc16is752Channel)channel, baudrate);
#else
    (void)channel;
    (void)baudrate;
    return 0;
#endif
}

static int ReconfigureRs485ChannelWithClock(uint8_t channel, unsigned int baudrate, unsigned long xtal_hz)
{
#if RS485_TRANSPORT_SC16IS752
    SC16IS752_SetClockHz(xtal_hz);
#else
    (void)xtal_hz;
#endif
    return ReconfigureRs485Channel(channel, baudrate);
}

static int ProbeReadOnlyPath(
    uint8_t preferred_channel,
    const uint16_t *registers,
    const uint16_t *register_counts,
    unsigned int register_option_count,
    FieldRs485ProbeMatch *match)
{
    static const Rs485ProbeUartConfig uart_configs[] = {
        {4800U, SC16IS752_XTAL_HZ},
        {9600U, SC16IS752_XTAL_HZ},
        {4800U, SC16IS752_ALT_XTAL_HZ},
        {9600U, SC16IS752_ALT_XTAL_HZ},
    };
    static const uint8_t function_codes[] = {
        MODBUS_FC_READ_HOLDING_REGISTERS,
        MODBUS_FC_READ_INPUT_REGISTERS,
    };
    uint8_t channels[2];
    unsigned int uart_index;
    unsigned int channel_index;
    unsigned int function_index;
    unsigned int register_index;

    if (registers == NULL || register_counts == NULL || register_option_count == 0U || match == NULL) {
        return RS485_MODBUS_ERR_INVALID;
    }
    channels[0] = preferred_channel;
    channels[1] = preferred_channel == RS485_CHANNEL_1 ? RS485_CHANNEL_2 : RS485_CHANNEL_1;

    for (uart_index = 0U; uart_index < sizeof(uart_configs) / sizeof(uart_configs[0]); ++uart_index) {
        for (channel_index = 0U; channel_index < sizeof(channels) / sizeof(channels[0]); ++channel_index) {
            uint8_t channel = channels[channel_index];
            int uart_status = ReconfigureRs485ChannelWithClock(
                channel,
                uart_configs[uart_index].baudrate,
                uart_configs[uart_index].xtal_hz);
            if (uart_status != 0) {
                continue;
            }

            for (function_index = 0U;
                 function_index < sizeof(function_codes) / sizeof(function_codes[0]);
                 ++function_index) {
                for (register_index = 0U; register_index < register_option_count; ++register_index) {
                    uint16_t regs[3] = {0};
                    uint16_t reg_count = register_counts[register_index];
                    int status;

                    if (reg_count == 0U || reg_count > sizeof(regs) / sizeof(regs[0])) {
                        continue;
                    }
                    Watchdog_Feed();
                    if (g_field_rs485_diagnostics.attempts != UINT16_MAX) {
                        g_field_rs485_diagnostics.attempts++;
                    }
                    status = RS485_ModbusReadRegistersWithTimeoutOnChannel(
                        channel,
                        function_codes[function_index],
                        1U,
                        registers[register_index],
                        reg_count,
                        regs,
                        sizeof(regs) / sizeof(regs[0]),
                        RS485_DIAGNOSTIC_PROBE_TIMEOUT_MS);
                    if (status == RS485_MODBUS_OK) {
                        if (g_field_rs485_diagnostics.successful_probes != UINT16_MAX) {
                            g_field_rs485_diagnostics.successful_probes++;
                        }
                        match->found = 1U;
                        match->channel = channel;
                        match->function_code = function_codes[function_index];
                        match->slave_addr = 1U;
                        match->start_reg = registers[register_index];
                        match->reg_count = reg_count;
                        match->baudrate = uart_configs[uart_index].baudrate;
                        match->xtal_hz = (uint32_t)uart_configs[uart_index].xtal_hz;
                        return RS485_MODBUS_OK;
                    }
                    LOS_Msleep(RS485_DIAGNOSTIC_PROBE_GAP_MS);
                }
            }
        }
    }
    return RS485_MODBUS_ERR_TIMEOUT;
}

static void RunReadOnlyDiagnostics(void)
{
    static const uint16_t soil_registers[] = {RS485_SOIL_REG_START};
    static const uint16_t soil_register_counts[] = {RS485_SOIL_REG_COUNT};
    static const uint16_t tilt_registers[] = {RS485_TILT_REG_START, 0x00C8U};
    static const uint16_t tilt_register_counts[] = {RS485_TILT_REG_COUNT, 1U};
    uint32_t start_tick = (uint32_t)LOS_TickCountGet();
    uint32_t elapsed_ticks;
    uint32_t ticks_per_second;
    int restore_a;
    int restore_b;

    memset(&g_field_rs485_diagnostics, 0, sizeof(g_field_rs485_diagnostics));
    g_field_rs485_diagnostics.scan_started = 1U;

    if (ProbeReadOnlyPath(
            RS485_SOIL_CHANNEL,
            soil_registers,
            soil_register_counts,
            sizeof(soil_registers) / sizeof(soil_registers[0]),
            &g_field_rs485_diagnostics.soil) == RS485_MODBUS_OK) {
        g_field_rs485_diagnostics.match_mask |= FIELD_RS485_DIAG_SOIL_MATCH;
    }
    if (ProbeReadOnlyPath(
            RS485_TILT_CHANNEL,
            tilt_registers,
            tilt_register_counts,
            sizeof(tilt_registers) / sizeof(tilt_registers[0]),
            &g_field_rs485_diagnostics.tilt) == RS485_MODBUS_OK) {
        g_field_rs485_diagnostics.match_mask |= FIELD_RS485_DIAG_TILT_MATCH;
    }

#if RS485_TRANSPORT_SC16IS752
    SC16IS752_SetClockHz(SC16IS752_XTAL_HZ);
#endif
    restore_a = ReconfigureRs485Channel(RS485_CHANNEL_1, RS485_BAUDRATE);
    restore_b = ReconfigureRs485Channel(RS485_CHANNEL_2, RS485_BAUDRATE);
    g_field_rs485_diagnostics.restore_ok = restore_a == 0 && restore_b == 0 ? 1U : 0U;
    g_field_rs485_diagnostics.scan_completed = 1U;

    elapsed_ticks = (uint32_t)LOS_TickCountGet() - start_tick;
    ticks_per_second = LOS_MS2Tick(1000U);
    if (ticks_per_second == 0U) {
        ticks_per_second = 1U;
    }
    g_field_rs485_diagnostics.duration_ms =
        (uint32_t)(((uint64_t)elapsed_ticks * 1000U) / ticks_per_second);
    printf("[RS485-DIAG] read-only scan complete attempts=%u matches=0x%02X restore=%u duration_ms=%u\n",
           g_field_rs485_diagnostics.attempts,
           g_field_rs485_diagnostics.match_mask,
           g_field_rs485_diagnostics.restore_ok,
           g_field_rs485_diagnostics.duration_ms);
}

static int ProbeTiltSensor(
    uint8_t *found_channel,
    uint8_t *found_addr,
    unsigned int *found_baudrate,
    unsigned long *found_xtal_hz,
    uint8_t *found_function_code)
{
    static const uint8_t channels[] = {
        RS485_TILT_CHANNEL,
        (RS485_TILT_CHANNEL == RS485_CHANNEL_1) ? RS485_CHANNEL_2 : RS485_CHANNEL_1,
    };
    static const Rs485ProbeUartConfig uart_configs[] = {
        {RS485_BAUDRATE, SC16IS752_XTAL_HZ},
        {RS485_BAUDRATE, SC16IS752_ALT_XTAL_HZ},
        {9600U, SC16IS752_XTAL_HZ},
        {9600U, SC16IS752_ALT_XTAL_HZ},
    };
    static const uint8_t function_codes[] = {
        MODBUS_FC_READ_HOLDING_REGISTERS,
        MODBUS_FC_READ_INPUT_REGISTERS,
    };
    static const uint16_t probe_registers[] = {
        0x0000U,
        0x00C8U,
    };
    uint16_t regs[RS485_TILT_REG_COUNT] = {0};
    uint16_t probe_value = 0;
    unsigned int uart_index;
    unsigned int channel_index;
    unsigned int function_index;
    unsigned int reg_index;
    uint8_t addr;

#if RS485_TILT_PROBE_DIAG
    printf("[RS485 TILT] probing per manual: addr=1, 8N1, fc=03/04, reg=0x0000/0x00C8, count=1\n");
#endif

    for (uart_index = 0; uart_index < sizeof(uart_configs) / sizeof(uart_configs[0]); ++uart_index) {
        unsigned int baudrate = uart_configs[uart_index].baudrate;
        unsigned long xtal_hz = uart_configs[uart_index].xtal_hz;
        if (uart_index > 0 &&
            baudrate == uart_configs[uart_index - 1U].baudrate &&
            xtal_hz == uart_configs[uart_index - 1U].xtal_hz) {
            continue;
        }
        for (channel_index = 0; channel_index < sizeof(channels) / sizeof(channels[0]); ++channel_index) {
            uint8_t channel = channels[channel_index];

            if (ReconfigureRs485ChannelWithClock(channel, baudrate, xtal_hz) != 0) {
#if RS485_TILT_PROBE_DIAG
                printf("[RS485 TILT] probe uart config failed ch=%u baud=%u xtal=%lu\n",
                       channel, baudrate, xtal_hz);
#endif
                continue;
            }

            for (function_index = 0; function_index < sizeof(function_codes) / sizeof(function_codes[0]); ++function_index) {
                uint8_t function_code = function_codes[function_index];

                for (reg_index = 0; reg_index < sizeof(probe_registers) / sizeof(probe_registers[0]); ++reg_index) {
                    uint16_t start_reg = probe_registers[reg_index];

                    for (addr = RS485_TILT_ADDR; addr <= RS485_TILT_ADDR; ++addr) {
                        Watchdog_Feed();
                        memset(regs, 0, sizeof(regs));
                        probe_value = 0;
#if RS485_TILT_PROBE_DIAG
                        printf("[RS485 TILT] probe ch=%u baud=%u xtal=%lu fc=0x%02X addr=%u reg=0x%04X count=1\n",
                               channel, baudrate, xtal_hz, function_code, addr, start_reg);
#endif
                        if (ProbeTiltSingleRegister(channel, function_code, addr, start_reg, &probe_value) == 0) {
                            if (found_channel != NULL) {
                                *found_channel = channel;
                            }
                            if (found_addr != NULL) {
                                *found_addr = addr;
                            }
                            if (found_baudrate != NULL) {
                                *found_baudrate = baudrate;
                            }
                            if (found_xtal_hz != NULL) {
                                *found_xtal_hz = xtal_hz;
                            }
                            if (found_function_code != NULL) {
                                *found_function_code = function_code;
                            }
#if RS485_TILT_PROBE_DIAG
                            printf("[RS485 TILT] probe success ch=%u baud=%u xtal=%lu fc=0x%02X addr=%u reg=0x%04X raw=%04X angle=%.2f\n",
                                   channel,
                                   baudrate,
                                   xtal_hz,
                                   function_code,
                                   addr,
                                   start_reg,
                                   probe_value,
                                   SignedRegisterToScaledFloat(probe_value, RS485_TILT_SCALE));
#endif
                            return 0;
                        }
                        LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
                    }
                }
            }
        }
    }

#if RS485_TRANSPORT_SC16IS752
    SC16IS752_SetClockHz(SC16IS752_XTAL_HZ);
#endif
    (void)ReconfigureRs485Channel(RS485_CHANNEL_1, RS485_BAUDRATE);
    (void)ReconfigureRs485Channel(RS485_CHANNEL_2, RS485_BAUDRATE);
    return -1;
}

int FieldRs485_Init(void)
{
    int status;

    memset(&g_field_rs485_diagnostics, 0, sizeof(g_field_rs485_diagnostics));
    status = RS485_ModbusInit();
    if (status != 0) {
        return status;
    }
    return 0;
}

void FieldRs485_RunDiagnostics(void)
{
#if RS485_STRUCTURED_DIAG
    RunReadOnlyDiagnostics();
#endif
}

int FieldRs485_ReadSelected(FieldRs485Readings *out, uint8_t requested_mask)
{
    int any_valid = 0;
    int read_soil;
    int read_soil_ec;
    int read_tilt;
    int read_rain;
    uint64_t collection_started_ms;
    uint64_t collection_completed_ms;
    uint64_t collection_duration_ms;

    if (out == NULL) {
        return -1;
    }

    requested_mask &= FIELD_RS485_PATH_ALL_MASK;
    read_soil = (requested_mask & FIELD_RS485_PATH_SOIL_MASK) != 0U;
    read_soil_ec = (requested_mask & FIELD_RS485_PATH_SOIL_EC_MASK) != 0U;
    read_tilt = (requested_mask & FIELD_RS485_PATH_TILT_MASK) != 0U;
    read_rain = (requested_mask & FIELD_RS485_PATH_RAIN_MASK) != 0U;

    memset(out, 0, sizeof(*out));
    collection_started_ms = FieldRs485MonotonicMs();
    FieldRs485_PathCycleInit(
        &out->cycle_diagnostics.paths[FIELD_RS485_PATH_SOIL_INDEX],
        ENABLE_RS485_SOIL_SENSOR && read_soil);
    FieldRs485_PathCycleInit(
        &out->cycle_diagnostics.paths[FIELD_RS485_PATH_SOIL_EC_INDEX],
        ENABLE_RS485_SOIL_SENSOR && RS485_SOIL_HAS_EC && read_soil_ec);
    FieldRs485_PathCycleInit(
        &out->cycle_diagnostics.paths[FIELD_RS485_PATH_TILT_INDEX],
        ENABLE_RS485_TILT_SENSOR && read_tilt);
    FieldRs485_PathCycleInit(
        &out->cycle_diagnostics.paths[FIELD_RS485_PATH_RAIN_INDEX],
        ENABLE_RS485_RAIN_SENSOR && read_rain);
#if ENABLE_RS485_SOIL_SENSOR
    if (read_soil) out->cycle_diagnostics.enabled_mask |= FIELD_RS485_PATH_SOIL_MASK;
#if RS485_SOIL_HAS_EC
    if (read_soil_ec) out->cycle_diagnostics.enabled_mask |= FIELD_RS485_PATH_SOIL_EC_MASK;
#endif
#endif
#if ENABLE_RS485_TILT_SENSOR
    if (read_tilt) out->cycle_diagnostics.enabled_mask |= FIELD_RS485_PATH_TILT_MASK;
#endif
#if ENABLE_RS485_RAIN_SENSOR
    if (read_rain) out->cycle_diagnostics.enabled_mask |= FIELD_RS485_PATH_RAIN_MASK;
#endif

#if ENABLE_RS485_TILT_SENSOR
    /* Core displacement evidence always gets the bus before low-rate paths. */
    if (read_tilt) {
#if RS485_TILT_AUTO_PROBE
        static int tilt_probe_done = 0;
        static int tilt_probe_ok = 0;
#endif
        static uint8_t tilt_channel = RS485_TILT_CHANNEL;
        static uint8_t tilt_addr = RS485_TILT_ADDR;
        static unsigned int tilt_baudrate = RS485_BAUDRATE;
        static unsigned long tilt_xtal_hz = SC16IS752_XTAL_HZ;
        static uint8_t tilt_function_code = MODBUS_FC_READ_HOLDING_REGISTERS;
        uint16_t regs[RS485_TILT_REG_COUNT] = {0};
        int read_ret;

#if RS485_TILT_AUTO_PROBE
        if (!tilt_probe_done) {
            tilt_probe_done = 1;
            tilt_probe_ok = (ProbeTiltSensor(
                                 &tilt_channel,
                                 &tilt_addr,
                                 &tilt_baudrate,
                                 &tilt_xtal_hz,
                                 &tilt_function_code) == 0);
            if (!tilt_probe_ok) {
                printf("[RS485 TILT] probe found no response; check RS485 wiring, sensor power, A/B, and sensor address\n");
            }
        }

        if (tilt_probe_ok) {
            (void)ReconfigureRs485ChannelWithClock(tilt_channel, tilt_baudrate, tilt_xtal_hz);
            read_ret = ReadTiltRegistersWithFunction(
                tilt_channel,
                tilt_function_code,
                tilt_addr,
                regs,
                RS485_TILT_REG_COUNT,
                RS485_RESPONSE_TIMEOUT_MS,
                &out->cycle_diagnostics.paths[FIELD_RS485_PATH_TILT_INDEX]);
        } else {
            uint8_t fallback_channel = (RS485_TILT_CHANNEL == RS485_CHANNEL_1) ? RS485_CHANNEL_2 : RS485_CHANNEL_1;
            read_ret = ReadTiltRegisters(
                RS485_TILT_CHANNEL,
                RS485_TILT_ADDR,
                regs,
                RS485_TILT_REG_COUNT,
                &out->cycle_diagnostics.paths[FIELD_RS485_PATH_TILT_INDEX]);
            if (read_ret != 0) {
                memset(regs, 0, sizeof(regs));
                read_ret = ReadTiltRegisters(
                    fallback_channel,
                    RS485_TILT_ADDR,
                    regs,
                    RS485_TILT_REG_COUNT,
                    &out->cycle_diagnostics.paths[FIELD_RS485_PATH_TILT_INDEX]);
                tilt_channel = fallback_channel;
            } else {
                tilt_channel = RS485_TILT_CHANNEL;
            }
        }
#else
        (void)ReconfigureRs485ChannelWithClock(tilt_channel, tilt_baudrate, tilt_xtal_hz);
        read_ret = ReadTiltRegistersWithFunction(
            tilt_channel,
            tilt_function_code,
            tilt_addr,
            regs,
            RS485_TILT_REG_COUNT,
            RS485_RESPONSE_TIMEOUT_MS,
            &out->cycle_diagnostics.paths[FIELD_RS485_PATH_TILT_INDEX]);
#endif

        if (read_ret == 0) {
            out->tilt_x_deg = SignedRegisterToScaledFloat(regs[RS485_TILT_X_REG_INDEX], RS485_TILT_SCALE);
            out->tilt_y_deg = SignedRegisterToScaledFloat(regs[RS485_TILT_Y_REG_INDEX], RS485_TILT_SCALE);
#if RS485_TILT_REG_COUNT > 2
            out->tilt_z_deg = SignedRegisterToScaledFloat(regs[RS485_TILT_Z_REG_INDEX], RS485_TILT_SCALE);
#endif
            out->tilt_valid = 1;
            any_valid = 1;
#if RS485_SENSOR_RESULT_LOG
            printf("[RS485 TILT] ch=%d addr=%d x=%.*fdeg y=%.*fdeg z=%.*fdeg\n",
                   tilt_channel,
                   tilt_addr,
                   RS485_TILT_DECIMALS,
                   out->tilt_x_deg,
                   RS485_TILT_DECIMALS,
                   out->tilt_y_deg,
                   RS485_TILT_DECIMALS,
                   out->tilt_z_deg);
#endif
        }
        if (read_soil || read_rain) {
            LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
        }
    }
#endif

#if ENABLE_RS485_SOIL_SENSOR
    if (read_soil) {
#if RS485_SOIL_HAS_EC
        static int soil_ec_supported = 0;
        static int soil_ec_unavailable_reported = 0;
        static unsigned int soil_ec_reprobe_countdown = 0U;
#endif
        uint16_t regs[RS485_SOIL_REG_COUNT] = {0};
        (void)ReconfigureRs485ChannelWithClock(RS485_SOIL_CHANNEL, RS485_BAUDRATE, SC16IS752_XTAL_HZ);
        if (ReadRegistersWithRetry(
                FIELD_RS485_PATH_SOIL_INDEX,
                RS485_SOIL_CHANNEL,
                MODBUS_FC_READ_HOLDING_REGISTERS,
                RS485_SOIL_ADDR,
                RS485_SOIL_REG_START,
                RS485_SOIL_REG_COUNT,
                regs,
                RS485_SOIL_REG_COUNT,
                RS485_LOW_PRIORITY_RESPONSE_TIMEOUT_MS,
                RS485_LOW_PRIORITY_READ_MAX_RETRIES,
                &out->cycle_diagnostics.paths[FIELD_RS485_PATH_SOIL_INDEX]) == 0) {
            out->soil_moisture_pct =
                (float)regs[RS485_SOIL_MOISTURE_REG_INDEX] * RS485_SOIL_MOISTURE_SCALE;
            out->soil_temperature_c =
                SignedRegisterToScaledFloat(regs[RS485_SOIL_TEMPERATURE_REG_INDEX], RS485_SOIL_TEMPERATURE_SCALE);
            out->soil_valid = 1;
            any_valid = 1;
#if RS485_SOIL_HAS_EC
            if (read_soil_ec && (soil_ec_supported || soil_ec_reprobe_countdown == 0U)) {
                uint16_t ec_reg = 0;
                int ec_read_ret;

                LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
                ec_read_ret = ReadRegistersWithRetry(
                    FIELD_RS485_PATH_SOIL_EC_INDEX,
                    RS485_SOIL_CHANNEL,
                    MODBUS_FC_READ_HOLDING_REGISTERS,
                    RS485_SOIL_ADDR,
                    RS485_SOIL_EC_REG,
                    1,
                    &ec_reg,
                    1,
                    RS485_LOW_PRIORITY_RESPONSE_TIMEOUT_MS,
                    RS485_LOW_PRIORITY_READ_MAX_RETRIES,
                    &out->cycle_diagnostics.paths[FIELD_RS485_PATH_SOIL_EC_INDEX]);
                if (ec_read_ret == 0) {
                    if (!soil_ec_supported) {
                        printf("[RS485 SOIL] optional EC register detected at 0x%04X\n", RS485_SOIL_EC_REG);
                    }
                    soil_ec_supported = 1;
                    soil_ec_unavailable_reported = 0;
                    soil_ec_reprobe_countdown = 0U;
                    out->soil_ec_us_cm = (float)ec_reg * RS485_SOIL_EC_SCALE;
                    out->soil_ec_valid = 1;
                } else if (!soil_ec_supported) {
                    soil_ec_reprobe_countdown = RS485_SOIL_EC_REPROBE_READS;
                    if (!soil_ec_unavailable_reported) {
                        printf("[RS485 SOIL] optional EC register unavailable; base temperature/moisture remain active\n");
                        soil_ec_unavailable_reported = 1;
                    }
                }
            }
            if (!soil_ec_supported && soil_ec_reprobe_countdown > 0U) {
                soil_ec_reprobe_countdown--;
            }
#endif
#if RS485_SENSOR_RESULT_LOG
            if (out->soil_ec_valid) {
                printf("[RS485 SOIL] ch=%u addr=%u temp=%.*fC moisture=%.*f%% ec=%.0fuS/cm\n",
                       RS485_SOIL_CHANNEL,
                       RS485_SOIL_ADDR,
                       RS485_SOIL_TEMPERATURE_DECIMALS,
                       out->soil_temperature_c,
                       RS485_SOIL_MOISTURE_DECIMALS,
                       out->soil_moisture_pct,
                       out->soil_ec_us_cm);
            } else {
                printf("[RS485 SOIL] ch=%u addr=%u temp=%.*fC moisture=%.*f%% ec=N/A\n",
                       RS485_SOIL_CHANNEL,
                       RS485_SOIL_ADDR,
                       RS485_SOIL_TEMPERATURE_DECIMALS,
                       out->soil_temperature_c,
                       RS485_SOIL_MOISTURE_DECIMALS,
                       out->soil_moisture_pct);
            }
#endif
        }
        if (read_rain) {
            LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
        }
    }
#endif

#if ENABLE_RS485_RAIN_SENSOR
    if (read_rain) {
        uint16_t regs[RS485_RAIN_REG_COUNT] = {0};
        if (ReadRegistersWithRetry(
                FIELD_RS485_PATH_RAIN_INDEX,
                RS485_RAIN_CHANNEL,
                MODBUS_FC_READ_HOLDING_REGISTERS,
                RS485_RAIN_ADDR,
                RS485_RAIN_REG_START,
                RS485_RAIN_REG_COUNT,
                regs,
                RS485_RAIN_REG_COUNT,
                RS485_RESPONSE_TIMEOUT_MS,
                RS485_SENSOR_READ_MAX_RETRIES,
                &out->cycle_diagnostics.paths[FIELD_RS485_PATH_RAIN_INDEX]) == 0) {
            out->rain_total_mm = (float)regs[0] * RS485_RAIN_TOTAL_SCALE;
            out->rain_valid = 1;
            any_valid = 1;
            printf("[RS485 RAIN] total=%.1fmm\n", out->rain_total_mm);
        }
    }
#endif

    if (out->soil_valid) {
        out->cycle_diagnostics.valid_mask |= FIELD_RS485_PATH_SOIL_MASK;
    }
    if (out->soil_ec_valid) {
        out->cycle_diagnostics.valid_mask |= FIELD_RS485_PATH_SOIL_EC_MASK;
    }
    if (out->tilt_valid) {
        out->cycle_diagnostics.valid_mask |= FIELD_RS485_PATH_TILT_MASK;
    }
    if (out->rain_valid) {
        out->cycle_diagnostics.valid_mask |= FIELD_RS485_PATH_RAIN_MASK;
    }
    collection_completed_ms = FieldRs485MonotonicMs();
    collection_duration_ms = collection_completed_ms - collection_started_ms;
    out->cycle_diagnostics.completed_uptime_s = (uint32_t)(collection_completed_ms / 1000U);
    out->cycle_diagnostics.duration_ms = collection_duration_ms > UINT32_MAX ?
        UINT32_MAX : (uint32_t)collection_duration_ms;

    return any_valid ? 0 : -1;
}

int FieldRs485_Read(FieldRs485Readings *out)
{
    return FieldRs485_ReadSelected(out, FIELD_RS485_PATH_ALL_MASK);
}

void FieldRs485_GetDiagnostics(FieldRs485Diagnostics *snapshot)
{
    if (snapshot == NULL) {
        return;
    }
    memcpy(snapshot, &g_field_rs485_diagnostics, sizeof(*snapshot));
}

#endif /* ENABLE_RS485_BUS */
