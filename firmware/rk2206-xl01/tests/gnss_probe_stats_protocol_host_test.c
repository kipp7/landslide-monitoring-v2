#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "../app/gnss_probe_stats_protocol.h"
#include "../drivers/xl01/field_link_frame.h"

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

static void FillModbusChannel(Rs485ModbusChannelDiagnostics *diag, uint32_t base)
{
    memset(diag, 0, sizeof(*diag));
    diag->requests = base + 0U;
    diag->successes = base + 1U;
    diag->write_errors = base + 2U;
    diag->tx_done_errors = base + 3U;
    diag->read_errors = base + 4U;
    diag->no_responses = base + 5U;
    diag->short_responses = base + 6U;
    diag->address_errors = base + 7U;
    diag->crc_errors = base + 8U;
    diag->exception_responses = base + 9U;
    diag->function_errors = base + 10U;
    diag->byte_count_errors = base + 11U;
    diag->rx_bytes = base + 12U;
    diag->last_status = (int8_t)(base == 100U ? RS485_MODBUS_ERR_TIMEOUT : RS485_MODBUS_OK);
    diag->last_rx_bytes = (uint16_t)(base + 13U);
    diag->last_response_addr = (uint8_t)(base == 100U ? 1U : 2U);
    diag->last_response_function = (uint8_t)(base == 100U ? 3U : 4U);
    diag->last_exception_code = (uint8_t)(base == 100U ? 0U : 2U);
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
    Sc16is752Diagnostics sc16is752_diagnostics;
    FieldRs485Diagnostics field_rs485_diagnostics;
    FieldRs485RuntimeDiagnostics rs485_runtime_diagnostics;
    Rs485ModbusDiagnostics modbus_diagnostics;
    GpsUartDiagnostics gps_uart_diagnostics;
    GnssRtcmLatencyDiagnostics latency_diagnostics;
    uint8_t payload[GNSS_PROBE_STATS_RESPONSE_V6_BYTES];
    uint8_t v7_payload[GNSS_PROBE_STATS_RESPONSE_V7_BYTES];
    uint8_t ack_payload[GNSS_RTCM_ACK_RESPONSE_V1_BYTES];
    uint8_t wire[FIELD_LINK_FRAME_ENCODED_BYTES];
    FieldLinkFrameDecoder wire_decoder;
    FieldLinkFrameMessage decoded_message;
    uint8_t target = 0U;
    uint32_t nonce = 0U;
    uint32_t *counter = &stats.accepted_fragments;
    unsigned int index;
    int wire_len;
    int decode_ret = 0;

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

    memset(&sc16is752_diagnostics, 0, sizeof(sc16is752_diagnostics));
    sc16is752_diagnostics.configured_i2c_addr = 0x4DU;
    sc16is752_diagnostics.detected_i2c_addr = 0x4DU;
    sc16is752_diagnostics.address_found = 1U;
    sc16is752_diagnostics.detected_lsr = 0x60U;
    sc16is752_diagnostics.init_status = 0;
    sc16is752_diagnostics.scratchpad_status[0] = 0;
    sc16is752_diagnostics.scratchpad_status[1] = -2;
    sc16is752_diagnostics.internal_loopback_status[0] = 0;
    sc16is752_diagnostics.internal_loopback_status[1] = -3;
    sc16is752_diagnostics.uart_init_status[0] = 0;
    sc16is752_diagnostics.uart_init_status[1] = -4;
    sc16is752_diagnostics.internal_loopback_rx_bytes[0] = 4U;
    sc16is752_diagnostics.internal_loopback_rx_bytes[1] = 2U;
    memset(&field_rs485_diagnostics, 0, sizeof(field_rs485_diagnostics));
    field_rs485_diagnostics.scan_started = 1U;
    field_rs485_diagnostics.scan_completed = 1U;
    field_rs485_diagnostics.restore_ok = 1U;
    field_rs485_diagnostics.match_mask = FIELD_RS485_DIAG_SOIL_MATCH;
    field_rs485_diagnostics.attempts = 27U;
    field_rs485_diagnostics.successful_probes = 1U;
    field_rs485_diagnostics.duration_ms = 8123U;
    field_rs485_diagnostics.soil.found = 1U;
    field_rs485_diagnostics.soil.channel = 0U;
    field_rs485_diagnostics.soil.function_code = 3U;
    field_rs485_diagnostics.soil.slave_addr = 1U;
    field_rs485_diagnostics.soil.start_reg = 0U;
    field_rs485_diagnostics.soil.reg_count = 2U;
    field_rs485_diagnostics.soil.baudrate = 4800U;
    field_rs485_diagnostics.soil.xtal_hz = 1843200U;
    FillModbusChannel(&modbus_diagnostics.channels[0], 100U);
    FillModbusChannel(&modbus_diagnostics.channels[1], 200U);
    assert(GnssProbeStatsResponseV4_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        &sc16is752_diagnostics, &field_rs485_diagnostics, &modbus_diagnostics,
        2U, GNSS_RTCM_INJECTION_PROBE, nonce, 1234U,
        payload, sizeof(payload)
    ) == GNSS_PROBE_STATS_RESPONSE_V4_BYTES);
    assert(payload[3] == 4U && payload[204] == 1U && payload[220] == 1U);
    assert(payload[205] == 0x4DU && payload[206] == 0x4DU && payload[207] == 1U);
    assert((int8_t)payload[210] == -2 && (int8_t)payload[212] == -3);
    assert((int8_t)payload[214] == -4 && payload[215] == 4U && payload[216] == 2U);
    assert(payload[217] == 0x60U && payload[218] == 0U && payload[219] == 0U);
    assert(payload[221] == 0x07U && payload[222] == FIELD_RS485_DIAG_SOIL_MATCH);
    assert(payload[223] == 0U && ReadUint16Be(payload + 224) == 27U);
    assert(ReadUint16Be(payload + 226) == 1U && ReadUint32Be(payload + 228) == 8123U);
    assert(payload[232] == 1U && payload[233] == 0U && payload[234] == 3U && payload[235] == 1U);
    assert(ReadUint16Be(payload + 236) == 0U && ReadUint16Be(payload + 238) == 2U);
    assert(ReadUint32Be(payload + 240) == 4800U && ReadUint32Be(payload + 244) == 1843200U);
    assert(payload[248] == 0U && ReadUint32Be(payload + 264) == 100U);
    assert(ReadUint32Be(payload + 264U + 12U * 4U) == 112U);
    assert(ReadUint32Be(payload + 316) == 200U);
    assert(ReadUint32Be(payload + 316U + 12U * 4U) == 212U);
    assert((int8_t)payload[368] == RS485_MODBUS_ERR_TIMEOUT);
    assert((int8_t)payload[369] == RS485_MODBUS_OK);
    assert(ReadUint16Be(payload + 370) == 113U && ReadUint16Be(payload + 372) == 213U);
    assert(payload[374] == 1U && payload[375] == 2U);
    assert(payload[376] == 3U && payload[377] == 4U);
    assert(payload[378] == 0U && payload[379] == 2U);
    assert(payload[380] == 0U && payload[383] == 0U);
    memset(&rs485_runtime_diagnostics, 0, sizeof(rs485_runtime_diagnostics));
    rs485_runtime_diagnostics.completed_cycles = 100U;
    rs485_runtime_diagnostics.last_completed_uptime_s = 1234U;
    rs485_runtime_diagnostics.last_duration_ms = 1680U;
    rs485_runtime_diagnostics.max_duration_ms = 3440U;
    rs485_runtime_diagnostics.enabled_mask =
        FIELD_RS485_PATH_SOIL_MASK | FIELD_RS485_PATH_SOIL_EC_MASK | FIELD_RS485_PATH_TILT_MASK;
    rs485_runtime_diagnostics.current_valid_mask =
        FIELD_RS485_PATH_SOIL_MASK | FIELD_RS485_PATH_TILT_MASK;
    for (index = 0U; index < 3U; ++index) {
        FieldRs485PathRuntimeDiagnostics *path = &rs485_runtime_diagnostics.paths[index];
        path->cycles = 100U;
        path->attempts = index == 1U ? 95U : 100U + (index == 0U ? 1U : 0U);
        path->first_attempt_failures = index == 1U ? 5U : (index == 0U ? 2U : 1U);
        path->retry_recoveries = index == 0U ? 1U : (index == 1U ? 2U : 0U);
        path->final_failures = index == 0U ? 1U : (index == 1U ? 3U : 1U);
        path->skipped_cycles = index == 1U ? 5U : 0U;
        path->consecutive_final_failures = index == 1U ? 1U : 0U;
        path->last_event_uptime_s = 80U + index;
        path->last_first_status = index == 2U ? RS485_MODBUS_OK : (int8_t)RS485_MODBUS_ERR_TIMEOUT;
        path->last_final_status = index == 1U ? (int8_t)RS485_MODBUS_ERR_TIMEOUT : RS485_MODBUS_OK;
        path->last_attempts = index == 2U ? 1U : 2U;
        path->last_event_flags = index == 0U ?
            (FIELD_RS485_EVENT_FIRST_FAILURE | FIELD_RS485_EVENT_RETRY_RECOVERED) :
            (index == 1U ?
                (FIELD_RS485_EVENT_FIRST_FAILURE | FIELD_RS485_EVENT_FINAL_FAILURE) :
                FIELD_RS485_EVENT_RECOVERED_AFTER_FINAL);
    }
    assert(GnssProbeStatsResponseV5_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        &sc16is752_diagnostics, &field_rs485_diagnostics, &modbus_diagnostics,
        &rs485_runtime_diagnostics,
        2U, GNSS_RTCM_INJECTION_PROBE, nonce, 1300U,
        payload, sizeof(payload)
    ) == GNSS_PROBE_STATS_RESPONSE_V5_BYTES);
    assert(payload[3] == 5U && payload[384] == 1U);
    assert(payload[385] == FIELD_RS485_PATH_COUNT);
    assert(payload[386] == rs485_runtime_diagnostics.enabled_mask);
    assert(payload[387] == rs485_runtime_diagnostics.current_valid_mask);
    assert(ReadUint32Be(payload + 388) == 100U);
    assert(ReadUint32Be(payload + 392) == 1234U);
    assert(ReadUint32Be(payload + 396) == 1680U);
    assert(ReadUint32Be(payload + 400) == 3440U);
    for (index = 0U; index < FIELD_RS485_PATH_COUNT; ++index) {
        unsigned int offset = 404U + index * 36U;
        if (index < 3U) {
            assert(ReadUint32Be(payload + offset) == 100U);
            assert(ReadUint32Be(payload + offset + 28U) == 80U + index);
        } else {
            assert(ReadUint32Be(payload + offset) == 0U);
        }
    }
    assert(payload[548] == 0U && payload[551] == 0U);
    memset(&gps_uart_diagnostics, 0, sizeof(gps_uart_diagnostics));
    gps_uart_diagnostics.schema_version = 1U;
    gps_uart_diagnostics.state = GPS_UART_PROBE_STATE_LOCKED_PRIMARY;
    gps_uart_diagnostics.active_candidate = 0U;
    gps_uart_diagnostics.selected_candidate = 0U;
    gps_uart_diagnostics.active_baudrate = 115200U;
    gps_uart_diagnostics.switch_count = 2U;
    gps_uart_diagnostics.reconfigure_failures = 3U;
    gps_uart_diagnostics.read_errors = 4U;
    gps_uart_diagnostics.fifo_dropped_bytes = 5U;
    gps_uart_diagnostics.fifo_drop_events = 6U;
    for (index = 0U; index < GPS_UART_PROBE_CANDIDATE_COUNT; ++index) {
        GpsUartCandidateDiagnostics *candidate = &gps_uart_diagnostics.candidates[index];
        candidate->baudrate = index == 0U ? 115200U : 9600U;
        candidate->rx_bytes = 1000U + index;
        candidate->printable_bytes = 900U + index;
        candidate->dollar_bytes = 80U + index;
        candidate->completed_lines = 70U + index;
        candidate->checksum_valid_sentences = 60U + index;
        candidate->checksum_invalid_sentences = 5U + index;
        candidate->gga_sentences = 30U + index;
        candidate->rmc_sentences = 20U + index;
        candidate->first_valid_uptime_ms = 8000U + index;
    }
    assert(GnssProbeStatsResponseV6_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        &sc16is752_diagnostics, &field_rs485_diagnostics, &modbus_diagnostics,
        &rs485_runtime_diagnostics, &gps_uart_diagnostics,
        2U, GNSS_RTCM_INJECTION_PROBE, nonce, 1300U,
        payload, sizeof(payload)
    ) == GNSS_PROBE_STATS_RESPONSE_V6_BYTES);
    assert(payload[3] == 6U && payload[552] == 1U);
    assert(payload[553] == GPS_UART_PROBE_STATE_LOCKED_PRIMARY);
    assert(payload[554] == 0U && payload[555] == 0U);
    assert(ReadUint32Be(payload + 556) == 115200U);
    assert(ReadUint32Be(payload + 560) == 2U);
    assert(ReadUint32Be(payload + 576) == 6U);
    assert(ReadUint32Be(payload + 580) == 115200U);
    assert(ReadUint32Be(payload + 584) == 1000U);
    assert(ReadUint32Be(payload + 616) == 8000U);
    assert(ReadUint32Be(payload + 620) == 9600U);
    assert(ReadUint32Be(payload + 656) == 8001U);
    wire_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_CONTROL,
        77U,
        (const char *)payload,
        GNSS_PROBE_STATS_RESPONSE_V6_BYTES,
        wire,
        sizeof(wire));
    assert(wire_len > GNSS_PROBE_STATS_RESPONSE_V6_BYTES);
    assert(wire_len <= 680);
    FieldLinkFrameDecoder_Init(&wire_decoder);
    memset(&decoded_message, 0, sizeof(decoded_message));
    for (index = 0U; index < (unsigned int)wire_len; ++index) {
        int current_ret = FieldLinkFrameDecoder_FeedByte(
            &wire_decoder, wire[index], &decoded_message);
        assert(current_ret >= 0);
        if (current_ret == 1) {
            decode_ret++;
        }
    }
    assert(decode_ret == 1);
    assert(decoded_message.type == FIELD_LINK_FRAME_TYPE_CONTROL);
    assert(decoded_message.sequence == 77U);
    assert(decoded_message.payload_len == GNSS_PROBE_STATS_RESPONSE_V6_BYTES);
    assert(memcmp(decoded_message.payload, payload, sizeof(payload)) == 0);

    memset(&latency_diagnostics, 0, sizeof(latency_diagnostics));
    latency_diagnostics.schema_version = GNSS_RTCM_LATENCY_SCHEMA_VERSION;
    latency_diagnostics.bucket_count = GNSS_RTCM_LATENCY_BUCKET_COUNT;
    latency_diagnostics.session_epoch = 0x10203040U;
    {
        const uint32_t bounds[GNSS_RTCM_LATENCY_BUCKET_COUNT] = {
            0U, 1U, 2U, 5U, 10U, 20U, 50U,
            100U, 250U, 500U, 1000U, 2000U, 3000U, UINT32_MAX
        };
        memcpy(latency_diagnostics.bucket_upper_bounds_ms, bounds, sizeof(bounds));
    }
    latency_diagnostics.completion_to_dequeue_ms.sample_count = 4U;
    latency_diagnostics.completion_to_dequeue_ms.max_ms = 90U;
    latency_diagnostics.completion_to_dequeue_ms.bucket_counts[7] = 4U;
    latency_diagnostics.uart_write_ms.sample_count = 3U;
    latency_diagnostics.uart_write_ms.max_ms = 8U;
    latency_diagnostics.uart_write_ms.bucket_counts[4] = 3U;
    latency_diagnostics.completion_to_uart_finished_ms.sample_count = 3U;
    latency_diagnostics.completion_to_uart_finished_ms.max_ms = 105U;
    latency_diagnostics.completion_to_uart_finished_ms.bucket_counts[8] = 3U;
    assert(GnssProbeStatsResponseV7_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        &sc16is752_diagnostics, &field_rs485_diagnostics, &modbus_diagnostics,
        &rs485_runtime_diagnostics, &gps_uart_diagnostics, &latency_diagnostics,
        2U, GNSS_RTCM_INJECTION_LIVE, nonce, 1300U,
        v7_payload, sizeof(v7_payload)
    ) == GNSS_PROBE_STATS_RESPONSE_V7_BYTES);
    assert(v7_payload[3] == 7U && v7_payload[660] == GNSS_RTCM_LATENCY_SCHEMA_VERSION);
    assert(v7_payload[661] == GNSS_RTCM_LATENCY_HISTOGRAM_COUNT);
    assert(v7_payload[662] == GNSS_RTCM_LATENCY_BUCKET_COUNT && v7_payload[663] == 0U);
    assert(ReadUint32Be(v7_payload + 664) == 0x10203040U);
    assert(ReadUint32Be(v7_payload + 668) == 0U);
    assert(ReadUint32Be(v7_payload + 720) == UINT32_MAX);
    assert(ReadUint32Be(v7_payload + 724) == 4U);
    assert(ReadUint32Be(v7_payload + 728) == 90U);
    assert(ReadUint32Be(v7_payload + 760) == 4U);
    assert(ReadUint32Be(v7_payload + 788) == 3U);
    assert(ReadUint32Be(v7_payload + 852) == 3U);
    assert(ReadUint32Be(v7_payload + 856) == 105U);
    wire_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_CONTROL,
        78U,
        (const char *)v7_payload,
        GNSS_PROBE_STATS_RESPONSE_V7_BYTES,
        wire,
        sizeof(wire));
    assert(wire_len > GNSS_PROBE_STATS_RESPONSE_V7_BYTES);
    assert(wire_len <= 940);
    FieldLinkFrameDecoder_Init(&wire_decoder);
    memset(&decoded_message, 0, sizeof(decoded_message));
    decode_ret = 0;
    for (index = 0U; index < (unsigned int)wire_len; ++index) {
        int current_ret = FieldLinkFrameDecoder_FeedByte(
            &wire_decoder, wire[index], &decoded_message);
        assert(current_ret >= 0);
        if (current_ret == 1) decode_ret++;
    }
    assert(decode_ret == 1);
    assert(decoded_message.payload_len == GNSS_PROBE_STATS_RESPONSE_V7_BYTES);
    assert(memcmp(decoded_message.payload, v7_payload, sizeof(v7_payload)) == 0);
    latency_diagnostics.bucket_count--;
    assert(GnssProbeStatsResponseV7_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        &sc16is752_diagnostics, &field_rs485_diagnostics, &modbus_diagnostics,
        &rs485_runtime_diagnostics, &gps_uart_diagnostics, &latency_diagnostics,
        2U, GNSS_RTCM_INJECTION_LIVE, nonce, 1300U,
        v7_payload, sizeof(v7_payload)
    ) == -1);
    latency_diagnostics.bucket_count++;
    latency_diagnostics.bucket_upper_bounds_ms[5]++;
    assert(GnssProbeStatsResponseV7_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        &sc16is752_diagnostics, &field_rs485_diagnostics, &modbus_diagnostics,
        &rs485_runtime_diagnostics, &gps_uart_diagnostics, &latency_diagnostics,
        2U, GNSS_RTCM_INJECTION_LIVE, nonce, 1300U,
        v7_payload, sizeof(v7_payload)
    ) == -1);
    latency_diagnostics.bucket_upper_bounds_ms[5]--;
    latency_diagnostics.uart_write_ms.sample_count++;
    assert(GnssProbeStatsResponseV7_Encode(
        &stats, &link_stats, &sensor_diagnostics,
        &sc16is752_diagnostics, &field_rs485_diagnostics, &modbus_diagnostics,
        &rs485_runtime_diagnostics, &gps_uart_diagnostics, &latency_diagnostics,
        2U, GNSS_RTCM_INJECTION_LIVE, nonce, 1300U,
        v7_payload, sizeof(v7_payload)
    ) == -1);
    latency_diagnostics.uart_write_ms.sample_count--;
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
    printf("gnss_probe_stats_protocol_host_test passed v7_payload_bytes=%u wire_bytes=%d\n",
           (unsigned int)sizeof(v7_payload), wire_len);
    return 0;
}
