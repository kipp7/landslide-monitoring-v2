#include "gnss_probe_stats_protocol.h"

#include <string.h>

static int HexValue(char value)
{
    if (value >= '0' && value <= '9') {
        return value - '0';
    }
    if (value >= 'A' && value <= 'F') {
        return value - 'A' + 10;
    }
    if (value >= 'a' && value <= 'f') {
        return value - 'a' + 10;
    }
    return -1;
}

static void WriteUint16Be(uint8_t *output, uint16_t value)
{
    output[0] = (uint8_t)((value >> 8) & 0xFFU);
    output[1] = (uint8_t)(value & 0xFFU);
}

static void WriteUint32Be(uint8_t *output, uint32_t value)
{
    output[0] = (uint8_t)((value >> 24) & 0xFFU);
    output[1] = (uint8_t)((value >> 16) & 0xFFU);
    output[2] = (uint8_t)((value >> 8) & 0xFFU);
    output[3] = (uint8_t)(value & 0xFFU);
}

int GnssProbeStatsQueryV1_Decode(
    const char *payload,
    int payload_bytes,
    uint8_t *target_node,
    uint32_t *nonce
)
{
    uint32_t parsed_nonce = 0U;
    uint8_t parsed_target;
    int index;

    if (payload == NULL || payload_bytes != GNSS_PROBE_STATS_QUERY_V1_BYTES ||
        payload[0] != 'G' || payload[1] != '3' || payload[2] != 'Q') {
        return -1;
    }
    if (payload[3] < 'A' || payload[3] > 'C') {
        return -1;
    }
    parsed_target = (uint8_t)(payload[3] - 'A' + 1);
    for (index = 4; index < GNSS_PROBE_STATS_QUERY_V1_BYTES; ++index) {
        int digit = HexValue(payload[index]);
        if (digit < 0) {
            return -1;
        }
        parsed_nonce = (parsed_nonce << 4) | (uint32_t)digit;
    }
    if (parsed_nonce == 0U) {
        return -1;
    }
    if (target_node != NULL) {
        *target_node = parsed_target;
    }
    if (nonce != NULL) {
        *nonce = parsed_nonce;
    }
    return 0;
}

int GnssProbeStatsResponseV1_Encode(
    const GnssRtcmInjectionStats *stats,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size
)
{
    const uint32_t counters[] = {
        stats != NULL ? stats->accepted_fragments : 0U,
        stats != NULL ? stats->duplicate_fragments : 0U,
        stats != NULL ? stats->rejected_fragments : 0U,
        stats != NULL ? stats->completed_frames : 0U,
        stats != NULL ? stats->crc_errors : 0U,
        stats != NULL ? stats->expired_assemblies : 0U,
        stats != NULL ? stats->capacity_evictions : 0U,
        stats != NULL ? stats->ttl_unverified_fragments : 0U,
        stats != NULL ? stats->queued_frames : 0U,
        stats != NULL ? stats->queue_evictions : 0U,
        stats != NULL ? stats->queue_expired_frames : 0U,
        stats != NULL ? stats->probe_validated_frames : 0U,
        stats != NULL ? stats->probe_validated_bytes : 0U,
        stats != NULL ? stats->injected_frames : 0U,
        stats != NULL ? stats->injected_bytes : 0U,
        stats != NULL ? stats->uart_write_errors : 0U,
        stats != NULL ? stats->uart_partial_writes : 0U,
        stats != NULL ? stats->injection_dropped_frames : 0U,
    };
    unsigned int index;

    if (output == NULL || output_size < GNSS_PROBE_STATS_RESPONSE_V1_BYTES ||
        node_number < 1U || node_number > 3U || injection_mode > 2U || nonce == 0U) {
        return -1;
    }

    memset(output, 0, GNSS_PROBE_STATS_RESPONSE_V1_BYTES);
    output[0] = 'G';
    output[1] = '3';
    output[2] = 'S';
    output[3] = 1U;
    output[4] = node_number;
    output[5] = injection_mode;
    WriteUint32Be(output + 8, nonce);
    WriteUint32Be(output + 12, snapshot_uptime_s);
    for (index = 0U; index < sizeof(counters) / sizeof(counters[0]); ++index) {
        WriteUint32Be(output + 16U + index * 4U, counters[index]);
    }
    WriteUint16Be(output + 88, stats != NULL ? stats->queue_high_watermark : 0U);
    WriteUint16Be(output + 90, stats != NULL ? stats->queue_pending : 0U);
    return GNSS_PROBE_STATS_RESPONSE_V1_BYTES;
}

int GnssProbeStatsResponseV2_Encode(
    const GnssRtcmInjectionStats *stats,
    const FieldLinkRxStats *link_stats,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size
)
{
    const uint32_t type_counters[] = {
        stats != NULL ? stats->completed_type_1005 : 0U,
        stats != NULL ? stats->completed_type_1033 : 0U,
        stats != NULL ? stats->completed_type_1074 : 0U,
        stats != NULL ? stats->completed_type_1094 : 0U,
        stats != NULL ? stats->completed_type_1114 : 0U,
        stats != NULL ? stats->completed_type_1124 : 0U,
    };
    const uint32_t link_counters[] = {
        link_stats != NULL ? link_stats->decoded_frames : 0U,
        link_stats != NULL ? link_stats->decoded_rtcm_frames : 0U,
        link_stats != NULL ? link_stats->decode_errors : 0U,
        link_stats != NULL ? link_stats->sequence_gaps : 0U,
        link_stats != NULL ? link_stats->sequence_duplicates : 0U,
        link_stats != NULL ? link_stats->sequence_resets : 0U,
        link_stats != NULL ? link_stats->fifo_dropped_bytes : 0U,
        link_stats != NULL ? link_stats->fifo_drop_events : 0U,
    };
    unsigned int index;

    if (output == NULL || output_size < GNSS_PROBE_STATS_RESPONSE_V2_BYTES) {
        return -1;
    }
    if (GnssProbeStatsResponseV1_Encode(
            stats,
            node_number,
            injection_mode,
            nonce,
            snapshot_uptime_s,
            output,
            output_size
        ) != GNSS_PROBE_STATS_RESPONSE_V1_BYTES) {
        return -1;
    }

    output[3] = 2U;
    for (index = 0U; index < sizeof(type_counters) / sizeof(type_counters[0]); ++index) {
        WriteUint32Be(output + 92U + index * 4U, type_counters[index]);
    }
    for (index = 0U; index < sizeof(link_counters) / sizeof(link_counters[0]); ++index) {
        WriteUint32Be(output + 116U + index * 4U, link_counters[index]);
    }
    return GNSS_PROBE_STATS_RESPONSE_V2_BYTES;
}
