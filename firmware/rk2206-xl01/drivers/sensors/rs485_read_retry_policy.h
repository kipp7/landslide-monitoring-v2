#ifndef DRIVERS_SENSORS_RS485_READ_RETRY_POLICY_H
#define DRIVERS_SENSORS_RS485_READ_RETRY_POLICY_H

#include "rs485_modbus.h"

static inline int RS485_ReadStatusIsRetryable(int status)
{
    return status == RS485_MODBUS_ERR_TIMEOUT ||
           status == RS485_MODBUS_ERR_READ ||
           status == RS485_MODBUS_ERR_SHORT ||
           status == RS485_MODBUS_ERR_CRC;
}

static inline int RS485_ReadShouldRetry(
    int status,
    unsigned int retries_used,
    unsigned int max_retries)
{
    return RS485_ReadStatusIsRetryable(status) && retries_used < max_retries;
}

#endif // DRIVERS_SENSORS_RS485_READ_RETRY_POLICY_H
