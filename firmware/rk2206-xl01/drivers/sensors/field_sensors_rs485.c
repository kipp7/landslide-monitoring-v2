#include "field_sensors_rs485.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "los_task.h"
#include "../../config/app_config.h"
#include "../../utils/watchdog_mgr.h"
#include "rs485_modbus.h"
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

#ifndef SC16IS752_ALT_XTAL_HZ
#define SC16IS752_ALT_XTAL_HZ 14745600UL
#endif

#define MODBUS_FC_READ_HOLDING_REGISTERS 0x03U
#define MODBUS_FC_READ_INPUT_REGISTERS   0x04U

typedef struct {
    unsigned int baudrate;
    unsigned long xtal_hz;
} Rs485ProbeUartConfig;

static float SignedRegisterToScaledFloat(uint16_t value, float scale)
{
    return (float)((int16_t)value) * scale;
}

static int ReadTiltRegistersWithFunction(
    uint8_t channel,
    uint8_t function_code,
    uint8_t addr,
    uint16_t *regs,
    unsigned int reg_capacity,
    unsigned int timeout_ms)
{
    return RS485_ModbusReadRegistersWithTimeoutOnChannel(
        channel,
        function_code,
        addr,
        RS485_TILT_REG_START,
        RS485_TILT_REG_COUNT,
        regs,
        reg_capacity,
        timeout_ms);
}

static int ReadTiltRegisters(uint8_t channel, uint8_t addr, uint16_t *regs, unsigned int reg_capacity)
{
    return ReadTiltRegistersWithFunction(
        channel,
        MODBUS_FC_READ_HOLDING_REGISTERS,
        addr,
        regs,
        reg_capacity,
        RS485_RESPONSE_TIMEOUT_MS);
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
    return SC16IS752_UartInit((Sc16is752Channel)channel, baudrate);
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
    return RS485_ModbusInit();
}

int FieldRs485_Read(FieldRs485Readings *out)
{
    int any_valid = 0;

    if (out == NULL) {
        return -1;
    }

    memset(out, 0, sizeof(*out));

#if ENABLE_RS485_SOIL_SENSOR
    {
#if RS485_SOIL_HAS_EC
        static int soil_ec_supported = 0;
        static int soil_ec_unavailable_reported = 0;
        static unsigned int soil_ec_reprobe_countdown = 0U;
#endif
        uint16_t regs[RS485_SOIL_REG_COUNT] = {0};
        (void)ReconfigureRs485ChannelWithClock(RS485_SOIL_CHANNEL, RS485_BAUDRATE, SC16IS752_XTAL_HZ);
        if (RS485_ModbusReadHoldingRegistersOnChannel(
                RS485_SOIL_CHANNEL,
                RS485_SOIL_ADDR,
                RS485_SOIL_REG_START,
                RS485_SOIL_REG_COUNT,
                regs,
                RS485_SOIL_REG_COUNT) == 0) {
            out->soil_moisture_pct =
                (float)regs[RS485_SOIL_MOISTURE_REG_INDEX] * RS485_SOIL_MOISTURE_SCALE;
            out->soil_temperature_c =
                SignedRegisterToScaledFloat(regs[RS485_SOIL_TEMPERATURE_REG_INDEX], RS485_SOIL_TEMPERATURE_SCALE);
            out->soil_valid = 1;
            any_valid = 1;
#if RS485_SOIL_HAS_EC
            if (soil_ec_supported || soil_ec_reprobe_countdown == 0U) {
                uint16_t ec_reg = 0;
                int ec_read_ret;

                LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
                ec_read_ret = RS485_ModbusReadHoldingRegistersOnChannel(
                    RS485_SOIL_CHANNEL,
                    RS485_SOIL_ADDR,
                    RS485_SOIL_EC_REG,
                    1,
                    &ec_reg,
                    1);
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
        LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
    }
#endif

#if ENABLE_RS485_TILT_SENSOR
    {
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
                RS485_RESPONSE_TIMEOUT_MS);
        } else {
            uint8_t fallback_channel = (RS485_TILT_CHANNEL == RS485_CHANNEL_1) ? RS485_CHANNEL_2 : RS485_CHANNEL_1;
            read_ret = ReadTiltRegisters(RS485_TILT_CHANNEL, RS485_TILT_ADDR, regs, RS485_TILT_REG_COUNT);
            if (read_ret != 0) {
                memset(regs, 0, sizeof(regs));
                read_ret = ReadTiltRegisters(fallback_channel, RS485_TILT_ADDR, regs, RS485_TILT_REG_COUNT);
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
            RS485_RESPONSE_TIMEOUT_MS);
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
        LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
    }
#endif

#if ENABLE_RS485_RAIN_SENSOR
    {
        uint16_t regs[RS485_RAIN_REG_COUNT] = {0};
        if (RS485_ModbusReadHoldingRegistersOnChannel(
                RS485_RAIN_CHANNEL,
                RS485_RAIN_ADDR,
                RS485_RAIN_REG_START,
                RS485_RAIN_REG_COUNT,
                regs,
                RS485_RAIN_REG_COUNT) == 0) {
            out->rain_total_mm = (float)regs[0] * RS485_RAIN_TOTAL_SCALE;
            out->rain_valid = 1;
            any_valid = 1;
            printf("[RS485 RAIN] total=%.1fmm\n", out->rain_total_mm);
        }
        LOS_Msleep(RS485_INTER_REQUEST_GAP_MS);
    }
#endif

    return any_valid ? 0 : -1;
}
