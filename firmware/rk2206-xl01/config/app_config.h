/*
 * Application Configuration
 * Central configuration file for all system parameters
 */

#ifndef CONFIG_APP_CONFIG_H
#define CONFIG_APP_CONFIG_H

// ==================== System Configuration ====================

// Platform identity (must align with software mainline). Change all three node
// values together before building each image:
// A: ...0001 / FIELD-NODE-A / A
// B: ...0002 / FIELD-NODE-B / B
// C: ...0003 / FIELD-NODE-C / C
#define IDENTITY_SCHEMA_VERSION  1
#define CRED_VERSION             1
#define DEVICE_ID                "00000000-0000-0000-0000-000000000001"
#define DEVICE_SECRET            "CHANGE_ME_DEVICE_SECRET"

// Optional field label for onsite debugging only (not a platform identity)
#define INSTALL_LABEL            "FIELD-NODE-A"
#define LEGACY_NODE_LABEL        "A"

// Runtime role
#define FIELD_NODE_ROLE_EDGE                 0
#define FIELD_NODE_ROLE_SOURCE_CONTROLLER    1
#define FIELD_NODE_ROLE                      FIELD_NODE_ROLE_EDGE

#if FIELD_NODE_ROLE == FIELD_NODE_ROLE_SOURCE_CONTROLLER
#define ENABLE_SHARED_PORT_SOURCE_CONTROL    1
#else
#define ENABLE_SHARED_PORT_SOURCE_CONTROL    0
#endif

// Upload Configuration
#define DOWNLINK_ONLY_MODE 0           // 0=enable periodic telemetry upload
#define XL01_RAW_UART_DIAG_MODE 0      // 0=disable UART RX diagnostics/logs for stable uplink mode
#define XL01_UART_DIAG_TX_HEARTBEAT 0  // 1=periodic TX heartbeat, 0=disabled to avoid loopback storms
#define XL01_UART_DIAG_RX_ECHO 0       // 1=echo raw RX bytes back out, 0=disabled to avoid feedback loops
#define PLATFORM_COMMAND_RX_LOG_MODE 0 // 0=hide verbose command RX JSON while focusing on GPS bring-up
#define TELEMETRY_PRETX_DIAG_MODE 0    // field baseline keeps telemetry diagnostics off unless debugging framing issues
#define FIELD_LINK_POSTTX_DIAG_MODE 0  // field baseline keeps post-TX loopback diagnostics off unless debugging transport
#define FIELD_LINK_WIRE_MODE_LEGACY_JSON   0
#define FIELD_LINK_WIRE_MODE_COBS_CRC_V1   1
// DL-XLxx 手册和 STM32 CC9D 例程确认了“链路层需要显式帧边界/校验/类型/序号”，
// 但现场业务 JSON 负载明显超过 CC9D 示例的 64B datas 上限。
// 这里直接对齐软件主线 field-gateway 已实现的 cobs-crc-v1，避免 RK2206 与 RK3568
// 再各走一套线制。当前主线已决定切到 framed transport，默认直接启用 cobs-crc-v1。
#define FIELD_LINK_WIRE_MODE FIELD_LINK_WIRE_MODE_COBS_CRC_V1
#define FIELD_LINK_MAX_PAYLOAD_BYTES 1024
#define XL01_UART_TX_CHUNK_SIZE 32     // Long transparent payloads are more stable when split into small UART bursts
#define XL01_UART_TX_CHUNK_DELAY_MS 30 // Delay between UART bursts to avoid overrunning XL01 transparent serial path
#define PLATFORM_POST_ACK_QUIET_MS 1200 // Hold telemetry briefly after any command ACK to keep the shared XL01 stream separable
#define PLATFORM_MANUAL_COLLECT_DELAY_MS 1500 // manual_collect waits longer so ACK is not immediately followed by forced telemetry
#define EDGE_UPLINK_MODE_PERIODIC 0
#define EDGE_UPLINK_MODE_POLLED 1
// Production pull mode:
// sample locally, but upload telemetry only when the center/gateway polls it.
#define EDGE_UPLINK_MODE EDGE_UPLINK_MODE_POLLED
#define UPLOAD_INTERVAL_MS  5000        // Periodic-mode interval; polled mode uploads only on request
#define MAX_RETRY_COUNT     3           // Retry 3 times if send fails
#define RETRY_DELAY_MS      500         // Wait 500ms between retries
#define ACK_TIMEOUT_MS      1000        // Wait 1s for ACK from gateway
#define ENABLE_ACK_CHECK    0           // No gateway ACK during no-sensor rehearsal

// In production polled mode the gateway should contact every node repeatedly.
// A healthy node therefore treats a long command silence as a stuck XL01/UART
// path and performs a watchdog reset to rebuild the MCU-side transport state.
#define ENABLE_FIELD_LINK_AUTO_RECOVERY 1
#define FIELD_LINK_STALE_REBOOT_MS      (180U * 1000U)
#define FIELD_LINK_RECOVERY_CHECK_MS    1000U
#define FIELD_LINK_RECOVERY_REBOOT_DELAY_MS 1000U

// Shared-port source-control configuration
#define SHARED_PORT_NODE_SLOT_COUNT          3
#define SHARED_PORT_MAX_PAYLOAD_BYTES        896
#define SHARED_PORT_COMMAND_QUIET_WINDOW_MS  10000

// Low Power Configuration
#define ENABLE_LOW_POWER    0           // 0=disabled, 1=enabled
#define SLEEP_AFTER_SEND    0           // Sleep after each send (low power)

// Version marker
#define FIRMWARE_SAMPLE_VERSION "v1.1-um220-rs485"
#define FIELD_BUILD_PROFILE_PRODUCTION 1

// Bring-up diagnostic mode:
// 1 = only print a boot heartbeat on the debug UART; do not initialize sensors or XL01.
// Use this to separate "firmware did not start / debug UART wrong" from sensor-driver issues.
#define BOOT_SERIAL_DIAG_MODE 0

// Sensor Enable Flags
// v1.1 keeps the confirmed UM220 GPS path. The new PCB routes RS485 through
// SC16IS752 over I2C, so UART1 stays available for debug logs.
#define ENABLE_GPS                 1    // UM220-IV NK on EUART0_M0 (PB6/PB7)
#define ENABLE_RS485_BUS           1    // SC16IS752 + isolated auto-direction TTL-RS485 modules
#define ENABLE_RS485_SOIL_SENSOR   (ENABLE_RS485_BUS && 1) // RS-WS/RS-ECTH soil sensor on RS485 channel 1
#define ENABLE_RS485_TILT_SENSOR   (ENABLE_RS485_BUS && 1) // RS485 tilt sensor on shared channel 2
#define ENABLE_RS485_RAIN_SENSOR   (ENABLE_RS485_BUS && 0) // Enable after confirming rain-gauge register map
#define ENABLE_SHT30               0    // Legacy I2C sensor disabled in v1.1
#define ENABLE_MPU6050             0    // Legacy I2C IMU disabled in v1.1
#define ENABLE_VIRTUAL             0    // Disable rehearsal-only virtual data

// Watchdog Configuration
#define ENABLE_WATCHDOG     1           // Enable watchdog for system stability
#define WATCHDOG_TIMEOUT    10          // Watchdog timeout (seconds)

// ==================== Hardware Configuration ====================

// XL01 Wireless Module
// Route sweep candidates from current BSP truth:
//   EUART2_M1 -> PB2/PB3   <- mainline default route
//   EUART0_M0 -> PB6/PB7
//   EUART1_M0 -> PC2/PC3
//   EUART0_M1 -> PC6/PC7
//   EUART1_M1 -> PA6/PA7 (debug path, conflicts with log UART)
#define XL01_UART_ID        EUART2_M1
#define XL01_BAUDRATE       115200

#if XL01_UART_ID == EUART2_M1
#define XL01_UART_ROUTE_NAME "EUART2_M1 PB2/PB3"
#elif XL01_UART_ID == EUART0_M0
#define XL01_UART_ROUTE_NAME "EUART0_M0 PB6/PB7"
#elif XL01_UART_ID == EUART1_M0
#define XL01_UART_ROUTE_NAME "EUART1_M0 PC2/PC3"
#elif XL01_UART_ID == EUART0_M1
#define XL01_UART_ROUTE_NAME "EUART0_M1 PC6/PC7"
#elif XL01_UART_ID == EUART1_M1
#define XL01_UART_ROUTE_NAME "EUART1_M1 PA6/PA7"
#else
#define XL01_UART_ROUTE_NAME "UNKNOWN"
#endif

#if ENABLE_GPS
// GPS Module (UART0_M0) - 板子上标注的UART_TX/UART_RX
// ✓ MPU6050已移至PB4/PB5，PB6/PB7现在可用于GPS
#define GPS_UART_ID         EUART0_M0    // PB6(RX), PB7(TX) - RK2206 UART0_M0
#define GPS_BAUDRATE        115200       // UM220-IV NK EVK config.ini WorkBaudrate defaults to 115200
#define GPS_UART_PROBE_LOG_MODE 0        // 0=GPS UART confirmed; keep only parsed NMEA/fix logs
#define GPS_VERBOSE_NMEA_LOG 0           // 0=hide raw GGA/RMC sentences; summary upload line shows GPS status
#endif

#if ENABLE_RS485_BUS
// RS485 Modbus RTU bus through SC16IS752 on EI2C0_M0 PB4/PB5.
// Do not route RS485 to PC2/PC3; those pins remain debug/log UART.
#define RS485_TRANSPORT_SC16IS752 1
#define SC16IS752_I2C_ADDR    0x4D        // Current board/module responds at 0x4D during bring-up
#define SC16IS752_XTAL_HZ     1843200UL   // Current WCMCU-752 module effective crystal
#define RS485_CHANNEL_1       0           // SC16IS752 UART A -> U5 -> J6
#define RS485_CHANNEL_2       1           // SC16IS752 UART B -> U8 -> J7
#define RS485_BAUDRATE        4800        // Soil and tilt manuals: factory default 4800 8N1
#define RS485_RESPONSE_TIMEOUT_MS 800
#define RS485_INTER_REQUEST_GAP_MS 80
#define RS485_RAW_DIAG_MODE    0           // Production log: hide raw Modbus TX/RX frames
#define RS485_TILT_AUTO_PROBE   0           // Production: fixed manual-confirmed channel/address/baud/clock
#define RS485_TILT_PROBE_DIAG  0           // Hide one-time tilt probe details after bring-up
#define RS485_SENSOR_RESULT_LOG 0          // Production: telemetry carries values; serial keeps only state/errors
#define SC16IS752_SELF_TEST_DIAG 0         // Hide scratchpad/internal loopback diagnostics
#define SC16IS752_UART_CONFIG_LOG 0        // Hide repeated channel divisor logs
#define RS485_UART_ROUTE_NAME  "SC16IS752 over EI2C0_M0 PB4/PB5"
#endif

// Default Modbus addresses. Change these after using a USB-RS485 tool if the
// sensors still have factory defaults or conflict on address 1.
#define RS485_SOIL_ADDR        1
#define RS485_TILT_ADDR        1
#define RS485_RAIN_ADDR        3
#define RS485_ALARM_ADDR       1

// RS-WS-N01-TR-1 and RS-ECTH-N01-TR-1: factory address 1, 4800 8N1.
// Current field wiring after YX75R diagnostics: soil uses channel 1.
// Both models expose moisture/temperature at 0x0000/0x0001, scaled by 10.
// RS-ECTH additionally exposes EC at 0x0002 as the raw uS/cm value. Read EC
// separately so a two-parameter RS-WS sensor cannot invalidate the base sample.
#define RS485_SOIL_REG_START   0x0000
#define RS485_SOIL_REG_COUNT   2
#define RS485_SOIL_MOISTURE_REG_INDEX 0
#define RS485_SOIL_TEMPERATURE_REG_INDEX 1
#define RS485_SOIL_MOISTURE_SCALE 0.1f
#define RS485_SOIL_TEMPERATURE_SCALE 0.1f
#define RS485_SOIL_MOISTURE_DECIMALS 1
#define RS485_SOIL_TEMPERATURE_DECIMALS 1
#define RS485_SOIL_HAS_EC      1
#define RS485_SOIL_EC_REG      0x0002
#define RS485_SOIL_EC_SCALE    1.0f
#define RS485_SOIL_EC_REPROBE_READS 60U
#define RS485_SOIL_CHANNEL     RS485_CHANNEL_1

// RS-DIP-N01-1 tilt sensor manual: factory address 1, 4800 8N1.
// Current field wiring keeps tilt on channel 2.
// Registers 0x0000/0x0001/0x0002 are X/Y/Z angle, signed, scaled by 100.
#define RS485_TILT_REG_START   0x0000
#define RS485_TILT_REG_COUNT   3
#define RS485_TILT_X_REG_INDEX 0
#define RS485_TILT_Y_REG_INDEX 1
#define RS485_TILT_Z_REG_INDEX 2
#define RS485_TILT_SCALE       0.01f
#define RS485_TILT_DECIMALS    2
#define RS485_TILT_WARNING_DEG 5.0f
#define RS485_TILT_CHANNEL     RS485_CHANNEL_2

// Audible/visual alarm beacon: factory manual says 9600 8N1.
// Temporarily disabled on RK2206 after YX75R diagnostics: PC/USB-RS485 can
// trigger it on the same line, but the current SC16IS752 + auto-direction
// RS485 path cannot drive it reliably. Keep sensor channels clean.
#define ENABLE_RS485_ALARM     0
#define RS485_ALARM_CHANNEL    RS485_CHANNEL_1
#define RS485_ALARM_BAUDRATE   9600
// YX75R has been verified by USB-RS485 as 9600 8N1. Do not retry 4800 here:
// channel 2 carries 4800 sensors with address 1, and probing alarm writes at
// 4800 can create misleading garbage responses or touch sensor registers.
#define RS485_ALARM_BAUDRATE_FALLBACK 0
#define RS485_ALARM_CHANNEL_SCAN 0
#define RS485_ALARM_RESPONSE_TIMEOUT_MS 800
// Keep the YX75R command stream deterministic during field verification.
// Address 0xFF fallback and alternate-channel scanning polluted the RS485 bus
// and made USB-RS485 passive-listen traces hard to interpret.
#define RS485_ALARM_ADDR_FALLBACK RS485_ALARM_ADDR
#define RS485_ALARM_PLAY_REG   0x000D
#define RS485_ALARM_PAUSE_REG  0x000E
#define RS485_ALARM_COMMAND_VALUE 0x0000
// YX75R Modbus manual V1.3: use explicit light and stop controls for alarms.
// 0xC2 controls D1 light independently; 0x16 stops current playback.
// 0x300F plays folder 01 / file 001 while keeping D1 flashing after playback.
#define RS485_ALARM_LIGHT_REG 0x00C2
#define RS485_ALARM_LIGHT_FLASH_VALUE 0x0003
#define RS485_ALARM_LIGHT_OFF_VALUE 0x0006
#define RS485_ALARM_STOP_REG 0x0016
#define RS485_ALARM_STOP_VALUE 0x0001
#define RS485_ALARM_PLAY_FILE_REG 0x300F
#define RS485_ALARM_PLAY_FILE_VALUE 0x0101

// Rain gauge is kept configurable until the exact model/register map is known.
#define RS485_RAIN_REG_START   0x0000
#define RS485_RAIN_REG_COUNT   1
#define RS485_RAIN_TOTAL_SCALE 0.1f

#if ENABLE_RS485_BUS || ENABLE_SHT30 || ENABLE_MPU6050
// I2C Bus - EI2C0_M0 (PB4=SDA, PB5=SCL) ✓ 修正：释放PB6/PB7给GPS
#define I2C_IDX             EI2C0_M0         // ← 改为PB4/PB5
#define I2C_BAUDRATE        EI2C_FRE_100K    // 100kHz (枚举值，不是数字)
#endif

#if ENABLE_SHT30 || ENABLE_MPU6050
#define SHT30_I2C_ADDR      0x44
#define MPU6050_I2C_ADDR    0x68
#endif

#endif // CONFIG_APP_CONFIG_H
