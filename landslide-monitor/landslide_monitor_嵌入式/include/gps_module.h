#ifndef __GPS_MODULE_H__
#define __GPS_MODULE_H__

#include <stdint.h>
#include <stdbool.h>
#include "landslide_monitor.h"

#ifdef __cplusplus
extern "C" {
#endif

// GPS模块配置
#define GPS_UART_PORT               EUART0_M0       // GPS模块使用UART0_M0
#define GPS_UART_RX                 GPIO0_PB6       // RX引脚
#define GPS_UART_TX                 GPIO0_PB7       // TX引脚
#define GPS_UART_BAUDRATE           9600            // GPS模块波特率
#define GPS_RECV_BUF_SIZE           512             // 接收缓冲区大小
#define GPS_MAX_SENTENCE_LEN        256             // NMEA语句最大长度

// GPS数据更新间隔
#define GPS_UPDATE_INTERVAL_MS      1000            // GPS数据更新间隔 1秒
#define GPS_TIMEOUT_MS              5000            // GPS数据超时时间 5秒
#define GPS_VALID_THRESHOLD         3               // 连续有效数据次数阈值

// NMEA语句类型
typedef enum {
    NMEA_TYPE_UNKNOWN = 0,
    NMEA_TYPE_GGA,                  // 全球定位系统定位数据
    NMEA_TYPE_RMC,                  // 推荐最小定位信息
    NMEA_TYPE_GSA,                  // 当前卫星信息
    NMEA_TYPE_GSV,                  // 可见卫星信息
    NMEA_TYPE_VTG                   // 地面速度信息
} NmeaType;

// GPS状态
typedef enum {
    GPS_STATUS_INIT = 0,            // 初始化状态
    GPS_STATUS_SEARCHING,           // 搜星状态
    GPS_STATUS_FIXED,               // 定位成功
    GPS_STATUS_LOST,                // 信号丢失
    GPS_STATUS_ERROR                // 错误状态
} GpsStatus;

// GPS统计信息
typedef struct {
    uint32_t total_sentences;       // 接收到的NMEA语句总数
    uint32_t valid_sentences;       // 有效NMEA语句数
    uint32_t gga_count;             // GGA语句计数
    uint32_t rmc_count;             // RMC语句计数
    uint32_t parse_errors;          // 解析错误次数
    uint32_t last_update_time;      // 最后更新时间
    GpsStatus status;               // GPS状态
} GpsStats;

// GPS模块内部数据结构
typedef struct {
    char raw_sentence[GPS_MAX_SENTENCE_LEN];    // 原始NMEA语句
    char latitude_str[16];                      // 纬度字符串
    char longitude_str[16];                     // 经度字符串
    char ns_indicator;                          // 南北半球指示符
    char ew_indicator;                          // 东西半球指示符
    char quality_indicator;                     // 定位质量指示符
    uint8_t satellite_count;                    // 卫星数量
    float hdop;                                 // 水平精度因子
    float altitude;                             // 海拔高度
    char altitude_unit;                         // 海拔单位
} GpsRawData;

/**
 * @brief 初始化GPS模块
 * @return 0: 成功, 其他: 失败
 */
int GPS_Init(void);

/**
 * @brief 反初始化GPS模块
 */
void GPS_Deinit(void);

/**
 * @brief 获取GPS数据
 * @param gps_data GPS数据结构指针
 * @return 0: 成功, 其他: 失败
 */
int GPS_GetData(GPSData *gps_data);

/**
 * @brief 检查GPS数据是否有效
 * @return true: 有效, false: 无效
 */
bool GPS_IsDataValid(void);

/**
 * @brief 获取GPS状态
 * @return GPS状态
 */
GpsStatus GPS_GetStatus(void);

/**
 * @brief 获取GPS统计信息
 * @param stats 统计信息结构指针
 */
void GPS_GetStats(GpsStats *stats);

/**
 * @brief 重置GPS统计信息
 */
void GPS_ResetStats(void);

/**
 * @brief GPS任务函数（内部使用）
 * @param arg 任务参数
 */
void GPS_Task(void *arg);

/**
 * @brief 解析GGA语句（内部使用）
 * @param sentence NMEA语句
 * @return 0: 成功, 其他: 失败
 */
int GPS_ParseGGA(const char *sentence);

/**
 * @brief 解析RMC语句（内部使用）
 * @param sentence NMEA语句
 * @return 0: 成功, 其他: 失败
 */
int GPS_ParseRMC(const char *sentence);

/**
 * @brief 转换坐标格式（内部使用）
 * @param coord_str 坐标字符串
 * @return 转换后的坐标值
 */
double GPS_ConvertCoordinate(const char *coord_str);

/**
 * @brief 验证NMEA校验和（内部使用）
 * @param sentence NMEA语句
 * @return true: 校验成功, false: 校验失败
 */
bool GPS_VerifyChecksum(const char *sentence);

/**
 * @brief 打印GPS调试信息
 */
void GPS_PrintDebugInfo(void);

#ifdef __cplusplus
}
#endif

#endif // __GPS_MODULE_H__
