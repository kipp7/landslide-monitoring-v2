#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "../drivers/sensors/gps_uart_probe.h"

static void AppendChecksum(const char *body, char *output, unsigned int output_bytes)
{
    unsigned char checksum = 0U;
    const char *cursor;

    for (cursor = body; *cursor != '\0'; ++cursor) {
        checksum ^= (unsigned char)*cursor;
    }
    snprintf(output, output_bytes, "$%s*%02X\r\n", body, checksum);
}

int main(void)
{
    GpsUartProbe probe;
    GpsUartDiagnostics diagnostics;
    char sentence[160];
    const unsigned char garbage[] = {0xFFU, 0x81U, 'x', '$', 'x', '\r', '\n'};

    GpsUartProbe_Init(&probe, 115200U, 9600U, 100U);
    assert(GpsUartProbe_Evaluate(&probe, 8099U, 8000U) == GPS_UART_PROBE_ACTION_NONE);
    assert(GpsUartProbe_Evaluate(&probe, 8100U, 8000U) == GPS_UART_PROBE_ACTION_SWITCH_FALLBACK);
    GpsUartProbe_Consume(&probe, garbage, sizeof(garbage), 8100U);
    GpsUartProbe_ApplyAction(
        &probe, GPS_UART_PROBE_ACTION_SWITCH_FALLBACK, 8100U, 1);
    assert(probe.diagnostics.active_baudrate == 9600U);
    assert(probe.diagnostics.switch_count == 1U);

    AppendChecksum(
        "GNGGA,010203.00,2233.000000,N,11344.000000,E,0,18,0.8,10.0,M,0.0,M,,",
        sentence,
        sizeof(sentence));
    GpsUartProbe_Consume(
        &probe, (const unsigned char *)sentence, (unsigned int)strlen(sentence), 9000U);
    assert(GpsUartProbe_Evaluate(&probe, 9000U, 8000U) == GPS_UART_PROBE_ACTION_LOCK);
    GpsUartProbe_ApplyAction(&probe, GPS_UART_PROBE_ACTION_LOCK, 9000U, 1);
    assert(probe.diagnostics.state == GPS_UART_PROBE_STATE_LOCKED_FALLBACK);
    assert(probe.diagnostics.selected_candidate == 1U);
    assert(probe.diagnostics.candidates[1].checksum_valid_sentences == 1U);
    assert(probe.diagnostics.candidates[1].gga_sentences == 1U);
    assert(!GpsUartProbe_IsRtcmWriteReady(&probe, 115200U));
    assert(GpsUartProbe_IsRtcmWriteReady(&probe, 9600U));

    GpsUartProbe_GetDiagnostics(&probe, 7U, 2U, &diagnostics);
    assert(diagnostics.fifo_dropped_bytes == 7U);
    assert(diagnostics.fifo_drop_events == 2U);
    assert(diagnostics.candidates[0].rx_bytes == sizeof(garbage));

    GpsUartProbe_Init(&probe, 115200U, 9600U, 0U);
    AppendChecksum(
        "GNRMC,010203.00,A,2233.000000,N,11344.000000,E,0.0,0.0,040826,,,A",
        sentence,
        sizeof(sentence));
    GpsUartProbe_Consume(
        &probe, (const unsigned char *)sentence, (unsigned int)strlen(sentence), 1000U);
    assert(GpsUartProbe_Evaluate(&probe, 1000U, 8000U) == GPS_UART_PROBE_ACTION_LOCK);
    GpsUartProbe_ApplyAction(&probe, GPS_UART_PROBE_ACTION_LOCK, 1000U, 1);
    assert(probe.diagnostics.state == GPS_UART_PROBE_STATE_LOCKED_PRIMARY);
    assert(probe.diagnostics.candidates[0].rmc_sentences == 1U);
    assert(GpsUartProbe_IsRtcmWriteReady(&probe, 115200U));

    GpsUartProbe_Init(&probe, 115200U, 9600U, 0U);
    GpsUartProbe_ApplyAction(
        &probe, GPS_UART_PROBE_ACTION_SWITCH_FALLBACK, 8000U, 1);
    assert(GpsUartProbe_Evaluate(&probe, 16000U, 8000U) ==
           GPS_UART_PROBE_ACTION_RESTORE_PRIMARY_FAILED);
    GpsUartProbe_ApplyAction(
        &probe, GPS_UART_PROBE_ACTION_RESTORE_PRIMARY_FAILED, 16000U, 1);
    assert(probe.diagnostics.state == GPS_UART_PROBE_STATE_FAILED_DEFAULT_PRIMARY);
    assert(probe.diagnostics.active_baudrate == 115200U);
    assert(probe.diagnostics.selected_candidate == GPS_UART_PROBE_NO_SELECTION);

    printf("gps_uart_probe_host_test passed\n");
    return 0;
}
