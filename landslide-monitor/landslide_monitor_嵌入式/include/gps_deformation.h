#ifndef __GPS_DEFORMATION_H__
#define __GPS_DEFORMATION_H__

#include <stdint.h>
#include <stdbool.h>
#include "gps_module.h"

#ifndef size_t
typedef unsigned int size_t;
#endif

#ifdef __cplusplus
extern "C" {
#endif

// GPS形变监测配置
#define GPS_DEFORM_HISTORY_SIZE     50      // 历史位置记录数量
#define GPS_DEFORM_MIN_ACCURACY     20.0f   // 最小精度要求 (米)
#define GPS_DEFORM_ALERT_DISTANCE   2.0f    // 位移警报阈值 (米)
#define GPS_DEFORM_CRITICAL_DISTANCE 5.0f   // 位移危险阈值 (米)
#define GPS_DEFORM_VELOCITY_WINDOW  10      // 速度计算窗口 (数据点)

// 地质形变类型
typedef enum {
    DEFORM_TYPE_NONE = 0,           // 无形变
    DEFORM_TYPE_HORIZONTAL,         // 水平位移
    DEFORM_TYPE_VERTICAL,           // 垂直位移
    DEFORM_TYPE_COMBINED,           // 复合位移
    DEFORM_TYPE_ROTATION            // 旋转位移
} DeformationType;

// 形变风险等级
typedef enum {
    DEFORM_RISK_SAFE = 0,           // 安全
    DEFORM_RISK_LOW = 1,            // 低风险
    DEFORM_RISK_MEDIUM = 2,         // 中风险
    DEFORM_RISK_HIGH = 3,           // 高风险
    DEFORM_RISK_CRITICAL = 4        // 危险
} DeformationRisk;

// GPS位置历史记录
typedef struct {
    double latitude;                // 纬度
    double longitude;               // 经度
    float altitude;                 // 海拔高度
    float accuracy;                 // 定位精度
    uint32_t timestamp;             // 时间戳
    bool valid;                     // 数据有效性
} GPSPositionRecord;

// 位移向量
typedef struct {
    float distance_2d;              // 2D位移距离 (米)
    float distance_3d;              // 3D位移距离 (米)
    float horizontal_distance;      // 水平位移距离 (米)
    float vertical_distance;        // 垂直位移距离 (米)
    float bearing;                  // 位移方向角 (度)
    float elevation_angle;          // 仰角 (度)
    uint32_t time_span;             // 时间跨度 (秒)
} DisplacementVector;

// 形变速度
typedef struct {
    float horizontal_velocity;      // 水平速度 (米/小时)
    float vertical_velocity;        // 垂直速度 (米/小时)
    float total_velocity;           // 总速度 (米/小时)
    float acceleration;             // 加速度 (米/小时²)
    bool is_accelerating;           // 是否在加速
} DeformationVelocity;

// 形变统计信息
typedef struct {
    float max_displacement;         // 最大位移 (米)
    float total_displacement;       // 累计位移 (米)
    float avg_velocity;             // 平均速度 (米/小时)
    float max_velocity;             // 最大速度 (米/小时)
    uint32_t alert_count;           // 警报次数
    uint32_t monitoring_duration;   // 监测时长 (秒)
    DeformationType dominant_type;  // 主要形变类型
} DeformationStats;

// GPS形变分析结果
typedef struct {
    // 基准位置
    GPSPositionRecord baseline_position;    // 基准位置
    GPSPositionRecord current_position;     // 当前位置
    
    // 位移分析
    DisplacementVector displacement;        // 位移向量
    DeformationVelocity velocity;          // 形变速度
    
    // 风险评估
    DeformationRisk risk_level;            // 风险等级
    DeformationType deform_type;           // 形变类型
    float confidence;                      // 置信度 (0.0-1.0)
    
    // 状态信息
    bool baseline_established;             // 基准是否建立
    bool analysis_valid;                   // 分析是否有效
    uint32_t analysis_timestamp;          // 分析时间戳
    char description[64];                  // 形变描述
    
    // 统计信息
    DeformationStats stats;                // 统计信息
} GPSDeformationAnalysis;

/**
 * @brief 初始化GPS形变监测
 * @return 0: 成功, 其他: 失败
 */
int GPS_Deformation_Init(void);

/**
 * @brief 反初始化GPS形变监测
 */
void GPS_Deformation_Deinit(void);

/**
 * @brief 设置基准位置
 * @param gps_data GPS数据
 * @return 0: 成功, 其他: 失败
 */
int GPS_Deformation_SetBaseline(const GPSData *gps_data);

/**
 * @brief 添加GPS位置数据进行形变分析
 * @param gps_data GPS数据
 * @return 0: 成功, 其他: 失败
 */
int GPS_Deformation_AddPosition(const GPSData *gps_data);

/**
 * @brief 获取形变分析结果
 * @param analysis 分析结果结构指针
 * @return 0: 成功, 其他: 失败
 */
int GPS_Deformation_GetAnalysis(GPSDeformationAnalysis *analysis);

/**
 * @brief 检查是否有形变警报
 * @return true: 有警报, false: 无警报
 */
bool GPS_Deformation_HasAlert(void);

/**
 * @brief 获取形变风险等级
 * @return 形变风险等级
 */
DeformationRisk GPS_Deformation_GetRiskLevel(void);

/**
 * @brief 重置形变监测数据
 */
void GPS_Deformation_Reset(void);

/**
 * @brief 计算两点间距离
 * @param lat1 点1纬度
 * @param lon1 点1经度
 * @param lat2 点2纬度
 * @param lon2 点2经度
 * @return 距离 (米)
 */
float GPS_Deformation_CalculateDistance(double lat1, double lon1, double lat2, double lon2);

/**
 * @brief 计算两点间方位角
 * @param lat1 点1纬度
 * @param lon1 点1经度
 * @param lat2 点2纬度
 * @param lon2 点2经度
 * @return 方位角 (度)
 */
float GPS_Deformation_CalculateBearing(double lat1, double lon1, double lat2, double lon2);

/**
 * @brief 获取形变统计信息
 * @param stats 统计信息结构指针
 */
void GPS_Deformation_GetStats(DeformationStats *stats);

/**
 * @brief 打印形变分析调试信息
 */
void GPS_Deformation_PrintDebugInfo(void);

/**
 * @brief 导出形变历史数据
 * @param buffer 输出缓冲区
 * @param buffer_size 缓冲区大小
 * @return 实际写入的字节数
 */
int GPS_Deformation_ExportHistory(char *buffer, size_t buffer_size);

#ifdef __cplusplus
}
#endif

#endif // __GPS_DEFORMATION_H__
