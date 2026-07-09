/*
 * Application Configuration
 * Central configuration file for all system parameters
 */

#ifndef CONFIG_APP_CONFIG_H
#define CONFIG_APP_CONFIG_H

// ==================== System Configuration ====================

// Platform identity (must align with software mainline)
#define IDENTITY_SCHEMA_VERSION  1
#define CRED_VERSION             1
#define DEVICE_ID                "00000000-0000-0000-0000-000000000001"
#define DEVICE_SECRET            "CHANGE_ME_DEVICE_SECRET"

// Optional field label for onsite debugging only (not a platform identity)
#define INSTALL_LABEL            "FIELD-NODE-A"
#define LEGACY_NODE_LABEL        "A"

// Upload Configuration
#define UPLOAD_INTERVAL_MS  5000        // Upload every 5 seconds
#define MAX_RETRY_COUNT     3           // Retry 3 times if send fails
#define RETRY_DELAY_MS      500         // Wait 500ms between retries
#define ACK_TIMEOUT_MS      1000        // Wait 1s for ACK from gateway
#define ENABLE_ACK_CHECK    1           // 0=No ACK (fire-and-forget), 1=Wait for ACK

// Low Power Configuration
#define ENABLE_LOW_POWER    0           // 0=disabled, 1=enabled
#define SLEEP_AFTER_SEND    0           // Sleep after each send (low power)

// Sensor Enable Flags (set to 1 to enable)
#define ENABLE_GPS          1           // GPS module ✓ 已启用（C6/C7）
#define ENABLE_SHT30        0           // Temperature & Humidity - 暂不使用
#define ENABLE_MPU6050      1           // Accelerometer & Gyroscope ✓ 调试中
#define ENABLE_VIRTUAL      0           // Virtual data - DISABLED

// Watchdog Configuration
#define ENABLE_WATCHDOG     1           // Enable watchdog for system stability
#define WATCHDOG_TIMEOUT    10          // Watchdog timeout (seconds)

// ==================== Hardware Configuration ====================

// XL01 Wireless Module (UART2)
#define XL01_UART_ID        EUART2_M1
#define XL01_BAUDRATE       115200

#if ENABLE_GPS
// GPS Module (UART0_M0) - 板子上标注的UART_TX/UART_RX
// ✓ MPU6050已移至PB4/PB5，PB6/PB7现在可用于GPS
#define GPS_UART_ID         EUART0_M0    // PB6(TX), PB7(RX) - 板子标注口
#define GPS_BAUDRATE        9600
#endif

#if ENABLE_SHT30 || ENABLE_MPU6050
// I2C Bus - EI2C0_M0 (PB4=SDA, PB5=SCL) ✓ 修正：释放PB6/PB7给GPS
#define I2C_IDX             EI2C0_M0         // ← 改为PB4/PB5
#define I2C_BAUDRATE        EI2C_FRE_100K    // 100kHz (枚举值，不是数字)
#define SHT30_I2C_ADDR      0x44
#define MPU6050_I2C_ADDR    0x68
#endif

#endif // CONFIG_APP_CONFIG_H
