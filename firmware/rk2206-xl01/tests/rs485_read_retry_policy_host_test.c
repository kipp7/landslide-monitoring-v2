#include <assert.h>
#include <stdio.h>

#include "../drivers/sensors/rs485_read_retry_policy.h"

int main(void)
{
    assert(RS485_ReadShouldRetry(RS485_MODBUS_ERR_TIMEOUT, 0U, 1U));
    assert(RS485_ReadShouldRetry(RS485_MODBUS_ERR_READ, 0U, 1U));
    assert(RS485_ReadShouldRetry(RS485_MODBUS_ERR_SHORT, 0U, 1U));
    assert(RS485_ReadShouldRetry(RS485_MODBUS_ERR_CRC, 0U, 1U));

    assert(!RS485_ReadShouldRetry(RS485_MODBUS_OK, 0U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_INVALID, 0U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_WRITE, 0U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_TX_DONE, 0U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_ADDR, 0U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_EXCEPTION, 0U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_FUNCTION, 0U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_BYTE_COUNT, 0U, 1U));

    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_TIMEOUT, 1U, 1U));
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_TIMEOUT, 0U, 0U));
    puts("RS485 read retry policy host test passed");
    return 0;
}
