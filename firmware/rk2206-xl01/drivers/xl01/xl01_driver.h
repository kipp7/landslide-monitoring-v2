/*
 * XL01 Wireless Module Driver
 * UART-based transparent transmission driver
 */

#ifndef DRIVERS_XL01_DRIVER_H
#define DRIVERS_XL01_DRIVER_H

#include "../../app/sensor_data.h"

typedef struct {
    char payload[256];
    int ready;
} PlatformCommandAckBuffer;

/**
 * Initialize XL01 module
 */
void XL01_Init(void);

/**
 * Send data with retry mechanism
 * @param data Data buffer to send
 * @param len Length of data
 * @param stats Statistics structure (will be updated)
 * @return 0 on success, -1 on failure
 */
int XL01_SendWithRetry(const char *data, int len, Statistics *stats);

/**
 * Send a platform command ack payload.
 * This is different from link-level ACK/OK confirmation and is intended
 * to carry DeviceCommandAck v1 JSON toward the gateway/platform side.
 */
int XL01_SendPlatformCommandAck(const char *data, int len);

/**
 * Poll UART for received data (call from high-priority task)
 */
void XL01_PollReceive(void);

/**
 * Process received data from FIFO buffer
 * @param stats Statistics structure (will be updated)
 * @return Number of bytes processed
 */
int XL01_ProcessReceivedData(Statistics *stats);

/**
 * Try to dequeue one platform command JSON payload received from the gateway.
 * Returns number of bytes copied to buffer, or 0 when no command is pending.
 */
int XL01_TryDequeuePlatformCommand(char *buffer, int buffer_size);

/**
 * Current link-level ack flag used only for transport confirmation.
 */
int XL01_HasLinkAck(void);

/**
 * Clear current link-level ack state.
 */
void XL01_ClearLinkAck(void);

#endif // DRIVERS_XL01_DRIVER_H
