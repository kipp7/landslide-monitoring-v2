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

static int DecodeQuery(
    const char *payload,
    int payload_bytes,
    char query_kind,
    uint8_t *target_node,
    uint32_t *nonce
)
{
    uint32_t parsed_nonce = 0U;
    uint8_t parsed_target;
    int index;

    if (payload == NULL || payload_bytes != GNSS_PROBE_STATS_QUERY_V1_BYTES ||
        payload[0] != 'G' || payload[1] != '3' || payload[2] != query_kind) {
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

int GnssProbeStatsQueryV1_Decode(
    const char *payload,
    int payload_bytes,
    uint8_t *target_node,
    uint32_t *nonce
)
{
    return DecodeQuery(payload, payload_bytes, 'Q', target_node, nonce);
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
)
{
    unsigned int index;

    if (output == NULL || output_size < GNSS_PROBE_STATS_RESPONSE_V3_BYTES) {
        return -1;
    }
    if (GnssProbeStatsResponseV2_Encode(
            stats,
            link_stats,
            node_number,
            injection_mode,
            nonce,
            snapshot_uptime_s,
            output,
            output_size
        ) != GNSS_PROBE_STATS_RESPONSE_V2_BYTES) {
        return -1;
    }

    memset(
        output + GNSS_PROBE_STATS_RESPONSE_V2_BYTES,
        0,
        GNSS_PROBE_STATS_RESPONSE_V3_BYTES - GNSS_PROBE_STATS_RESPONSE_V2_BYTES
    );
    output[3] = 3U;
    if (sensor_diagnostics != NULL) {
        output[148] = sensor_diagnostics->enabled_mask & GNSS_SENSOR_ALL_MASK;
        output[149] = sensor_diagnostics->initialization_success_mask & GNSS_SENSOR_ALL_MASK;
        output[150] = sensor_diagnostics->current_valid_mask & GNSS_SENSOR_ALL_MASK;
        output[151] = sensor_diagnostics->ever_success_mask & GNSS_SENSOR_ALL_MASK;
    }
    output[152] = GNSS_SENSOR_DIAGNOSTIC_COUNT;
    for (index = 0U; index < GNSS_SENSOR_DIAGNOSTIC_COUNT; ++index) {
        WriteUint32Be(
            output + 156U + index * 4U,
            sensor_diagnostics != NULL ? sensor_diagnostics->sample_counts[index] : 0U
        );
        WriteUint32Be(
            output + 172U + index * 4U,
            sensor_diagnostics != NULL ? sensor_diagnostics->last_success_uptime_s[index] : 0U
        );
        WriteUint32Be(
            output + 188U + index * 4U,
            sensor_diagnostics != NULL ? sensor_diagnostics->consecutive_failures[index] : 0U
        );
    }
    return GNSS_PROBE_STATS_RESPONSE_V3_BYTES;
}

static void EncodeFieldProbeMatch(uint8_t *output, const FieldRs485ProbeMatch *match)
{
    if (output == NULL || match == NULL) {
        return;
    }
    output[0] = match->found;
    output[1] = match->channel;
    output[2] = match->function_code;
    output[3] = match->slave_addr;
    WriteUint16Be(output + 4, match->start_reg);
    WriteUint16Be(output + 6, match->reg_count);
    WriteUint32Be(output + 8, match->baudrate);
    WriteUint32Be(output + 12, match->xtal_hz);
}

static void EncodeModbusChannelCounters(
    uint8_t *output,
    const Rs485ModbusChannelDiagnostics *diagnostics)
{
    const uint32_t counters[] = {
        diagnostics != NULL ? diagnostics->requests : 0U,
        diagnostics != NULL ? diagnostics->successes : 0U,
        diagnostics != NULL ? diagnostics->write_errors : 0U,
        diagnostics != NULL ? diagnostics->tx_done_errors : 0U,
        diagnostics != NULL ? diagnostics->read_errors : 0U,
        diagnostics != NULL ? diagnostics->no_responses : 0U,
        diagnostics != NULL ? diagnostics->short_responses : 0U,
        diagnostics != NULL ? diagnostics->address_errors : 0U,
        diagnostics != NULL ? diagnostics->crc_errors : 0U,
        diagnostics != NULL ? diagnostics->exception_responses : 0U,
        diagnostics != NULL ? diagnostics->function_errors : 0U,
        diagnostics != NULL ? diagnostics->byte_count_errors : 0U,
        diagnostics != NULL ? diagnostics->rx_bytes : 0U,
    };
    unsigned int index;

    for (index = 0U; index < sizeof(counters) / sizeof(counters[0]); ++index) {
        WriteUint32Be(output + index * 4U, counters[index]);
    }
}

int GnssProbeStatsResponseV4_Encode(
    const GnssRtcmInjectionStats *stats,
    const FieldLinkRxStats *link_stats,
    const GnssSensorDiagnostics *sensor_diagnostics,
    const Sc16is752Diagnostics *sc16is752_diagnostics,
    const FieldRs485Diagnostics *field_rs485_diagnostics,
    const Rs485ModbusDiagnostics *modbus_diagnostics,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size
)
{
    unsigned int channel;

    if (output == NULL || output_size < GNSS_PROBE_STATS_RESPONSE_V4_BYTES) {
        return -1;
    }
    if (GnssProbeStatsResponseV3_Encode(
            stats,
            link_stats,
            sensor_diagnostics,
            node_number,
            injection_mode,
            nonce,
            snapshot_uptime_s,
            output,
            output_size
        ) != GNSS_PROBE_STATS_RESPONSE_V3_BYTES) {
        return -1;
    }

    memset(
        output + GNSS_PROBE_STATS_RESPONSE_V3_BYTES,
        0,
        GNSS_PROBE_STATS_RESPONSE_V4_BYTES - GNSS_PROBE_STATS_RESPONSE_V3_BYTES
    );
    output[3] = 4U;

    output[204] = 1U;
    if (sc16is752_diagnostics != NULL) {
        output[205] = sc16is752_diagnostics->configured_i2c_addr;
        output[206] = sc16is752_diagnostics->detected_i2c_addr;
        output[207] = sc16is752_diagnostics->address_found;
        output[208] = (uint8_t)sc16is752_diagnostics->init_status;
        output[209] = (uint8_t)sc16is752_diagnostics->scratchpad_status[0];
        output[210] = (uint8_t)sc16is752_diagnostics->scratchpad_status[1];
        output[211] = (uint8_t)sc16is752_diagnostics->internal_loopback_status[0];
        output[212] = (uint8_t)sc16is752_diagnostics->internal_loopback_status[1];
        output[213] = (uint8_t)sc16is752_diagnostics->uart_init_status[0];
        output[214] = (uint8_t)sc16is752_diagnostics->uart_init_status[1];
        output[215] = sc16is752_diagnostics->internal_loopback_rx_bytes[0];
        output[216] = sc16is752_diagnostics->internal_loopback_rx_bytes[1];
        output[217] = sc16is752_diagnostics->detected_lsr;
    }

    output[220] = 1U;
    if (field_rs485_diagnostics != NULL) {
        output[221] =
            (field_rs485_diagnostics->scan_started ? 1U : 0U) |
            (field_rs485_diagnostics->scan_completed ? 2U : 0U) |
            (field_rs485_diagnostics->restore_ok ? 4U : 0U);
        output[222] = field_rs485_diagnostics->match_mask;
        WriteUint16Be(output + 224, field_rs485_diagnostics->attempts);
        WriteUint16Be(output + 226, field_rs485_diagnostics->successful_probes);
        WriteUint32Be(output + 228, field_rs485_diagnostics->duration_ms);
        EncodeFieldProbeMatch(output + 232, &field_rs485_diagnostics->soil);
        EncodeFieldProbeMatch(output + 248, &field_rs485_diagnostics->tilt);
    }

    for (channel = 0U; channel < RS485_MODBUS_DIAGNOSTIC_CHANNELS; ++channel) {
        const Rs485ModbusChannelDiagnostics *channel_diagnostics =
            modbus_diagnostics != NULL ? &modbus_diagnostics->channels[channel] : NULL;
        EncodeModbusChannelCounters(output + 264U + channel * 52U, channel_diagnostics);
        if (channel_diagnostics != NULL) {
            output[368U + channel] = (uint8_t)channel_diagnostics->last_status;
            WriteUint16Be(output + 370U + channel * 2U, channel_diagnostics->last_rx_bytes);
            output[374U + channel] = channel_diagnostics->last_response_addr;
            output[376U + channel] = channel_diagnostics->last_response_function;
            output[378U + channel] = channel_diagnostics->last_exception_code;
        }
    }
    return GNSS_PROBE_STATS_RESPONSE_V4_BYTES;
}

static void EncodeFieldRs485PathRuntimeDiagnostics(
    uint8_t *output,
    const FieldRs485PathRuntimeDiagnostics *diagnostics)
{
    const uint32_t counters[] = {
        diagnostics != NULL ? diagnostics->cycles : 0U,
        diagnostics != NULL ? diagnostics->attempts : 0U,
        diagnostics != NULL ? diagnostics->first_attempt_failures : 0U,
        diagnostics != NULL ? diagnostics->retry_recoveries : 0U,
        diagnostics != NULL ? diagnostics->final_failures : 0U,
        diagnostics != NULL ? diagnostics->skipped_cycles : 0U,
        diagnostics != NULL ? diagnostics->consecutive_final_failures : 0U,
        diagnostics != NULL ? diagnostics->last_event_uptime_s : 0U,
    };
    unsigned int index;

    for (index = 0U; index < sizeof(counters) / sizeof(counters[0]); ++index) {
        WriteUint32Be(output + index * 4U, counters[index]);
    }
    if (diagnostics != NULL) {
        output[32] = (uint8_t)diagnostics->last_first_status;
        output[33] = (uint8_t)diagnostics->last_final_status;
        output[34] = diagnostics->last_attempts;
        output[35] = diagnostics->last_event_flags;
    }
}

int GnssProbeStatsResponseV5_Encode(
    const GnssRtcmInjectionStats *stats,
    const FieldLinkRxStats *link_stats,
    const GnssSensorDiagnostics *sensor_diagnostics,
    const Sc16is752Diagnostics *sc16is752_diagnostics,
    const FieldRs485Diagnostics *field_rs485_diagnostics,
    const Rs485ModbusDiagnostics *modbus_diagnostics,
    const FieldRs485RuntimeDiagnostics *rs485_runtime_diagnostics,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size
)
{
    unsigned int path_index;

    if (output == NULL || output_size < GNSS_PROBE_STATS_RESPONSE_V5_BYTES) {
        return -1;
    }
    if (GnssProbeStatsResponseV4_Encode(
            stats,
            link_stats,
            sensor_diagnostics,
            sc16is752_diagnostics,
            field_rs485_diagnostics,
            modbus_diagnostics,
            node_number,
            injection_mode,
            nonce,
            snapshot_uptime_s,
            output,
            output_size
        ) != GNSS_PROBE_STATS_RESPONSE_V4_BYTES) {
        return -1;
    }

    memset(
        output + GNSS_PROBE_STATS_RESPONSE_V4_BYTES,
        0,
        GNSS_PROBE_STATS_RESPONSE_V5_BYTES - GNSS_PROBE_STATS_RESPONSE_V4_BYTES
    );
    output[3] = 5U;
    output[384] = 1U;
    output[385] = FIELD_RS485_PATH_COUNT;
    if (rs485_runtime_diagnostics != NULL) {
        output[386] = rs485_runtime_diagnostics->enabled_mask & FIELD_RS485_PATH_ALL_MASK;
        output[387] = rs485_runtime_diagnostics->current_valid_mask & FIELD_RS485_PATH_ALL_MASK;
        WriteUint32Be(output + 388, rs485_runtime_diagnostics->completed_cycles);
        WriteUint32Be(output + 392, rs485_runtime_diagnostics->last_completed_uptime_s);
        WriteUint32Be(output + 396, rs485_runtime_diagnostics->last_duration_ms);
        WriteUint32Be(output + 400, rs485_runtime_diagnostics->max_duration_ms);
    }
    for (path_index = 0U; path_index < FIELD_RS485_PATH_COUNT; ++path_index) {
        const FieldRs485PathRuntimeDiagnostics *path_diagnostics =
            rs485_runtime_diagnostics != NULL ?
                &rs485_runtime_diagnostics->paths[path_index] : NULL;
        EncodeFieldRs485PathRuntimeDiagnostics(
            output + 404U + path_index * 36U,
            path_diagnostics);
    }
    return GNSS_PROBE_STATS_RESPONSE_V5_BYTES;
}

static void EncodeGpsUartCandidate(
    uint8_t *output,
    const GpsUartCandidateDiagnostics *candidate)
{
    const uint32_t values[] = {
        candidate != NULL ? candidate->baudrate : 0U,
        candidate != NULL ? candidate->rx_bytes : 0U,
        candidate != NULL ? candidate->printable_bytes : 0U,
        candidate != NULL ? candidate->dollar_bytes : 0U,
        candidate != NULL ? candidate->completed_lines : 0U,
        candidate != NULL ? candidate->checksum_valid_sentences : 0U,
        candidate != NULL ? candidate->checksum_invalid_sentences : 0U,
        candidate != NULL ? candidate->gga_sentences : 0U,
        candidate != NULL ? candidate->rmc_sentences : 0U,
        candidate != NULL ? candidate->first_valid_uptime_ms : 0U,
    };
    unsigned int index;

    for (index = 0U; index < sizeof(values) / sizeof(values[0]); ++index) {
        WriteUint32Be(output + index * 4U, values[index]);
    }
}

int GnssProbeStatsResponseV6_Encode(
    const GnssRtcmInjectionStats *stats,
    const FieldLinkRxStats *link_stats,
    const GnssSensorDiagnostics *sensor_diagnostics,
    const Sc16is752Diagnostics *sc16is752_diagnostics,
    const FieldRs485Diagnostics *field_rs485_diagnostics,
    const Rs485ModbusDiagnostics *modbus_diagnostics,
    const FieldRs485RuntimeDiagnostics *rs485_runtime_diagnostics,
    const GpsUartDiagnostics *gps_uart_diagnostics,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size)
{
    unsigned int candidate_index;

    if (output == NULL || output_size < GNSS_PROBE_STATS_RESPONSE_V6_BYTES) {
        return -1;
    }
    if (GnssProbeStatsResponseV5_Encode(
            stats,
            link_stats,
            sensor_diagnostics,
            sc16is752_diagnostics,
            field_rs485_diagnostics,
            modbus_diagnostics,
            rs485_runtime_diagnostics,
            node_number,
            injection_mode,
            nonce,
            snapshot_uptime_s,
            output,
            output_size
        ) != GNSS_PROBE_STATS_RESPONSE_V5_BYTES) {
        return -1;
    }

    memset(
        output + GNSS_PROBE_STATS_RESPONSE_V5_BYTES,
        0,
        GNSS_PROBE_STATS_RESPONSE_V6_BYTES - GNSS_PROBE_STATS_RESPONSE_V5_BYTES);
    output[3] = 6U;
    if (gps_uart_diagnostics != NULL) {
        output[552] = gps_uart_diagnostics->schema_version;
        output[553] = gps_uart_diagnostics->state;
        output[554] = gps_uart_diagnostics->active_candidate;
        output[555] = gps_uart_diagnostics->selected_candidate;
        WriteUint32Be(output + 556, gps_uart_diagnostics->active_baudrate);
        WriteUint32Be(output + 560, gps_uart_diagnostics->switch_count);
        WriteUint32Be(output + 564, gps_uart_diagnostics->reconfigure_failures);
        WriteUint32Be(output + 568, gps_uart_diagnostics->read_errors);
        WriteUint32Be(output + 572, gps_uart_diagnostics->fifo_dropped_bytes);
        WriteUint32Be(output + 576, gps_uart_diagnostics->fifo_drop_events);
    } else {
        output[555] = GPS_UART_PROBE_NO_SELECTION;
    }
    for (candidate_index = 0U;
         candidate_index < GPS_UART_PROBE_CANDIDATE_COUNT;
         ++candidate_index) {
        EncodeGpsUartCandidate(
            output + 580U + candidate_index * 40U,
            gps_uart_diagnostics != NULL
                ? &gps_uart_diagnostics->candidates[candidate_index]
                : NULL);
    }
    return GNSS_PROBE_STATS_RESPONSE_V6_BYTES;
}

static int ValidateLatencyHistogram(
    const GnssRtcmLatencyHistogram *histogram,
    const uint32_t *upper_bounds)
{
    uint64_t total = 0U;
    int highest_non_empty = -1;
    unsigned int index;

    if (histogram == NULL || upper_bounds == NULL) return -1;
    for (index = 0U; index < GNSS_RTCM_LATENCY_BUCKET_COUNT; ++index) {
        total += histogram->bucket_counts[index];
        if (histogram->bucket_counts[index] != 0U) highest_non_empty = (int)index;
    }
    if (total != histogram->sample_count) {
        return -1;
    }
    if (histogram->sample_count == 0U) {
        return histogram->max_ms == 0U && highest_non_empty < 0 ? 0 : -1;
    }
    if (highest_non_empty < 0 ||
        histogram->max_ms > upper_bounds[highest_non_empty] ||
        (highest_non_empty > 0 && histogram->max_ms <= upper_bounds[highest_non_empty - 1])) {
        return -1;
    }
    return 0;
}

static int ValidateLatencyDiagnostics(const GnssRtcmLatencyDiagnostics *diagnostics)
{
    static const uint32_t expected_upper_bounds[GNSS_RTCM_LATENCY_BUCKET_COUNT] = {
        0U, 1U, 2U, 5U, 10U, 20U, 50U,
        100U, 250U, 500U, 1000U, 2000U, 3000U, UINT32_MAX
    };
    unsigned int index;
    if (diagnostics == NULL ||
        diagnostics->schema_version != GNSS_RTCM_LATENCY_SCHEMA_VERSION ||
        diagnostics->bucket_count != GNSS_RTCM_LATENCY_BUCKET_COUNT) {
        return -1;
    }
    for (index = 0U; index < GNSS_RTCM_LATENCY_BUCKET_COUNT; ++index) {
        if (diagnostics->bucket_upper_bounds_ms[index] != expected_upper_bounds[index]) {
            return -1;
        }
    }
    if (ValidateLatencyHistogram(
            &diagnostics->completion_to_dequeue_ms,
            diagnostics->bucket_upper_bounds_ms) != 0 ||
        ValidateLatencyHistogram(
            &diagnostics->uart_write_ms,
            diagnostics->bucket_upper_bounds_ms) != 0 ||
        ValidateLatencyHistogram(
            &diagnostics->completion_to_uart_finished_ms,
            diagnostics->bucket_upper_bounds_ms) != 0) {
        return -1;
    }
    return 0;
}

static void EncodeLatencyHistogram(
    uint8_t *output,
    const GnssRtcmLatencyHistogram *histogram)
{
    unsigned int index;
    WriteUint32Be(output, histogram->sample_count);
    WriteUint32Be(output + 4, histogram->max_ms);
    for (index = 0U; index < GNSS_RTCM_LATENCY_BUCKET_COUNT; ++index) {
        WriteUint32Be(output + 8U + index * 4U, histogram->bucket_counts[index]);
    }
}

int GnssProbeStatsResponseV7_Encode(
    const GnssRtcmInjectionStats *stats,
    const FieldLinkRxStats *link_stats,
    const GnssSensorDiagnostics *sensor_diagnostics,
    const Sc16is752Diagnostics *sc16is752_diagnostics,
    const FieldRs485Diagnostics *field_rs485_diagnostics,
    const Rs485ModbusDiagnostics *modbus_diagnostics,
    const FieldRs485RuntimeDiagnostics *rs485_runtime_diagnostics,
    const GpsUartDiagnostics *gps_uart_diagnostics,
    const GnssRtcmLatencyDiagnostics *latency_diagnostics,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint32_t snapshot_uptime_s,
    uint8_t *output,
    int output_size)
{
    unsigned int index;
    if (output == NULL || output_size < GNSS_PROBE_STATS_RESPONSE_V7_BYTES ||
        ValidateLatencyDiagnostics(latency_diagnostics) != 0) {
        return -1;
    }
    if (GnssProbeStatsResponseV6_Encode(
            stats,
            link_stats,
            sensor_diagnostics,
            sc16is752_diagnostics,
            field_rs485_diagnostics,
            modbus_diagnostics,
            rs485_runtime_diagnostics,
            gps_uart_diagnostics,
            node_number,
            injection_mode,
            nonce,
            snapshot_uptime_s,
            output,
            output_size
        ) != GNSS_PROBE_STATS_RESPONSE_V6_BYTES) {
        return -1;
    }

    memset(
        output + GNSS_PROBE_STATS_RESPONSE_V6_BYTES,
        0,
        GNSS_PROBE_STATS_RESPONSE_V7_BYTES - GNSS_PROBE_STATS_RESPONSE_V6_BYTES);
    output[3] = 7U;
    output[660] = latency_diagnostics->schema_version;
    output[661] = GNSS_RTCM_LATENCY_HISTOGRAM_COUNT;
    output[662] = latency_diagnostics->bucket_count;
    WriteUint32Be(output + 664, latency_diagnostics->session_epoch);
    for (index = 0U; index < GNSS_RTCM_LATENCY_BUCKET_COUNT; ++index) {
        WriteUint32Be(
            output + 668U + index * 4U,
            latency_diagnostics->bucket_upper_bounds_ms[index]);
    }
    EncodeLatencyHistogram(output + 724, &latency_diagnostics->completion_to_dequeue_ms);
    EncodeLatencyHistogram(output + 788, &latency_diagnostics->uart_write_ms);
    EncodeLatencyHistogram(
        output + 852,
        &latency_diagnostics->completion_to_uart_finished_ms);
    return GNSS_PROBE_STATS_RESPONSE_V7_BYTES;
}

int GnssRtcmAckQueryV1_Decode(
    const char *payload,
    int payload_bytes,
    uint8_t *target_node,
    uint32_t *nonce
)
{
    return DecodeQuery(payload, payload_bytes, 'A', target_node, nonce);
}

int GnssRtcmAckResponseV1_Encode(
    const GnssRtcmAckWindow *window,
    uint8_t node_number,
    uint8_t injection_mode,
    uint32_t nonce,
    uint8_t *output,
    int output_size
)
{
    if (output == NULL || output_size < GNSS_RTCM_ACK_RESPONSE_V1_BYTES ||
        node_number < 1U || node_number > 3U || injection_mode > 2U || nonce == 0U) {
        return -1;
    }
    if (window != NULL && window->session_valid != 0U && window->session_epoch == 0U) {
        return -1;
    }

    memset(output, 0, GNSS_RTCM_ACK_RESPONSE_V1_BYTES);
    output[0] = 'G';
    output[1] = '3';
    output[2] = 'A';
    output[3] = 1U;
    output[4] = node_number;
    output[5] = injection_mode;
    output[6] = window != NULL && window->session_valid != 0U ? 1U : 0U;
    WriteUint32Be(output + 8, nonce);
    if (window != NULL && window->session_valid != 0U) {
        WriteUint32Be(output + 12, window->session_epoch);
        WriteUint32Be(output + 16, window->highest_sequence);
        WriteUint16Be(output + 20, window->completed_bitmap);
    }
    return GNSS_RTCM_ACK_RESPONSE_V1_BYTES;
}
