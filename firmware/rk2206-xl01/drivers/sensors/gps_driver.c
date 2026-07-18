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
#include "../../config/app_config.h"
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
#define GPS_POLL_DRAIN_BUDGET_BYTES FIFO_SIZE
#define GPS_FIX_STALE_TIMEOUT_MS 15000U
#define GPS_FIFO_STATUS_LOG_INTERVAL_MS 10000U

#ifndef GPS_VERBOSE_NMEA_LOG
#define GPS_VERBOSE_NMEA_LOG 0
#endif

#ifndef GPS_UART_PROBE_LOG_MODE
#define GPS_UART_PROBE_LOG_MODE 1
#endif

#define GPS_UART_PROBE_IDLE_LOG_INTERVAL_MS 3000U
#define GPS_UART_PROBE_RX_LOG_INTERVAL_MS 1000U
#define GPS_UART_PROBE_PREVIEW_BYTES 24

// GPS global data
static float g_gps_latitude = 0.0f;
static float g_gps_longitude = 0.0f;
static bool g_gps_valid = false;
static bool g_gps_fixed = false;  // GPS定位状态
static uint32_t g_gps_last_fix_tick = 0;

// NMEA parsing buffer
static char g_line_buffer[GPS_LINE_BUF_SIZE];
static int g_line_pos = 0;
static unsigned int g_last_reported_fifo_drop_events = 0;
static uint32_t g_last_fifo_write_warn_tick = 0;
static int g_last_uart_read_status = 0;
static volatile int g_gps_resync_requested = 0;
static uint32_t g_uart_last_idle_probe_tick = 0;
static uint32_t g_uart_last_rx_probe_tick = 0;
static uint32_t g_uart_total_rx_bytes = 0;
static bool g_line_collecting = false;

// UART中断接收FIFO (1024 bytes, defined in fifo.h)
static Fifo g_gps_fifo;

static void ResetGpsLineState(void)
{
    g_line_collecting = false;
    g_line_pos = 0;
    memset(g_line_buffer, 0, sizeof(g_line_buffer));
}

static void StartGpsLineState(void)
{
    ResetGpsLineState();
    g_line_collecting = true;
    g_line_buffer[g_line_pos++] = '$';
}

static int HexCharValue(char c)
{
    if (c >= '0' && c <= '9') {
        return c - '0';
    }
    if (c >= 'A' && c <= 'F') {
        return c - 'A' + 10;
    }
    if (c >= 'a' && c <= 'f') {
        return c - 'a' + 10;
    }
    return -1;
}

static bool IsNmeaChecksumValid(const char *line)
{
    const char *star;
    unsigned char checksum = 0;
    unsigned char expected;
    int hi;
    int lo;
    const char *p;

    if (line == NULL || line[0] != '$') {
        return false;
    }

    star = strchr(line, '*');
    if (star == NULL || star <= line + 1 || star[1] == '\0' || star[2] == '\0') {
        return false;
    }

    for (p = line + 1; p < star; ++p) {
        checksum ^= (unsigned char)(*p);
    }

    hi = HexCharValue(star[1]);
    lo = HexCharValue(star[2]);
    if (hi < 0 || lo < 0) {
        return false;
    }

    expected = (unsigned char)((hi << 4) | lo);
    return checksum == expected;
}

static void PrintGpsUartProbeChunk(const unsigned char *data, int len)
{
#if GPS_UART_PROBE_LOG_MODE
    int preview_len;
    int i;

    if (data == NULL || len <= 0) {
        return;
    }

    preview_len = len;
    if (preview_len > GPS_UART_PROBE_PREVIEW_BYTES) {
        preview_len = GPS_UART_PROBE_PREVIEW_BYTES;
    }

    printf("[GPS PROBE] UART RX len=%d total=%u hex=", len, g_uart_total_rx_bytes);
    for (i = 0; i < preview_len; ++i) {
        printf("%02X", data[i]);
        if (i + 1 < preview_len) {
            printf(" ");
        }
    }
    printf(" ascii=");
    for (i = 0; i < preview_len; ++i) {
        unsigned char c = data[i];
        printf("%c", (c >= 0x20 && c <= 0x7E) ? c : '.');
    }
    if (len > preview_len) {
        printf("...");
    }
    printf("\n");
#else
    (void)data;
    (void)len;
#endif
}

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

static bool IsNmeaSentenceType(const char *line, const char *sentence_type)
{
    size_t type_len;

    if (line == NULL || sentence_type == NULL || line[0] != '$') {
        return false;
    }

    type_len = strlen(sentence_type);
    if (type_len == 0U) {
        return false;
    }

    // NMEA talker IDs vary by GNSS constellation: GP/GN/GB/BD/GA/GL...
    // The sentence formatter is always the last 3 chars after the 2-char talker.
    return strlen(line) >= (1U + 2U + type_len) &&
           strncmp(line + 3, sentence_type, type_len) == 0;
}

// Parse GGA sentence from any GNSS talker, for example $GPGGA/$GNGGA/$GBGGA.
static void ParseGGA(const char* line)
{
    if (!line) return;
    bool had_fix = g_gps_fixed;
    
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
    
    // GGA fix quality:
    // 1=GPS fix, 2=DGPS fix, 4=RTK fixed, 5=RTK float.
    bool is_position_fix =
        fix_quality[0] == '1' ||
        fix_quality[0] == '2' ||
        fix_quality[0] == '4' ||
        fix_quality[0] == '5';

    // Check if we have valid data
    if (latitude_str[0] && longitude_str[0] && is_position_fix) {
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
        g_gps_last_fix_tick = LOS_TickCountGet();

        if (!had_fix) {
            printf("[GPS] Fix acquired (GGA q=%c): lat=%.6f lon=%.6f\n", fix_quality[0], lat, lon);
        }
    } else if (fix_quality[0] == '0') {
        if (had_fix) {
            printf("[GPS] Fix lost (GGA)\n");
        }
        g_gps_fixed = false;
        g_gps_last_fix_tick = 0;
    }
}

// Parse RMC sentence from any GNSS talker, for example $GPRMC/$GNRMC/$GBRMC.
// Format: $GNRMC,time,status,lat,N/S,lon,E/W,speed,course,date,mag_var,mag_dir*checksum
static void ParseRMC(const char* line)
{
    if (!line) return;
    bool had_fix = g_gps_fixed;
    
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
        g_gps_last_fix_tick = LOS_TickCountGet();

        if (!had_fix) {
            printf("[GPS] Fix acquired (RMC): lat=%.6f lon=%.6f\n", lat, lon);
        }
    } else if (status == 'V' || status == 'v') {
        if (had_fix) {
            printf("[GPS] Fix lost (RMC)\n");
        }
        g_gps_fixed = false;
        g_gps_last_fix_tick = 0;
    } else {
        // 数据不完整的警告
        if (GPS_VERBOSE_NMEA_LOG && status == 'A' && (!latitude_str[0] || !longitude_str[0])) {
            printf("[GPS] WARN RMC data incomplete: lat=%s lon=%s\n", latitude_str, longitude_str);
        }
    }
}

// 后台任务：高频率轮询UART，将数据写入FIFO
// 注：RK2206 UART不支持硬件中断，使用轮询模拟
static void GPS_UartPollTask(void)
{
    unsigned char temp_buf[64];  // 临时缓冲区

#if GPS_UART_PROBE_LOG_MODE
    printf("[GPS PROBE] UART poll task running id=%u baud=%u\n", GPS_UART_ID, GPS_BAUDRATE);
#endif
    
    while (1) {
        // 尝试读取UART数据
        int len = IoTUartRead(GPS_UART_ID, temp_buf, sizeof(temp_buf));
        if (len > 0) {
            uint32_t now = LOS_TickCountGet();
            uint32_t rx_log_interval_ticks = LOS_MS2Tick(GPS_UART_PROBE_RX_LOG_INTERVAL_MS);
            int written = Fifo_Write(&g_gps_fifo, temp_buf, (unsigned int)len);

            if (rx_log_interval_ticks == 0U) {
                rx_log_interval_ticks = 1U;
            }
            g_uart_total_rx_bytes += (uint32_t)len;
            if (GPS_UART_PROBE_LOG_MODE &&
                (g_uart_last_rx_probe_tick == 0U || (now - g_uart_last_rx_probe_tick) >= rx_log_interval_ticks)) {
                g_uart_last_rx_probe_tick = now;
                PrintGpsUartProbeChunk(temp_buf, len);
            }

            g_last_uart_read_status = 1;
            if (written < 0) {
                if ((g_last_fifo_write_warn_tick == 0U) || ((now - g_last_fifo_write_warn_tick) >= 200U)) {
                    g_last_fifo_write_warn_tick = now;
                    printf("[GPS] FIFO write unavailable; dropping UART chunk len=%d\n", len);
                }
                g_gps_resync_requested = 1;
            } else if (written < len) {
                uint32_t now = LOS_TickCountGet();

                if ((g_last_fifo_write_warn_tick == 0U) || ((now - g_last_fifo_write_warn_tick) >= 200U)) {
                    g_last_fifo_write_warn_tick = now;
                    printf("[GPS] FIFO short write %d/%d dropped_bytes=%u dropped_events=%u\n",
                           written,
                           len,
                           Fifo_DroppedBytes(&g_gps_fifo),
                           Fifo_DroppedEvents(&g_gps_fifo));
                }
                g_gps_resync_requested = 1;
            }
        } else if (len < 0) {
            if (g_last_uart_read_status != len) {
                g_last_uart_read_status = len;
                printf("[GPS] UART read error ret=%d\n", len);
            }
        } else {
            uint32_t now = LOS_TickCountGet();
            uint32_t idle_log_interval_ticks = LOS_MS2Tick(GPS_UART_PROBE_IDLE_LOG_INTERVAL_MS);

            if (idle_log_interval_ticks == 0U) {
                idle_log_interval_ticks = 1U;
            }
            if (GPS_UART_PROBE_LOG_MODE &&
                (g_uart_last_idle_probe_tick == 0U || (now - g_uart_last_idle_probe_tick) >= idle_log_interval_ticks)) {
                g_uart_last_idle_probe_tick = now;
                printf(
                    "[GPS PROBE] UART idle no bytes id=%u baud=%u total=%u\n",
                    GPS_UART_ID,
                    GPS_BAUDRATE,
                    g_uart_total_rx_bytes
                );
            }
            g_last_uart_read_status = 0;
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

        if (c == '$') {
            StartGpsLineState();
            continue;
        }

        // 只接受可打印字符和换行符，过滤乱码
        if (c == '\n' || c == '\r') {
            if (g_line_collecting && g_line_pos > 6) {  // 至少需要"$XXXXX"
                g_line_buffer[g_line_pos] = '\0';

                // 只处理关键的NMEA语句（RMC和GGA），兼容 GP/GN/GB 等 talker。
                bool is_useful = false;
                if (!IsNmeaChecksumValid(g_line_buffer)) {
                    ResetGpsLineState();
                    continue;
                }

                if (IsNmeaSentenceType(g_line_buffer, "GGA")) {
                    is_useful = true;
                    ParseGGA(g_line_buffer);
                }
                else if (IsNmeaSentenceType(g_line_buffer, "RMC")) {
                    is_useful = true;
                    ParseRMC(g_line_buffer);
                }
                
                // 只打印有用的语句（减少输出噪音）
                if (GPS_VERBOSE_NMEA_LOG && is_useful) {
                    printf("[GPS RAW] %s\n", g_line_buffer);
                }
                
                ResetGpsLineState();
            } else {
                // 丢弃过短的行
                ResetGpsLineState();
            }
        } else if (c >= 0x20 && c <= 0x7E) {  // 只接受可打印ASCII字符
            if (!g_line_collecting) {
                continue;
            }
            if (g_line_pos < GPS_LINE_BUF_SIZE - 1) {
                g_line_buffer[g_line_pos++] = c;
            } else {
                // Buffer overflow - 丢弃整行
                ResetGpsLineState();
            }
        }
        // 忽略其他字符（乱码）
    }
}

int GPS_Init(void)
{
    printf("[GPS] Initializing UART id=%u with polling task (baud=%d)...\n", GPS_UART_ID, GPS_BAUDRATE);
    
    // 初始化FIFO缓冲区 (1024 bytes)
    Fifo_Init(&g_gps_fifo);
    if (!Fifo_IsReady(&g_gps_fifo)) {
        printf("[GPS] ERROR: FIFO init failed\n");
        return -1;
    }
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
    
    printf("[OK] GPS initialized with NMEA parsing + polling task\n");
    g_gps_valid = true;  // UART is valid, waiting for fix
    
    return 0;
}

// Poll GPS UART for new data (call this regularly from main loop)
// 中断模式：从FIFO读取中断接收到的数据
void GPS_Poll(void)
{
    unsigned char recv_buf[GPS_RECV_BUF_SIZE];
    unsigned int total_drained = 0;
    unsigned int dropped_events = Fifo_DroppedEvents(&g_gps_fifo);

    if (g_gps_resync_requested) {
        g_gps_resync_requested = 0;
        ResetGpsLineState();
    }

    if (dropped_events != g_last_reported_fifo_drop_events) {
        g_last_reported_fifo_drop_events = dropped_events;
        ResetGpsLineState();
        printf("[GPS] FIFO overrun detected: dropped_bytes=%u dropped_events=%u avail=%d high_water=%u\n",
               Fifo_DroppedBytes(&g_gps_fifo),
               dropped_events,
               Fifo_Available(&g_gps_fifo),
               Fifo_HighWatermark(&g_gps_fifo));
    }

    // 从FIFO读取数据（轮询任务已经把数据写入FIFO），单次尽量清空 backlog。
    while (total_drained < GPS_POLL_DRAIN_BUDGET_BYTES) {
        unsigned int remaining_budget = GPS_POLL_DRAIN_BUDGET_BYTES - total_drained;
        unsigned int chunk_budget = remaining_budget;
        int len;

        if (chunk_budget > (GPS_RECV_BUF_SIZE - 1)) {
            chunk_budget = (GPS_RECV_BUF_SIZE - 1);
        }

        len = Fifo_Read(&g_gps_fifo, recv_buf, chunk_budget);
        if (len <= 0) {
            break;
        }

        ProcessGPSData(recv_buf, len);
        total_drained += (unsigned int)len;
    }

    // 调试：每10秒打印一次FIFO状态
    {
        static uint32_t last_print = 0;
        uint32_t now = LOS_TickCountGet();
        uint32_t log_interval_ticks = LOS_MS2Tick(GPS_FIFO_STATUS_LOG_INTERVAL_MS);

        if (log_interval_ticks == 0U) {
            log_interval_ticks = 1U;
        }

        if ((now - last_print) >= log_interval_ticks) {
            int avail = Fifo_Available(&g_gps_fifo);
            last_print = now;
            if (avail > 0 || Fifo_DroppedEvents(&g_gps_fifo) > 0) {
                printf("[GPS] FIFO: avail=%d dropped_bytes=%u dropped_events=%u high_water=%u\n",
                       avail,
                       Fifo_DroppedBytes(&g_gps_fifo),
                       Fifo_DroppedEvents(&g_gps_fifo),
                       Fifo_HighWatermark(&g_gps_fifo));
            }
        }
    }

    if (g_gps_fixed && g_gps_last_fix_tick != 0U) {
        uint32_t now = LOS_TickCountGet();
        uint32_t stale_timeout_ticks = LOS_MS2Tick(GPS_FIX_STALE_TIMEOUT_MS);

        if (stale_timeout_ticks == 0U) {
            stale_timeout_ticks = 1U;
        }

        if ((now - g_gps_last_fix_tick) > stale_timeout_ticks) {
            g_gps_fixed = false;
            g_gps_last_fix_tick = 0U;
            printf("[GPS] Fix expired after %u ms without fresh valid sentence\n", GPS_FIX_STALE_TIMEOUT_MS);
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
