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

int SC16IS752_Init(void);
void SC16IS752_SetClockHz(unsigned long xtal_hz);
int SC16IS752_UartInit(Sc16is752Channel channel, unsigned int baudrate);
int SC16IS752_Write(Sc16is752Channel channel, const uint8_t *data, unsigned int len);
int SC16IS752_WaitTxDone(Sc16is752Channel channel, unsigned int timeout_ms);
int SC16IS752_Read(Sc16is752Channel channel, uint8_t *data, unsigned int len);
void SC16IS752_DrainRx(Sc16is752Channel channel);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_SC16IS752_DRIVER_H
