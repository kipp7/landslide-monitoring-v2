#include "gps_deformation.h"
#include "los_memory.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// 地球半径 (米)
#define EARTH_RADIUS_M  6378137.0

// GPS形变监测全局变量
static bool g_deform_initialized = false;
static GPSPositionRecord g_position_history[GPS_DEFORM_HISTORY_SIZE];
static uint16_t g_history_count = 0;
static uint16_t g_history_index = 0;
static GPSPositionRecord g_baseline_position = {0};
static bool g_baseline_established = false;
static GPSDeformationAnalysis g_current_analysis = {0};
static DeformationStats g_deform_stats = {0};

// 内部函数声明
static float CalculateHaversineDistance(double lat1, double lon1, double lat2, double lon2);
static float CalculateBearing(double lat1, double lon1, double lat2, double lon2);
static void UpdateDeformationStats(const DisplacementVector *displacement);
static DeformationRisk AssessDeformationRisk(const DisplacementVector *displacement, const DeformationVelocity *velocity);
static DeformationType ClassifyDeformationType(const DisplacementVector *displacement);
static void CalculateVelocity(DeformationVelocity *velocity);

/**
 * @brief 初始化GPS形变监测
 */
int GPS_Deformation_Init(void)
{
    if (g_deform_initialized) {
        printf("GPS deformation monitoring already initialized\n");
        return 0;
    }
    
    printf("Initializing GPS deformation monitoring...\n");
    
    // 初始化数据结构
    memset(g_position_history, 0, sizeof(g_position_history));
    memset(&g_baseline_position, 0, sizeof(g_baseline_position));
    memset(&g_current_analysis, 0, sizeof(g_current_analysis));
    memset(&g_deform_stats, 0, sizeof(g_deform_stats));
    
    g_history_count = 0;
    g_history_index = 0;
    g_baseline_established = false;
    
    g_deform_initialized = true;
    printf("GPS deformation monitoring initialized successfully\n");
    
    return 0;
}

/**
 * @brief 反初始化GPS形变监测
 */
void GPS_Deformation_Deinit(void)
{
    if (!g_deform_initialized) {
        return;
    }
    
    printf("Deinitializing GPS deformation monitoring...\n");
    g_deform_initialized = false;
    printf("GPS deformation monitoring deinitialized\n");
}

/**
 * @brief 设置基准位置
 */
int GPS_Deformation_SetBaseline(const GPSData *gps_data)
{
    if (!g_deform_initialized || !gps_data || !gps_data->valid) {
        return -1;
    }
    
    // 检查GPS精度
    if (gps_data->accuracy > GPS_DEFORM_MIN_ACCURACY) {
        printf("GPS accuracy too low for baseline: %.1fm (required: %.1fm)\n", 
               gps_data->accuracy, GPS_DEFORM_MIN_ACCURACY);
        return -2;
    }
    
    // 设置基准位置
    g_baseline_position.latitude = gps_data->latitude;
    g_baseline_position.longitude = gps_data->longitude;
    g_baseline_position.altitude = gps_data->altitude;
    g_baseline_position.accuracy = gps_data->accuracy;
    g_baseline_position.timestamp = gps_data->last_update_time;
    g_baseline_position.valid = true;
    
    g_baseline_established = true;
    
    // 重置统计信息
    memset(&g_deform_stats, 0, sizeof(g_deform_stats));
    g_deform_stats.monitoring_duration = 0;
    
    printf("GPS baseline established: %.6f°, %.6f°, %.1fm (accuracy: %.1fm)\n",
           g_baseline_position.latitude, g_baseline_position.longitude,
           g_baseline_position.altitude, g_baseline_position.accuracy);
    
    return 0;
}

/**
 * @brief 添加GPS位置数据进行形变分析
 */
int GPS_Deformation_AddPosition(const GPSData *gps_data)
{
    if (!g_deform_initialized || !gps_data || !gps_data->valid) {
        return -1;
    }
    
    // 检查GPS精度
    if (gps_data->accuracy > GPS_DEFORM_MIN_ACCURACY) {
        return -2;
    }
    
    // 如果没有基准位置，自动设置第一个有效位置为基准
    if (!g_baseline_established) {
        return GPS_Deformation_SetBaseline(gps_data);
    }
    
    // 添加到历史记录
    GPSPositionRecord *record = &g_position_history[g_history_index];
    record->latitude = gps_data->latitude;
    record->longitude = gps_data->longitude;
    record->altitude = gps_data->altitude;
    record->accuracy = gps_data->accuracy;
    record->timestamp = gps_data->last_update_time;
    record->valid = true;
    
    // 更新索引
    g_history_index = (g_history_index + 1) % GPS_DEFORM_HISTORY_SIZE;
    if (g_history_count < GPS_DEFORM_HISTORY_SIZE) {
        g_history_count++;
    }
    
    // 计算位移
    DisplacementVector displacement = {0};
    displacement.horizontal_distance = CalculateHaversineDistance(
        g_baseline_position.latitude, g_baseline_position.longitude,
        gps_data->latitude, gps_data->longitude);
    
    displacement.vertical_distance = gps_data->altitude - g_baseline_position.altitude;
    displacement.distance_2d = displacement.horizontal_distance;
    displacement.distance_3d = sqrtf(displacement.horizontal_distance * displacement.horizontal_distance +
                                   displacement.vertical_distance * displacement.vertical_distance);
    
    displacement.bearing = CalculateBearing(
        g_baseline_position.latitude, g_baseline_position.longitude,
        gps_data->latitude, gps_data->longitude);
    
    if (displacement.horizontal_distance > 0) {
        displacement.elevation_angle = atanf(displacement.vertical_distance / displacement.horizontal_distance) * 180.0f / M_PI;
    }
    
    displacement.time_span = (gps_data->last_update_time - g_baseline_position.timestamp) / 1000; // 转换为秒
    
    // 计算速度
    DeformationVelocity velocity = {0};
    CalculateVelocity(&velocity);
    
    // 更新分析结果
    g_current_analysis.baseline_position = g_baseline_position;
    g_current_analysis.current_position = *record;
    g_current_analysis.displacement = displacement;
    g_current_analysis.velocity = velocity;
    g_current_analysis.risk_level = AssessDeformationRisk(&displacement, &velocity);
    g_current_analysis.deform_type = ClassifyDeformationType(&displacement);
    g_current_analysis.baseline_established = true;
    g_current_analysis.analysis_valid = true;
    g_current_analysis.analysis_timestamp = gps_data->last_update_time;
    
    // 计算置信度
    float accuracy_factor = 1.0f - (gps_data->accuracy / GPS_DEFORM_MIN_ACCURACY);
    float time_factor = (displacement.time_span > 300) ? 1.0f : (displacement.time_span / 300.0f); // 5分钟后达到满置信度
    g_current_analysis.confidence = accuracy_factor * time_factor;
    if (g_current_analysis.confidence > 1.0f) g_current_analysis.confidence = 1.0f;
    if (g_current_analysis.confidence < 0.0f) g_current_analysis.confidence = 0.0f;
    
    // 设置描述
    switch (g_current_analysis.risk_level) {
        case DEFORM_RISK_CRITICAL:
            snprintf(g_current_analysis.description, sizeof(g_current_analysis.description),
                     "Critical deformation: %.1fm", displacement.distance_3d);
            break;
        case DEFORM_RISK_HIGH:
            snprintf(g_current_analysis.description, sizeof(g_current_analysis.description),
                     "High deformation risk: %.1fm", displacement.distance_3d);
            break;
        case DEFORM_RISK_MEDIUM:
            snprintf(g_current_analysis.description, sizeof(g_current_analysis.description),
                     "Medium deformation: %.1fm", displacement.distance_3d);
            break;
        case DEFORM_RISK_LOW:
            snprintf(g_current_analysis.description, sizeof(g_current_analysis.description),
                     "Low deformation: %.1fm", displacement.distance_3d);
            break;
        default:
            snprintf(g_current_analysis.description, sizeof(g_current_analysis.description),
                     "Stable position: %.1fm", displacement.distance_3d);
            break;
    }
    
    // 更新统计信息
    UpdateDeformationStats(&displacement);
    
    // 打印形变信息
    if (displacement.distance_3d > 1.0f) {
        printf("GPS Deformation: %.1fm (H:%.1fm V:%.1fm) Risk:%d Type:%d\n",
               displacement.distance_3d, displacement.horizontal_distance,
               displacement.vertical_distance, g_current_analysis.risk_level,
               g_current_analysis.deform_type);
    }
    
    return 0;
}

/**
 * @brief 获取形变分析结果
 */
int GPS_Deformation_GetAnalysis(GPSDeformationAnalysis *analysis)
{
    if (!g_deform_initialized || !analysis) {
        return -1;
    }

    memcpy(analysis, &g_current_analysis, sizeof(GPSDeformationAnalysis));
    return 0;
}

/**
 * @brief 检查是否有形变警报
 */
bool GPS_Deformation_HasAlert(void)
{
    if (!g_deform_initialized || !g_current_analysis.analysis_valid) {
        return false;
    }

    return (g_current_analysis.risk_level >= DEFORM_RISK_MEDIUM);
}

/**
 * @brief 获取形变风险等级
 */
DeformationRisk GPS_Deformation_GetRiskLevel(void)
{
    if (!g_deform_initialized || !g_current_analysis.analysis_valid) {
        return DEFORM_RISK_SAFE;
    }

    return g_current_analysis.risk_level;
}

/**
 * @brief 重置形变监测数据
 */
void GPS_Deformation_Reset(void)
{
    if (!g_deform_initialized) {
        return;
    }

    printf("Resetting GPS deformation monitoring data...\n");

    memset(g_position_history, 0, sizeof(g_position_history));
    memset(&g_current_analysis, 0, sizeof(g_current_analysis));
    memset(&g_deform_stats, 0, sizeof(g_deform_stats));

    g_history_count = 0;
    g_history_index = 0;
    g_baseline_established = false;

    printf("GPS deformation monitoring data reset\n");
}

/**
 * @brief 计算两点间距离 (Haversine公式)
 */
static float CalculateHaversineDistance(double lat1, double lon1, double lat2, double lon2)
{
    double dlat = (lat2 - lat1) * M_PI / 180.0;
    double dlon = (lon2 - lon1) * M_PI / 180.0;
    double a = sin(dlat/2) * sin(dlat/2) + cos(lat1 * M_PI / 180.0) * cos(lat2 * M_PI / 180.0) * sin(dlon/2) * sin(dlon/2);
    double c = 2 * atan2(sqrt(a), sqrt(1-a));
    return (float)(EARTH_RADIUS_M * c);
}

/**
 * @brief 计算两点间方位角
 */
static float CalculateBearing(double lat1, double lon1, double lat2, double lon2)
{
    double dlat = (lat2 - lat1) * M_PI / 180.0;
    double dlon = (lon2 - lon1) * M_PI / 180.0;
    double y = sin(dlon) * cos(lat2 * M_PI / 180.0);
    double x = cos(lat1 * M_PI / 180.0) * sin(lat2 * M_PI / 180.0) -
               sin(lat1 * M_PI / 180.0) * cos(lat2 * M_PI / 180.0) * cos(dlon);
    double bearing = atan2(y, x) * 180.0 / M_PI;
    return (float)fmod(bearing + 360.0, 360.0);
}

/**
 * @brief 更新形变统计信息
 */
static void UpdateDeformationStats(const DisplacementVector *displacement)
{
    if (!displacement) return;

    // 更新最大位移
    if (displacement->distance_3d > g_deform_stats.max_displacement) {
        g_deform_stats.max_displacement = displacement->distance_3d;
    }

    // 更新累计位移
    g_deform_stats.total_displacement += displacement->distance_3d;

    // 更新监测时长
    g_deform_stats.monitoring_duration = displacement->time_span;

    // 计算平均速度
    if (displacement->time_span > 0) {
        g_deform_stats.avg_velocity = g_deform_stats.total_displacement / (displacement->time_span / 3600.0f);
    }

    // 更新警报计数
    if (displacement->distance_3d > GPS_DEFORM_ALERT_DISTANCE) {
        g_deform_stats.alert_count++;
    }
}

/**
 * @brief 评估形变风险等级
 */
static DeformationRisk AssessDeformationRisk(const DisplacementVector *displacement, const DeformationVelocity *velocity)
{
    if (!displacement || !velocity) {
        return DEFORM_RISK_SAFE;
    }

    float distance = displacement->distance_3d;
    float vel = velocity->total_velocity;

    // 基于位移距离的风险评估
    if (distance >= GPS_DEFORM_CRITICAL_DISTANCE) {
        return DEFORM_RISK_CRITICAL;
    } else if (distance >= GPS_DEFORM_ALERT_DISTANCE) {
        return DEFORM_RISK_HIGH;
    } else if (distance >= 1.0f) {
        return DEFORM_RISK_MEDIUM;
    } else if (distance >= 0.5f) {
        return DEFORM_RISK_LOW;
    }

    // 基于速度的风险评估
    if (vel > 1.0f) {  // 超过1米/小时
        return DEFORM_RISK_HIGH;
    } else if (vel > 0.5f) {  // 超过0.5米/小时
        return DEFORM_RISK_MEDIUM;
    } else if (vel > 0.1f) {  // 超过0.1米/小时
        return DEFORM_RISK_LOW;
    }

    return DEFORM_RISK_SAFE;
}

/**
 * @brief 分类形变类型
 */
static DeformationType ClassifyDeformationType(const DisplacementVector *displacement)
{
    if (!displacement) {
        return DEFORM_TYPE_NONE;
    }

    float h_ratio = displacement->horizontal_distance / (displacement->distance_3d + 0.001f);
    float v_ratio = fabsf(displacement->vertical_distance) / (displacement->distance_3d + 0.001f);

    if (displacement->distance_3d < 0.1f) {
        return DEFORM_TYPE_NONE;
    }

    if (h_ratio > 0.8f && v_ratio < 0.3f) {
        return DEFORM_TYPE_HORIZONTAL;
    } else if (v_ratio > 0.8f && h_ratio < 0.3f) {
        return DEFORM_TYPE_VERTICAL;
    } else if (h_ratio > 0.4f && v_ratio > 0.4f) {
        return DEFORM_TYPE_COMBINED;
    } else {
        return DEFORM_TYPE_ROTATION;
    }
}

/**
 * @brief 计算形变速度
 */
static void CalculateVelocity(DeformationVelocity *velocity)
{
    if (!velocity || g_history_count < 2) {
        memset(velocity, 0, sizeof(DeformationVelocity));
        return;
    }

    // 使用最近的几个点计算速度
    int window_size = (g_history_count < GPS_DEFORM_VELOCITY_WINDOW) ? g_history_count : GPS_DEFORM_VELOCITY_WINDOW;

    if (window_size < 2) {
        memset(velocity, 0, sizeof(DeformationVelocity));
        return;
    }

    // 获取最新和最旧的位置
    int latest_idx = (g_history_index - 1 + GPS_DEFORM_HISTORY_SIZE) % GPS_DEFORM_HISTORY_SIZE;
    int oldest_idx = (g_history_index - window_size + GPS_DEFORM_HISTORY_SIZE) % GPS_DEFORM_HISTORY_SIZE;

    GPSPositionRecord *latest = &g_position_history[latest_idx];
    GPSPositionRecord *oldest = &g_position_history[oldest_idx];

    if (!latest->valid || !oldest->valid) {
        memset(velocity, 0, sizeof(DeformationVelocity));
        return;
    }

    // 计算时间差 (小时)
    float time_diff_hours = (latest->timestamp - oldest->timestamp) / (1000.0f * 3600.0f);
    if (time_diff_hours <= 0) {
        memset(velocity, 0, sizeof(DeformationVelocity));
        return;
    }

    // 计算距离差
    float h_distance = CalculateHaversineDistance(oldest->latitude, oldest->longitude,
                                                 latest->latitude, latest->longitude);
    float v_distance = latest->altitude - oldest->altitude;
    float total_distance = sqrtf(h_distance * h_distance + v_distance * v_distance);

    // 计算速度
    velocity->horizontal_velocity = h_distance / time_diff_hours;
    velocity->vertical_velocity = v_distance / time_diff_hours;
    velocity->total_velocity = total_distance / time_diff_hours;

    // 计算加速度 (简化版本)
    if (g_deform_stats.max_velocity > 0) {
        velocity->acceleration = (velocity->total_velocity - g_deform_stats.max_velocity) / time_diff_hours;
        velocity->is_accelerating = (velocity->acceleration > 0.01f);
    }

    // 更新最大速度
    if (velocity->total_velocity > g_deform_stats.max_velocity) {
        g_deform_stats.max_velocity = velocity->total_velocity;
    }
}

/**
 * @brief 公共接口：计算两点间距离
 */
float GPS_Deformation_CalculateDistance(double lat1, double lon1, double lat2, double lon2)
{
    return CalculateHaversineDistance(lat1, lon1, lat2, lon2);
}

/**
 * @brief 公共接口：计算两点间方位角
 */
float GPS_Deformation_CalculateBearing(double lat1, double lon1, double lat2, double lon2)
{
    return CalculateBearing(lat1, lon1, lat2, lon2);
}

/**
 * @brief 获取形变统计信息
 */
void GPS_Deformation_GetStats(DeformationStats *stats)
{
    if (!g_deform_initialized || !stats) {
        return;
    }

    memcpy(stats, &g_deform_stats, sizeof(DeformationStats));
}

/**
 * @brief 打印形变分析调试信息
 */
void GPS_Deformation_PrintDebugInfo(void)
{
    if (!g_deform_initialized) {
        printf("GPS deformation monitoring not initialized\n");
        return;
    }

    printf("\n=== GPS Deformation Analysis ===\n");
    printf("Baseline established: %s\n", g_baseline_established ? "YES" : "NO");

    if (g_baseline_established) {
        printf("Baseline: %.6f°, %.6f°, %.1fm\n",
               g_baseline_position.latitude, g_baseline_position.longitude, g_baseline_position.altitude);
    }

    if (g_current_analysis.analysis_valid) {
        printf("Current: %.6f°, %.6f°, %.1fm\n",
               g_current_analysis.current_position.latitude,
               g_current_analysis.current_position.longitude,
               g_current_analysis.current_position.altitude);

        printf("Displacement: %.1fm (H:%.1fm V:%.1fm)\n",
               g_current_analysis.displacement.distance_3d,
               g_current_analysis.displacement.horizontal_distance,
               g_current_analysis.displacement.vertical_distance);

        printf("Velocity: %.3fm/h (H:%.3fm/h V:%.3fm/h)\n",
               g_current_analysis.velocity.total_velocity,
               g_current_analysis.velocity.horizontal_velocity,
               g_current_analysis.velocity.vertical_velocity);

        printf("Risk Level: %d, Type: %d, Confidence: %.2f\n",
               g_current_analysis.risk_level, g_current_analysis.deform_type,
               g_current_analysis.confidence);

        printf("Description: %s\n", g_current_analysis.description);
    }

    printf("Statistics:\n");
    printf("  Max displacement: %.1fm\n", g_deform_stats.max_displacement);
    printf("  Total displacement: %.1fm\n", g_deform_stats.total_displacement);
    printf("  Max velocity: %.3fm/h\n", g_deform_stats.max_velocity);
    printf("  Alert count: %d\n", g_deform_stats.alert_count);
    printf("  Monitoring duration: %ds\n", g_deform_stats.monitoring_duration);
    printf("  History count: %d/%d\n", g_history_count, GPS_DEFORM_HISTORY_SIZE);
    printf("================================\n\n");
}
