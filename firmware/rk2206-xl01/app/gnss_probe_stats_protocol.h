#ifndef APP_GNSS_PROBE_STATS_PROTOCOL_H
#define APP_GNSS_PROBE_STATS_PROTOCOL_H

#include <stdint.h>

#include "../drivers/xl01/gnss_rtcm_injection.h"
#include "../drivers/xl01/field_link_rx_stats.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GNSS_PROBE_STATS_QUERY_V1_BYTES 12
#define GNSS_PROBE_STATS_RESPONSE_V1_BYTES 92
#define GNSS_PROBE_STATS_RESPONSE_V2_BYTES 148
#define GNSS_PROBE_STATS_RESPONSE_V3_BYTES 204
#define GNSS_RTCM_ACK_QUERY_V1_BYTES 12
#define GNSS_RTCM_ACK_RESPONSE_V1_BYTES 24

#define GNSS_SENSOR_DIAGNOSTIC_COUNT 4
#define GNSS_SENSOR_UM220_INDEX 0
#define GNSS_SENSOR_SOIL_INDEX 1
#define GNSS_SENSOR_SOIL_EC_INDEX 2
#define GNSS_SENSOR_TILT_INDEX 3

#define GNSS_SENSOR_UM220_MASK (1U << GNSS_SENSOR_UM220_INDEX)
#define GNSS_SENSOR_SOIL_MASK (1U << GNSS_SENSOR_SOIL_INDEX)
#define GNSS_SENSOR_SOIL_EC_MASK (1U << GNSS_SENSOR_SOIL_EC_INDEX)
#define GNSS_SENSOR_TILT_MASK (1U << GNSS_SENSOR_TILT_INDEX)
#define GNSS_SENSOR_ALL_MASK ((1U << GNSS_SENSOR_DIAGNOSTIC_COUNT) - 1U)

typedef struct {
    uint8_t enabled_mask;
    uint8_t initialization_success_mask;
    uint8_t current_valid_mask;
    uint8_t ever_success_mask;
    uint32_t sample_counts[GNSS_SENSOR_DIAGNOSTIC_COUNT];
    uint32_t last_success_uptime_s[GNSS_SENSOR_DIAGNOSTIC_COUNT];
    uint32_t consecutive_failures[GNSS_SENSOR_DIAGNOSTIC_COUNT];
} GnssSensorDiagnostics;

int GnssProbeStatsQueryV1_Decode(
    const char *payload,
    int payload_bytes,
    uint8_t *target_node,
    uint32_t *nonce
);

int GnssProbeStatsResponseV1_Encode(
    const GnssRtcmInjectionStats *stats,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size
);

int GnssProbeStatsResponseV2_Encode(
    const GnssRtcmInjectionStats *stats,
    const FieldLinkRxStats *link_stats,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size
);

int GnssProbeStatsResponseV3_Encode(
    const GnssRtcmInjectionStats *stats,
    const FieldLinkRxStats *link_stats,
    const GnssSensorDiagnostics *sensor_diagnostics,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size
);

int GnssRtcmAckQueryV1_Decode(
    const char *payload,
    int payload_bytes,
    uint8_t *target_node,
    uint32_t *nonce
);

int GnssRtcmAckResponseV1_Encode(
    const GnssRtcmAckWindow *window,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint8_t *output,
    int output_size
);

#ifdef __cplusplus
}
#endif

#endif // APP_GNSS_PROBE_STATS_PROTOCOL_H
