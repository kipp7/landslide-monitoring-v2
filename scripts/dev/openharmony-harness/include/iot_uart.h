#ifndef OPENHARMONY_HARNESS_IOT_UART_H
#define OPENHARMONY_HARNESS_IOT_UART_H

typedef struct {
    int baudRate;
    int dataBits;
    int stopBits;
    int parity;
    int rxBlock;
    int txBlock;
    int pad;
} IotUartAttribute;

#define IOT_UART_DATA_BIT_8 8
#define IOT_UART_STOP_BIT_1 1
#define IOT_UART_PARITY_NONE 0
#define IOT_UART_BLOCK_STATE_NONE_BLOCK 0
#define IOT_FLOW_CTRL_NONE 0

unsigned int IoTUartInit(int id, const IotUartAttribute *attr);
void IoTUartDeinit(int id);
int IoTUartRead(int id, unsigned char *buffer, unsigned int len);
int IoTUartWrite(int id, unsigned char *buffer, unsigned int len);

#endif
