#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "../app/compact_telemetry_builder.h"
#include "../app/compact_poll_command.h"
#include "../drivers/sensors/simulated_field_sensors.h"
#include "../drivers/sensors/simulated_gnss.h"
#include "../drivers/xl01/field_link_frame.h"

static unsigned int ReadUint16Be(const unsigned char *input)
{
    return ((unsigned int)input[0] << 8) | (unsigned int)input[1];
}

static unsigned int ReadUint32Be(const unsigned char *input)
{
    return ((unsigned int)input[0] << 24) | ((unsigned int)input[1] << 16) |
           ((unsigned int)input[2] << 8) | (unsigned int)input[3];
}

static int64_t ReadInt64Be(const unsigned char *input)
{
    uint64_t value = 0U;
    unsigned int index;
    for (index = 0U; index < 8U; ++index) value = (value << 8) | input[index];
    return (int64_t)value;
}

static int64_t ReadInt40Be(const unsigned char *input)
{
    uint64_t value = 0U;
    unsigned int index;
    for (index = 0U; index < 5U; ++index) value = (value << 8) | input[index];
    if ((value & (1ULL << 39)) != 0U) value |= ~((1ULL << 40) - 1ULL);
    return (int64_t)value;
}

static int32_t ReadInt24Be(const unsigned char *input)
{
    uint32_t value = ((uint32_t)input[0] << 16) | ((uint32_t)input[1] << 8) | input[2];
    if ((value & (1U << 23)) != 0U) value |= 0xFF000000U;
    return (int32_t)value;
}

static void FillProfessionalGnss(SensorData *data)
{
    data->gnss_status_valid = 1;
    data->gnss.status_valid = 1U;
    data->gnss.position_valid = 1U;
    data->gnss.coordinate_frame = GNSS_COORDINATE_FRAME_CGCS2000;
    data->gnss.gga_quality = 4U;
    data->gnss.fix_flags = GNSS_FIX_NMEA_CHECKSUM_VALID | GNSS_FIX_TRUSTED |
        GNSS_FIX_TIME_VALID | GNSS_FIX_GST_VALID | GNSS_FIX_CORRECTION_AGE_VALID |
        GNSS_FIX_HDOP_VALID | GNSS_FIX_ALTITUDE_VALID | GNSS_FIX_GEOID_VALID |
        GNSS_FIX_STATION_VALID | GNSS_FIX_POSITION_VALID |
        GNSS_FIX_FIXED_STATS_VALID | GNSS_FIX_COORDINATE_FRAME_VALID;
    data->gnss.gnss_week = 2430U;
    data->gnss.gnss_tow_ms = 123456789U;
    data->gnss.satellites_used = 31U;
    data->gnss.latitude_e9 = 24612345678LL;
    data->gnss.longitude_e9 = 118123456789LL;
    data->gnss.altitude_msl_mm = 12345;
    data->gnss.geoid_separation_mm = -2345;
    data->gnss.correction_age_ms = 2000U;
    data->gnss.solution_age_ms = 127U;
    data->gnss.hdop_x100 = 52U;
    data->gnss.gst_sigma_lat_mm = 6U;
    data->gnss.gst_sigma_lon_mm = 7U;
    data->gnss.gst_sigma_alt_mm = 15U;
    data->gnss.fix_streak_s = 71U;
    data->gnss.fixed_ratio_1m_permille = 983U;
    data->gnss.fix_drop_count = 2U;
    data->gnss.reference_station_id = 82U;
}

int main(void)
{
    const char *command_id = "P112345678";
    SensorData data;
    SensorData simulated_gnss;
    unsigned char payload[COMPACT_TELEMETRY_PAYLOAD_BYTES];
    unsigned char v6_core[COMPACT_TELEMETRY_V6_PAYLOAD_BYTES];
    unsigned char v6_environment[COMPACT_TELEMETRY_V6_PAYLOAD_BYTES];
    unsigned char v6_audit[COMPACT_TELEMETRY_V6_PAYLOAD_BYTES];
    unsigned char frame[FIELD_LINK_FRAME_ENCODED_BYTES];
    FieldLinkFrameDecoder decoder;
    FieldLinkFrameMessage decoded;
    GnssRtcmInjectionStats rtcm_stats;
    GnssRtcmRuntimeStatus rtcm_runtime;
    int payload_len;
    int frame_len;
    int v6_frame_len;
    int result = 0;
    int index;
    CompactPollBroadcastDeduplicator deduplicator;

    memset(&deduplicator, 0, sizeof(deduplicator));
    assert(CompactPollCommand_ShouldSuppressBroadcastDuplicate(
        &deduplicator, "P112345678", COMPACT_POLL_COMMAND_BYTES) == 0);
    assert(CompactPollCommand_ShouldSuppressBroadcastDuplicate(
        &deduplicator, "P112345678", COMPACT_POLL_COMMAND_BYTES) == 1);
    assert(CompactPollCommand_ShouldSuppressBroadcastDuplicate(
        &deduplicator, "P2A12345678", COMPACT_TARGETED_POLL_COMMAND_BYTES) == 0);
    for (index = 0; index < (int)COMPACT_POLL_RECENT_BROADCASTS + 1; ++index) {
        char broadcast[COMPACT_POLL_COMMAND_BYTES + 1];
        snprintf(broadcast, sizeof(broadcast), "P1%08X", (unsigned int)(index + 1));
        assert(CompactPollCommand_ShouldSuppressBroadcastDuplicate(
            &deduplicator, broadcast, COMPACT_POLL_COMMAND_BYTES) == 0);
    }
    assert(CompactPollCommand_ShouldSuppressBroadcastDuplicate(
        &deduplicator, "P112345678", COMPACT_POLL_COMMAND_BYTES) == 0);

    memset(&data, 0, sizeof(data));
    data.seq = 77U;
    data.sample_epoch = 41U;
    data.uptime = 900U;
    SimulatedFieldSensors_Read(&data, data.uptime, 'C');
    data.battery_voltage_mv = 12123U;
    data.battery_level = 83;
    data.battery_estimate_quality = 2;
    data.battery_valid = 1;
    data.warning = 1;
    FillProfessionalGnss(&data);

    payload_len = BuildCompactTelemetryV3(
        &data, "C", command_id, "scheduler_poll", payload, sizeof(payload));
    assert(payload_len == COMPACT_TELEMETRY_V3_PAYLOAD_BYTES);
    assert(payload[0] == 'L' && payload[1] == 'S' && payload[2] == 3U);
    assert(payload[3] == 3U);
    assert(payload[4] == (COMPACT_TELEMETRY_STATUS_WARNING |
                          COMPACT_TELEMETRY_STATUS_FIELD_SENSORS_SIMULATED));
    assert(payload[5] == COMPACT_TELEMETRY_TRIGGER_SCHEDULER_POLL);
    assert(ReadUint32Be(payload + 8) == data.seq);
    assert(ReadUint32Be(payload + 12) == data.uptime);
    assert(ReadUint32Be(payload + 16) == CompactTelemetry_CommandTag(command_id));
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_V3_VALID_GNSS_POSITION) != 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_V3_VALID_GST) != 0U);
    assert(ReadUint16Be(payload + 20) == 12123U);
    assert(payload[22] == 83U && payload[23] == 2U);
    assert(ReadInt64Be(payload + 36) == data.gnss.latitude_e9);
    assert(ReadInt64Be(payload + 44) == data.gnss.longitude_e9);
    assert((int32_t)ReadUint32Be(payload + 52) == data.gnss.altitude_msl_mm);
    assert((int32_t)ReadUint32Be(payload + 56) == data.gnss.geoid_separation_mm);
    assert(payload[74] == 4U && payload[75] == GNSS_COORDINATE_FRAME_CGCS2000);
    assert(ReadUint16Be(payload + 76) == data.gnss.fix_flags);
    assert(payload[78] == 31U);
    assert(ReadUint16Be(payload + 79) == 52U);
    assert(ReadUint16Be(payload + 89) == 983U);
    assert(ReadUint16Be(payload + 93) == 82U);

    simulated_gnss = data;
    simulated_gnss.simulated_field_data = 0;
    simulated_gnss.simulated_gnss_data = 1;
    payload_len = BuildCompactTelemetryV3(
        &simulated_gnss, "C", command_id, "scheduler_poll", payload, sizeof(payload));
    assert(payload_len == COMPACT_TELEMETRY_V3_PAYLOAD_BYTES);
    assert(payload[4] == (COMPACT_TELEMETRY_STATUS_WARNING |
                          COMPACT_TELEMETRY_STATUS_GNSS_SIMULATED));
    assert(payload[74] == 1U);
    assert((ReadUint16Be(payload + 76) & GNSS_FIX_TRUSTED) == 0U);
    assert((ReadUint16Be(payload + 76) & GNSS_FIX_CORRECTION_AGE_VALID) == 0U);
    assert((ReadUint16Be(payload + 76) & GNSS_FIX_FIXED_STATS_VALID) == 0U);
    assert((ReadUint16Be(payload + 76) & GNSS_FIX_STATION_VALID) == 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_V3_VALID_CORRECTION_AGE) == 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_V3_VALID_FIXED_STATS) == 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_V3_VALID_STATION) == 0U);

    memset(&simulated_gnss, 0, sizeof(simulated_gnss));
    SimulatedGnss_Read(&simulated_gnss, 37U, 'B');
    assert(simulated_gnss.gnss_status_valid == 1);
    assert(simulated_gnss.simulated_gnss_data == 1);
    assert(simulated_gnss.gnss.gga_quality == 1U);
    assert(simulated_gnss.gnss.position_valid == 1U);
    assert((simulated_gnss.gnss.fix_flags & GNSS_FIX_TRUSTED) == 0U);

    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY, 9U, (const char *)payload, payload_len,
        frame, sizeof(frame));
    assert(frame_len > 0);
    assert(frame_len <= 114);
    memset(&decoded, 0, sizeof(decoded));
    FieldLinkFrameDecoder_Init(&decoder);
    for (index = 0; index < frame_len; ++index) {
        result = FieldLinkFrameDecoder_FeedByte(&decoder, frame[index], &decoded);
    }
    assert(result == 1);
    assert(decoded.type == FIELD_LINK_FRAME_TYPE_TELEMETRY);
    assert(decoded.sequence == 9U);
    assert(decoded.payload_len == payload_len);
    assert(memcmp(decoded.payload, payload, (size_t)payload_len) == 0);

    memset(&rtcm_stats, 0, sizeof(rtcm_stats));
    memset(&rtcm_runtime, 0, sizeof(rtcm_runtime));
    rtcm_stats.injected_frames = 450U;
    rtcm_stats.rejected_fragments = 2U;
    rtcm_stats.crc_errors = 1U;
    rtcm_stats.queue_evictions = 3U;
    rtcm_stats.queue_expired_frames = 4U;
    rtcm_stats.injection_dropped_frames = 5U;
    rtcm_stats.uart_write_errors = 6U;
    rtcm_runtime.mode = GNSS_RTCM_INJECTION_LIVE;
    rtcm_runtime.state_flags = GNSS_RTCM_STATE_READY |
        GNSS_RTCM_STATE_SESSION_ARMED | GNSS_RTCM_STATE_LEASE_VALID |
        GNSS_RTCM_STATE_FRAGMENT_RECENT | GNSS_RTCM_STATE_FRAME_RECENT |
        GNSS_RTCM_STATE_ACTION_RECENT;
    rtcm_runtime.queue_pending = 1U;
    rtcm_runtime.queue_high_watermark = 4U;
    rtcm_runtime.session_epoch = 0x12345678U;
    rtcm_runtime.lease_remaining_ms = 59123U;
    rtcm_runtime.last_completed_frame_age_ms = 234U;

    payload_len = BuildCompactTelemetryV6(
        &data, &rtcm_stats, &rtcm_runtime, COMPACT_TELEMETRY_V6_SCOPE_CORE,
        "C", command_id, v6_core, sizeof(v6_core));
    assert(payload_len == COMPACT_TELEMETRY_V6_PAYLOAD_BYTES);
    assert(v6_core[2] == 6U && v6_core[5] == COMPACT_TELEMETRY_V6_SCOPE_CORE);
    assert(ReadUint32Be(v6_core + 8) == 77U && ReadUint32Be(v6_core + 12) == 41U);
    assert(ReadInt40Be(v6_core + 26) == data.gnss.latitude_e9);
    assert(ReadInt40Be(v6_core + 31) == data.gnss.longitude_e9);
    assert(ReadInt24Be(v6_core + 36) == data.gnss.altitude_msl_mm);
    assert(v6_core[39] == 12U && v6_core[40] == 31U);
    assert(v6_core[41] == 11U && v6_core[42] == 20U && v6_core[43] == 7U);
    assert(v6_core[44] == 6U && v6_core[45] == 7U);
    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY, 12U, (const char *)v6_core, payload_len,
        frame, sizeof(frame));
    assert(frame_len == 64);
    v6_frame_len = frame_len;

    data.seq = 0U;
    assert(BuildCompactTelemetryV6(
        &data, &rtcm_stats, &rtcm_runtime, COMPACT_TELEMETRY_V6_SCOPE_CORE,
        "C", command_id, v6_core, sizeof(v6_core)) < 0);
    data.seq = 77U;

    payload_len = BuildCompactTelemetryV6(
        &data, &rtcm_stats, &rtcm_runtime, COMPACT_TELEMETRY_V6_SCOPE_ENVIRONMENT,
        "C", "P3C12345678", v6_environment, sizeof(v6_environment));
    assert(payload_len == COMPACT_TELEMETRY_V6_PAYLOAD_BYTES);
    assert(v6_environment[5] == COMPACT_TELEMETRY_V6_SCOPE_ENVIRONMENT);
    assert(ReadUint32Be(v6_environment + 20) == 900U);
    assert(ReadUint16Be(v6_environment + 24) == 12123U);
    assert(ReadInt24Be(v6_environment + 34) == -2345);
    assert(ReadUint16Be(v6_environment + 37) == 2430U);
    assert(ReadUint32Be(v6_environment + 39) == 123456789U);
    assert(ReadUint16Be(v6_environment + 43) == 15U);
    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY, 13U, (const char *)v6_environment, payload_len,
        frame, sizeof(frame));
    assert(frame_len == v6_frame_len);

    payload_len = BuildCompactTelemetryV6(
        &data, &rtcm_stats, &rtcm_runtime, COMPACT_TELEMETRY_V6_SCOPE_AUDIT,
        "C", "P4C12345678", v6_audit, sizeof(v6_audit));
    assert(payload_len == COMPACT_TELEMETRY_V6_PAYLOAD_BYTES);
    assert(v6_audit[5] == COMPACT_TELEMETRY_V6_SCOPE_AUDIT);
    assert(v6_audit[20] == GNSS_RTCM_INJECTION_LIVE && v6_audit[21] == rtcm_runtime.state_flags);
    assert(v6_audit[22] == 0x14U && ReadUint32Be(v6_audit + 24) == 0x12345678U);
    assert(ReadUint16Be(v6_audit + 28) == 592U);
    assert(ReadUint16Be(v6_audit + 30) == 23U);
    assert(ReadUint16Be(v6_audit + 32) == 450U);
    assert(ReadUint16Be(v6_audit + 34) == data.gnss.fix_flags);
    assert(ReadUint16Be(v6_audit + 40) == 82U);
    assert(ReadUint16Be(v6_audit + 42) == 6U && ReadUint16Be(v6_audit + 44) == 7U);
    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY, 14U, (const char *)v6_audit, payload_len,
        frame, sizeof(frame));
    assert(frame_len == v6_frame_len);

    memset(&rtcm_stats, 0, sizeof(rtcm_stats));
    memset(&rtcm_runtime, 0, sizeof(rtcm_runtime));
    rtcm_stats.accepted_fragments = 1234U;
    rtcm_stats.completed_frames = 456U;
    rtcm_stats.injected_frames = 450U;
    rtcm_stats.rejected_fragments = 2U;
    rtcm_stats.crc_errors = 1U;
    rtcm_stats.queue_evictions = 3U;
    rtcm_stats.queue_expired_frames = 4U;
    rtcm_stats.injection_dropped_frames = 5U;
    rtcm_stats.uart_write_errors = 6U;
    rtcm_runtime.mode = GNSS_RTCM_INJECTION_LIVE;
    rtcm_runtime.state_flags = GNSS_RTCM_STATE_READY |
        GNSS_RTCM_STATE_SESSION_ARMED | GNSS_RTCM_STATE_LEASE_VALID |
        GNSS_RTCM_STATE_FRAGMENT_RECENT | GNSS_RTCM_STATE_FRAME_RECENT |
        GNSS_RTCM_STATE_ACTION_RECENT;
    rtcm_runtime.queue_pending = 1U;
    rtcm_runtime.queue_high_watermark = 4U;
    rtcm_runtime.session_epoch = 0x12345678U;
    rtcm_runtime.lease_remaining_ms = 59123U;
    rtcm_runtime.last_fragment_age_ms = 123U;
    rtcm_runtime.last_completed_frame_age_ms = 234U;
    rtcm_runtime.last_action_age_ms = 345U;

    payload_len = BuildCompactTelemetryV4(
        &data, &rtcm_stats, &rtcm_runtime, "C", command_id,
        "scheduler_poll", payload, sizeof(payload));
    assert(payload_len == COMPACT_TELEMETRY_V4_PAYLOAD_BYTES);
    assert(payload[2] == 4U);
    assert(payload[95] == GNSS_RTCM_INJECTION_LIVE);
    assert(payload[96] == rtcm_runtime.state_flags);
    assert(payload[97] == 1U && payload[98] == 4U);
    assert(ReadUint32Be(payload + 99) == 0x12345678U);
    assert(ReadUint32Be(payload + 103) == 59123U);
    assert(ReadUint32Be(payload + 107) == 123U);
    assert(ReadUint32Be(payload + 111) == 234U);
    assert(ReadUint32Be(payload + 115) == 345U);
    assert(ReadUint32Be(payload + 119) == 1234U);
    assert(ReadUint32Be(payload + 123) == 456U);
    assert(ReadUint32Be(payload + 127) == 450U);
    assert(ReadUint16Be(payload + 131) == 2U);
    assert(ReadUint16Be(payload + 133) == 1U);
    assert(ReadUint16Be(payload + 135) == 12U);
    assert(ReadUint16Be(payload + 137) == 6U);

    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY, 10U, (const char *)payload, payload_len,
        frame, sizeof(frame));
    assert(frame_len > 0 && frame_len <= 158);
    memset(&decoded, 0, sizeof(decoded));
    FieldLinkFrameDecoder_Init(&decoder);
    for (index = 0; index < frame_len; ++index) {
        result = FieldLinkFrameDecoder_FeedByte(&decoder, frame[index], &decoded);
    }
    assert(result == 1 && decoded.payload_len == payload_len);
    assert(memcmp(decoded.payload, payload, (size_t)payload_len) == 0);

    payload_len = BuildCompactTelemetryV5(
        &data, &rtcm_stats, &rtcm_runtime, "C", command_id,
        "scheduler_poll", payload, sizeof(payload));
    assert(payload_len == COMPACT_TELEMETRY_V5_PAYLOAD_BYTES);
    assert(payload[2] == 5U);
    assert(payload[95] == GNSS_RTCM_INJECTION_LIVE);
    assert(payload[96] == rtcm_runtime.state_flags);
    assert(payload[97] == 1U && payload[98] == 4U);
    assert(ReadUint32Be(payload + 99) == 0x12345678U);
    assert(ReadUint16Be(payload + 103) == 592U);
    assert(ReadUint16Be(payload + 105) == 23U);
    assert(ReadUint16Be(payload + 107) == 450U);
    assert(payload[109] == 0x0FU);

    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY, 11U, (const char *)payload, payload_len,
        frame, sizeof(frame));
    assert(frame_len == 128);
    memset(&decoded, 0, sizeof(decoded));
    FieldLinkFrameDecoder_Init(&decoder);
    for (index = 0; index < frame_len; ++index) {
        result = FieldLinkFrameDecoder_FeedByte(&decoder, frame[index], &decoded);
    }
    assert(result == 1 && decoded.payload_len == payload_len);
    assert(memcmp(decoded.payload, payload, (size_t)payload_len) == 0);

    rtcm_stats.injected_frames = 70000U;
    payload_len = BuildCompactTelemetryV5(
        &data, &rtcm_stats, &rtcm_runtime, "C", command_id,
        "scheduler_poll", payload, sizeof(payload));
    assert(payload_len == COMPACT_TELEMETRY_V5_PAYLOAD_BYTES);
    assert(ReadUint16Be(payload + 107) == 0xFFFFU);
    assert((payload[109] & COMPACT_TELEMETRY_V5_RTCM_INJECTED_COUNT_SATURATED) != 0U);

    rtcm_stats.queue_evictions = UINT32_MAX;
    rtcm_stats.queue_expired_frames = 1U;
    rtcm_stats.injection_dropped_frames = 1U;
    payload_len = BuildCompactTelemetryV5(
        &data, &rtcm_stats, &rtcm_runtime, "C", command_id,
        "scheduler_poll", payload, sizeof(payload));
    assert(payload_len == COMPACT_TELEMETRY_V5_PAYLOAD_BYTES);
    assert((payload[109] & COMPACT_TELEMETRY_V5_RTCM_ERROR_QUEUE_DROP) != 0U);

    memset(&rtcm_stats, 0, sizeof(rtcm_stats));
    memset(&rtcm_runtime, 0, sizeof(rtcm_runtime));
    rtcm_runtime.state_flags = GNSS_RTCM_STATE_READY;
    rtcm_runtime.last_fragment_age_ms = UINT32_MAX;
    rtcm_runtime.last_completed_frame_age_ms = UINT32_MAX;
    rtcm_runtime.last_action_age_ms = UINT32_MAX;
    payload_len = BuildCompactTelemetryV5(
        &data, &rtcm_stats, &rtcm_runtime, "C", command_id,
        "scheduler_poll", payload, sizeof(payload));
    assert(payload_len == COMPACT_TELEMETRY_V5_PAYLOAD_BYTES);
    assert(payload[95] == GNSS_RTCM_INJECTION_DISABLED);
    assert(payload[96] == GNSS_RTCM_STATE_READY);
    assert(ReadUint32Be(payload + 99) == 0U);
    assert(ReadUint16Be(payload + 103) == 0U);
    assert(ReadUint16Be(payload + 105) == COMPACT_TELEMETRY_V5_AGE_UNAVAILABLE);
    assert(ReadUint16Be(payload + 107) == 0U);
    assert(payload[109] == 0U);

    assert(CompactPollCommand_IsValid("P112345678", COMPACT_POLL_COMMAND_BYTES));
    assert(!CompactPollCommand_IsValid("P11234567Z", COMPACT_POLL_COMMAND_BYTES));
    assert(CompactPollCommand_IsValid("P2A12345678", COMPACT_TARGETED_POLL_COMMAND_BYTES));
    assert(CompactPollCommand_IsValid("P3A12345678", COMPACT_TARGETED_POLL_COMMAND_BYTES));
    assert(CompactPollCommand_IsValid("P4C12345678", COMPACT_TARGETED_POLL_COMMAND_BYTES));
    assert(!CompactPollCommand_IsValid("P2D12345678", COMPACT_TARGETED_POLL_COMMAND_BYTES));
    assert(CompactPollCommand_TargetMatches("P112345678", "A"));
    assert(CompactPollCommand_TargetMatches("P2B12345678", "B"));
    assert(!CompactPollCommand_TargetMatches("P2B12345678", "A"));
    assert(CompactPollCommand_TargetMatches("P3B12345678", "B"));
    assert(CompactPollCommand_TargetMatches("P4C12345678", "C"));
    assert(CompactPollCommand_Scope("P112345678") == COMPACT_POLL_SCOPE_CORE);
    assert(CompactPollCommand_Scope("P2A12345678") == COMPACT_POLL_SCOPE_CORE);
    assert(CompactPollCommand_Scope("P3A12345678") == COMPACT_POLL_SCOPE_ENVIRONMENT);
    assert(CompactPollCommand_Scope("P4A12345678") == COMPACT_POLL_SCOPE_AUDIT);
    assert(CompactPollCommand_ResponseDelayMs("P112345678", "A") == 0U);
    assert(CompactPollCommand_ResponseDelayMs("P112345678", "B") == 340U);
    assert(CompactPollCommand_ResponseDelayMs("P112345678", "C") == 680U);
    assert(CompactPollCommand_ResponseDelayMs("P2C12345678", "C") == 0U);

    printf("compact_v6_payload_bytes=%d field_link_wire_bytes=%d command_tag=%08x\n",
           COMPACT_TELEMETRY_V6_PAYLOAD_BYTES, v6_frame_len, CompactTelemetry_CommandTag(command_id));
    printf("v6_core_hex=");
    for (index = 0; index < COMPACT_TELEMETRY_V6_PAYLOAD_BYTES; ++index) printf("%02x", v6_core[index]);
    printf("\nv6_environment_hex=");
    for (index = 0; index < COMPACT_TELEMETRY_V6_PAYLOAD_BYTES; ++index) printf("%02x", v6_environment[index]);
    printf("\nv6_audit_hex=");
    for (index = 0; index < COMPACT_TELEMETRY_V6_PAYLOAD_BYTES; ++index) printf("%02x", v6_audit[index]);
    printf("\n");
    return 0;
}
