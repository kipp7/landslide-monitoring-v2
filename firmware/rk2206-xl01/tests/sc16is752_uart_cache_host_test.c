#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "../drivers/sensors/sc16is752_driver.h"
#include "mocks/iot_errno.h"

static unsigned int g_i2c_write_calls = 0U;
static unsigned int g_i2c_read_calls = 0U;
static int g_fail_writes = 0;
static int g_fail_reads = 0;

unsigned int IoTI2cInit(unsigned int id, unsigned int baudrate)
{
    (void)id;
    (void)baudrate;
    return IOT_SUCCESS;
}

unsigned int IoTI2cDeinit(unsigned int id)
{
    (void)id;
    return IOT_SUCCESS;
}

unsigned int IoTI2cWrite(
    unsigned int id,
    unsigned short device_addr,
    const unsigned char *data,
    unsigned int data_len)
{
    (void)id;
    (void)device_addr;
    (void)data;
    (void)data_len;
    g_i2c_write_calls++;
    return g_fail_writes ? IOT_FAILURE : IOT_SUCCESS;
}

unsigned int IoTI2cRead(
    unsigned int id,
    unsigned short device_addr,
    unsigned char *data,
    unsigned int data_len)
{
    (void)id;
    (void)device_addr;
    g_i2c_read_calls++;
    if (g_fail_reads) {
        return IOT_FAILURE;
    }
    memset(data, 0, data_len);
    return IOT_SUCCESS;
}

unsigned int IoTI2cSetBaudrate(unsigned int id, unsigned int baudrate)
{
    (void)id;
    (void)baudrate;
    return IOT_SUCCESS;
}

unsigned int IoTI2cScan(unsigned int id, unsigned short *slave_addr, unsigned int slave_addr_len)
{
    (void)id;
    (void)slave_addr;
    (void)slave_addr_len;
    return 0U;
}

void LOS_Msleep(uint32_t milliseconds)
{
    (void)milliseconds;
}

int main(void)
{
    unsigned int writes_after_initial_config;
    unsigned int writes_before_failure;
    uint8_t unused = 0U;

    assert(SC16IS752_UartReconfigureCached(SC16IS752_CHANNEL_A) == -8);
    assert(SC16IS752_UartInit(SC16IS752_CHANNEL_A, 4800U) == 0);
    writes_after_initial_config = g_i2c_write_calls;
    assert(writes_after_initial_config == 7U);

    assert(SC16IS752_UartEnsureConfigured(SC16IS752_CHANNEL_A, 4800U) == 0);
    assert(g_i2c_write_calls == writes_after_initial_config);

    SC16IS752_SetClockHz(14745600UL);
    assert(SC16IS752_UartEnsureConfigured(SC16IS752_CHANNEL_A, 4800U) == 0);
    assert(g_i2c_write_calls == writes_after_initial_config + 7U);
    writes_after_initial_config = g_i2c_write_calls;
    assert(SC16IS752_UartReconfigureCached(SC16IS752_CHANNEL_A) == 0);
    assert(g_i2c_write_calls == writes_after_initial_config + 7U);

    assert(SC16IS752_UartInit(SC16IS752_CHANNEL_B, 4800U) == 0);
    writes_before_failure = g_i2c_write_calls;
    g_fail_reads = 1;
    assert(SC16IS752_Read(SC16IS752_CHANNEL_B, &unused, 1U) < 0);
    assert(g_i2c_read_calls == 6U);
    g_fail_reads = 0;
    assert(SC16IS752_UartEnsureConfigured(SC16IS752_CHANNEL_B, 4800U) == 0);
    assert(g_i2c_write_calls == writes_before_failure + 6U + 7U);

    writes_before_failure = g_i2c_write_calls;
    g_fail_writes = 1;
    assert(SC16IS752_UartInit(SC16IS752_CHANNEL_A, 9600U) < 0);
    assert(g_i2c_write_calls == writes_before_failure + 3U);
    g_fail_writes = 0;
    assert(SC16IS752_UartEnsureConfigured(SC16IS752_CHANNEL_A, 9600U) == 0);
    assert(g_i2c_write_calls == writes_before_failure + 3U + 7U);

    assert(SC16IS752_UartEnsureConfigured((Sc16is752Channel)2, 4800U) == -7);
    puts("SC16IS752 UART cache host test passed");
    return 0;
}
