#ifndef DRIVERS_SENSORS_SC16IS752_DRIVER_H
#define DRIVERS_SENSORS_SC16IS752_DRIVER_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    SC16IS752_CHANNEL_A = 0,
    SC16IS752_CHANNEL_B = 1,
} Sc16is752Channel;

#define SC16IS752_DIAG_NOT_RUN 127

typedef struct {
    uint8_t configured_i2c_addr;
    uint8_t detected_i2c_addr;
    uint8_t address_found;
    uint8_t detected_lsr;
    int8_t init_status;
    int8_t scratchpad_status[2];
    int8_t internal_loopback_status[2];
    int8_t uart_init_status[2];
    uint8_t internal_loopback_rx_bytes[2];
    uint8_t reserved[2];
} Sc16is752Diagnostics;

int SC16IS752_Init(void);
void SC16IS752_SetClockHz(unsigned long xtal_hz);
int SC16IS752_UartInit(Sc16is752Channel channel, unsigned int baudrate);
int SC16IS752_Write(Sc16is752Channel channel, const uint8_t *data, unsigned int len);
int SC16IS752_WaitTxDone(Sc16is752Channel channel, unsigned int timeout_ms);
int SC16IS752_Read(Sc16is752Channel channel, uint8_t *data, unsigned int len);
void SC16IS752_DrainRx(Sc16is752Channel channel);
void SC16IS752_GetDiagnostics(Sc16is752Diagnostics *snapshot);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_SC16IS752_DRIVER_H
