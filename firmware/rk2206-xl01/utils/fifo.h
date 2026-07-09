/*
 * FIFO Buffer Utility
 * Thread-safe circular buffer for UART receive buffering
 */

#ifndef UTILS_FIFO_H
#define UTILS_FIFO_H

#define FIFO_SIZE 1024

typedef struct {
    unsigned char buffer[FIFO_SIZE];
    unsigned int read_index;
    unsigned int write_index;
} Fifo;

/**
 * Initialize FIFO buffer
 */
void Fifo_Init(Fifo *fifo);

/**
 * Write data to FIFO
 * @return Number of bytes written
 */
int Fifo_Write(Fifo *fifo, unsigned char *data, unsigned int len);

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

#endif // UTILS_FIFO_H
