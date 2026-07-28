#ifndef DRIVERS_XL01_GNSS_RTCM_INJECTION_H
#define DRIVERS_XL01_GNSS_RTCM_INJECTION_H

#include <stdint.h>

#include "../../config/app_config.h"
#include "gnss_transport_v3.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t accepted_fragments;
    uint32_t duplicate_fragments;
    uint32_t rejected_fragments;
    uint32_t completed_frames;
    uint32_t crc_errors;
    uint32_t expired_assemblies;
    uint32_t capacity_evictions;
    uint32_t ttl_unverified_fragments;
    uint32_t queued_frames;
    uint32_t queue_evictions;
    uint32_t queue_expired_frames;
    uint32_t probe_validated_frames;
    uint32_t probe_validated_bytes;
    uint32_t injected_frames;
    uint32_t injected_bytes;
    uint32_t uart_write_errors;
    uint32_t uart_partial_writes;
    uint32_t injection_dropped_frames;
    uint32_t completed_type_1005;
    uint32_t completed_type_1033;
    uint32_t completed_type_1074;
    uint32_t completed_type_1094;
    uint32_t completed_type_1114;
    uint32_t completed_type_1124;
    uint16_t queue_high_watermark;
    uint16_t queue_pending;
} GnssRtcmInjectionStats;

typedef struct {
    uint8_t session_valid;
    uint32_t session_epoch;
    uint32_t highest_sequence;
    uint16_t completed_bitmap;
} GnssRtcmAckWindow;

int GnssRtcmInjection_Init(uint8_t local_node);

GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptFragment(
    const uint8_t *payload,
    uint16_t payload_bytes,
    uint64_t monotonic_ms
);

int GnssRtcmInjection_TryDequeue(
    uint64_t monotonic_ms,
    uint8_t *frame,
    uint16_t frame_capacity,
    uint16_t *frame_bytes,
    uint16_t *message_type
);

void GnssRtcmInjection_RecordProbe(uint16_t frame_bytes);
void GnssRtcmInjection_RecordInjected(uint16_t frame_bytes);
void GnssRtcmInjection_RecordWriteError(uint8_t partial_write);
void GnssRtcmInjection_RecordInjectionDrop(void);
void GnssRtcmInjection_GetStats(GnssRtcmInjectionStats *stats);
void GnssRtcmInjection_GetAckWindow(GnssRtcmAckWindow *window);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_XL01_GNSS_RTCM_INJECTION_H
