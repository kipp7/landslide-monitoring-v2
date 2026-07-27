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

int main(void)
{
    const char query[] = "G3QB89ABCDEF";
    GnssRtcmInjectionStats stats;
    uint8_t payload[GNSS_PROBE_STATS_RESPONSE_V1_BYTES];
    uint8_t target = 0U;
    uint32_t nonce = 0U;
    uint32_t *counter = &stats.accepted_fragments;
    unsigned int index;

    assert(GnssProbeStatsQueryV1_Decode(query, 12, &target, &nonce) == 0);
    assert(target == 2U);
    assert(nonce == 0x89ABCDEFU);
    assert(GnssProbeStatsQueryV1_Decode("G3QD89ABCDEF", 12, NULL, NULL) == -1);
    assert(GnssProbeStatsQueryV1_Decode("G3QA00000000", 12, NULL, NULL) == -1);
    assert(GnssProbeStatsQueryV1_Decode("G3QA89ABCDEZ", 12, NULL, NULL) == -1);

    memset(&stats, 0, sizeof(stats));
    for (index = 0U; index < 18U; ++index) {
        counter[index] = index + 1U;
    }
    stats.queue_high_watermark = 19U;
    stats.queue_pending = 20U;
    assert(GnssProbeStatsResponseV1_Encode(
        &stats, 2U, GNSS_RTCM_INJECTION_PROBE, nonce, 1234U, payload, sizeof(payload)
    ) == GNSS_PROBE_STATS_RESPONSE_V1_BYTES);
    assert(memcmp(payload, "G3S", 3) == 0);
    assert(payload[3] == 1U && payload[4] == 2U && payload[5] == 1U);
    assert(payload[6] == 0U && payload[7] == 0U);
    assert(ReadUint32Be(payload + 8) == nonce);
    assert(ReadUint32Be(payload + 12) == 1234U);
    for (index = 0U; index < 18U; ++index) {
        assert(ReadUint32Be(payload + 16U + index * 4U) == index + 1U);
    }
    assert(ReadUint16Be(payload + 88) == 19U);
    assert(ReadUint16Be(payload + 90) == 20U);
    printf("gnss_probe_stats_protocol_host_test passed payload_bytes=%u\n",
           (unsigned int)sizeof(payload));
    return 0;
}
