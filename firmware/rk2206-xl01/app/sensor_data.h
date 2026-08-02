/*
 * Sensor Data Structure
 * Shared data structure for sensor readings
 */

#ifndef APP_SENSOR_DATA_H
#define APP_SENSOR_DATA_H

#include "../drivers/sensors/gnss_solution_parser.h"

// ==================== Data Structures ====================

typedef struct {
    // System info
    unsigned int seq;           // Packet sequence number
    unsigned int uptime;        // System uptime (seconds)
    
    // RS485 soil sensor
    float soil_temperature;      // °C
    float soil_moisture;         // %
    float soil_ec;               // us/cm when the optional 0x0002 register is available
    int soil_ec_valid;           // 0=unsupported/read failed, 1=valid
    int soil_valid;              // 0=invalid, 1=valid
    
    // Professional GNSS solution. RK3568 converts trusted RTK Fixed epochs to ECEF/ENU.
    GnssSolutionSnapshot gnss;
    int gnss_status_valid;

    // RS485 tilt/rain sensors
    float angle_x, angle_y, angle_z;     // RS-DIP-N01-1 tilt angle (°)
    int tilt_valid;                      // 0=invalid, 1=valid
    float rain_total;                    // mm
    int rain_valid;                      // 0=invalid, 1=valid
    
    // Status
    int warning;                // Warning flag
    int battery_level;          // Battery level (%)
    unsigned int battery_voltage_mv; // Filtered 3S pack voltage
    int battery_valid;          // 0=invalid, 1=valid
    int battery_estimate_quality; // 1=default calibration, 2=field calibrated
    int simulated_field_data;   // 1=RS485 values are generated for link rehearsal
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
