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
#include "../../config/app_config.h"

#if ENABLE_GPS

#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include "iot_uart.h"
#include "iot_errno.h"
#include "utils/fifo.h"  // 使用项目FIFO模块
#include "los_tick.h"  // For LOS_TickCountGet
#include "los_task.h"  // For LOS_TaskCreate
#include "cmsis_os2.h"  // For LOS_Msleep
#include "../xl01/gnss_rtcm_injection.h"

// GPS UART Configuration (moved from config to avoid dependency)
// UM220-IV NK uses the carrier's dedicated PB6/PB7 UART route.
#ifndef GPS_UART_ID
#define GPS_UART_ID         EUART0_M0    // PB6/PB7 - 板子标注的UART_TX/UART_RX
#endif

#ifndef GPS_BAUDRATE
#define GPS_BAUDRATE        9600
#endif

#define GPS_RECV_BUF_SIZE   512
#define GPS_LINE_BUF_SIZE   256  // Increased for longer NMEA sentences
#define GPS_POLL_DRAIN_BUDGET_BYTES FIFO_SIZE
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

static GnssSolutionParser g_gnss_parser;
static osMutexId_t g_gnss_parser_mutex = NULL;
static unsigned char g_last_logged_gga_quality = 0U;

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

#if GNSS_RTCM_INJECTION_CAPABILITY != GNSS_RTCM_INJECTION_DISABLED
static unsigned char g_rtcm_uart_frame[GNSS_RTCM_V3_MAX_FRAME_BYTES];
static uint32_t g_rtcm_last_status_log_tick = 0U;
#endif

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

static uint64_t GpsMonotonicMs(void)
{
    uint64_t ticks = (uint64_t)LOS_TickCountGet();
    uint64_t ticks_per_second = (uint64_t)g_ticksPerSec;

    if (ticks_per_second == 0U) return ticks;
    return (ticks / ticks_per_second) * 1000U +
           ((ticks % ticks_per_second) * 1000U) / ticks_per_second;
}

static void GnssParserLock(void)
{
    if (g_gnss_parser_mutex != NULL) osMutexAcquire(g_gnss_parser_mutex, osWaitForever);
}

static void GnssParserUnlock(void)
{
    if (g_gnss_parser_mutex != NULL) osMutexRelease(g_gnss_parser_mutex);
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

#if GNSS_RTCM_INJECTION_CAPABILITY != GNSS_RTCM_INJECTION_DISABLED
static int GPS_WriteRtcmFrame(const unsigned char *frame, uint16_t frame_bytes)
{
    uint16_t offset = 0U;

    while (offset < frame_bytes) {
        uint16_t remaining = (uint16_t)(frame_bytes - offset);
        uint16_t chunk = remaining > GNSS_RTCM_UART_CHUNK_SIZE
                             ? GNSS_RTCM_UART_CHUNK_SIZE
                             : remaining;
        int written = IoTUartWrite(GPS_UART_ID, frame + offset, chunk);

        if (written != (int)chunk) {
            GnssRtcmInjection_RecordWriteError(written > 0 ? 1U : 0U);
            return -1;
        }
        offset = (uint16_t)(offset + chunk);
    }

    GnssRtcmInjection_RecordInjected(frame_bytes, GpsMonotonicMs());
    return 0;
}

static void GPS_ProcessRtcmQueue(void)
{
    GnssRtcmRuntimeStatus runtime;
    uint64_t now_ms = GpsMonotonicMs();
    uint16_t frame_bytes = 0U;
    uint16_t message_type = 0U;
    int dequeue_ret = GnssRtcmInjection_TryDequeue(
        now_ms,
        g_rtcm_uart_frame,
        sizeof(g_rtcm_uart_frame),
        &frame_bytes,
        &message_type
    );

    (void)message_type;
    if (dequeue_ret <= 0) {
        return;
    }

    GnssRtcmInjection_GetRuntimeStatus(now_ms, &runtime);
    if (runtime.mode == GNSS_RTCM_INJECTION_PROBE) {
        GnssRtcmInjection_RecordProbe(frame_bytes, now_ms);
    } else if (runtime.mode == GNSS_RTCM_INJECTION_LIVE &&
               GPS_WriteRtcmFrame(g_rtcm_uart_frame, frame_bytes) != 0) {
        GnssRtcmInjection_RecordInjectionDrop();
    }
}

static void GPS_LogRtcmStatus(void)
{
    uint32_t now = (uint32_t)LOS_TickCountGet();
    uint32_t interval = LOS_MS2Tick(GNSS_RTCM_STATUS_LOG_INTERVAL_MS);
    GnssRtcmInjectionStats stats;
    GnssRtcmRuntimeStatus runtime;

    if (interval == 0U) {
        interval = 1U;
    }
    if (g_rtcm_last_status_log_tick != 0U &&
        now - g_rtcm_last_status_log_tick < interval) {
        return;
    }
    g_rtcm_last_status_log_tick = now;
    GnssRtcmInjection_GetStats(&stats);
    GnssRtcmInjection_GetRuntimeStatus(GpsMonotonicMs(), &runtime);
    if (stats.accepted_fragments == 0U && stats.rejected_fragments == 0U) {
        return;
    }
    printf(
        "[RTCM] mode=%d accepted=%u complete=%u duplicate=%u rejected=%u crc=%u "
        "expired=%u ttl_unverified=%u queue=%u/%u queue_evict=%u queue_expired=%u "
        "probe=%u injected=%u bytes=%u write_err=%u partial=%u drop=%u\n",
        runtime.mode,
        stats.accepted_fragments,
        stats.completed_frames,
        stats.duplicate_fragments,
        stats.rejected_fragments,
        stats.crc_errors,
        stats.expired_assemblies,
        stats.ttl_unverified_fragments,
        stats.queue_pending,
        stats.queue_high_watermark,
        stats.queue_evictions,
        stats.queue_expired_frames,
        stats.probe_validated_frames,
        stats.injected_frames,
        stats.injected_bytes,
        stats.uart_write_errors,
        stats.uart_partial_writes,
        stats.injection_dropped_frames
    );
}
#endif

// 后台任务：高频率轮询UART，将数据写入FIFO
// 注：RK2206 UART不支持硬件中断，使用轮询模拟
static void GPS_UartPollTask(void)
{
    unsigned char temp_buf[64];  // 临时缓冲区

#if GPS_UART_PROBE_LOG_MODE
    printf("[GPS PROBE] UART poll task running id=%u baud=%u\n", GPS_UART_ID, GPS_BAUDRATE);
#endif
    
    while (1) {
#if GNSS_RTCM_INJECTION_CAPABILITY != GNSS_RTCM_INJECTION_DISABLED
        // This task exclusively owns GNSS UART I/O. Queue producers never call
        // IoTUartWrite, so NMEA reads and RTCM writes cannot race in the HAL.
        GPS_ProcessRtcmQueue();
        GPS_LogRtcmStatus();
#endif
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

                int parse_result;
                GnssSolutionSnapshot snapshot;

                GnssParserLock();
                parse_result = GnssSolutionParser_PushNmea(
                    &g_gnss_parser,
                    g_line_buffer,
                    (uint32_t)GpsMonotonicMs()
                );
                if (parse_result > 0 &&
                    GnssSolutionParser_GetSnapshot(
                        &g_gnss_parser,
                        (uint32_t)GpsMonotonicMs(),
                        &snapshot
                    ) == 0 && snapshot.gga_quality != g_last_logged_gga_quality) {
                    g_last_logged_gga_quality = snapshot.gga_quality;
                    printf(
                        "[GNSS] GGA quality=%u trusted=%s satellites=%u correction_age_ms=%u\n",
                        snapshot.gga_quality,
                        (snapshot.fix_flags & GNSS_FIX_TRUSTED) != 0U ? "yes" : "no",
                        snapshot.satellites_used,
                        snapshot.correction_age_ms
                    );
                }
                GnssParserUnlock();
                
                // 只打印有用的语句（减少输出噪音）
                if (GPS_VERBOSE_NMEA_LOG && parse_result > 0) {
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
    GnssSolutionParser_Init(&g_gnss_parser, GNSS_COORDINATE_FRAME);
    g_gnss_parser_mutex = osMutexNew(NULL);
    if (g_gnss_parser_mutex == NULL) {
        printf("[GPS] ERROR: GNSS solution mutex init failed\n");
        return -1;
    }
    
    IotUartAttribute uart_attr = {
        .baudRate = GPS_BAUDRATE,
        .dataBits = IOT_UART_DATA_BIT_8,
        .stopBits = IOT_UART_STOP_BIT_1,
        .parity = IOT_UART_PARITY_NONE,
        .rxBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
#if GNSS_RTCM_INJECTION_CAPABILITY == GNSS_RTCM_INJECTION_LIVE
        .txBlock = IOT_UART_BLOCK_STATE_BLOCK,
#else
        .txBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
#endif
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

}

int GPS_ReadSolution(GnssSolutionSnapshot *solution)
{
    int result;
    if (solution == NULL) return -1;
    GnssParserLock();
    result = GnssSolutionParser_GetSnapshot(
        &g_gnss_parser,
        (uint32_t)GpsMonotonicMs(),
        solution
    );
    GnssParserUnlock();
    return result;
}

int GPS_GetGgaQuality(void)
{
    GnssSolutionSnapshot snapshot;
    return GPS_ReadSolution(&snapshot) == 0 ? (int)snapshot.gga_quality : 0;
}

#endif // ENABLE_GPS
