#include "gps_module.h"
#include "iot_uart.h"
#include "iot_errno.h"
#include "los_task.h"
#include "los_memory.h"
#include "cmsis_os2.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// GPS模块全局变量
static bool g_gps_initialized = false;
static GPSData g_current_gps_data = {0};
static GpsStats g_gps_stats = {0};
static GpsRawData g_gps_raw_data = {0};
static uint32_t g_gps_task_id = 0;

// 互斥锁保护GPS数据
static uint32_t g_gps_mutex = 0;

/**
 * @brief 初始化GPS模块
 */
int GPS_Init(void)
{
    int ret;
    
    if (g_gps_initialized) {
        printf("GPS module already initialized\n");
        return 0;
    }
    
    printf("Initializing GPS module...\n");
    
    // 创建互斥锁
    ret = LOS_MuxCreate(&g_gps_mutex);
    if (ret != LOS_OK) {
        printf("Failed to create GPS mutex: %d\n", ret);
        return -1;
    }
    
    // 初始化GPS数据
    memset(&g_current_gps_data, 0, sizeof(g_current_gps_data));
    memset(&g_gps_stats, 0, sizeof(g_gps_stats));
    memset(&g_gps_raw_data, 0, sizeof(g_gps_raw_data));
    
    // 设置默认GPS坐标（广西地区）
    g_current_gps_data.latitude = 22.8154;   // 广西南宁纬度
    g_current_gps_data.longitude = 108.3275;  // 广西南宁经度
    g_current_gps_data.altitude = 100.0;      // 默认海拔100米
    g_current_gps_data.accuracy = 10.0;       // 默认精度10米
    g_current_gps_data.valid = false;         // 初始状态为无效
    
    g_gps_stats.status = GPS_STATUS_INIT;
    
    // 创建GPS任务
    TSK_INIT_PARAM_S task_param = {0};
    task_param.pfnTaskEntry = (TSK_ENTRY_FUNC)GPS_Task;
    task_param.uwStackSize = 4096;
    task_param.pcName = "GPS_Task";
    task_param.usTaskPrio = 25;  // 中等优先级
    
    ret = LOS_TaskCreate(&g_gps_task_id, &task_param);
    if (ret != LOS_OK) {
        printf("Failed to create GPS task: %d\n", ret);
        LOS_MuxDelete(g_gps_mutex);
        return -2;
    }
    
    g_gps_initialized = true;
    printf("GPS module initialized successfully\n");
    
    return 0;
}

/**
 * @brief 反初始化GPS模块
 */
void GPS_Deinit(void)
{
    if (!g_gps_initialized) {
        return;
    }
    
    printf("Deinitializing GPS module...\n");
    
    // 删除任务
    if (g_gps_task_id != 0) {
        LOS_TaskDelete(g_gps_task_id);
        g_gps_task_id = 0;
    }
    
    // 反初始化UART
    IoTUartDeinit(GPS_UART_PORT);
    
    // 删除互斥锁
    if (g_gps_mutex != 0) {
        LOS_MuxDelete(g_gps_mutex);
        g_gps_mutex = 0;
    }
    
    g_gps_initialized = false;
    printf("GPS module deinitialized\n");
}

/**
 * @brief 获取GPS数据
 */
int GPS_GetData(GPSData *gps_data)
{
    if (!g_gps_initialized || gps_data == NULL) {
        return -1;
    }
    
    // 加锁保护数据
    if (LOS_MuxPend(g_gps_mutex, LOS_WAIT_FOREVER) != LOS_OK) {
        return -2;
    }
    
    // 复制GPS数据
    memcpy(gps_data, &g_current_gps_data, sizeof(GPSData));
    
    // 解锁
    LOS_MuxPost(g_gps_mutex);
    
    return 0;
}

/**
 * @brief 检查GPS数据是否有效
 */
bool GPS_IsDataValid(void)
{
    if (!g_gps_initialized) {
        return false;
    }
    
    bool valid = false;
    
    if (LOS_MuxPend(g_gps_mutex, 1000) == LOS_OK) {
        valid = g_current_gps_data.valid;
        LOS_MuxPost(g_gps_mutex);
    }
    
    return valid;
}

/**
 * @brief 获取GPS状态
 */
GpsStatus GPS_GetStatus(void)
{
    if (!g_gps_initialized) {
        return GPS_STATUS_ERROR;
    }
    
    return g_gps_stats.status;
}

/**
 * @brief 获取GPS统计信息
 */
void GPS_GetStats(GpsStats *stats)
{
    if (!g_gps_initialized || stats == NULL) {
        return;
    }
    
    if (LOS_MuxPend(g_gps_mutex, 1000) == LOS_OK) {
        memcpy(stats, &g_gps_stats, sizeof(GpsStats));
        LOS_MuxPost(g_gps_mutex);
    }
}

/**
 * @brief 重置GPS统计信息
 */
void GPS_ResetStats(void)
{
    if (!g_gps_initialized) {
        return;
    }
    
    if (LOS_MuxPend(g_gps_mutex, 1000) == LOS_OK) {
        memset(&g_gps_stats, 0, sizeof(g_gps_stats));
        g_gps_stats.status = GPS_STATUS_INIT;
        LOS_MuxPost(g_gps_mutex);
    }
}

/**
 * @brief 转换坐标格式
 */
double GPS_ConvertCoordinate(const char *coord_str)
{
    if (!coord_str || strlen(coord_str) == 0) {
        return 0.0;
    }
    
    double coord = atof(coord_str);
    int degrees = (int)(coord / 100);
    double minutes = coord - degrees * 100;
    
    return degrees + minutes / 60.0;
}

/**
 * @brief 验证NMEA校验和
 */
bool GPS_VerifyChecksum(const char *sentence)
{
    if (!sentence || strlen(sentence) < 4) {
        return false;
    }
    
    // 查找校验和位置
    const char *checksum_pos = strrchr(sentence, '*');
    if (!checksum_pos) {
        return false;  // 没有校验和
    }
    
    // 计算校验和
    uint8_t calculated_checksum = 0;
    for (const char *p = sentence + 1; p < checksum_pos; p++) {
        calculated_checksum ^= *p;
    }
    
    // 解析校验和
    uint8_t provided_checksum = (uint8_t)strtol(checksum_pos + 1, NULL, 16);
    
    return calculated_checksum == provided_checksum;
}

/**
 * @brief 打印GPS调试信息
 */
void GPS_PrintDebugInfo(void)
{
    if (!g_gps_initialized) {
        printf("GPS module not initialized\n");
        return;
    }
    
    printf("\n=== GPS Debug Information ===\n");
    printf("Status: %s\n", 
           g_gps_stats.status == GPS_STATUS_INIT ? "INIT" :
           g_gps_stats.status == GPS_STATUS_SEARCHING ? "SEARCHING" :
           g_gps_stats.status == GPS_STATUS_FIXED ? "FIXED" :
           g_gps_stats.status == GPS_STATUS_LOST ? "LOST" : "ERROR");
    
    printf("Data Valid: %s\n", g_current_gps_data.valid ? "YES" : "NO");
    printf("Latitude: %.6f°\n", g_current_gps_data.latitude);
    printf("Longitude: %.6f°\n", g_current_gps_data.longitude);
    printf("Altitude: %.1fm\n", g_current_gps_data.altitude);
    printf("Accuracy: %.1fm\n", g_current_gps_data.accuracy);
    
    printf("Statistics:\n");
    printf("  Total sentences: %d\n", g_gps_stats.total_sentences);
    printf("  Valid sentences: %d\n", g_gps_stats.valid_sentences);
    printf("  GGA count: %d\n", g_gps_stats.gga_count);
    printf("  Parse errors: %d\n", g_gps_stats.parse_errors);
    printf("=============================\n\n");
}

/**
 * @brief 解析GGA语句
 */
int GPS_ParseGGA(const char *sentence)
{
    if (!sentence) {
        return -1;
    }

    // 验证校验和
    if (!GPS_VerifyChecksum(sentence)) {
        g_gps_stats.parse_errors++;
        return -2;
    }

    // 复制原始数据
    strncpy(g_gps_raw_data.raw_sentence, sentence, sizeof(g_gps_raw_data.raw_sentence) - 1);
    g_gps_raw_data.raw_sentence[sizeof(g_gps_raw_data.raw_sentence) - 1] = '\0';

    // 解析GGA语句
    char *copy = strdup(sentence);
    if (!copy) {
        g_gps_stats.parse_errors++;
        return -3;
    }

    int field_index = 0;
    char *token;
    char *saveptr;
    char *p = copy;

    while ((token = strtok_r(p, ",", &saveptr)) != NULL) {
        p = NULL;
        field_index++;

        switch (field_index) {
            case 3: // 纬度
                if (strlen(token) > 0) {
                    strncpy(g_gps_raw_data.latitude_str, token, sizeof(g_gps_raw_data.latitude_str) - 1);
                }
                break;
            case 4: // 南北半球指示符
                g_gps_raw_data.ns_indicator = token[0];
                break;
            case 5: // 经度
                if (strlen(token) > 0) {
                    strncpy(g_gps_raw_data.longitude_str, token, sizeof(g_gps_raw_data.longitude_str) - 1);
                }
                break;
            case 6: // 东西半球指示符
                g_gps_raw_data.ew_indicator = token[0];
                break;
            case 7: // 定位质量指示符
                g_gps_raw_data.quality_indicator = token[0];
                break;
            case 8: // 卫星数量
                g_gps_raw_data.satellite_count = (uint8_t)atoi(token);
                break;
            case 9: // 水平精度因子
                g_gps_raw_data.hdop = atof(token);
                break;
            case 10: // 海拔高度
                g_gps_raw_data.altitude = atof(token);
                break;
            case 11: // 海拔单位
                g_gps_raw_data.altitude_unit = token[0];
                break;
            default:
                break;
        }
    }

    free(copy);

    // 更新GPS数据
    if (LOS_MuxPend(g_gps_mutex, 1000) == LOS_OK) {
        // 检查数据有效性
        if (g_gps_raw_data.quality_indicator >= '1' &&
            strlen(g_gps_raw_data.latitude_str) > 0 &&
            strlen(g_gps_raw_data.longitude_str) > 0) {

            // 转换坐标
            g_current_gps_data.latitude = GPS_ConvertCoordinate(g_gps_raw_data.latitude_str);
            g_current_gps_data.longitude = GPS_ConvertCoordinate(g_gps_raw_data.longitude_str);

            // 应用南北/东西半球指示符
            if (g_gps_raw_data.ns_indicator == 'S' || g_gps_raw_data.ns_indicator == 's') {
                g_current_gps_data.latitude = -g_current_gps_data.latitude;
            }
            if (g_gps_raw_data.ew_indicator == 'W' || g_gps_raw_data.ew_indicator == 'w') {
                g_current_gps_data.longitude = -g_current_gps_data.longitude;
            }

            // 更新其他数据
            g_current_gps_data.altitude = g_gps_raw_data.altitude;
            g_current_gps_data.accuracy = g_gps_raw_data.hdop * 5.0;  // 估算精度
            g_current_gps_data.valid = true;
            g_current_gps_data.last_update_time = LOS_TickCountGet();

            // 复制原始数据
            snprintf(g_current_gps_data.raw_data, sizeof(g_current_gps_data.raw_data),
                     "%.6f,%.6f,%.1f", g_current_gps_data.latitude,
                     g_current_gps_data.longitude, g_current_gps_data.altitude);

            g_gps_stats.status = GPS_STATUS_FIXED;
            g_gps_stats.valid_sentences++;

            printf("GPS: %.6f°, %.6f°, %.1fm (Sats: %d)\n",
                   g_current_gps_data.latitude, g_current_gps_data.longitude,
                   g_current_gps_data.altitude, g_gps_raw_data.satellite_count);
        } else {
            g_gps_stats.status = GPS_STATUS_SEARCHING;
        }

        g_gps_stats.gga_count++;
        g_gps_stats.last_update_time = LOS_TickCountGet();

        LOS_MuxPost(g_gps_mutex);
    }

    return 0;
}

/**
 * @brief GPS任务函数
 */
void GPS_Task(void *arg)
{
    (void)arg;

    printf("GPS task started\n");

    // 初始化UART
    IotUartAttribute uart_attr = {
        .baudRate = GPS_UART_BAUDRATE,
        .dataBits = IOT_UART_DATA_BIT_8,
        .stopBits = IOT_UART_STOP_BIT_1,
        .parity = IOT_UART_PARITY_NONE,
        .rxBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .txBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .pad = 0
    };

    if (IoTUartInit(GPS_UART_PORT, &uart_attr) != IOT_SUCCESS) {
        printf("GPS UART initialization failed\n");
        g_gps_stats.status = GPS_STATUS_ERROR;
        return;
    }

    if (IoTUartSetFlowCtrl(GPS_UART_PORT, IOT_FLOW_CTRL_NONE) != IOT_SUCCESS) {
        printf("GPS UART flow control setup failed\n");
        IoTUartDeinit(GPS_UART_PORT);
        g_gps_stats.status = GPS_STATUS_ERROR;
        return;
    }

    printf("GPS UART initialized successfully (Port: EUART0_M0, Baudrate: %d)\n", GPS_UART_BAUDRATE);

    // 接收缓冲区
    unsigned char recv_buf[GPS_RECV_BUF_SIZE] = {0};
    char line_buf[GPS_MAX_SENTENCE_LEN] = {0};
    int line_pos = 0;
    int no_data_count = 0;
    uint32_t last_status_print = 0;

    g_gps_stats.status = GPS_STATUS_SEARCHING;

    while (1) {
        // 读取UART数据
        int len = IoTUartRead(GPS_UART_PORT, recv_buf, sizeof(recv_buf) - 1);

        if (len > 0) {
            no_data_count = 0;
            g_gps_stats.total_sentences++;

            // 处理接收到的数据
            for (int i = 0; i < len; i++) {
                char c = recv_buf[i];

                if (c == '\n' || c == '\r') {
                    if (line_pos > 0) {
                        line_buf[line_pos] = '\0';

                        // 解析NMEA语句
                        if (strncmp(line_buf, "$GPGGA", 6) == 0 || strncmp(line_buf, "$GNGGA", 6) == 0) {
                            GPS_ParseGGA(line_buf);
                        }

                        // 重置行缓冲区
                        line_pos = 0;
                        memset(line_buf, 0, sizeof(line_buf));
                    }
                } else {
                    // 添加字符到行缓冲区
                    if (line_pos < GPS_MAX_SENTENCE_LEN - 1) {
                        line_buf[line_pos++] = c;
                    }
                }
            }
        } else {
            no_data_count++;

            // 检查GPS数据超时
            uint32_t current_time = LOS_TickCountGet();
            if (g_current_gps_data.valid &&
                (current_time - g_current_gps_data.last_update_time) > GPS_TIMEOUT_MS) {

                if (LOS_MuxPend(g_gps_mutex, 1000) == LOS_OK) {
                    g_current_gps_data.valid = false;
                    g_gps_stats.status = GPS_STATUS_LOST;
                    LOS_MuxPost(g_gps_mutex);
                }

                printf("GPS data timeout - marking as invalid\n");
            }

            // 定期打印状态信息
            if (current_time - last_status_print > 30000) {  // 每30秒
                printf("GPS Status: %s, No data count: %d\n",
                       g_gps_stats.status == GPS_STATUS_SEARCHING ? "SEARCHING" :
                       g_gps_stats.status == GPS_STATUS_FIXED ? "FIXED" :
                       g_gps_stats.status == GPS_STATUS_LOST ? "LOST" : "ERROR",
                       no_data_count);
                last_status_print = current_time;
            }
        }

        // 任务延时
        usleep(10000);  // 10ms
    }

    // 清理资源
    IoTUartDeinit(GPS_UART_PORT);
    printf("GPS task ended\n");
}
