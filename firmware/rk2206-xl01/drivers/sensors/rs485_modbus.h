#ifndef DRIVERS_SENSORS_RS485_MODBUS_H
#define DRIVERS_SENSORS_RS485_MODBUS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define RS485_MODBUS_OK                 0
#define RS485_MODBUS_ERR_INVALID       -1
#define RS485_MODBUS_ERR_WRITE         -2
#define RS485_MODBUS_ERR_TX_DONE       -3
#define RS485_MODBUS_ERR_TIMEOUT       -4
#define RS485_MODBUS_ERR_ADDR          -5
#define RS485_MODBUS_ERR_CRC           -6
#define RS485_MODBUS_ERR_EXCEPTION     -7
#define RS485_MODBUS_ERR_ECHO          -8
#define RS485_MODBUS_ERR_SHORT         -9
#define RS485_MODBUS_ERR_FUNCTION      -10
#define RS485_MODBUS_ERR_BYTE_COUNT    -11
#define RS485_MODBUS_ERR_READ          -12

#define RS485_MODBUS_DIAGNOSTIC_CHANNELS 2

typedef struct {
    uint32_t requests;
    uint32_t successes;
    uint32_t write_errors;
    uint32_t tx_done_errors;
    uint32_t read_errors;
    uint32_t no_responses;
    uint32_t short_responses;
    uint32_t address_errors;
    uint32_t crc_errors;
    uint32_t exception_responses;
    uint32_t function_errors;
    uint32_t byte_count_errors;
    uint32_t rx_bytes;
    int8_t last_status;
    uint16_t last_rx_bytes;
    uint8_t last_response_addr;
    uint8_t last_response_function;
    uint8_t last_exception_code;
} Rs485ModbusChannelDiagnostics;

typedef struct {
    Rs485ModbusChannelDiagnostics channels[RS485_MODBUS_DIAGNOSTIC_CHANNELS];
} Rs485ModbusDiagnostics;

int RS485_ModbusInit(void);
int RS485_ModbusReadRegistersWithTimeoutOnChannel(
    uint8_t channel,
    uint8_t function_code,
    uint8_t slave_addr,
    uint16_t start_reg,
    uint16_t reg_count,
    uint16_t *out_regs,
    unsigned int out_reg_capacity,
    unsigned int timeout_ms
);
int RS485_ModbusReadHoldingRegistersOnChannel(
    uint8_t channel,
    uint8_t slave_addr,
    uint16_t start_reg,
    uint16_t reg_count,
    uint16_t *out_regs,
    unsigned int out_reg_capacity
);
int RS485_ModbusReadHoldingRegisters(
    uint8_t slave_addr,
    uint16_t start_reg,
    uint16_t reg_count,
    uint16_t *out_regs,
    unsigned int out_reg_capacity
);
int RS485_ModbusWriteSingleRegisterOnChannel(
    uint8_t channel,
    uint8_t slave_addr,
    uint16_t reg_addr,
    uint16_t value,
    unsigned int timeout_ms
);
int RS485_ModbusWriteSingleRegisterOnChannelExpectResponseAddr(
    uint8_t channel,
    uint8_t slave_addr,
    uint8_t expected_response_addr,
    uint16_t reg_addr,
    uint16_t value,
    unsigned int timeout_ms
);
int RS485_ModbusWriteSingleRegisterOnChannelAllowResponseAddrs(
    uint8_t channel,
    uint8_t slave_addr,
    uint8_t allowed_response_addr_1,
    uint8_t allowed_response_addr_2,
    uint16_t reg_addr,
    uint16_t value,
    unsigned int timeout_ms
);
int RS485_ModbusRawWriteOnChannel(
    uint8_t channel,
    const uint8_t *data,
    unsigned int len,
    unsigned int tx_done_timeout_ms
);
const char *RS485_ModbusStatusName(int code);
uint8_t RS485_ModbusGetLastWriteResponseAddr(void);
unsigned int RS485_ModbusGetLastWriteResponseBytes(void);
unsigned int RS485_ModbusGetLastWriteResponse(uint8_t *out, unsigned int out_capacity);
void RS485_ModbusGetDiagnostics(Rs485ModbusDiagnostics *snapshot);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_RS485_MODBUS_H
