#include "field_link_rx_stats.h"

#include <string.h>

void FieldLinkRxStats_Init(FieldLinkRxStats *stats)
{
    if (stats != NULL) {
        memset(stats, 0, sizeof(*stats));
    }
}

void FieldLinkRxStats_RecordDecoded(
    FieldLinkRxStats *stats,
    uint32_t sequence,
    uint8_t is_rtcm
)
{
    uint32_t delta;

    if (stats == NULL) {
        return;
    }
    stats->decoded_frames++;
    if (is_rtcm != 0U) {
        stats->decoded_rtcm_frames++;
    }
    if (stats->last_sequence_valid == 0U) {
        stats->last_sequence = sequence;
        stats->last_sequence_valid = 1U;
        return;
    }

    delta = sequence - stats->last_sequence;
    if (delta == 0U) {
        stats->sequence_duplicates++;
    } else if (delta <= 0x7FFFFFFFU) {
        stats->sequence_gaps += delta - 1U;
    } else {
        stats->sequence_resets++;
    }
    stats->last_sequence = sequence;
}

void FieldLinkRxStats_RecordDecodeError(FieldLinkRxStats *stats)
{
    if (stats != NULL) {
        stats->decode_errors++;
    }
}
