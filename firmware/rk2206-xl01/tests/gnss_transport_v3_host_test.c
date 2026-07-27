#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "../drivers/xl01/gnss_transport_v3.h"
#include "../drivers/xl01/gnss_rtcm_injection.h"

#define RTCM_FRAME_BYTES 129U
#define TEST_FRAGMENT_DATA_BYTES 31U
#define TEST_FRAGMENT_COUNT 5U
#define TEST_NOW_MS 1785059400000ULL

static void WriteU16(uint8_t *output, uint16_t value)
{
    output[0] = (uint8_t)(value >> 8);
    output[1] = (uint8_t)value;
}

static void WriteU32(uint8_t *output, uint32_t value)
{
    output[0] = (uint8_t)(value >> 24);
    output[1] = (uint8_t)(value >> 16);
    output[2] = (uint8_t)(value >> 8);
    output[3] = (uint8_t)value;
}

static void WriteU64(uint8_t *output, uint64_t value)
{
    output[0] = (uint8_t)(value >> 56);
    output[1] = (uint8_t)(value >> 48);
    output[2] = (uint8_t)(value >> 40);
    output[3] = (uint8_t)(value >> 32);
    output[4] = (uint8_t)(value >> 24);
    output[5] = (uint8_t)(value >> 16);
    output[6] = (uint8_t)(value >> 8);
    output[7] = (uint8_t)value;
}

static uint8_t HexNibble(char value)
{
    if (value >= '0' && value <= '9') {
        return (uint8_t)(value - '0');
    }
    if (value >= 'a' && value <= 'f') {
        return (uint8_t)(value - 'a' + 10);
    }
    return 0xFFU;
}

static void DecodeHex(const char *hex, uint8_t *output, uint16_t output_bytes)
{
    uint16_t index;
    assert(strlen(hex) == (size_t)output_bytes * 2U);
    for (index = 0U; index < output_bytes; ++index) {
        uint8_t high = HexNibble(hex[index * 2U]);
        uint8_t low = HexNibble(hex[index * 2U + 1U]);
        assert(high <= 0x0FU && low <= 0x0FU);
        output[index] = (uint8_t)((high << 4) | low);
    }
}

static void BuildRtcm(uint8_t frame[RTCM_FRAME_BYTES])
{
    uint16_t index;
    uint16_t payload_bytes = RTCM_FRAME_BYTES - 6U;
    uint32_t crc;
    memset(frame, 0, RTCM_FRAME_BYTES);
    frame[0] = 0xD3U;
    frame[1] = (uint8_t)((payload_bytes >> 8) & 0x03U);
    frame[2] = (uint8_t)payload_bytes;
    frame[3] = (uint8_t)(1124U >> 4);
    frame[4] = (uint8_t)((1124U & 0x0FU) << 4);
    for (index = 5U; index < RTCM_FRAME_BYTES - 3U; ++index) {
        frame[index] = index % 13U == 0U ? 0U : (uint8_t)(index * 37U);
    }
    crc = GnssTransportV3_Crc24q(frame, RTCM_FRAME_BYTES - 3U);
    frame[RTCM_FRAME_BYTES - 3U] = (uint8_t)(crc >> 16);
    frame[RTCM_FRAME_BYTES - 2U] = (uint8_t)(crc >> 8);
    frame[RTCM_FRAME_BYTES - 1U] = (uint8_t)crc;
}

static uint16_t BuildFragment(
    const uint8_t frame[RTCM_FRAME_BYTES],
    uint8_t fragment_index,
    uint32_t session_epoch,
    uint32_t sequence,
    uint8_t target_mask,
    uint64_t generated_unix_ms,
    uint8_t *output
)
{
    uint16_t offset = (uint16_t)(fragment_index * TEST_FRAGMENT_DATA_BYTES);
    uint16_t remaining = (uint16_t)(RTCM_FRAME_BYTES - offset);
    uint16_t data_bytes = remaining < TEST_FRAGMENT_DATA_BYTES ? remaining : TEST_FRAGMENT_DATA_BYTES;
    uint32_t crc;
    memset(output, 0, GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES + TEST_FRAGMENT_DATA_BYTES);
    output[0] = 0x47U;
    output[1] = 0x33U;
    output[2] = 3U;
    output[3] = 28U;
    output[5] = 0U;
    output[6] = target_mask;
    output[7] = 1U;
    WriteU32(output + 8, session_epoch);
    WriteU32(output + 12, sequence);
    WriteU64(output + 16, generated_unix_ms);
    WriteU32(output + 24, 3000U);
    WriteU16(output + 28, 1124U);
    output[30] = GNSS_RTCM_CLASS_OBSERVATION;
    output[31] = fragment_index;
    output[32] = TEST_FRAGMENT_COUNT;
    WriteU16(output + 34, RTCM_FRAME_BYTES);
    WriteU16(output + 36, offset);
    crc = GnssTransportV3_Crc24q(frame, RTCM_FRAME_BYTES - 3U);
    WriteU32(output + 38, crc);
    memcpy(output + GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES, frame + offset, data_bytes);
    return (uint16_t)(GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES + data_bytes);
}

static void TestCoreGoldenVector(void)
{
    static const char *expected_hex =
        "4733031c0001000200000011000004120000019f9dd4d9bb00000bb8"
        "0104003f097d202913290a95000000091bf093150000001b3d01f0b1"
        "0000bbfbffffd96c000007d0000000530038005b004800080009000f"
        "01b601b90138024803e800000017";
    GnssCoreV3 core;
    uint8_t encoded[GNSS_CORE_V3_PAYLOAD_BYTES];
    uint8_t expected[GNSS_CORE_V3_PAYLOAD_BYTES];
    memset(&core, 0, sizeof(core));
    core.transport.source_node = 1U;
    core.transport.target_mask = GNSS_V3_TARGET_GATEWAY;
    core.transport.priority = 2U;
    core.transport.session_epoch = 17U;
    core.transport.sequence = 1042U;
    core.transport.generated_unix_ms = 1785059400123ULL;
    core.transport.ttl_ms = 3000U;
    core.coordinate_frame = 1U;
    core.gga_quality = 4U;
    core.fix_flags = 63U;
    core.gnss_week = 2429U;
    core.satellites_used = 32U;
    core.satellites_visible = 41U;
    core.gnss_tow_ms = 321456789U;
    core.latitude_e9 = 39123456789LL;
    core.longitude_e9 = 116987654321LL;
    core.altitude_msl_mm = 48123;
    core.geoid_separation_mm = -9876;
    core.correction_age_ms = 2000U;
    core.solution_age_ms = 83U;
    core.hdop_x100 = 56U;
    core.pdop_x100 = 91U;
    core.vdop_x100 = 72U;
    core.gst_sigma_lat_mm = 8U;
    core.gst_sigma_lon_mm = 9U;
    core.gst_sigma_alt_mm = 15U;
    core.cn0_mean_dbhz_x10 = 438U;
    core.cn0_median_dbhz_x10 = 441U;
    core.cn0_min_dbhz_x10 = 312U;
    core.fix_streak_s = 584U;
    core.fixed_ratio_1m_permille = 1000U;
    core.reference_station_id = 23U;
    assert(GnssTransportV3_EncodeCore(&core, encoded, sizeof(encoded)) == GNSS_CORE_V3_PAYLOAD_BYTES);
    DecodeHex(expected_hex, expected, sizeof(expected));
    assert(memcmp(encoded, expected, sizeof(expected)) == 0);
}

static void TestRtcmReassembly(void)
{
    static const uint8_t order[TEST_FRAGMENT_COUNT] = {2U, 0U, 4U, 1U, 3U};
    uint8_t frame[RTCM_FRAME_BYTES];
    uint8_t payloads[TEST_FRAGMENT_COUNT][GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES + TEST_FRAGMENT_DATA_BYTES];
    uint16_t payload_bytes[TEST_FRAGMENT_COUNT];
    uint8_t completed[GNSS_RTCM_V3_MAX_FRAME_BYTES];
    uint16_t completed_bytes = 0U;
    uint16_t completed_type = 0U;
    GnssRtcmReassemblerV3 state;
    GnssRtcmReassemblyStatusV3 status = GNSS_RTCM_REASSEMBLY_REJECTED;
    uint8_t index;
    BuildRtcm(frame);
    for (index = 0U; index < TEST_FRAGMENT_COUNT; ++index) {
        payload_bytes[index] = BuildFragment(
            frame, index, 31U, 88U, GNSS_V3_TARGET_ALL_NODES, TEST_NOW_MS, payloads[index]
        );
    }
    GnssRtcmReassemblerV3_Init(&state, 2U);
    assert(sizeof(state) <= 7000U);
    for (index = 0U; index < TEST_FRAGMENT_COUNT; ++index) {
        uint8_t fragment_index = order[index];
        status = GnssRtcmReassemblerV3_Push(
            &state,
            payloads[fragment_index],
            payload_bytes[fragment_index],
            TEST_NOW_MS + index * 10U,
            1U,
            completed,
            sizeof(completed),
            &completed_bytes,
            &completed_type
        );
        if (index == 0U) {
            assert(status == GNSS_RTCM_REASSEMBLY_ACCEPTED);
            assert(GnssRtcmReassemblerV3_Push(
                &state, payloads[fragment_index], payload_bytes[fragment_index], TEST_NOW_MS + 1U,
                1U, completed, sizeof(completed), &completed_bytes, &completed_type
            ) == GNSS_RTCM_REASSEMBLY_DUPLICATE);
        }
    }
    assert(status == GNSS_RTCM_REASSEMBLY_COMPLETE);
    assert(completed_bytes == RTCM_FRAME_BYTES);
    assert(completed_type == 1124U);
    assert(memcmp(completed, frame, RTCM_FRAME_BYTES) == 0);
    assert(GnssRtcmReassemblerV3_Push(
        &state, payloads[0], payload_bytes[0], TEST_NOW_MS + 100U,
        1U, completed, sizeof(completed), &completed_bytes, &completed_type
    ) == GNSS_RTCM_REASSEMBLY_DUPLICATE);
    assert(state.completed_frames == 1U);
    assert(state.duplicate_fragments == 2U);
}

static void TestFreshnessAndSessionRejection(void)
{
    uint8_t frame[RTCM_FRAME_BYTES];
    uint8_t payload[GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES + TEST_FRAGMENT_DATA_BYTES];
    uint8_t completed[GNSS_RTCM_V3_MAX_FRAME_BYTES];
    uint16_t payload_bytes;
    uint16_t completed_bytes;
    GnssRtcmReassemblerV3 state;
    BuildRtcm(frame);
    GnssRtcmReassemblerV3_Init(&state, 1U);

    payload_bytes = BuildFragment(frame, 0U, 10U, 1U, GNSS_V3_TARGET_NODE_B, TEST_NOW_MS, payload);
    assert(GnssRtcmReassemblerV3_Push(
        &state, payload, payload_bytes, TEST_NOW_MS, 1U,
        completed, sizeof(completed), &completed_bytes, NULL
    ) == GNSS_RTCM_REASSEMBLY_REJECTED);

    payload_bytes = BuildFragment(frame, 0U, 10U, 1U, GNSS_V3_TARGET_NODE_A, TEST_NOW_MS - 3001U, payload);
    assert(GnssRtcmReassemblerV3_Push(
        &state, payload, payload_bytes, TEST_NOW_MS, 1U,
        completed, sizeof(completed), &completed_bytes, NULL
    ) == GNSS_RTCM_REASSEMBLY_REJECTED);

    payload_bytes = BuildFragment(frame, 0U, 11U, 2U, GNSS_V3_TARGET_NODE_A, TEST_NOW_MS, payload);
    assert(GnssRtcmReassemblerV3_Push(
        &state, payload, payload_bytes, TEST_NOW_MS, 1U,
        completed, sizeof(completed), &completed_bytes, NULL
    ) == GNSS_RTCM_REASSEMBLY_ACCEPTED);

    payload_bytes = BuildFragment(frame, 0U, 10U, 3U, GNSS_V3_TARGET_NODE_A, TEST_NOW_MS, payload);
    assert(GnssRtcmReassemblerV3_Push(
        &state, payload, payload_bytes, TEST_NOW_MS, 1U,
        completed, sizeof(completed), &completed_bytes, NULL
    ) == GNSS_RTCM_REASSEMBLY_REJECTED);
}

static GnssRtcmReassemblyStatusV3 FeedInjectionFrame(
    const uint8_t frame[RTCM_FRAME_BYTES],
    uint32_t session_epoch,
    uint32_t sequence,
    uint64_t monotonic_ms,
    int corrupt_fragment
)
{
    uint8_t payload[GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES + TEST_FRAGMENT_DATA_BYTES];
    GnssRtcmReassemblyStatusV3 status = GNSS_RTCM_REASSEMBLY_REJECTED;
    uint8_t index;

    for (index = 0U; index < TEST_FRAGMENT_COUNT; ++index) {
        uint16_t payload_bytes = BuildFragment(
            frame,
            index,
            session_epoch,
            sequence,
            GNSS_V3_TARGET_NODE_A,
            TEST_NOW_MS,
            payload
        );
        if ((int)index == corrupt_fragment) {
            payload[GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES] ^= 0x5AU;
        }
        status = GnssRtcmInjection_AcceptFragment(
            payload,
            payload_bytes,
            monotonic_ms + index
        );
    }
    return status;
}

static void TestBoundedInjectionQueue(void)
{
    uint8_t frame[RTCM_FRAME_BYTES];
    uint8_t dequeued[GNSS_RTCM_V3_MAX_FRAME_BYTES];
    uint16_t dequeued_bytes = 0U;
    uint16_t message_type = 0U;
    GnssRtcmInjectionStats stats;

    BuildRtcm(frame);
    assert(GNSS_RTCM_QUEUE_DEPTH == 4U);
    assert(GnssRtcmInjection_Init(0U) == -1);
    assert(GnssRtcmInjection_Init(1U) == 0);
    assert(FeedInjectionFrame(frame, 51U, 1U, 1000U, -1) == GNSS_RTCM_REASSEMBLY_COMPLETE);
    assert(FeedInjectionFrame(frame, 51U, 2U, 1010U, -1) == GNSS_RTCM_REASSEMBLY_COMPLETE);
    assert(FeedInjectionFrame(frame, 51U, 3U, 1020U, -1) == GNSS_RTCM_REASSEMBLY_COMPLETE);
    assert(FeedInjectionFrame(frame, 51U, 4U, 1030U, -1) == GNSS_RTCM_REASSEMBLY_COMPLETE);
    assert(FeedInjectionFrame(frame, 51U, 5U, 1040U, -1) == GNSS_RTCM_REASSEMBLY_COMPLETE);

    GnssRtcmInjection_GetStats(&stats);
    assert(stats.completed_frames == 5U);
    assert(stats.queued_frames == 5U);
    assert(stats.queue_pending == GNSS_RTCM_QUEUE_DEPTH);
    assert(stats.queue_high_watermark == GNSS_RTCM_QUEUE_DEPTH);
    assert(stats.queue_evictions == 1U);
    assert(stats.ttl_unverified_fragments == 25U);
    assert(stats.completed_type_1124 == 5U);

    assert(GnssRtcmInjection_TryDequeue(
        1100U, dequeued, sizeof(dequeued), &dequeued_bytes, &message_type
    ) == 1);
    assert(dequeued_bytes == RTCM_FRAME_BYTES);
    assert(message_type == 1124U);
    assert(memcmp(dequeued, frame, RTCM_FRAME_BYTES) == 0);
    GnssRtcmInjection_RecordProbe(dequeued_bytes);

    assert(GnssRtcmInjection_TryDequeue(
        1100U, dequeued, sizeof(dequeued), &dequeued_bytes, &message_type
    ) == 1);
    assert(GnssRtcmInjection_TryDequeue(
        1100U, dequeued, sizeof(dequeued), &dequeued_bytes, &message_type
    ) == 1);
    assert(GnssRtcmInjection_TryDequeue(
        1100U, dequeued, sizeof(dequeued), &dequeued_bytes, &message_type
    ) == 1);
    assert(GnssRtcmInjection_TryDequeue(
        1100U, dequeued, sizeof(dequeued), &dequeued_bytes, &message_type
    ) == 0);

    assert(FeedInjectionFrame(frame, 51U, 6U, 1200U, -1) == GNSS_RTCM_REASSEMBLY_COMPLETE);
    assert(GnssRtcmInjection_TryDequeue(
        4205U, dequeued, sizeof(dequeued), &dequeued_bytes, &message_type
    ) == 0);
    GnssRtcmInjection_GetStats(&stats);
    assert(stats.queue_expired_frames == 1U);
    assert(stats.probe_validated_frames == 1U);
    assert(stats.probe_validated_bytes == RTCM_FRAME_BYTES);
}

static void TestInjectionCrcCounter(void)
{
    uint8_t frame[RTCM_FRAME_BYTES];
    GnssRtcmInjectionStats stats;

    BuildRtcm(frame);
    assert(GnssRtcmInjection_Init(1U) == 0);
    assert(FeedInjectionFrame(frame, 61U, 1U, 2000U, 2) == GNSS_RTCM_REASSEMBLY_REJECTED);
    GnssRtcmInjection_GetStats(&stats);
    assert(stats.completed_frames == 0U);
    assert(stats.crc_errors == 1U);
    assert(stats.rejected_fragments == 1U);
    assert(stats.queue_pending == 0U);
}

int main(void)
{
    TestCoreGoldenVector();
    TestRtcmReassembly();
    TestFreshnessAndSessionRejection();
    TestBoundedInjectionQueue();
    TestInjectionCrcCounter();
    printf("gnss_transport_v3_host_test passed reassembler_bytes=%u queue_bytes=%u\n",
           (unsigned int)sizeof(GnssRtcmReassemblerV3),
           (unsigned int)(GNSS_RTCM_QUEUE_DEPTH * GNSS_RTCM_V3_MAX_FRAME_BYTES));
    return 0;
}
