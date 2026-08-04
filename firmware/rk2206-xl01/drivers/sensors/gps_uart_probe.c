#include "gps_uart_probe.h"

#include <string.h>

static void IncrementSaturated(uint32_t *value, uint32_t amount)
{
    if (value == NULL || amount == 0U) {
        return;
    }
    if (*value > 0xFFFFFFFFU - amount) {
        *value = 0xFFFFFFFFU;
    } else {
        *value += amount;
    }
}

static int HexValue(unsigned char value)
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

static void ResetLine(GpsUartProbe *probe)
{
    probe->collecting = 0U;
    probe->saw_star = 0U;
    probe->checksum = 0U;
    probe->expected_checksum = 0U;
    probe->checksum_digits = 0U;
    probe->header_length = 0U;
    memset(probe->header, 0, sizeof(probe->header));
}

static void StartLine(GpsUartProbe *probe, GpsUartCandidateDiagnostics *candidate)
{
    ResetLine(probe);
    probe->collecting = 1U;
    IncrementSaturated(&candidate->dollar_bytes, 1U);
}

static int HeaderIs(const GpsUartProbe *probe, const char *suffix)
{
    return probe->header_length == sizeof(probe->header) &&
           probe->header[2] == suffix[0] &&
           probe->header[3] == suffix[1] &&
           probe->header[4] == suffix[2];
}

static void CompleteLine(
    GpsUartProbe *probe,
    GpsUartCandidateDiagnostics *candidate,
    uint32_t now_ms)
{
    int checksum_valid;

    if (probe->collecting == 0U) {
        return;
    }
    IncrementSaturated(&candidate->completed_lines, 1U);
    checksum_valid = probe->saw_star != 0U &&
                     probe->checksum_digits == 2U &&
                     probe->checksum == probe->expected_checksum;
    if (checksum_valid) {
        IncrementSaturated(&candidate->checksum_valid_sentences, 1U);
        if (candidate->first_valid_uptime_ms == 0U) {
            candidate->first_valid_uptime_ms = now_ms == 0U ? 1U : now_ms;
        }
        if (HeaderIs(probe, "GGA")) {
            IncrementSaturated(&candidate->gga_sentences, 1U);
        } else if (HeaderIs(probe, "RMC")) {
            IncrementSaturated(&candidate->rmc_sentences, 1U);
        }
    } else {
        IncrementSaturated(&candidate->checksum_invalid_sentences, 1U);
    }
    ResetLine(probe);
}

void GpsUartProbe_Init(
    GpsUartProbe *probe,
    uint32_t primary_baudrate,
    uint32_t fallback_baudrate,
    uint32_t now_ms)
{
    if (probe == NULL) {
        return;
    }
    memset(probe, 0, sizeof(*probe));
    probe->diagnostics.schema_version = 1U;
    probe->diagnostics.state = GPS_UART_PROBE_STATE_PRIMARY;
    probe->diagnostics.active_candidate = 0U;
    probe->diagnostics.selected_candidate = GPS_UART_PROBE_NO_SELECTION;
    probe->diagnostics.active_baudrate = primary_baudrate;
    probe->diagnostics.candidates[0].baudrate = primary_baudrate;
    probe->diagnostics.candidates[1].baudrate = fallback_baudrate;
    probe->candidate_started_ms = now_ms;
    ResetLine(probe);
}

void GpsUartProbe_Consume(
    GpsUartProbe *probe,
    const unsigned char *data,
    unsigned int data_bytes,
    uint32_t now_ms)
{
    GpsUartCandidateDiagnostics *candidate;
    unsigned int index;

    if (probe == NULL || data == NULL ||
        probe->diagnostics.active_candidate >= GPS_UART_PROBE_CANDIDATE_COUNT) {
        return;
    }
    candidate = &probe->diagnostics.candidates[probe->diagnostics.active_candidate];
    IncrementSaturated(&candidate->rx_bytes, data_bytes);
    for (index = 0U; index < data_bytes; ++index) {
        unsigned char value = data[index];
        int digit;

        if (value >= 0x20U && value <= 0x7EU) {
            IncrementSaturated(&candidate->printable_bytes, 1U);
        }
        if (value == '$') {
            StartLine(probe, candidate);
            continue;
        }
        if (value == '\r' || value == '\n') {
            CompleteLine(probe, candidate, now_ms);
            continue;
        }
        if (probe->collecting == 0U) {
            continue;
        }
        if (probe->saw_star == 0U) {
            if (value == '*') {
                probe->saw_star = 1U;
                continue;
            }
            probe->checksum ^= value;
            if (probe->header_length < sizeof(probe->header)) {
                probe->header[probe->header_length++] = (char)value;
            }
            continue;
        }
        if (probe->checksum_digits >= 2U) {
            continue;
        }
        digit = HexValue(value);
        if (digit < 0) {
            probe->checksum_digits = 3U;
            continue;
        }
        probe->expected_checksum = (uint8_t)((probe->expected_checksum << 4) | (uint8_t)digit);
        probe->checksum_digits++;
    }
}

GpsUartProbeAction GpsUartProbe_Evaluate(
    const GpsUartProbe *probe,
    uint32_t now_ms,
    uint32_t probe_window_ms)
{
    const GpsUartCandidateDiagnostics *candidate;

    if (probe == NULL || probe_window_ms == 0U ||
        probe->diagnostics.active_candidate >= GPS_UART_PROBE_CANDIDATE_COUNT) {
        return GPS_UART_PROBE_ACTION_NONE;
    }
    if (probe->diagnostics.state != GPS_UART_PROBE_STATE_PRIMARY &&
        probe->diagnostics.state != GPS_UART_PROBE_STATE_FALLBACK &&
        probe->diagnostics.state != GPS_UART_PROBE_STATE_FAILED_DEFAULT_PRIMARY) {
        return GPS_UART_PROBE_ACTION_NONE;
    }
    candidate = &probe->diagnostics.candidates[probe->diagnostics.active_candidate];
    if (candidate->checksum_valid_sentences > 0U) {
        return GPS_UART_PROBE_ACTION_LOCK;
    }
    if (probe->diagnostics.state == GPS_UART_PROBE_STATE_FAILED_DEFAULT_PRIMARY) {
        return GPS_UART_PROBE_ACTION_NONE;
    }
    if ((uint32_t)(now_ms - probe->candidate_started_ms) < probe_window_ms) {
        return GPS_UART_PROBE_ACTION_NONE;
    }
    return probe->diagnostics.state == GPS_UART_PROBE_STATE_PRIMARY
               ? GPS_UART_PROBE_ACTION_SWITCH_FALLBACK
               : GPS_UART_PROBE_ACTION_RESTORE_PRIMARY_FAILED;
}

void GpsUartProbe_ApplyAction(
    GpsUartProbe *probe,
    GpsUartProbeAction action,
    uint32_t now_ms,
    int reconfigure_succeeded)
{
    if (probe == NULL || action == GPS_UART_PROBE_ACTION_NONE) {
        return;
    }
    if (action == GPS_UART_PROBE_ACTION_LOCK) {
        if (probe->diagnostics.active_candidate == 0U) {
            probe->diagnostics.state = GPS_UART_PROBE_STATE_LOCKED_PRIMARY;
            probe->diagnostics.selected_candidate = 0U;
        } else if (probe->diagnostics.active_candidate == 1U) {
            probe->diagnostics.state = GPS_UART_PROBE_STATE_LOCKED_FALLBACK;
            probe->diagnostics.selected_candidate = 1U;
        }
        return;
    }
    if (!reconfigure_succeeded) {
        IncrementSaturated(&probe->diagnostics.reconfigure_failures, 1U);
        probe->diagnostics.state = GPS_UART_PROBE_STATE_RECONFIGURE_ERROR;
        probe->diagnostics.selected_candidate = GPS_UART_PROBE_NO_SELECTION;
        return;
    }
    IncrementSaturated(&probe->diagnostics.switch_count, 1U);
    probe->candidate_started_ms = now_ms;
    probe->diagnostics.selected_candidate = GPS_UART_PROBE_NO_SELECTION;
    if (action == GPS_UART_PROBE_ACTION_SWITCH_FALLBACK) {
        probe->diagnostics.state = GPS_UART_PROBE_STATE_FALLBACK;
        probe->diagnostics.active_candidate = 1U;
    } else {
        probe->diagnostics.state = GPS_UART_PROBE_STATE_FAILED_DEFAULT_PRIMARY;
        probe->diagnostics.active_candidate = 0U;
    }
    probe->diagnostics.active_baudrate =
        probe->diagnostics.candidates[probe->diagnostics.active_candidate].baudrate;
    ResetLine(probe);
}

void GpsUartProbe_RecordReadError(GpsUartProbe *probe)
{
    if (probe != NULL) {
        IncrementSaturated(&probe->diagnostics.read_errors, 1U);
    }
}

void GpsUartProbe_GetDiagnostics(
    const GpsUartProbe *probe,
    uint32_t fifo_dropped_bytes,
    uint32_t fifo_drop_events,
    GpsUartDiagnostics *diagnostics)
{
    if (probe == NULL || diagnostics == NULL) {
        return;
    }
    memcpy(diagnostics, &probe->diagnostics, sizeof(*diagnostics));
    diagnostics->fifo_dropped_bytes = fifo_dropped_bytes;
    diagnostics->fifo_drop_events = fifo_drop_events;
}

int GpsUartProbe_IsRtcmWriteReady(
    const GpsUartProbe *probe,
    uint32_t required_baudrate)
{
    uint8_t selected;

    if (probe == NULL) {
        return 0;
    }
    selected = probe->diagnostics.selected_candidate;
    return selected < GPS_UART_PROBE_CANDIDATE_COUNT &&
           probe->diagnostics.active_candidate == selected &&
           probe->diagnostics.active_baudrate == required_baudrate &&
           probe->diagnostics.candidates[selected].checksum_valid_sentences > 0U;
}
