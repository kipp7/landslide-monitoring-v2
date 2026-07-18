#ifndef DRIVERS_SENSORS_FIELD_ALARM_RS485_H
#define DRIVERS_SENSORS_FIELD_ALARM_RS485_H

#include <stdint.h>

#define FIELD_ALARM_RS485_RX_HEX_MAX 32

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int final_ret;
    int primary_ret;
    int fallback_ret;
    uint8_t step;
    uint8_t primary_rx_addr;
    uint8_t fallback_rx_addr;
    unsigned int primary_rx_bytes;
    unsigned int fallback_rx_bytes;
    char primary_rx_hex[FIELD_ALARM_RS485_RX_HEX_MAX];
    char fallback_rx_hex[FIELD_ALARM_RS485_RX_HEX_MAX];
    uint8_t channel;
    uint8_t primary_addr;
    uint8_t fallback_addr;
    uint16_t reg;
    uint16_t value;
    unsigned int baudrate;
    unsigned int timeout_ms;
    int used_fallback;
} FieldAlarmRs485Diag;

int FieldAlarmRs485_SetEnabled(int enabled);
int FieldAlarmRs485_SendRawDiagnostic(int enabled);
const FieldAlarmRs485Diag *FieldAlarmRs485_GetLastDiag(void);
const char *FieldAlarmRs485_ResultName(int code);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_FIELD_ALARM_RS485_H
