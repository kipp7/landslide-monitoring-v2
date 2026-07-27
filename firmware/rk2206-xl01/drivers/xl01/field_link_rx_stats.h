#ifndef DRIVERS_XL01_FIELD_LINK_RX_STATS_H
#define DRIVERS_XL01_FIELD_LINK_RX_STATS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t decoded_frames;
    uint32_t decoded_rtcm_frames;
    uint32_t decode_errors;
    uint32_t sequence_gaps;
    uint32_t sequence_duplicates;
    uint32_t sequence_resets;
    uint32_t fifo_dropped_bytes;
    uint32_t fifo_drop_events;
    uint32_t last_sequence;
    uint8_t last_sequence_valid;
} FieldLinkRxStats;

void FieldLinkRxStats_Init(FieldLinkRxStats *stats);
void FieldLinkRxStats_RecordDecoded(
    FieldLinkRxStats *stats,
    uint32_t sequence,
    uint8_t is_rtcm
);
void FieldLinkRxStats_RecordDecodeError(FieldLinkRxStats *stats);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_XL01_FIELD_LINK_RX_STATS_H
