#include "field_alarm_rs485.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "los_task.h"
#include "../../config/app_config.h"
#include "rs485_modbus.h"

#if ENABLE_RS485_ALARM && RS485_TRANSPORT_SC16IS752
#include "sc16is752_driver.h"
#endif

#ifndef ENABLE_RS485_ALARM
#define ENABLE_RS485_ALARM 0
#endif

#ifndef RS485_CHANNEL_2
#define RS485_CHANNEL_2 1
#endif

#ifndef RS485_ALARM_CHANNEL
#define RS485_ALARM_CHANNEL RS485_CHANNEL_2
#endif

#ifndef RS485_ALARM_BAUDRATE
#define RS485_ALARM_BAUDRATE 9600
#endif

#ifndef RS485_ALARM_BAUDRATE_FALLBACK
#define RS485_ALARM_BAUDRATE_FALLBACK 0
#endif

#ifndef RS485_ALARM_CHANNEL_SCAN
#define RS485_ALARM_CHANNEL_SCAN 1
#endif

#ifndef RS485_ALARM_RESPONSE_TIMEOUT_MS
#define RS485_ALARM_RESPONSE_TIMEOUT_MS 800
#endif

#ifndef RS485_ALARM_ADDR
#define RS485_ALARM_ADDR 1
#endif

#ifndef RS485_ALARM_ADDR_FALLBACK
#define RS485_ALARM_ADDR_FALLBACK 0xFF
#endif

#ifndef RS485_ALARM_PLAY_REG
#define RS485_ALARM_PLAY_REG 0x000D
#endif

#ifndef RS485_ALARM_PAUSE_REG
#define RS485_ALARM_PAUSE_REG 0x000E
#endif

#ifndef RS485_ALARM_LIGHT_REG
#define RS485_ALARM_LIGHT_REG 0x00C2
#endif

#ifndef RS485_ALARM_LIGHT_FLASH_VALUE
#define RS485_ALARM_LIGHT_FLASH_VALUE 0x0003
#endif

#ifndef RS485_ALARM_LIGHT_OFF_VALUE
#define RS485_ALARM_LIGHT_OFF_VALUE 0x0006
#endif

#ifndef RS485_ALARM_STOP_REG
#define RS485_ALARM_STOP_REG 0x0016
#endif

#ifndef RS485_ALARM_STOP_VALUE
#define RS485_ALARM_STOP_VALUE 0x0001
#endif

#ifndef RS485_ALARM_PLAY_FILE_REG
#define RS485_ALARM_PLAY_FILE_REG 0x300F
#endif

#ifndef RS485_ALARM_PLAY_FILE_VALUE
#define RS485_ALARM_PLAY_FILE_VALUE 0x0101
#endif

#ifndef RS485_ALARM_COMMAND_VALUE
#define RS485_ALARM_COMMAND_VALUE 0x0000
#endif

static FieldAlarmRs485Diag g_last_alarm_diag = {
    .final_ret = -1,
    .primary_ret = -1,
    .fallback_ret = -1,
    .step = 0,
    .primary_rx_addr = 0,
    .fallback_rx_addr = 0,
    .primary_rx_bytes = 0,
    .fallback_rx_bytes = 0,
    .primary_rx_hex = "",
    .fallback_rx_hex = "",
    .channel = RS485_ALARM_CHANNEL,
    .primary_addr = RS485_ALARM_ADDR,
    .fallback_addr = RS485_ALARM_ADDR_FALLBACK,
    .reg = 0,
    .value = RS485_ALARM_COMMAND_VALUE,
    .baudrate = RS485_ALARM_BAUDRATE,
    .timeout_ms = RS485_ALARM_RESPONSE_TIMEOUT_MS,
    .used_fallback = 0,
};

static const uint8_t YX75R_RAW_LIGHT_FLASH[] = {0x01, 0x06, 0x00, 0xC2, 0x00, 0x03, 0x68, 0x37};
static const uint8_t YX75R_RAW_PLAY_FILE[] = {0x01, 0x06, 0x30, 0x0F, 0x01, 0x01, 0x76, 0x99};
static const uint8_t YX75R_RAW_LIGHT_OFF[] = {0x01, 0x06, 0x00, 0xC2, 0x00, 0x06, 0xA8, 0x34};
static const uint8_t YX75R_RAW_STOP[] = {0x01, 0x06, 0x00, 0x16, 0x00, 0x01, 0xA9, 0xCE};

static uint8_t FieldAlarmRs485_GetAlternateChannel(void)
{
#if RS485_ALARM_CHANNEL == RS485_CHANNEL_1
    return (uint8_t)RS485_CHANNEL_2;
#else
    return (uint8_t)RS485_CHANNEL_1;
#endif
}

static int FieldAlarmRs485_PrepareChannelAtBaud(uint8_t channel, unsigned int baudrate)
{
#if ENABLE_RS485_ALARM && RS485_TRANSPORT_SC16IS752
    SC16IS752_SetClockHz(SC16IS752_XTAL_HZ);
    return SC16IS752_UartInit((Sc16is752Channel)channel, baudrate);
#else
    (void)channel;
    (void)baudrate;
    return ENABLE_RS485_ALARM ? 0 : -1;
#endif
}

static int FieldAlarmRs485_WriteControl(uint8_t channel, uint8_t addr, uint16_t reg, uint16_t value)
{
    return RS485_ModbusWriteSingleRegisterOnChannelAllowResponseAddrs(
        channel,
        addr,
        (uint8_t)RS485_ALARM_ADDR,
        (uint8_t)RS485_ALARM_ADDR_FALLBACK,
        reg,
        value,
        RS485_ALARM_RESPONSE_TIMEOUT_MS);
}

static int FieldAlarmRs485_WriteFallbackControl(uint8_t channel, uint16_t reg, uint16_t value)
{
    return RS485_ModbusWriteSingleRegisterOnChannelAllowResponseAddrs(
        channel,
        (uint8_t)RS485_ALARM_ADDR_FALLBACK,
        (uint8_t)RS485_ALARM_ADDR,
        (uint8_t)RS485_ALARM_ADDR_FALLBACK,
        reg,
        value,
        RS485_ALARM_RESPONSE_TIMEOUT_MS);
}

static void FieldAlarmRs485_FormatLastWriteResponse(char *out, unsigned int out_size)
{
    uint8_t rx[8];
    unsigned int len;
    unsigned int i;
    unsigned int used = 0U;

    if (out == NULL || out_size == 0U) {
        return;
    }
    out[0] = '\0';

    len = RS485_ModbusGetLastWriteResponse(rx, sizeof(rx));
    for (i = 0U; i < len && used + 2U < out_size; ++i) {
        int n = snprintf(out + used, out_size - used, "%02X", rx[i]);
        if (n <= 0) {
            break;
        }
        used += (unsigned int)n;
    }
}

static void FieldAlarmRs485_ResetStepDiag(uint8_t step, uint16_t reg, uint16_t value)
{
    g_last_alarm_diag.final_ret = RS485_MODBUS_ERR_INVALID;
    g_last_alarm_diag.primary_ret = RS485_MODBUS_ERR_INVALID;
    g_last_alarm_diag.fallback_ret = RS485_MODBUS_ERR_INVALID;
    g_last_alarm_diag.step = step;
    g_last_alarm_diag.primary_rx_addr = 0;
    g_last_alarm_diag.fallback_rx_addr = 0;
    g_last_alarm_diag.primary_rx_bytes = 0;
    g_last_alarm_diag.fallback_rx_bytes = 0;
    g_last_alarm_diag.primary_rx_hex[0] = '\0';
    g_last_alarm_diag.fallback_rx_hex[0] = '\0';
    g_last_alarm_diag.channel = RS485_ALARM_CHANNEL;
    g_last_alarm_diag.primary_addr = RS485_ALARM_ADDR;
    g_last_alarm_diag.fallback_addr = RS485_ALARM_ADDR_FALLBACK;
    g_last_alarm_diag.reg = reg;
    g_last_alarm_diag.value = value;
    g_last_alarm_diag.timeout_ms = RS485_ALARM_RESPONSE_TIMEOUT_MS;
    g_last_alarm_diag.used_fallback = 0;
}

static int FieldAlarmRs485_RunControlStepAtCurrentBaud(uint8_t channel, uint16_t reg, uint16_t value)
{
    int ret;

    g_last_alarm_diag.channel = channel;
    ret = FieldAlarmRs485_WriteControl(channel, (uint8_t)RS485_ALARM_ADDR, reg, value);
    g_last_alarm_diag.primary_ret = ret;
    g_last_alarm_diag.primary_rx_addr = RS485_ModbusGetLastWriteResponseAddr();
    g_last_alarm_diag.primary_rx_bytes = RS485_ModbusGetLastWriteResponseBytes();
    FieldAlarmRs485_FormatLastWriteResponse(g_last_alarm_diag.primary_rx_hex,
                                            sizeof(g_last_alarm_diag.primary_rx_hex));
    if (ret != 0 && RS485_ALARM_ADDR_FALLBACK != RS485_ALARM_ADDR) {
        g_last_alarm_diag.used_fallback = 1;
        ret = FieldAlarmRs485_WriteFallbackControl(channel, reg, value);
        g_last_alarm_diag.fallback_ret = ret;
        g_last_alarm_diag.fallback_rx_addr = RS485_ModbusGetLastWriteResponseAddr();
        g_last_alarm_diag.fallback_rx_bytes = RS485_ModbusGetLastWriteResponseBytes();
        FieldAlarmRs485_FormatLastWriteResponse(g_last_alarm_diag.fallback_rx_hex,
                                                sizeof(g_last_alarm_diag.fallback_rx_hex));
    }
    g_last_alarm_diag.final_ret = ret;

    printf("[ALARM RS485] step=%u ch=%u baud=%u reg=0x%04X value=0x%04X primary=%s fallback=%s result=%s\n",
           g_last_alarm_diag.step,
           channel,
           g_last_alarm_diag.baudrate,
           reg,
           value,
           RS485_ModbusStatusName(g_last_alarm_diag.primary_ret),
           g_last_alarm_diag.used_fallback ? RS485_ModbusStatusName(g_last_alarm_diag.fallback_ret) : "not_used",
           RS485_ModbusStatusName(ret));
    return ret;
}

static int FieldAlarmRs485_RunControlStepOnChannel(
    uint8_t step,
    uint8_t channel,
    uint16_t reg,
    uint16_t value,
    unsigned int baudrate)
{
    int ret;

    FieldAlarmRs485_ResetStepDiag(step, reg, value);
    g_last_alarm_diag.channel = channel;
    g_last_alarm_diag.baudrate = baudrate;
    if (FieldAlarmRs485_PrepareChannelAtBaud(channel, baudrate) != 0) {
        printf("[ALARM RS485] channel init failed ch=%u baud=%u\n",
               channel, baudrate);
        return -1;
    }

    ret = FieldAlarmRs485_RunControlStepAtCurrentBaud(channel, reg, value);
    return ret;
}

static int FieldAlarmRs485_RunControlStep(uint8_t step, uint16_t reg, uint16_t value)
{
    int ret;

    ret = FieldAlarmRs485_RunControlStepOnChannel(
        step,
        (uint8_t)RS485_ALARM_CHANNEL,
        reg,
        value,
        RS485_ALARM_BAUDRATE);

#if RS485_ALARM_CHANNEL_SCAN
    if (ret != 0) {
        uint8_t alternate_channel = FieldAlarmRs485_GetAlternateChannel();
        printf("[ALARM RS485] retry alternate channel=%u after ch=%u result=%s\n",
               alternate_channel,
               (uint8_t)RS485_ALARM_CHANNEL,
               RS485_ModbusStatusName(ret));
        ret = FieldAlarmRs485_RunControlStepOnChannel(
            step,
            alternate_channel,
            reg,
            value,
            RS485_ALARM_BAUDRATE);
    }
#endif

#if RS485_ALARM_BAUDRATE_FALLBACK != 0 && RS485_ALARM_BAUDRATE_FALLBACK != RS485_ALARM_BAUDRATE
    if (ret != 0) {
        printf("[ALARM RS485] retry fallback baud=%u after result=%s\n",
               RS485_ALARM_BAUDRATE_FALLBACK,
               RS485_ModbusStatusName(ret));
        ret = FieldAlarmRs485_RunControlStepOnChannel(
            step,
            (uint8_t)RS485_ALARM_CHANNEL,
            reg,
            value,
            RS485_ALARM_BAUDRATE_FALLBACK);
    }
#endif
    return ret;
}

const FieldAlarmRs485Diag *FieldAlarmRs485_GetLastDiag(void)
{
    return &g_last_alarm_diag;
}

const char *FieldAlarmRs485_ResultName(int code)
{
    return RS485_ModbusStatusName(code);
}

int FieldAlarmRs485_SetEnabled(int enabled)
{
    int first_ret;
    int second_ret;

    FieldAlarmRs485_ResetStepDiag(0, 0, 0);

    if (!ENABLE_RS485_ALARM) {
        return -1;
    }

    if (enabled) {
        first_ret = FieldAlarmRs485_RunControlStep(
            1,
            RS485_ALARM_LIGHT_REG,
            RS485_ALARM_LIGHT_FLASH_VALUE);

        /*
         * YX75R may execute the write while the RK2206 side misses the echo on
         * the isolated RS485 path. Do not abort before the audio command, or a
         * missing light echo prevents the real sound test.
         */
        second_ret = FieldAlarmRs485_RunControlStep(
            2,
            RS485_ALARM_PLAY_FILE_REG,
            RS485_ALARM_PLAY_FILE_VALUE);
        if (second_ret != 0) {
            return second_ret;
        }
        return first_ret;
    }

    first_ret = FieldAlarmRs485_RunControlStep(
        1,
        RS485_ALARM_LIGHT_REG,
        RS485_ALARM_LIGHT_OFF_VALUE);

    second_ret = FieldAlarmRs485_RunControlStep(
        2,
        RS485_ALARM_STOP_REG,
        RS485_ALARM_STOP_VALUE);
    if (second_ret != 0) {
        return second_ret;
    }
    return first_ret;
}

static int FieldAlarmRs485_SendRawPairOnChannel(
    uint8_t channel,
    const uint8_t *first_frame,
    unsigned int first_len,
    const uint8_t *second_frame,
    unsigned int second_len
)
{
    int first_ret;
    int second_ret;

    if (FieldAlarmRs485_PrepareChannelAtBaud(channel, RS485_ALARM_BAUDRATE) != 0) {
        printf("[ALARM RAW] channel init failed ch=%u baud=%u\n", channel, RS485_ALARM_BAUDRATE);
        return RS485_MODBUS_ERR_INVALID;
    }

    first_ret = RS485_ModbusRawWriteOnChannel(channel, first_frame, first_len, 80U);
    LOS_Msleep(120);
    second_ret = RS485_ModbusRawWriteOnChannel(channel, second_frame, second_len, 80U);

    printf("[ALARM RAW] ch=%u first=%s second=%s\n",
           channel,
           RS485_ModbusStatusName(first_ret),
           RS485_ModbusStatusName(second_ret));

    return second_ret != 0 ? second_ret : first_ret;
}

int FieldAlarmRs485_SendRawDiagnostic(int enabled)
{
    const uint8_t *first_frame;
    const uint8_t *second_frame;
    unsigned int first_len;
    unsigned int second_len;
    uint8_t primary_channel = (uint8_t)RS485_ALARM_CHANNEL;
    uint8_t alternate_channel = FieldAlarmRs485_GetAlternateChannel();
    int primary_ret;
    int alternate_ret;

    FieldAlarmRs485_ResetStepDiag(9, 0, 0);
    g_last_alarm_diag.baudrate = RS485_ALARM_BAUDRATE;

    if (!ENABLE_RS485_ALARM) {
        return RS485_MODBUS_ERR_INVALID;
    }

    if (enabled) {
        first_frame = YX75R_RAW_LIGHT_FLASH;
        first_len = sizeof(YX75R_RAW_LIGHT_FLASH);
        second_frame = YX75R_RAW_PLAY_FILE;
        second_len = sizeof(YX75R_RAW_PLAY_FILE);
        g_last_alarm_diag.reg = RS485_ALARM_PLAY_FILE_REG;
        g_last_alarm_diag.value = RS485_ALARM_PLAY_FILE_VALUE;
    } else {
        first_frame = YX75R_RAW_LIGHT_OFF;
        first_len = sizeof(YX75R_RAW_LIGHT_OFF);
        second_frame = YX75R_RAW_STOP;
        second_len = sizeof(YX75R_RAW_STOP);
        g_last_alarm_diag.reg = RS485_ALARM_STOP_REG;
        g_last_alarm_diag.value = RS485_ALARM_STOP_VALUE;
    }

    primary_ret = FieldAlarmRs485_SendRawPairOnChannel(
        primary_channel,
        first_frame,
        first_len,
        second_frame,
        second_len);

    LOS_Msleep(150);

    alternate_ret = FieldAlarmRs485_SendRawPairOnChannel(
        alternate_channel,
        first_frame,
        first_len,
        second_frame,
        second_len);

    g_last_alarm_diag.channel = alternate_channel;
    g_last_alarm_diag.primary_ret = primary_ret;
    g_last_alarm_diag.fallback_ret = alternate_ret;
    g_last_alarm_diag.final_ret = alternate_ret != 0 ? alternate_ret : primary_ret;
    g_last_alarm_diag.used_fallback = 1;

    return (primary_ret == 0 || alternate_ret == 0) ? 0 : g_last_alarm_diag.final_ret;
}
