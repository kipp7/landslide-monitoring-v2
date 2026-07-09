/*
 * FIFO Buffer Implementation
 */

#include "fifo.h"

void Fifo_Init(Fifo *fifo)
{
    fifo->read_index = 0;
    fifo->write_index = 0;
}

int Fifo_Write(Fifo *fifo, unsigned char *data, unsigned int len)
{
    for (unsigned int i = 0; i < len; i++) {
        fifo->buffer[fifo->write_index] = data[i];
        fifo->write_index = (fifo->write_index + 1) % FIFO_SIZE;
    }
    return len;
}

int Fifo_Read(Fifo *fifo, unsigned char *data, unsigned int len)
{
    unsigned int count = 0;
    while (count < len && fifo->read_index != fifo->write_index) {
        data[count++] = fifo->buffer[fifo->read_index];
        fifo->read_index = (fifo->read_index + 1) % FIFO_SIZE;
    }
    return count;
}

int Fifo_Available(Fifo *fifo)
{
    if (fifo->write_index >= fifo->read_index) {
        return fifo->write_index - fifo->read_index;
    } else {
        return FIFO_SIZE - fifo->read_index + fifo->write_index;
    }
}
