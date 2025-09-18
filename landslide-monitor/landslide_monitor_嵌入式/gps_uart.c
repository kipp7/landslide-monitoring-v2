#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "iot_uart.h"
#include "ohos_init.h"
#include "cmsis_os2.h"

#define GPS_UART_PORT EUART0_M0
#define RECV_BUF_SIZE 512

typedef struct {
    char rawLine[RECV_BUF_SIZE];  // 原始NMEA语句
    char latitudeStr[16];
    char N_S;
    char longitudeStr[16];
    char E_W;
    double latitude;
    double longitude;
} GPS_Info;

GPS_Info Save_Data;

double Convert_to_degrees(char* data)
{
    double temp = atof(data);
    int degree = (int)(temp / 100);
    double minutes = temp - degree * 100;
    return degree + minutes / 60.0;
}

void ParseGGA(const char* line)
{
    if (!line) return;

    strncpy(Save_Data.rawLine, line, sizeof(Save_Data.rawLine) - 1);
    Save_Data.rawLine[sizeof(Save_Data.rawLine) - 1] = '\0';

    char *copy = strdup(line);
    if (!copy) {
        printf(" strdup失败，内存不足？\n");
        return;
    }

    int fieldIndex = 0;
    char *token;
    char *saveptr;
    char *p = copy;

    while ((token = strtok_r(p, ",", &saveptr)) != NULL) {
        p = NULL;
        fieldIndex++;

        switch (fieldIndex) {
            case 3:
                strncpy(Save_Data.latitudeStr, token, sizeof(Save_Data.latitudeStr) - 1);
                break;
            case 4:
                Save_Data.N_S = token[0];
                break;
            case 5:
                strncpy(Save_Data.longitudeStr, token, sizeof(Save_Data.longitudeStr) - 1);
                break;
            case 6:
                Save_Data.E_W = token[0];
                break;
            default:
                break;
        }
    }

    free(copy);

    if (Save_Data.latitudeStr[0] && Save_Data.longitudeStr[0]) {
        Save_Data.latitude = Convert_to_degrees(Save_Data.latitudeStr);
        Save_Data.longitude = Convert_to_degrees(Save_Data.longitudeStr);

        if (Save_Data.N_S == 'S' || Save_Data.N_S == 's') {
            Save_Data.latitude = -Save_Data.latitude;
        }
        if (Save_Data.E_W == 'W' || Save_Data.E_W == 'w') {
            Save_Data.longitude = -Save_Data.longitude;
        }

        printf("\n 解析结果:\n");
        printf("  原始句子: %s\n", Save_Data.rawLine);
        printf("  纬度: %s%c → %.6f°\n", Save_Data.latitudeStr, Save_Data.N_S, Save_Data.latitude);
        printf("  经度: %s%c → %.6f°\n", Save_Data.longitudeStr, Save_Data.E_W, Save_Data.longitude);
    } else {
        printf(" GGA语句字段不完整，跳过解析。\n");
    }
}

//  线程入口函数，参数类型必须是 void*
void GPS_Task(void *arg)
{
    IotUartAttribute attr = {
        .baudRate = 9600,
        .dataBits = IOT_UART_DATA_BIT_8,
        .stopBits = IOT_UART_STOP_BIT_1,
        .parity = IOT_UART_PARITY_NONE,
        .rxBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .txBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .pad = 0
    };

    if (IoTUartInit(GPS_UART_PORT, &attr) != 0) {
        printf(" UART 初始化失败！请检查串口连接与配置。\n");
        return;
    }

    if (IoTUartSetFlowCtrl(GPS_UART_PORT, IOT_FLOW_CTRL_NONE) != 0) {
        printf(" 设置UART流控失败！\n");
        IoTUartDeinit(GPS_UART_PORT);
        return;
    }

    unsigned char recvBuf[RECV_BUF_SIZE] = {0};
    char lineBuf[RECV_BUF_SIZE] = {0};
    int linePos = 0;
    int noDataCount = 0;

    while (1) {
        int len = IoTUartRead(GPS_UART_PORT, recvBuf, sizeof(recvBuf) - 1);
        if (len > 0) {
            noDataCount = 0;
            for (int i = 0; i < len; i++) {
                char c = recvBuf[i];
                if (c == '\n' || c == '\r') {
                    if (linePos > 0) {
                        lineBuf[linePos] = '\0';
                        printf("📡 接收到：%s\n", lineBuf);

                        if (strncmp(lineBuf, "$GPGGA", 6) == 0 || strncmp(lineBuf, "$GNGGA", 6) == 0) {
                            ParseGGA(lineBuf);
                        }

                        linePos = 0;
                        memset(lineBuf, 0, sizeof(lineBuf));
                    }
                } else {
                    if (linePos < RECV_BUF_SIZE - 1) {
                        lineBuf[linePos++] = c;
                    }
                }
            }
        } else {
            noDataCount++;
            if (noDataCount % 100 == 0) {
                printf(" 未收到串口数据（%d 次）\n", noDataCount);
            }
        }

        usleep(10000);  // 每次循环延迟10ms
    }

    IoTUartDeinit(GPS_UART_PORT);
}

void GPS_MainEntry(void)
{
    printf(" GPS_MainEntry 启动！等待GPS数据...\n");

    osThreadAttr_t attr = {
        .name = "GpsTask",
        .stack_size = 4096,  // ✅ 足够的线程栈空间，避免栈溢出
        .priority = osPriorityNormal,
    };

    if (osThreadNew(GPS_Task, NULL, &attr) == NULL) {
        printf(" 创建GPS任务线程失败！\n");
    }
}

APP_FEATURE_INIT(GPS_MainEntry);
