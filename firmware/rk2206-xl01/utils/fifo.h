/*
 * FIFO Buffer Utility
 * Thread-safe circular buffer for UART receive buffering
 */

#ifndef UTILS_FIFO_H
#define UTILS_FIFO_H

#include <stdint.h>

#define FIFO_SIZE 1024

typedef struct {
    unsigned char buffer[FIFO_SIZE];
    unsigned int read_index;
    unsigned int write_index;
    unsigned int count;
    unsigned int dropped_bytes;
    unsigned int dropped_events;
    unsigned int high_watermark;
    uint32_t mutex;
    unsigned char mutex_ready;
} Fifo;

/**
 * Initialize FIFO buffer
 */
void Fifo_Init(Fifo *fifo);

/**
 * Return 1 when the FIFO lock was initialized successfully
 */
int Fifo_IsReady(Fifo *fifo);

/**
 * Write data to FIFO
 * @return Number of bytes written
 */
int Fifo_Write(Fifo *fifo, const unsigned char *data, unsigned int len);

/**
 * Read data from FIFO
 * @return Number of bytes read
 */
int Fifo_Read(Fifo *fifo, unsigned char *data, unsigned int len);

/**
 * Get available bytes in FIFO
 * @return Number of available bytes
 */
int Fifo_Available(Fifo *fifo);

/**
 * Get total dropped bytes due to FIFO overrun
 */
unsigned int Fifo_DroppedBytes(Fifo *fifo);

/**
 * Get total overrun events due to FIFO full condition
 */
unsigned int Fifo_DroppedEvents(Fifo *fifo);

/**
 * Get the highest occupancy observed since init
 */
unsigned int Fifo_HighWatermark(Fifo *fifo);

#endif // UTILS_FIFO_H
