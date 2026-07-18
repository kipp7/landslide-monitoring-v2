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

    // RS485 soil sensor
    float soil_temperature;      // °C
    float soil_moisture;         // %
    float soil_ec;               // us/cm when the optional 0x0002 register is available
    int soil_ec_valid;           // 0=unsupported/read failed, 1=valid
    int soil_valid;              // 0=invalid, 1=valid
    
    // GPS
    float latitude;             // Decimal degrees
    float longitude;            // Decimal degrees
    int gps_valid;              // 0=invalid, 1=valid
    
    // Accelerometer & Gyroscope (MPU6050)
    float accel_x, accel_y, accel_z;    // g
    float gyro_x, gyro_y, gyro_z;       // °/s
    float angle_x, angle_y, angle_z;    // Tilt angle (°)
    int imu_valid;                      // 0=invalid, 1=valid

    // RS485 tilt/rain sensors
    int tilt_valid;                      // 0=invalid, 1=valid
    float rain_total;                    // mm
    int rain_valid;                      // 0=invalid, 1=valid
    
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
