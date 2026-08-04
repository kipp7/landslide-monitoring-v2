#ifndef DRIVERS_SENSORS_GPS_UART_PROBE_H
#define DRIVERS_SENSORS_GPS_UART_PROBE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GPS_UART_PROBE_CANDIDATE_COUNT 2U
#define GPS_UART_PROBE_NO_SELECTION 0xFFU

typedef enum {
    GPS_UART_PROBE_STATE_NOT_INITIALIZED = 0,
    GPS_UART_PROBE_STATE_PRIMARY = 1,
    GPS_UART_PROBE_STATE_FALLBACK = 2,
    GPS_UART_PROBE_STATE_LOCKED_PRIMARY = 3,
    GPS_UART_PROBE_STATE_LOCKED_FALLBACK = 4,
    GPS_UART_PROBE_STATE_FAILED_DEFAULT_PRIMARY = 5,
    GPS_UART_PROBE_STATE_RECONFIGURE_ERROR = 6
} GpsUartProbeState;

typedef enum {
    GPS_UART_PROBE_ACTION_NONE = 0,
    GPS_UART_PROBE_ACTION_LOCK = 1,
    GPS_UART_PROBE_ACTION_SWITCH_FALLBACK = 2,
    GPS_UART_PROBE_ACTION_RESTORE_PRIMARY_FAILED = 3
} GpsUartProbeAction;

typedef struct {
    uint32_t baudrate;
    uint32_t rx_bytes;
    uint32_t printable_bytes;
    uint32_t dollar_bytes;
    uint32_t completed_lines;
    uint32_t checksum_valid_sentences;
    uint32_t checksum_invalid_sentences;
    uint32_t gga_sentences;
    uint32_t rmc_sentences;
    uint32_t first_valid_uptime_ms;
} GpsUartCandidateDiagnostics;

typedef struct {
    uint8_t schema_version;
    uint8_t state;
    uint8_t active_candidate;
    uint8_t selected_candidate;
    uint32_t active_baudrate;
    uint32_t switch_count;
    uint32_t reconfigure_failures;
    uint32_t read_errors;
    uint32_t fifo_dropped_bytes;
    uint32_t fifo_drop_events;
    GpsUartCandidateDiagnostics candidates[GPS_UART_PROBE_CANDIDATE_COUNT];
} GpsUartDiagnostics;

typedef struct {
    GpsUartDiagnostics diagnostics;
    uint32_t candidate_started_ms;
    uint8_t collecting;
    uint8_t saw_star;
    uint8_t checksum;
    uint8_t expected_checksum;
    uint8_t checksum_digits;
    uint8_t header_length;
    char header[5];
} GpsUartProbe;

void GpsUartProbe_Init(
    GpsUartProbe *probe,
    uint32_t primary_baudrate,
    uint32_t fallback_baudrate,
    uint32_t now_ms
);

void GpsUartProbe_Consume(
    GpsUartProbe *probe,
    const unsigned char *data,
    unsigned int data_bytes,
    uint32_t now_ms
);

GpsUartProbeAction GpsUartProbe_Evaluate(
    const GpsUartProbe *probe,
    uint32_t now_ms,
    uint32_t probe_window_ms
);

void GpsUartProbe_ApplyAction(
    GpsUartProbe *probe,
    GpsUartProbeAction action,
    uint32_t now_ms,
    int reconfigure_succeeded
);

void GpsUartProbe_RecordReadError(GpsUartProbe *probe);

void GpsUartProbe_GetDiagnostics(
    const GpsUartProbe *probe,
    uint32_t fifo_dropped_bytes,
    uint32_t fifo_drop_events,
    GpsUartDiagnostics *diagnostics
);

int GpsUartProbe_IsRtcmWriteReady(
    const GpsUartProbe *probe,
    uint32_t required_baudrate
);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_SENSORS_GPS_UART_PROBE_H
