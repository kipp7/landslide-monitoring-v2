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

#ifdef __cplusplus
}
#endif

#endif // APP_GNSS_PROBE_STATS_PROTOCOL_H
