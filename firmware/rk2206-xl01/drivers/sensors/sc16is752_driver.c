#include "sc16is752_driver.h"

#include <stdio.h>
#include <string.h>
#include "iot_errno.h"
#include "iot_i2c.h"
#include "los_task.h"
#include "../../config/app_config.h"

#ifndef SC16IS752_I2C_ADDR
#define SC16IS752_I2C_ADDR 0x48
#endif

#ifndef SC16IS752_XTAL_HZ
#define SC16IS752_XTAL_HZ 14745600UL
#endif

#ifndef I2C_IDX
#define I2C_IDX EI2C0_M0
#endif

#ifndef I2C_BAUDRATE
#define I2C_BAUDRATE EI2C_FRE_100K
#endif

#define SC16IS752_REG_RHR_THR 0x00
#define SC16IS752_REG_IER     0x01
#define SC16IS752_REG_FCR     0x02
#define SC16IS752_REG_LCR     0x03
#define SC16IS752_REG_MCR     0x04
#define SC16IS752_REG_LSR     0x05
#define SC16IS752_REG_SPR     0x07
#define SC16IS752_REG_TXLVL   0x08
#define SC16IS752_REG_RXLVL   0x09
#define SC16IS752_REG_IOCTRL  0x0E
#define SC16IS752_REG_DLL     0x00
#define SC16IS752_REG_DLH     0x01

#define SC16IS752_LSR_DATA_READY 0x01
#define SC16IS752_LSR_THR_EMPTY  0x20
#define SC16IS752_LSR_TX_EMPTY   0x40
#define SC16IS752_LCR_8N1        0x03
#define SC16IS752_LCR_DLAB       0x80
#define SC16IS752_FCR_ENABLE_AND_RESET 0x07
#define SC16IS752_MCR_LOOPBACK 0x10
#define SC16IS752_IOCTRL_RESET   0x08
#define SC16IS752_FIFO_SIZE      64
#define SC16IS752_I2C_RETRY_COUNT 3
#define SC16IS752_I2C_RETRY_DELAY_MS 2

#ifndef SC16IS752_I2C_BUS_SCAN_DIAG
#define SC16IS752_I2C_BUS_SCAN_DIAG 0
#endif

#ifndef SC16IS752_SELF_TEST_DIAG
#define SC16IS752_SELF_TEST_DIAG 0
#endif

#ifndef SC16IS752_UART_CONFIG_LOG
#define SC16IS752_UART_CONFIG_LOG 0
#endif

static uint8_t g_sc16is752_i2c_addr = SC16IS752_I2C_ADDR;
static unsigned long g_sc16is752_xtal_hz = SC16IS752_XTAL_HZ;

#if SC16IS752_I2C_BUS_SCAN_DIAG
typedef struct {
    unsigned int id;
    const char *name;
} Sc16is752I2cBusDiag;

static void Sc16is752_PrintI2cBusScan(void)
{
    static const Sc16is752I2cBusDiag buses[] = {
        {EI2C0_M2, "EI2C0_M2 PA0/PA1"},
        {EI2C1_M2, "EI2C1_M2 PA2/PA3"},
        {EI2C0_M0, "EI2C0_M0 PB4/PB5"},
        {EI2C1_M0, "EI2C1_M0 PB6/PB7"},
        {EI2C1_M1, "EI2C1_M1 PC1/PC2"},
        {EI2C0_M1, "EI2C0_M1 PC6/PC7"},
        {EI2C2_M0, "EI2C2_M0 PD5/PD6"},
    };
    unsigned short addrs[16];
    unsigned int i;

    printf("[SC16IS752-DIAG] I2C bus scan begin\n");
    for (i = 0; i < sizeof(buses) / sizeof(buses[0]); ++i) {
        unsigned int count;
        unsigned int j;
        unsigned int ret = IoTI2cInit(buses[i].id, EI2C_FRE_100K);
        if (ret != IOT_SUCCESS) {
            printf("[SC16IS752-DIAG] %s init failed ret=%u\n", buses[i].name, ret);
            continue;
        }

        memset(addrs, 0, sizeof(addrs));
        count = IoTI2cScan(buses[i].id, addrs, sizeof(addrs) / sizeof(addrs[0]));
        printf("[SC16IS752-DIAG] %s found=%u", buses[i].name, count);
        for (j = 0; j < count && j < sizeof(addrs) / sizeof(addrs[0]); ++j) {
            printf(" 0x%02X", addrs[j]);
        }
        printf("\n");
        (void)IoTI2cDeinit(buses[i].id);
    }
    printf("[SC16IS752-DIAG] I2C bus scan end\n");
}
#endif

static uint8_t Sc16is752_SubAddress(uint8_t reg, Sc16is752Channel channel)
{
    return (uint8_t)(((reg & 0x0FU) << 3) | (((uint8_t)channel & 0x01U) << 1));
}

static int Sc16is752_WriteBytes(uint8_t sub_addr, const uint8_t *data, unsigned int len)
{
    uint8_t buffer[SC16IS752_FIFO_SIZE + 1];
    int attempt;

    if (data == NULL || len == 0 || len > SC16IS752_FIFO_SIZE) {
        return -1;
    }

    buffer[0] = sub_addr;
    memcpy(&buffer[1], data, len);

    for (attempt = 0; attempt < SC16IS752_I2C_RETRY_COUNT; ++attempt) {
        unsigned int ret = IoTI2cWrite(I2C_IDX, g_sc16is752_i2c_addr, buffer, len + 1U);
        if (ret == IOT_SUCCESS) {
            return 0;
        }
        if (attempt + 1 < SC16IS752_I2C_RETRY_COUNT) {
            LOS_Msleep(SC16IS752_I2C_RETRY_DELAY_MS);
        }
    }

    return -2;
}

static int Sc16is752_ReadBytes(uint8_t sub_addr, uint8_t *data, unsigned int len)
{
    int attempt;

    if (data == NULL || len == 0) {
        return -1;
    }

    for (attempt = 0; attempt < SC16IS752_I2C_RETRY_COUNT; ++attempt) {
        unsigned int ret = IoTI2cWrite(I2C_IDX, g_sc16is752_i2c_addr, &sub_addr, 1);
        if (ret == IOT_SUCCESS) {
            ret = IoTI2cRead(I2C_IDX, g_sc16is752_i2c_addr, data, len);
            if (ret == IOT_SUCCESS) {
                return 0;
            }
        }
        if (attempt + 1 < SC16IS752_I2C_RETRY_COUNT) {
            LOS_Msleep(SC16IS752_I2C_RETRY_DELAY_MS);
        }
    }

    return -2;
}

static int Sc16is752_WriteReg(Sc16is752Channel channel, uint8_t reg, uint8_t value)
{
    uint8_t sub_addr = Sc16is752_SubAddress(reg, channel);
    return Sc16is752_WriteBytes(sub_addr, &value, 1);
}

static int Sc16is752_ReadReg(Sc16is752Channel channel, uint8_t reg, uint8_t *value)
{
    uint8_t sub_addr = Sc16is752_SubAddress(reg, channel);
    return Sc16is752_ReadBytes(sub_addr, value, 1);
}

static unsigned int Sc16is752_CalcDivisor(unsigned int baudrate)
{
    unsigned int divisor;
    unsigned long xtal_hz = g_sc16is752_xtal_hz;

    if (baudrate == 0U) {
        baudrate = 4800U;
    }
    if (xtal_hz == 0UL) {
        xtal_hz = SC16IS752_XTAL_HZ;
    }

    divisor = (unsigned int)((xtal_hz + (baudrate * 8U)) / (baudrate * 16U));
    if (divisor == 0U) {
        divisor = 1U;
    }
    if (divisor > 0xFFFFU) {
        divisor = 0xFFFFU;
    }

    return divisor;
}

void SC16IS752_SetClockHz(unsigned long xtal_hz)
{
    if (xtal_hz == 0UL) {
        xtal_hz = SC16IS752_XTAL_HZ;
    }
    g_sc16is752_xtal_hz = xtal_hz;
}

static int Sc16is752_ProbeAddress(uint8_t addr, uint8_t *lsr)
{
    g_sc16is752_i2c_addr = addr;
    return Sc16is752_ReadReg(SC16IS752_CHANNEL_A, SC16IS752_REG_LSR, lsr);
}

static int Sc16is752_FindAddress(uint8_t *lsr)
{
    uint8_t addr;

    if (Sc16is752_ProbeAddress(SC16IS752_I2C_ADDR, lsr) == 0) {
        return 0;
    }

    printf("[SC16IS752] no response at configured addr=0x%02X; scanning 0x48..0x57\n",
           SC16IS752_I2C_ADDR);

    for (addr = 0x48U; addr <= 0x57U; ++addr) {
        if (addr == SC16IS752_I2C_ADDR) {
            continue;
        }
        if (Sc16is752_ProbeAddress(addr, lsr) == 0) {
            printf("[SC16IS752] found device at addr=0x%02X\n", addr);
            return 0;
        }
    }

    g_sc16is752_i2c_addr = SC16IS752_I2C_ADDR;
    return -1;
}

static int Sc16is752_ScratchpadTest(Sc16is752Channel channel)
{
    uint8_t value = 0;
    uint8_t pattern = (channel == SC16IS752_CHANNEL_A) ? 0xA5U : 0x5AU;

    if (Sc16is752_WriteReg(channel, SC16IS752_REG_SPR, pattern) != 0 ||
        Sc16is752_ReadReg(channel, SC16IS752_REG_SPR, &value) != 0) {
        printf("[SC16IS752-DIAG] scratchpad access failed channel=%c\n",
               channel == SC16IS752_CHANNEL_A ? 'A' : 'B');
        return -1;
    }

    if (value != pattern) {
        printf("[SC16IS752-DIAG] scratchpad mismatch channel=%c wrote=0x%02X read=0x%02X\n",
               channel == SC16IS752_CHANNEL_A ? 'A' : 'B',
               pattern,
               value);
        return -2;
    }

    printf("[SC16IS752-DIAG] scratchpad OK channel=%c value=0x%02X\n",
           channel == SC16IS752_CHANNEL_A ? 'A' : 'B',
           value);
    return 0;
}

static int Sc16is752_InternalLoopbackTest(Sc16is752Channel channel)
{
    static const uint8_t pattern[] = {0x55, 0xA5, 0x5A, 0xC3};
    uint8_t rx[sizeof(pattern)] = {0};
    uint32_t waited_ms = 0;
    uint8_t rxlvl = 0;
    uint8_t lsr = 0;
    uint8_t mcr = 0;
    unsigned int received = 0;
    int written;

    if (Sc16is752_WriteReg(channel, SC16IS752_REG_FCR, SC16IS752_FCR_ENABLE_AND_RESET) != 0 ||
        Sc16is752_WriteReg(channel, SC16IS752_REG_MCR, SC16IS752_MCR_LOOPBACK) != 0) {
        printf("[SC16IS752-DIAG] byte-fifo internal loopback setup failed channel=%c\n",
               channel == SC16IS752_CHANNEL_A ? 'A' : 'B');
        return -1;
    }

    (void)Sc16is752_ReadReg(channel, SC16IS752_REG_MCR, &mcr);
    written = SC16IS752_Write(channel, pattern, sizeof(pattern));
    if (written != (int)sizeof(pattern)) {
        (void)Sc16is752_WriteReg(channel, SC16IS752_REG_MCR, 0x00);
        printf("[SC16IS752-DIAG] byte-fifo internal loopback write failed channel=%c written=%d mcr=0x%02X\n",
               channel == SC16IS752_CHANNEL_A ? 'A' : 'B',
               written,
               mcr);
        return -2;
    }

    while (waited_ms < 150U && received < sizeof(pattern)) {
        int len;

        (void)Sc16is752_ReadReg(channel, SC16IS752_REG_RXLVL, &rxlvl);
        (void)Sc16is752_ReadReg(channel, SC16IS752_REG_LSR, &lsr);
        len = SC16IS752_Read(channel, rx + received, sizeof(rx) - received);
        if (len > 0) {
            received += (unsigned int)len;
        }
        if (received >= sizeof(pattern)) {
            break;
        }
        LOS_Msleep(1);
        waited_ms++;
    }

    if (received < sizeof(pattern) || memcmp(pattern, rx, sizeof(pattern)) != 0) {
        (void)Sc16is752_WriteReg(channel, SC16IS752_REG_FCR, SC16IS752_FCR_ENABLE_AND_RESET);
        (void)Sc16is752_WriteReg(channel, SC16IS752_REG_MCR, 0x00);
        printf("[SC16IS752-DIAG] byte-fifo internal loopback failed channel=%c written=%d received=%u rxlvl=%u lsr=0x%02X mcr=0x%02X rx=%02X %02X %02X %02X\n",
               channel == SC16IS752_CHANNEL_A ? 'A' : 'B',
               written,
               received,
               rxlvl,
               lsr,
               mcr,
               rx[0], rx[1], rx[2], rx[3]);
        return -3;
    }

    (void)Sc16is752_WriteReg(channel, SC16IS752_REG_FCR, SC16IS752_FCR_ENABLE_AND_RESET);
    (void)Sc16is752_WriteReg(channel, SC16IS752_REG_MCR, 0x00);
    printf("[SC16IS752-DIAG] byte-fifo internal loopback OK channel=%c written=%d received=%u rx=%02X %02X %02X %02X\n",
           channel == SC16IS752_CHANNEL_A ? 'A' : 'B',
           written,
           received,
           rx[0], rx[1], rx[2], rx[3]);
    return 0;
}

int SC16IS752_UartInit(Sc16is752Channel channel, unsigned int baudrate)
{
    unsigned int divisor = Sc16is752_CalcDivisor(baudrate);

    if (Sc16is752_WriteReg(channel, SC16IS752_REG_IER, 0x00) != 0) {
        return -1;
    }
    if (Sc16is752_WriteReg(channel, SC16IS752_REG_LCR, SC16IS752_LCR_DLAB) != 0) {
        return -2;
    }
    if (Sc16is752_WriteReg(channel, SC16IS752_REG_DLL, (uint8_t)(divisor & 0xFFU)) != 0 ||
        Sc16is752_WriteReg(channel, SC16IS752_REG_DLH, (uint8_t)((divisor >> 8) & 0xFFU)) != 0) {
        return -3;
    }
    if (Sc16is752_WriteReg(channel, SC16IS752_REG_LCR, SC16IS752_LCR_8N1) != 0) {
        return -4;
    }
    if (Sc16is752_WriteReg(channel, SC16IS752_REG_FCR, SC16IS752_FCR_ENABLE_AND_RESET) != 0) {
        return -5;
    }
    if (Sc16is752_WriteReg(channel, SC16IS752_REG_MCR, 0x00) != 0) {
        return -6;
    }

#if SC16IS752_UART_CONFIG_LOG
    printf("[SC16IS752] channel=%c baud=%u xtal=%lu divisor=%u configured 8N1\n",
           channel == SC16IS752_CHANNEL_A ? 'A' : 'B',
           baudrate,
           g_sc16is752_xtal_hz,
           divisor);
#endif
    return 0;
}

int SC16IS752_Init(void)
{
    uint8_t lsr = 0;
    unsigned int ret;

    printf("[SC16IS752] Initializing I2C idx=%d configured_addr=0x%02X xtal=%lu...\n",
           I2C_IDX,
           SC16IS752_I2C_ADDR,
           g_sc16is752_xtal_hz);

#if SC16IS752_I2C_BUS_SCAN_DIAG
    Sc16is752_PrintI2cBusScan();
#endif

    ret = IoTI2cInit(I2C_IDX, I2C_BAUDRATE);
    if (ret != IOT_SUCCESS) {
        printf("[SC16IS752] I2C init failed ret=%u\n", ret);
        return -1;
    }

    if (Sc16is752_FindAddress(&lsr) != 0) {
        printf("[SC16IS752] probe failed; no device found in 0x48..0x57\n");
        return -2;
    }

    (void)Sc16is752_WriteReg(SC16IS752_CHANNEL_A, SC16IS752_REG_IOCTRL, SC16IS752_IOCTRL_RESET);
    LOS_Msleep(10);

    if (Sc16is752_ReadReg(SC16IS752_CHANNEL_A, SC16IS752_REG_LSR, &lsr) != 0) {
        printf("[SC16IS752] probe failed after reset at addr=0x%02X\n", g_sc16is752_i2c_addr);
        return -2;
    }

    if (SC16IS752_UartInit(SC16IS752_CHANNEL_A, RS485_BAUDRATE) != 0 ||
        SC16IS752_UartInit(SC16IS752_CHANNEL_B, RS485_BAUDRATE) != 0) {
        printf("[SC16IS752] UART channel init failed\n");
        return -3;
    }

#if SC16IS752_SELF_TEST_DIAG
    (void)Sc16is752_ScratchpadTest(SC16IS752_CHANNEL_A);
    (void)Sc16is752_ScratchpadTest(SC16IS752_CHANNEL_B);
    (void)Sc16is752_InternalLoopbackTest(SC16IS752_CHANNEL_A);
    (void)Sc16is752_InternalLoopbackTest(SC16IS752_CHANNEL_B);
#endif

    printf("[OK] SC16IS752 ready addr=0x%02X lsr=0x%02X\n", g_sc16is752_i2c_addr, lsr);
    return 0;
}

int SC16IS752_Write(Sc16is752Channel channel, const uint8_t *data, unsigned int len)
{
    unsigned int written = 0;
    uint32_t guard = 0;

    if (data == NULL || len == 0U) {
        return 0;
    }

    while (written < len && guard < 200U) {
        uint8_t txlvl = 0;
        if (Sc16is752_ReadReg(channel, SC16IS752_REG_TXLVL, &txlvl) != 0) {
            return written > 0U ? (int)written : -1;
        }

        if (txlvl == 0U) {
            LOS_Msleep(1);
            guard++;
            continue;
        }

        if (Sc16is752_WriteBytes(Sc16is752_SubAddress(SC16IS752_REG_RHR_THR, channel),
                                 &data[written],
                                 1) != 0) {
            return written > 0U ? (int)written : -2;
        }

        written++;
    }

    return (int)written;
}

int SC16IS752_WaitTxDone(Sc16is752Channel channel, unsigned int timeout_ms)
{
    uint32_t waited_ms = 0;
    uint8_t lsr = 0;

    if (timeout_ms == 0U) {
        timeout_ms = 1U;
    }

    while (waited_ms <= timeout_ms) {
        if (Sc16is752_ReadReg(channel, SC16IS752_REG_LSR, &lsr) != 0) {
            return -1;
        }
        if ((lsr & (SC16IS752_LSR_THR_EMPTY | SC16IS752_LSR_TX_EMPTY)) ==
            (SC16IS752_LSR_THR_EMPTY | SC16IS752_LSR_TX_EMPTY)) {
            return 0;
        }
        LOS_Msleep(1);
        waited_ms++;
    }

    printf("[SC16IS752] tx wait timeout channel=%c lsr=0x%02X\n",
           channel == SC16IS752_CHANNEL_A ? 'A' : 'B',
           lsr);
    return -2;
}

int SC16IS752_Read(Sc16is752Channel channel, uint8_t *data, unsigned int len)
{
    uint8_t rxlvl = 0;
    uint8_t lsr = 0;
    unsigned int to_read;

    if (data == NULL || len == 0U) {
        return 0;
    }

    if (Sc16is752_ReadReg(channel, SC16IS752_REG_RXLVL, &rxlvl) != 0) {
        if (Sc16is752_ReadReg(channel, SC16IS752_REG_LSR, &lsr) != 0 ||
            (lsr & SC16IS752_LSR_DATA_READY) == 0U) {
            return 0;
        }
        rxlvl = 1;
    }

    if (rxlvl == 0U) {
        return 0;
    }

    to_read = len;
    if (to_read > rxlvl) {
        to_read = rxlvl;
    }
    if (to_read > SC16IS752_FIFO_SIZE) {
        to_read = SC16IS752_FIFO_SIZE;
    }

    for (unsigned int i = 0; i < to_read; ++i) {
        if (Sc16is752_ReadBytes(Sc16is752_SubAddress(SC16IS752_REG_RHR_THR, channel), &data[i], 1) != 0) {
            return i > 0U ? (int)i : -1;
        }
    }

    return (int)to_read;
}

void SC16IS752_DrainRx(Sc16is752Channel channel)
{
    uint8_t buffer[16];
    int guard = 0;

    while (guard < 16) {
        int len = SC16IS752_Read(channel, buffer, sizeof(buffer));
        if (len <= 0) {
            break;
        }
        guard++;
    }
}
