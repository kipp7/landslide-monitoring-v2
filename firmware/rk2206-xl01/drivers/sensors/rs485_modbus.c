#include "rs485_modbus.h"

#include <stdio.h>
#include <string.h>
#include "iot_errno.h"
#include "iot_uart.h"
#include "los_task.h"
#include "los_tick.h"
#include "../../config/app_config.h"

#ifndef RS485_TRANSPORT_SC16IS752
#define RS485_TRANSPORT_SC16IS752 0
#endif

#if RS485_TRANSPORT_SC16IS752
#include "sc16is752_driver.h"
#endif

#ifndef RS485_UART_ID
#define RS485_UART_ID EUART1_M0
#endif

#ifndef RS485_BAUDRATE
#define RS485_BAUDRATE 9600
#endif

#ifndef RS485_RESPONSE_TIMEOUT_MS
#define RS485_RESPONSE_TIMEOUT_MS 300
#endif

#ifndef RS485_RAW_DIAG_MODE
#define RS485_RAW_DIAG_MODE 0
#endif

#ifndef RS485_EXTERNAL_LOOPBACK_DIAG
#define RS485_EXTERNAL_LOOPBACK_DIAG 0
#endif

#ifndef RS485_DEFAULT_CHANNEL
#define RS485_DEFAULT_CHANNEL 0
#endif

#define MODBUS_READ_HOLDING_REGISTERS 0x03
#define MODBUS_READ_INPUT_REGISTERS 0x04
#define MODBUS_WRITE_SINGLE_REGISTER 0x06
#define MODBUS_MAX_RESPONSE_BYTES 96

static uint8_t g_last_write_response_addr = 0U;
static unsigned int g_last_write_response_bytes = 0U;
static uint8_t g_last_write_response[8] = {0};

const char *RS485_ModbusStatusName(int code)
{
    switch (code) {
        case RS485_MODBUS_OK:
            return "ok";
        case RS485_MODBUS_ERR_INVALID:
            return "invalid";
        case RS485_MODBUS_ERR_WRITE:
            return "write_failed";
        case RS485_MODBUS_ERR_TX_DONE:
            return "tx_not_completed";
        case RS485_MODBUS_ERR_TIMEOUT:
            return "timeout_or_no_full_response";
        case RS485_MODBUS_ERR_ADDR:
            return "unexpected_slave_addr";
        case RS485_MODBUS_ERR_CRC:
            return "crc_mismatch";
        case RS485_MODBUS_ERR_EXCEPTION:
            return "modbus_exception";
        case RS485_MODBUS_ERR_ECHO:
            return "malformed_echo";
        default:
            return "unknown";
    }
}

uint8_t RS485_ModbusGetLastWriteResponseAddr(void)
{
    return g_last_write_response_addr;
}

unsigned int RS485_ModbusGetLastWriteResponseBytes(void)
{
    return g_last_write_response_bytes;
}

unsigned int RS485_ModbusGetLastWriteResponse(uint8_t *out, unsigned int out_capacity)
{
    unsigned int copy_len;

    if (out == NULL || out_capacity == 0U) {
        return 0U;
    }

    copy_len = g_last_write_response_bytes;
    if (copy_len > sizeof(g_last_write_response)) {
        copy_len = sizeof(g_last_write_response);
    }
    if (copy_len > out_capacity) {
        copy_len = out_capacity;
    }

    if (copy_len > 0U) {
        memcpy(out, g_last_write_response, copy_len);
    }
    return copy_len;
}

static uint16_t ModbusCrc16(const uint8_t *data, unsigned int len)
{
    uint16_t crc = 0xFFFF;
    unsigned int i;
    int bit;

    for (i = 0; i < len; ++i) {
        crc ^= data[i];
        for (bit = 0; bit < 8; ++bit) {
            if ((crc & 0x0001U) != 0U) {
                crc = (uint16_t)((crc >> 1) ^ 0xA001U);
            } else {
                crc = (uint16_t)(crc >> 1);
            }
        }
    }

    return crc;
}

static void PrintHexFrame(const char *prefix, const uint8_t *data, unsigned int len)
{
#if RS485_RAW_DIAG_MODE
    unsigned int i;

    if (prefix == NULL || data == NULL) {
        return;
    }

    printf("%s", prefix);
    for (i = 0; i < len; ++i) {
        printf("%02X", data[i]);
        if (i + 1 < len) {
            printf(" ");
        }
    }
    printf("\n");
#else
    (void)prefix;
    (void)data;
    (void)len;
#endif
}

static void DrainPort(uint8_t channel)
{
#if RS485_TRANSPORT_SC16IS752
    SC16IS752_DrainRx((Sc16is752Channel)channel);
#else
    uint8_t buf[32];
    int len;
    int guard = 0;

    (void)channel;
    do {
        len = IoTUartRead(RS485_UART_ID, buf, sizeof(buf));
        guard++;
    } while (len > 0 && guard < 8);
#endif
}

static int WritePort(uint8_t channel, const uint8_t *data, unsigned int len)
{
#if RS485_TRANSPORT_SC16IS752
    return SC16IS752_Write((Sc16is752Channel)channel, data, len);
#else
    (void)channel;
    return IoTUartWrite(RS485_UART_ID, data, len);
#endif
}

static int WaitPortTxDone(uint8_t channel, unsigned int timeout_ms)
{
#if RS485_TRANSPORT_SC16IS752
    return SC16IS752_WaitTxDone((Sc16is752Channel)channel, timeout_ms);
#else
    (void)channel;
    (void)timeout_ms;
    return 0;
#endif
}

static int ReadPort(uint8_t channel, uint8_t *data, unsigned int len)
{
#if RS485_TRANSPORT_SC16IS752
    return SC16IS752_Read((Sc16is752Channel)channel, data, len);
#else
    (void)channel;
    return IoTUartRead(RS485_UART_ID, data, len);
#endif
}

#if RS485_TRANSPORT_SC16IS752 && RS485_EXTERNAL_LOOPBACK_DIAG
static void Rs485ExternalLoopbackOneWay(uint8_t tx_channel, uint8_t rx_channel)
{
    static const uint8_t pattern[] = {0x52, 0x53, 0x34, 0x38, 0x35, 0x21};
    uint8_t rx[sizeof(pattern)] = {0};
    unsigned int received = 0;
    unsigned int waited_ms = 0;
    int written;

    DrainPort(tx_channel);
    DrainPort(rx_channel);

    written = WritePort(tx_channel, pattern, sizeof(pattern));
    while (waited_ms < 500U && received < sizeof(pattern)) {
        int len = ReadPort(rx_channel, rx + received, sizeof(rx) - received);
        if (len > 0) {
            received += (unsigned int)len;
        } else {
            LOS_Msleep(5);
            waited_ms += 5U;
        }
    }

    printf("[RS485-DIAG] external loop tx_ch=%u rx_ch=%u written=%d received=%u rx=",
           tx_channel,
           rx_channel,
           written,
           received);
    for (unsigned int i = 0; i < sizeof(rx); ++i) {
        printf("%02X", rx[i]);
        if (i + 1U < sizeof(rx)) {
            printf(" ");
        }
    }
    printf(" result=%s\n",
           (written == (int)sizeof(pattern) &&
            received == sizeof(pattern) &&
            memcmp(pattern, rx, sizeof(pattern)) == 0)
               ? "OK"
               : "FAIL");
}

static void Rs485ExternalLoopbackDiag(void)
{
    printf("[RS485-DIAG] external loopback requires jumper: J6_A<->J7_A and J6_B<->J7_B, sensor disconnected\n");
    Rs485ExternalLoopbackOneWay(RS485_CHANNEL_1, RS485_CHANNEL_2);
    LOS_Msleep(50);
    Rs485ExternalLoopbackOneWay(RS485_CHANNEL_2, RS485_CHANNEL_1);
}
#endif

int RS485_ModbusInit(void)
{
#if RS485_TRANSPORT_SC16IS752
    printf("[RS485] Initializing Modbus via SC16IS752 baud=%u...\n", RS485_BAUDRATE);
    if (SC16IS752_Init() != 0) {
        printf("[RS485] SC16IS752 init failed\n");
        return -1;
    }
    DrainPort(RS485_CHANNEL_1);
    DrainPort(RS485_CHANNEL_2);
#if RS485_EXTERNAL_LOOPBACK_DIAG
    Rs485ExternalLoopbackDiag();
#endif
    printf("[OK] RS485 Modbus initialized via SC16IS752\n");
    return 0;
#else
    IotUartAttribute uart_attr = {
        .baudRate = RS485_BAUDRATE,
        .dataBits = IOT_UART_DATA_BIT_8,
        .stopBits = IOT_UART_STOP_BIT_1,
        .parity = IOT_UART_PARITY_NONE,
        .rxBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .txBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .pad = IOT_FLOW_CTRL_NONE,
    };
    unsigned int ret;

    printf("[RS485] Initializing Modbus UART id=%u baud=%u...\n", RS485_UART_ID, RS485_BAUDRATE);
    ret = IoTUartInit(RS485_UART_ID, &uart_attr);
    if (ret != IOT_SUCCESS) {
        printf("[RS485] UART init failed: %u\n", ret);
        return -1;
    }

    DrainPort(RS485_DEFAULT_CHANNEL);
    printf("[OK] RS485 Modbus initialized\n");
    return 0;
#endif
}

int RS485_ModbusReadRegistersWithTimeoutOnChannel(
    uint8_t channel,
    uint8_t function_code,
    uint8_t slave_addr,
    uint16_t start_reg,
    uint16_t reg_count,
    uint16_t *out_regs,
    unsigned int out_reg_capacity,
    unsigned int timeout_ms
)
{
    uint8_t request[8];
    uint8_t response[MODBUS_MAX_RESPONSE_BYTES];
    uint16_t crc;
    uint32_t start_tick;
    uint32_t timeout_ticks;
    unsigned int expected_len;
    unsigned int received = 0;
    unsigned int i;

    if ((function_code != MODBUS_READ_HOLDING_REGISTERS && function_code != MODBUS_READ_INPUT_REGISTERS) ||
        slave_addr == 0U || reg_count == 0U || out_regs == NULL || out_reg_capacity < reg_count) {
        return -1;
    }

    expected_len = 5U + ((unsigned int)reg_count * 2U);
    if (expected_len > sizeof(response)) {
        return -1;
    }

    request[0] = slave_addr;
    request[1] = function_code;
    request[2] = (uint8_t)(start_reg >> 8);
    request[3] = (uint8_t)(start_reg & 0xFFU);
    request[4] = (uint8_t)(reg_count >> 8);
    request[5] = (uint8_t)(reg_count & 0xFFU);
    crc = ModbusCrc16(request, 6);
    request[6] = (uint8_t)(crc & 0xFFU);
    request[7] = (uint8_t)(crc >> 8);

    DrainPort(channel);
#if RS485_RAW_DIAG_MODE
    {
        char prefix[40];
        snprintf(prefix, sizeof(prefix), "[RS485 TX ch=%u fc=0x%02X] ", channel, function_code);
        PrintHexFrame(prefix, request, sizeof(request));
    }
#else
    PrintHexFrame("[RS485 TX] ", request, sizeof(request));
#endif

    {
        int written = WritePort(channel, request, sizeof(request));
        if (written != (int)sizeof(request)) {
            printf("[RS485] write failed ch=%u slave=%u reg=0x%04X count=%u written=%d\n",
                   channel, slave_addr, start_reg, reg_count, written);
            return -1;
        }
    }

    if (WaitPortTxDone(channel, 50U) != 0) {
        printf("[RS485] tx not completed ch=%u slave=%u reg=0x%04X count=%u\n",
               channel, slave_addr, start_reg, reg_count);
        return -1;
    }

    memset(response, 0, sizeof(response));
    start_tick = (uint32_t)LOS_TickCountGet();
    timeout_ticks = LOS_MS2Tick(timeout_ms);
    if (timeout_ticks == 0U) {
        timeout_ticks = 1U;
    }

    while (((uint32_t)LOS_TickCountGet() - start_tick) <= timeout_ticks) {
        int len;

        if (received >= expected_len) {
            break;
        }

        len = ReadPort(channel, response + received, expected_len - received);
        if (len > 0) {
            received += (unsigned int)len;
            if (received >= 5U &&
                response[0] == slave_addr &&
                (response[1] & 0x80U) != 0U) {
                expected_len = 5U;
                break;
            }
            continue;
        }

        LOS_Msleep(5);
    }

    if (received > 0U) {
#if RS485_RAW_DIAG_MODE
        char prefix[40];
        snprintf(prefix, sizeof(prefix), "[RS485 RX ch=%u fc=0x%02X] ", channel, function_code);
        PrintHexFrame(prefix, response, received);
#else
        PrintHexFrame("[RS485 RX] ", response, received);
#endif
    }

    if (received < 5U) {
#if RS485_RAW_DIAG_MODE
        printf("[RS485] timeout/no response ch=%u fc=0x%02X slave=%u reg=0x%04X count=%u bytes=%u\n",
               channel, function_code, slave_addr, start_reg, reg_count, received);
#endif
        return -1;
    }

    if (response[0] != slave_addr) {
        printf("[RS485] unexpected slave addr got=%u expected=%u\n", response[0], slave_addr);
        return -1;
    }

    crc = ModbusCrc16(response, received - 2U);
    if (response[received - 2U] != (uint8_t)(crc & 0xFFU) ||
        response[received - 1U] != (uint8_t)(crc >> 8)) {
        printf("[RS485] CRC mismatch slave=%u bytes=%u\n", slave_addr, received);
        return -1;
    }

    if ((response[1] & 0x80U) != 0U) {
        printf("[RS485] Modbus exception slave=%u func=0x%02X code=0x%02X\n",
               slave_addr, response[1], response[2]);
        return -1;
    }

    if (response[1] != function_code ||
        response[2] != (uint8_t)(reg_count * 2U) ||
        received < expected_len) {
        printf("[RS485] malformed response slave=%u func=0x%02X byte_count=%u bytes=%u\n",
               slave_addr, response[1], response[2], received);
        return -1;
    }

    for (i = 0; i < reg_count; ++i) {
        unsigned int offset = 3U + (i * 2U);
        out_regs[i] = (uint16_t)(((uint16_t)response[offset] << 8) | response[offset + 1U]);
    }

    return 0;
}

int RS485_ModbusReadHoldingRegistersOnChannel(
    uint8_t channel,
    uint8_t slave_addr,
    uint16_t start_reg,
    uint16_t reg_count,
    uint16_t *out_regs,
    unsigned int out_reg_capacity
)
{
    return RS485_ModbusReadRegistersWithTimeoutOnChannel(
        channel,
        MODBUS_READ_HOLDING_REGISTERS,
        slave_addr,
        start_reg,
        reg_count,
        out_regs,
        out_reg_capacity,
        RS485_RESPONSE_TIMEOUT_MS);
}

int RS485_ModbusReadHoldingRegisters(
    uint8_t slave_addr,
    uint16_t start_reg,
    uint16_t reg_count,
    uint16_t *out_regs,
    unsigned int out_reg_capacity
)
{
    return RS485_ModbusReadHoldingRegistersOnChannel(
        RS485_DEFAULT_CHANNEL,
        slave_addr,
        start_reg,
        reg_count,
        out_regs,
        out_reg_capacity
    );
}

int RS485_ModbusWriteSingleRegisterOnChannel(
    uint8_t channel,
    uint8_t slave_addr,
    uint16_t reg_addr,
    uint16_t value,
    unsigned int timeout_ms
)
{
    return RS485_ModbusWriteSingleRegisterOnChannelExpectResponseAddr(
        channel,
        slave_addr,
        slave_addr,
        reg_addr,
        value,
        timeout_ms);
}

int RS485_ModbusWriteSingleRegisterOnChannelExpectResponseAddr(
    uint8_t channel,
    uint8_t slave_addr,
    uint8_t expected_response_addr,
    uint16_t reg_addr,
    uint16_t value,
    unsigned int timeout_ms
)
{
    return RS485_ModbusWriteSingleRegisterOnChannelAllowResponseAddrs(
        channel,
        slave_addr,
        expected_response_addr,
        expected_response_addr,
        reg_addr,
        value,
        timeout_ms);
}

int RS485_ModbusWriteSingleRegisterOnChannelAllowResponseAddrs(
    uint8_t channel,
    uint8_t slave_addr,
    uint8_t allowed_response_addr_1,
    uint8_t allowed_response_addr_2,
    uint16_t reg_addr,
    uint16_t value,
    unsigned int timeout_ms
)
{
    uint8_t request[8];
    uint8_t response[8];
    uint16_t crc;
    uint32_t start_tick;
    uint32_t timeout_ticks;
    unsigned int received = 0;

    g_last_write_response_addr = 0U;
    g_last_write_response_bytes = 0U;
    memset(g_last_write_response, 0, sizeof(g_last_write_response));

    if (slave_addr == 0U || allowed_response_addr_1 == 0U || allowed_response_addr_2 == 0U) {
        return RS485_MODBUS_ERR_INVALID;
    }

    request[0] = slave_addr;
    request[1] = MODBUS_WRITE_SINGLE_REGISTER;
    request[2] = (uint8_t)(reg_addr >> 8);
    request[3] = (uint8_t)(reg_addr & 0xFFU);
    request[4] = (uint8_t)(value >> 8);
    request[5] = (uint8_t)(value & 0xFFU);
    crc = ModbusCrc16(request, 6);
    request[6] = (uint8_t)(crc & 0xFFU);
    request[7] = (uint8_t)(crc >> 8);

    DrainPort(channel);
#if RS485_RAW_DIAG_MODE
    {
        char prefix[40];
        snprintf(prefix, sizeof(prefix), "[RS485 TX ch=%u fc=0x06] ", channel);
        PrintHexFrame(prefix, request, sizeof(request));
    }
#else
    PrintHexFrame("[RS485 TX] ", request, sizeof(request));
#endif

    {
        int written = WritePort(channel, request, sizeof(request));
        if (written != (int)sizeof(request)) {
            printf("[RS485] write single register failed ch=%u slave=%u reg=0x%04X value=0x%04X written=%d\n",
                   channel, slave_addr, reg_addr, value, written);
            return RS485_MODBUS_ERR_WRITE;
        }
    }

    if (WaitPortTxDone(channel, 50U) != 0) {
        printf("[RS485] write single tx not completed ch=%u slave=%u reg=0x%04X value=0x%04X\n",
               channel, slave_addr, reg_addr, value);
        return RS485_MODBUS_ERR_TX_DONE;
    }

    memset(response, 0, sizeof(response));
    start_tick = (uint32_t)LOS_TickCountGet();
    timeout_ticks = LOS_MS2Tick(timeout_ms);
    if (timeout_ticks == 0U) {
        timeout_ticks = 1U;
    }

    while (((uint32_t)LOS_TickCountGet() - start_tick) <= timeout_ticks) {
        int len;

        if (received >= sizeof(response)) {
            break;
        }

        len = ReadPort(channel, response + received, sizeof(response) - received);
        if (len > 0) {
            received += (unsigned int)len;
            g_last_write_response_bytes = received;
            if (received > 0U) {
                g_last_write_response_addr = response[0];
            }
            memcpy(g_last_write_response, response, received);
            continue;
        }

        LOS_Msleep(5);
    }

    if (received > 0U) {
        g_last_write_response_bytes = received;
        g_last_write_response_addr = response[0];
#if RS485_RAW_DIAG_MODE
        char prefix[40];
        snprintf(prefix, sizeof(prefix), "[RS485 RX ch=%u fc=0x06] ", channel);
        PrintHexFrame(prefix, response, received);
#else
        PrintHexFrame("[RS485 RX] ", response, received);
#endif
    }

    if (received < sizeof(response)) {
        printf("[RS485] write single timeout/no full response ch=%u slave=%u reg=0x%04X value=0x%04X bytes=%u\n",
               channel, slave_addr, reg_addr, value, received);
        return RS485_MODBUS_ERR_TIMEOUT;
    }

    if (response[0] != allowed_response_addr_1 && response[0] != allowed_response_addr_2) {
        printf("[RS485] write single unexpected slave addr got=%u expected=%u/%u sent=%u\n",
               response[0], allowed_response_addr_1, allowed_response_addr_2, slave_addr);
        return RS485_MODBUS_ERR_ADDR;
    }

    crc = ModbusCrc16(response, sizeof(response) - 2U);
    if (response[sizeof(response) - 2U] != (uint8_t)(crc & 0xFFU) ||
        response[sizeof(response) - 1U] != (uint8_t)(crc >> 8)) {
        printf("[RS485] write single CRC mismatch slave=%u bytes=%u\n", slave_addr, received);
        return RS485_MODBUS_ERR_CRC;
    }

    if ((response[1] & 0x80U) != 0U) {
        printf("[RS485] write single exception slave=%u func=0x%02X code=0x%02X\n",
               slave_addr, response[1], response[2]);
        return RS485_MODBUS_ERR_EXCEPTION;
    }

    if (response[1] != request[1] ||
        response[2] != request[2] ||
        response[3] != request[3] ||
        response[4] != request[4] ||
        response[5] != request[5]) {
        printf("[RS485] write single malformed echo slave=%u allowed=%u/%u reg=0x%04X value=0x%04X\n",
               slave_addr, allowed_response_addr_1, allowed_response_addr_2, reg_addr, value);
        return RS485_MODBUS_ERR_ECHO;
    }

    return RS485_MODBUS_OK;
}

int RS485_ModbusRawWriteOnChannel(
    uint8_t channel,
    const uint8_t *data,
    unsigned int len,
    unsigned int tx_done_timeout_ms
)
{
    int written;

    if (data == NULL || len == 0U) {
        return RS485_MODBUS_ERR_INVALID;
    }

    DrainPort(channel);

    printf("[RS485 RAW TX ch=%u] ", channel);
    for (unsigned int i = 0U; i < len; ++i) {
        printf("%02X", data[i]);
        if (i + 1U < len) {
            printf(" ");
        }
    }
    printf("\n");

    written = WritePort(channel, data, len);
    if (written != (int)len) {
        printf("[RS485 RAW TX FAIL] ch=%u len=%u written=%d\n", channel, len, written);
        return RS485_MODBUS_ERR_WRITE;
    }

    if (WaitPortTxDone(channel, tx_done_timeout_ms) != 0) {
        printf("[RS485 RAW TX WAIT FAIL] ch=%u len=%u\n", channel, len);
        return RS485_MODBUS_ERR_TX_DONE;
    }

    return RS485_MODBUS_OK;
}
