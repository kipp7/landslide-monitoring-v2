/*
 * GPS Module Implementation with NMEA Parsing
 *
 * Current source-of-truth implementation for the hardware stable version.
 * If GPS UART truth changes in the future, update this file together with:
 * - config/app_config.h
 * - 当前配置总结.md
 * - PINOUT.md
 * - 接线检查清单.md
 *
 * Do not re-activate gps_module.* as an alternative implementation unless a
 * new board-level decision explicitly replaces this file.
 */

#include "gps_driver.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include "iot_uart.h"
#include "iot_errno.h"
#include "utils/fifo.h"  // 使用项目FIFO模块
#include "los_tick.h"  // For LOS_TickCountGet
#include "los_task.h"  // For LOS_TaskCreate
#include "cmsis_os2.h"  // For LOS_Msleep

// GPS UART Configuration (moved from config to avoid dependency)
// ✓ 最终方案：MPU6050移至PB4/PB5，GPS使用板子标注的UART口
#ifndef GPS_UART_ID
#define GPS_UART_ID         EUART0_M0    // PB6/PB7 - 板子标注的UART_TX/UART_RX
#endif

#ifndef GPS_BAUDRATE
#define GPS_BAUDRATE        9600
#endif

#define GPS_RECV_BUF_SIZE   512
#define GPS_LINE_BUF_SIZE   256  // Increased for longer NMEA sentences

// GPS global data
static float g_gps_latitude = 0.0f;
static float g_gps_longitude = 0.0f;
static bool g_gps_valid = false;
static bool g_gps_fixed = false;  // GPS定位状态

// NMEA parsing buffer
static char g_line_buffer[GPS_LINE_BUF_SIZE];
static int g_line_pos = 0;

// UART中断接收FIFO (1024 bytes, defined in fifo.h)
static Fifo g_gps_fifo;

// Convert NMEA format (DDMM.MMMM) to decimal degrees (DD.DDDDDD)
static double ConvertToDegrees(const char* data)
{
    if (!data || strlen(data) < 4) {
        return 0.0;
    }
    
    double temp = atof(data);
    int degree = (int)(temp / 100);
    double minutes = temp - degree * 100.0;
    return degree + minutes / 60.0;
}

// Parse $GPGGA or $GNGGA sentence
static void ParseGGA(const char* line)
{
    if (!line) return;
    
    // Make a copy for strtok_r
    char copy[GPS_LINE_BUF_SIZE];
    strncpy(copy, line, GPS_LINE_BUF_SIZE - 1);
    copy[GPS_LINE_BUF_SIZE - 1] = '\0';
    
    char latitude_str[16] = {0};
    char longitude_str[16] = {0};
    char ns = 0, ew = 0;
    char fix_quality[2] = {0};
    
    int field_index = 0;
    char *token;
    char *saveptr;
    char *p = copy;
    
    while ((token = strtok_r(p, ",", &saveptr)) != NULL) {
        p = NULL;
        field_index++;
        
        switch (field_index) {
            case 3:  // Latitude (DDMM.MMMM)
                strncpy(latitude_str, token, sizeof(latitude_str) - 1);
                break;
            case 4:  // N/S
                ns = token[0];
                break;
            case 5:  // Longitude (DDDMM.MMMM)
                strncpy(longitude_str, token, sizeof(longitude_str) - 1);
                break;
            case 6:  // E/W
                ew = token[0];
                break;
            case 7:  // Fix quality (0=invalid, 1=GPS fix, 2=DGPS fix)
                fix_quality[0] = token[0];
                break;
            default:
                break;
        }
    }
    
    // Check if we have valid data
    if (latitude_str[0] && longitude_str[0] && (fix_quality[0] == '1' || fix_quality[0] == '2')) {
        double lat = ConvertToDegrees(latitude_str);
        double lon = ConvertToDegrees(longitude_str);
        
        if (ns == 'S' || ns == 's') {
            lat = -lat;
        }
        if (ew == 'W' || ew == 'w') {
            lon = -lon;
        }
        
        // Update global data
        g_gps_latitude = (float)lat;
        g_gps_longitude = (float)lon;
        g_gps_valid = true;
        g_gps_fixed = true;
        
        printf("✓✓✓ GPS定位成功(GGA): 纬度=%.6f° 经度=%.6f° ✓✓✓\n", lat, lon);
    } else if (fix_quality[0] == '0') {
        g_gps_fixed = false;
    }
}

// Parse $GPRMC or $GNRMC sentence (RMC更常用，数据更完整)
// Format: $GNRMC,time,status,lat,N/S,lon,E/W,speed,course,date,mag_var,mag_dir*checksum
static void ParseRMC(const char* line)
{
    if (!line) return;
    
    // Make a copy for strtok_r
    char copy[GPS_LINE_BUF_SIZE];
    strncpy(copy, line, GPS_LINE_BUF_SIZE - 1);
    copy[GPS_LINE_BUF_SIZE - 1] = '\0';
    
    char latitude_str[16] = {0};
    char longitude_str[16] = {0};
    char ns = 0, ew = 0;
    char status = 0;
    
    int field_index = 0;
    char *token;
    char *saveptr;
    char *p = copy;
    
    while ((token = strtok_r(p, ",", &saveptr)) != NULL) {
        p = NULL;
        field_index++;
        
        switch (field_index) {
            case 3:  // Status (A=valid, V=invalid)
                status = token[0];
                break;
            case 4:  // Latitude (DDMM.MMMM)
                strncpy(latitude_str, token, sizeof(latitude_str) - 1);
                break;
            case 5:  // N/S
                ns = token[0];
                break;
            case 6:  // Longitude (DDDMM.MMMM)
                strncpy(longitude_str, token, sizeof(longitude_str) - 1);
                break;
            case 7:  // E/W
                ew = token[0];
                break;
            default:
                break;
        }
    }
    
    // Debug: 打印解析的字段
    static int debug_count = 0;
    if (debug_count++ % 20 == 0) {  // 每20条打印一次调试信息
        printf("[RMC] 字段数=%d, status='%c', lat='%s', ns='%c', lon='%s', ew='%c'\n",
               field_index, status, latitude_str, ns, longitude_str, ew);
    }
    
    // Check if we have valid data (status='A' means valid)
    if (latitude_str[0] && longitude_str[0] && (status == 'A' || status == 'a')) {
        double lat = ConvertToDegrees(latitude_str);
        double lon = ConvertToDegrees(longitude_str);
        
        if (ns == 'S' || ns == 's') {
            lat = -lat;
        }
        if (ew == 'W' || ew == 'w') {
            lon = -lon;
        }
        
        // Update global data
        g_gps_latitude = (float)lat;
        g_gps_longitude = (float)lon;
        g_gps_valid = true;
        g_gps_fixed = true;
        
        printf("✓✓✓ GPS定位成功(RMC): 纬度=%.6f° 经度=%.6f° ✓✓✓\n", lat, lon);
    } else if (status == 'V' || status == 'v') {
        g_gps_fixed = false;
    } else {
        // 数据不完整的警告
        if (status == 'A' && (!latitude_str[0] || !longitude_str[0])) {
            printf("[GPS] ⚠️ RMC数据不完整: lat=%s lon=%s\n", latitude_str, longitude_str);
        }
    }
}

// 后台任务：高频率轮询UART，将数据写入FIFO
// 注：RK2206 UART不支持硬件中断，使用轮询模拟
static void GPS_UartPollTask(void)
{
    unsigned char temp_buf[64];  // 临时缓冲区
    
    while (1) {
        // 尝试读取UART数据
        int len = IoTUartRead(GPS_UART_ID, temp_buf, sizeof(temp_buf));
        if (len > 0) {
            // 写入FIFO缓冲区
            Fifo_Write(&g_gps_fifo, temp_buf, len);
        }
        
        // 10ms轮询一次（100Hz），足够GPS 9600波特率
        LOS_Msleep(10);
    }
}

// Process received UART data
static void ProcessGPSData(const unsigned char* data, int len)
{
    for (int i = 0; i < len; i++) {
        char c = data[i];
        
        // 只接受可打印字符和换行符，过滤乱码
        if (c == '\n' || c == '\r') {
            if (g_line_pos > 6) {  // 至少需要"$XXXXX"
                g_line_buffer[g_line_pos] = '\0';
                
                // 只处理关键的NMEA语句（GNRMC和GNGGA）
                bool is_useful = false;
                if (strncmp(g_line_buffer, "$GPGGA", 6) == 0 || 
                    strncmp(g_line_buffer, "$GNGGA", 6) == 0) {
                    is_useful = true;
                    ParseGGA(g_line_buffer);
                }
                else if (strncmp(g_line_buffer, "$GPRMC", 6) == 0 || 
                         strncmp(g_line_buffer, "$GNRMC", 6) == 0) {
                    is_useful = true;
                    ParseRMC(g_line_buffer);
                }
                
                // 只打印有用的语句（减少输出噪音）
                if (is_useful) {
                    printf("📡 GPS: %s\n", g_line_buffer);
                }
                
                g_line_pos = 0;
                memset(g_line_buffer, 0, sizeof(g_line_buffer));  // 清空缓冲
            } else {
                // 丢弃过短的行
                g_line_pos = 0;
            }
        } else if (c >= 0x20 && c <= 0x7E) {  // 只接受可打印ASCII字符
            if (g_line_pos < GPS_LINE_BUF_SIZE - 1) {
                g_line_buffer[g_line_pos++] = c;
            } else {
                // Buffer overflow - 丢弃整行
                g_line_pos = 0;
                memset(g_line_buffer, 0, sizeof(g_line_buffer));
            }
        }
        // 忽略其他字符（乱码）
    }
}

int GPS_Init(void)
{
    printf("[GPS] Initializing UART0 with polling task (Baudrate: %d)...\n", GPS_BAUDRATE);
    
    // 初始化FIFO缓冲区 (1024 bytes)
    Fifo_Init(&g_gps_fifo);
    printf("[GPS] FIFO initialized (1024 bytes)\n");
    
    IotUartAttribute uart_attr = {
        .baudRate = GPS_BAUDRATE,
        .dataBits = IOT_UART_DATA_BIT_8,
        .stopBits = IOT_UART_STOP_BIT_1,
        .parity = IOT_UART_PARITY_NONE,
        .rxBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .txBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .pad = IOT_FLOW_CTRL_NONE,
    };
    
    unsigned int ret = IoTUartInit(GPS_UART_ID, &uart_attr);
    if (ret != IOT_SUCCESS) {
        printf("[ERROR] GPS UART init failed: %u\n", ret);
        return -1;
    }
    
    // 创建后台轮询任务（模拟中断接收）
    TSK_INIT_PARAM_S taskParam = {0};
    taskParam.pfnTaskEntry = (TSK_ENTRY_FUNC)GPS_UartPollTask;
    taskParam.uwStackSize = 2048;  // 2KB stack
    taskParam.pcName = "GPS_UartPoll";
    taskParam.usTaskPrio = 25;  // 中等优先级
    
    UINT32 taskID;
    ret = LOS_TaskCreate(&taskID, &taskParam);
    if (ret != LOS_OK) {
        printf("[GPS] ERROR: Failed to create poll task (ret=%u)\n", ret);
        return -1;
    }
    
    printf("[OK] GPS initialized with NMEA parsing + polling task ⚡\n");
    g_gps_valid = true;  // UART is valid, waiting for fix
    
    return 0;
}

// Poll GPS UART for new data (call this regularly from main loop)
// 中断模式：从FIFO读取中断接收到的数据
void GPS_Poll(void)
{
    unsigned char recv_buf[GPS_RECV_BUF_SIZE];
    
    // 从FIFO读取数据（中断已经把数据写入FIFO）
    int len = Fifo_Read(&g_gps_fifo, recv_buf, GPS_RECV_BUF_SIZE - 1);
    if (len > 0) {
        ProcessGPSData(recv_buf, len);
        
        // 调试：每10秒打印一次FIFO状态
        static uint32_t last_print = 0;
        uint32_t now = LOS_TickCountGet() / 100;  // 转换为秒
        if (now - last_print >= 10) {
            last_print = now;
            int avail = Fifo_Available(&g_gps_fifo);
            if (avail > 0) {
                printf("[GPS] FIFO: %d bytes waiting\n", avail);
            }
        }
    }
}

int GPS_Read(float *lat, float *lon)
{
    if (!g_gps_valid) {
        return -1;
    }
    
    // 总是更新坐标值（即使fix状态为false）
    *lat = g_gps_latitude;
    *lon = g_gps_longitude;
    
    // 返回值表示GPS是否有有效定位
    // 但坐标值已经被更新（可能是最后一次有效定位的坐标）
    return g_gps_fixed ? 0 : -1;
}
