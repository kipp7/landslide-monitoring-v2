#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "../app/gnss_probe_stats_protocol.h"

static uint16_t ReadUint16Be(const uint8_t *input)
{
    return (uint16_t)(((uint16_t)input[0] << 8) | input[1]);
}

static uint32_t ReadUint32Be(const uint8_t *input)
{
    return ((uint32_t)input[0] << 24) |
           ((uint32_t)input[1] << 16) |
           ((uint32_t)input[2] << 8) |
           input[3];
}

static void TestFieldLinkRxStats(void)
{
    FieldLinkRxStats stats;

    FieldLinkRxStats_Init(&stats);
    FieldLinkRxStats_RecordDecoded(&stats, 10U, 1U);
    FieldLinkRxStats_RecordDecoded(&stats, 12U, 0U);
    FieldLinkRxStats_RecordDecoded(&stats, 12U, 1U);
    FieldLinkRxStats_RecordDecoded(&stats, 3U, 1U);
    FieldLinkRxStats_RecordDecodeError(&stats);
    assert(stats.decoded_frames == 4U);
    assert(stats.decoded_rtcm_frames == 3U);
    assert(stats.decode_errors == 1U);
    assert(stats.sequence_gaps == 1U);
    assert(stats.sequence_duplicates == 1U);
    assert(stats.sequence_resets == 1U);
    assert(stats.last_sequence == 3U);
    assert(stats.last_sequence_valid == 1U);
}

int main(void)
{
    const char query[] = "G3QB89ABCDEF";
    const char ack_query[] = "G3AB89ABCDEF";
    GnssRtcmInjectionStats stats;
    GnssRtcmAckWindow ack_window;
    FieldLinkRxStats link_stats;
    GnssSensorDiagnostics sensor_diagnostics;
    uint8_t payload[GNSS_PROBE_STATS_RESPONSE_V3_BYTES];
    uint8_t ack_payload[GNSS_RTCM_ACK_RESPONSE_V1_BYTES];
    uint8_t target = 0U;
    uint32_t nonce = 0U;
    uint32_t *counter = &stats.accepted_fragments;
    unsigned int index;

    TestFieldLinkRxStats();
    assert(GnssProbeStatsQueryV1_Decode(query, 12, &target, &nonce) == 0);
    assert(target == 2U);
    assert(nonce == 0x89ABCDEFU);
    assert(GnssProbeStatsQueryV1_Decode("G3QD89ABCDEF", 12, NULL, NULL) == -1);
    assert(GnssProbeStatsQueryV1_Decode("G3QA00000000", 12, NULL, NULL) == -1);
    assert(GnssProbeStatsQueryV1_Decode("G3QA89ABCDEZ", 12, NULL, NULL) == -1);
    assert(GnssRtcmAckQueryV1_Decode(ack_query, 12, &target, &nonce) == 0);
    assert(target == 2U && nonce == 0x89ABCDEFU);
    assert(GnssRtcmAckQueryV1_Decode("G3AQ89ABCDEF", 12, NULL, NULL) == -1);

    memset(&stats, 0, sizeof(stats));
    for (index = 0U; index < 18U; ++index) {
        counter[index] = index + 1U;
    }
    stats.queue_high_watermark = 19U;
    stats.queue_pending = 20U;
    stats.completed_type_1005 = 21U;
    stats.completed_type_1033 = 22U;
    stats.completed_type_1074 = 23U;
    stats.completed_type_1094 = 24U;
    stats.completed_type_1114 = 25U;
    stats.completed_type_1124 = 26U;
    memset(&link_stats, 0, sizeof(link_stats));
    link_stats.decoded_frames = 31U;
    link_stats.decoded_rtcm_frames = 32U;
    link_stats.decode_errors = 33U;
    link_stats.sequence_gaps = 34U;
    link_stats.sequence_duplicates = 35U;
    link_stats.sequence_resets = 36U;
    link_stats.fifo_dropped_bytes = 37U;
    link_stats.fifo_drop_events = 38U;
    assert(GnssProbeStatsResponseV2_Encode(
        &stats, &link_stats, 2U, GNSS_RTCM_INJECTION_PROBE, nonce, 1234U,
        payload, sizeof(payload)
    ) == GNSS_PROBE_STATS_RESPONSE_V2_BYTES);
    assert(memcmp(payload, "G3S", 3) == 0);
    assert(payload[3] == 2U && payload[4] == 2U && payload[5] == 1U);
    assert(payload[6] == 0U && payload[7] == 0U);
    assert(ReadUint32Be(payload + 8) == nonce);
    assert(ReadUint32Be(payload + 12) == 1234U);
    for (index = 0U; index < 18U; ++index) {
        assert(ReadUint32Be(payload + 16U + index * 4U) == index + 1U);
    }
    assert(ReadUint16Be(payload + 88) == 19U);
    assert(ReadUint16Be(payload + 90) == 20U);
    for (index = 0U; index < 6U; ++index) {
        assert(ReadUint32Be(payload + 92U + index * 4U) == index + 21U);
    }
    for (index = 0U; index < 8U; ++index) {
        assert(ReadUint32Be(payload + 116U + index * 4U) == index + 31U);
    }
    memset(&sensor_diagnostics, 0, sizeof(sensor_diagnostics));
    sensor_diagnostics.enabled_mask = GNSS_SENSOR_UM220_MASK | GNSS_SENSOR_SOIL_MASK |
                                      GNSS_SENSOR_SOIL_EC_MASK | GNSS_SENSOR_TILT_MASK;
    sensor_diagnostics.initialization_success_mask = sensor_diagnostics.enabled_mask;
    sensor_diagnostics.current_valid_mask = GNSS_SENSOR_UM220_MASK;
    sensor_diagnostics.ever_success_mask = GNSS_SENSOR_SOIL_MASK | GNSS_SENSOR_UM220_MASK;
    for (index = 0U; index < GNSS_SENSOR_DIAGNOSTIC_COUNT; ++index) {
        sensor_diagnostics.sample_counts[index] = index + 41U;
        sensor_diagnostics.last_success_uptime_s[index] = index + 51U;
        sensor_diagnostics.consecutive_failures[index] = index + 61U;
    }
    assert(GnssProbeStatsResponseV3_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        2U, GNSS_RTCM_INJECTION_PROBE, nonce, 1234U,
        payload, sizeof(payload)
    ) == GNSS_PROBE_STATS_RESPONSE_V3_BYTES);
    assert(payload[3] == 3U && payload[152] == GNSS_SENSOR_DIAGNOSTIC_COUNT);
    assert(payload[148] == sensor_diagnostics.enabled_mask);
    assert(payload[149] == sensor_diagnostics.initialization_success_mask);
    assert(payload[150] == sensor_diagnostics.current_valid_mask);
    assert(payload[151] == sensor_diagnostics.ever_success_mask);
    assert(payload[153] == 0U && payload[154] == 0U && payload[155] == 0U);
    for (index = 0U; index < GNSS_SENSOR_DIAGNOSTIC_COUNT; ++index) {
        assert(ReadUint32Be(payload + 156U + index * 4U) == index + 41U);
        assert(ReadUint32Be(payload + 172U + index * 4U) == index + 51U);
        assert(ReadUint32Be(payload + 188U + index * 4U) == index + 61U);
    }
    memset(&ack_window, 0, sizeof(ack_window));
    ack_window.session_valid = 1U;
    ack_window.session_epoch = 0x10203040U;
    ack_window.highest_sequence = 117U;
    ack_window.completed_bitmap = 0xA55AU;
    assert(GnssRtcmAckResponseV1_Encode(
        &ack_window, 2U, GNSS_RTCM_INJECTION_PROBE, nonce,
        ack_payload, sizeof(ack_payload)
    ) == GNSS_RTCM_ACK_RESPONSE_V1_BYTES);
    assert(memcmp(ack_payload, "G3A", 3) == 0);
    assert(ack_payload[3] == 1U && ack_payload[4] == 2U && ack_payload[5] == 1U);
    assert(ack_payload[6] == 1U && ack_payload[7] == 0U);
    assert(ReadUint32Be(ack_payload + 8) == nonce);
    assert(ReadUint32Be(ack_payload + 12) == 0x10203040U);
    assert(ReadUint32Be(ack_payload + 16) == 117U);
    assert(ReadUint16Be(ack_payload + 20) == 0xA55AU);
    assert(ReadUint16Be(ack_payload + 22) == 0U);
    printf("gnss_probe_stats_protocol_host_test passed v3_payload_bytes=%u\n",
           (unsigned int)sizeof(payload));
    return 0;
}
