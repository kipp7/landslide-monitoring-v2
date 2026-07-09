/*
 * Sensor Data Structure
 * Shared data structure for sensor readings
 */

#ifndef APP_SENSOR_DATA_H
#define APP_SENSOR_DATA_H

// ==================== Data Structures ====================

typedef struct {
    // System info
    unsigned int seq;           // Packet sequence number
    unsigned int uptime;        // System uptime (seconds)
    
    // Temperature & Humidity (SHT30)
    float temperature;          // °C
    float humidity;             // %
    int temp_valid;             // 0=invalid, 1=valid
    
    // GPS
    float latitude;             // Decimal degrees
    float longitude;            // Decimal degrees
    int gps_valid;              // 0=invalid, 1=valid
    
    // Accelerometer & Gyroscope (MPU6050)
    float accel_x, accel_y, accel_z;    // g
    float gyro_x, gyro_y, gyro_z;       // °/s
    float angle_x, angle_y;             // Tilt angle (°)
    int imu_valid;                      // 0=invalid, 1=valid
    
    // Status
    int warning;                // Warning flag
    int battery_level;          // Battery level (%)
} SensorData;

typedef struct {
    unsigned int total_sent;
    unsigned int success_count;
    unsigned int retry_count;
    unsigned int failed_count;
    unsigned int total_bytes;
    unsigned int rx_packets;
    unsigned int uptime_sec;
} Statistics;

#endif // APP_SENSOR_DATA_H
