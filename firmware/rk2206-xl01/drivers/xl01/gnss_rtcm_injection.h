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

#define GNSS_RTCM_MODE_COMMAND_BYTES 19
#define GNSS_RTCM_AGE_UNAVAILABLE UINT32_MAX
#define GNSS_RTCM_BATCH_HEADER_BYTES 8U
#define GNSS_RTCM_BATCH_MAX_FRAGMENTS 4U

enum {
    GNSS_RTCM_STATE_READY = 1U << 0,
    GNSS_RTCM_STATE_SESSION_ARMED = 1U << 1,
    GNSS_RTCM_STATE_LEASE_VALID = 1U << 2,
    GNSS_RTCM_STATE_FRAGMENT_RECENT = 1U << 3,
    GNSS_RTCM_STATE_FRAME_RECENT = 1U << 4,
    GNSS_RTCM_STATE_ACTION_RECENT = 1U << 5
};

typedef struct {
    uint8_t target_mask;
    uint8_t mode;
    uint32_t session_epoch;
    uint16_t lease_seconds;
} GnssRtcmModeCommand;

typedef struct {
    uint8_t mode;
    uint8_t state_flags;
    uint8_t queue_pending;
    uint8_t queue_high_watermark;
    uint32_t session_epoch;
    uint32_t lease_remaining_ms;
    uint32_t last_fragment_age_ms;
    uint32_t last_completed_frame_age_ms;
    uint32_t last_action_age_ms;
} GnssRtcmRuntimeStatus;

int GnssRtcmInjection_Init(uint8_t local_node);

int GnssRtcmModeCommand_Decode(
    const char *payload,
    int payload_bytes,
    GnssRtcmModeCommand *command
);

int GnssRtcmInjection_ConfigureRuntime(
    const GnssRtcmModeCommand *command,
    uint64_t monotonic_ms
);

void GnssRtcmInjection_GetRuntimeStatus(
    uint64_t monotonic_ms,
    GnssRtcmRuntimeStatus *status
);

GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptFragment(
    const uint8_t *payload,
    uint16_t payload_bytes,
    uint64_t monotonic_ms
);

GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptPayload(
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

void GnssRtcmInjection_RecordProbe(uint16_t frame_bytes, uint64_t monotonic_ms);
void GnssRtcmInjection_RecordInjected(uint16_t frame_bytes, uint64_t monotonic_ms);
void GnssRtcmInjection_RecordWriteError(uint8_t partial_write);
void GnssRtcmInjection_RecordInjectionDrop(void);
void GnssRtcmInjection_GetStats(GnssRtcmInjectionStats *stats);
void GnssRtcmInjection_GetAckWindow(GnssRtcmAckWindow *window);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_XL01_GNSS_RTCM_INJECTION_H
