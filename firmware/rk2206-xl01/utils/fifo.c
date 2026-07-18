/*
 * FIFO Buffer Implementation
 */

#include "fifo.h"
#include <stdio.h>
#include <string.h>
#include "los_task.h"

static int Fifo_Lock(Fifo *fifo)
{
    if (fifo == NULL) {
        return -1;
    }

    if (!fifo->mutex_ready) {
        return -1;
    }

    return LOS_MuxPend(fifo->mutex, LOS_WAIT_FOREVER) == LOS_OK ? 0 : -1;
}

static void Fifo_Unlock(Fifo *fifo)
{
    if (fifo != NULL && fifo->mutex_ready) {
        LOS_MuxPost(fifo->mutex);
    }
}

void Fifo_Init(Fifo *fifo)
{
    if (fifo == NULL) {
        return;
    }

    memset(fifo, 0, sizeof(*fifo));
    fifo->read_index = 0;
    fifo->write_index = 0;
    fifo->count = 0;
    fifo->dropped_bytes = 0;
    fifo->dropped_events = 0;
    fifo->high_watermark = 0;
    fifo->mutex = 0;
    fifo->mutex_ready = LOS_MuxCreate(&fifo->mutex) == LOS_OK ? 1U : 0U;
    if (!fifo->mutex_ready) {
        printf("[FIFO ERROR] mutex create failed\n");
    }
}

int Fifo_IsReady(Fifo *fifo)
{
    if (fifo == NULL) {
        return 0;
    }

    return fifo->mutex_ready ? 1 : 0;
}

int Fifo_Write(Fifo *fifo, const unsigned char *data, unsigned int len)
{
    unsigned int i;
    unsigned int written = 0;

    if (fifo == NULL || data == NULL || len == 0U) {
        return 0;
    }

    if (Fifo_Lock(fifo) != 0) {
        return -1;
    }

    for (i = 0; i < len; i++) {
        if (fifo->count >= FIFO_SIZE) {
            break;
        }

        fifo->buffer[fifo->write_index] = data[i];
        fifo->write_index = (fifo->write_index + 1) % FIFO_SIZE;
        fifo->count++;
        written++;
    }

    if (fifo->count > fifo->high_watermark) {
        fifo->high_watermark = fifo->count;
    }

    if (written < len) {
        fifo->dropped_bytes += (len - written);
        fifo->dropped_events++;
    }

    Fifo_Unlock(fifo);
    return (int)written;
}

int Fifo_Read(Fifo *fifo, unsigned char *data, unsigned int len)
{
    unsigned int count = 0;

    if (fifo == NULL || data == NULL || len == 0U) {
        return 0;
    }

    if (Fifo_Lock(fifo) != 0) {
        return -1;
    }

    while (count < len && fifo->count > 0U) {
        data[count++] = fifo->buffer[fifo->read_index];
        fifo->read_index = (fifo->read_index + 1) % FIFO_SIZE;
        fifo->count--;
    }

    Fifo_Unlock(fifo);
    return count;
}

int Fifo_Available(Fifo *fifo)
{
    unsigned int available = 0;

    if (fifo == NULL) {
        return 0;
    }

    if (Fifo_Lock(fifo) != 0) {
        return -1;
    }

    available = fifo->count;
    Fifo_Unlock(fifo);
    return (int)available;
}

unsigned int Fifo_DroppedBytes(Fifo *fifo)
{
    unsigned int dropped = 0;

    if (fifo == NULL) {
        return 0;
    }

    if (Fifo_Lock(fifo) != 0) {
        return 0;
    }

    dropped = fifo->dropped_bytes;
    Fifo_Unlock(fifo);
    return dropped;
}

unsigned int Fifo_DroppedEvents(Fifo *fifo)
{
    unsigned int dropped_events = 0;

    if (fifo == NULL) {
        return 0;
    }

    if (Fifo_Lock(fifo) != 0) {
        return 0;
    }

    dropped_events = fifo->dropped_events;
    Fifo_Unlock(fifo);
    return dropped_events;
}

unsigned int Fifo_HighWatermark(Fifo *fifo)
{
    unsigned int high_watermark = 0;

    if (fifo == NULL) {
        return 0;
    }

    if (Fifo_Lock(fifo) != 0) {
        return 0;
    }

    high_watermark = fifo->high_watermark;
    Fifo_Unlock(fifo);
    return high_watermark;
}
