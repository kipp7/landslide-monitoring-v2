#include "gnss_rtcm_injection.h"

#include <limits.h>
#include <string.h>

#if GNSS_RTCM_INJECTION_CAPABILITY != GNSS_RTCM_INJECTION_DISABLED

#ifndef GNSS_RTCM_INJECTION_HOST_TEST
#include "cmsis_os2.h"
#endif

typedef struct {
    uint8_t frame[GNSS_RTCM_V3_MAX_FRAME_BYTES];
    uint16_t frame_bytes;
    uint16_t message_type;
    uint32_t ttl_ms;
    uint64_t enqueued_ms;
} GnssRtcmQueueSlot;

static GnssRtcmReassemblerV3 g_reassembler;
static GnssRtcmQueueSlot g_queue[GNSS_RTCM_QUEUE_DEPTH];
static uint8_t g_queue_head;
static uint8_t g_queue_count;
static uint8_t g_completed_frame[GNSS_RTCM_V3_MAX_FRAME_BYTES];
static GnssRtcmInjectionStats g_stats;
static uint8_t g_ready;
static uint8_t g_local_node;
static uint8_t g_runtime_mode;
static uint32_t g_armed_session_epoch;
static uint64_t g_lease_expires_ms;
static uint64_t g_last_fragment_ms;
static uint64_t g_last_completed_frame_ms;
static uint64_t g_last_action_ms;
static uint8_t g_has_last_fragment;
static uint8_t g_has_last_completed_frame;
static uint8_t g_has_last_action;

#ifndef GNSS_RTCM_INJECTION_HOST_TEST
static osMutexId_t g_mutex;
#endif

static void Lock(void)
{
#ifndef GNSS_RTCM_INJECTION_HOST_TEST
    if (g_mutex != NULL) {
        osMutexAcquire(g_mutex, osWaitForever);
    }
#endif
}

static void Unlock(void)
{
#ifndef GNSS_RTCM_INJECTION_HOST_TEST
    if (g_mutex != NULL) {
        osMutexRelease(g_mutex);
    }
#endif
}

static int HexValue(char value)
{
    if (value >= '0' && value <= '9') return value - '0';
    if (value >= 'A' && value <= 'F') return value - 'A' + 10;
    if (value >= 'a' && value <= 'f') return value - 'a' + 10;
    return -1;
}

static int ParseHex(const char *input, int digits, uint32_t *value)
{
    uint32_t parsed = 0U;
    int index;
    if (input == NULL || value == NULL || digits <= 0 || digits > 8) return -1;
    for (index = 0; index < digits; ++index) {
        int nibble = HexValue(input[index]);
        if (nibble < 0) return -1;
        parsed = (parsed << 4) | (uint32_t)nibble;
    }
    *value = parsed;
    return 0;
}

int GnssRtcmModeCommand_Decode(
    const char *payload,
    int payload_bytes,
    GnssRtcmModeCommand *command)
{
    GnssRtcmModeCommand parsed;
    uint32_t target_mask;
    uint32_t session_epoch;
    uint32_t lease_seconds;

    if (payload == NULL || payload_bytes != GNSS_RTCM_MODE_COMMAND_BYTES ||
        memcmp(payload, "G3M1", 4U) != 0 ||
        ParseHex(payload + 4, 2, &target_mask) != 0 ||
        ParseHex(payload + 7, 8, &session_epoch) != 0 ||
        ParseHex(payload + 15, 4, &lease_seconds) != 0 ||
        payload[6] < '0' || payload[6] > '2') {
        return -1;
    }

    memset(&parsed, 0, sizeof(parsed));
    parsed.target_mask = (uint8_t)target_mask;
    parsed.mode = (uint8_t)(payload[6] - '0');
    parsed.session_epoch = session_epoch;
    parsed.lease_seconds = (uint16_t)lease_seconds;
    if (parsed.target_mask == 0U ||
        (parsed.target_mask & ~GNSS_V3_TARGET_ALL_NODES) != 0U ||
        parsed.mode > GNSS_RTCM_INJECTION_CAPABILITY) {
        return -1;
    }
    if (parsed.mode == GNSS_RTCM_INJECTION_DISABLED) {
        if (parsed.lease_seconds != 0U) return -1;
    } else if (parsed.session_epoch == 0U ||
               parsed.lease_seconds < GNSS_RTCM_MIN_LEASE_SECONDS ||
               parsed.lease_seconds > GNSS_RTCM_MAX_LEASE_SECONDS) {
        return -1;
    }
    if (command != NULL) *command = parsed;
    return 0;
}

static uint32_t QueueAgeLimit(uint32_t transport_ttl_ms)
{
    return transport_ttl_ms < GNSS_RTCM_MAX_QUEUE_AGE_MS
               ? transport_ttl_ms
               : GNSS_RTCM_MAX_QUEUE_AGE_MS;
}

static void EvictQueueHead(void)
{
    memset(&g_queue[g_queue_head], 0, sizeof(g_queue[g_queue_head]));
    g_queue_head = (uint8_t)((g_queue_head + 1U) % GNSS_RTCM_QUEUE_DEPTH);
    g_queue_count--;
}

static void AccumulateReassemblerStats(void)
{
    g_stats.accepted_fragments += g_reassembler.accepted_fragments;
    g_stats.duplicate_fragments += g_reassembler.duplicate_fragments;
    g_stats.rejected_fragments += g_reassembler.rejected_fragments;
    g_stats.completed_frames += g_reassembler.completed_frames;
    g_stats.crc_errors += g_reassembler.crc_errors;
    g_stats.expired_assemblies += g_reassembler.expired_assemblies;
    g_stats.capacity_evictions += g_reassembler.capacity_evictions;
    g_stats.ttl_unverified_fragments += g_reassembler.ttl_unverified_fragments;
}

static void ResetSessionState(void)
{
    AccumulateReassemblerStats();
    memset(g_queue, 0, sizeof(g_queue));
    memset(g_completed_frame, 0, sizeof(g_completed_frame));
    g_queue_head = 0U;
    g_queue_count = 0U;
    GnssRtcmReassemblerV3_Init(&g_reassembler, g_local_node);
}

static void DisableRuntime(void)
{
    ResetSessionState();
    g_runtime_mode = GNSS_RTCM_INJECTION_DISABLED;
    g_armed_session_epoch = 0U;
    g_lease_expires_ms = 0U;
}

static void EnforceLease(uint64_t monotonic_ms)
{
    if (g_runtime_mode != GNSS_RTCM_INJECTION_DISABLED &&
        monotonic_ms >= g_lease_expires_ms) {
        DisableRuntime();
    }
}

static uint32_t AgeMs(uint64_t monotonic_ms, uint64_t then_ms, uint8_t valid)
{
    uint64_t age;
    if (valid == 0U || monotonic_ms < then_ms) return GNSS_RTCM_AGE_UNAVAILABLE;
    age = monotonic_ms - then_ms;
    return age > UINT32_MAX ? UINT32_MAX : (uint32_t)age;
}

static void EnqueueCompleted(
    const uint8_t *frame,
    uint16_t frame_bytes,
    uint16_t message_type,
    uint32_t ttl_ms,
    uint64_t monotonic_ms)
{
    uint8_t tail;

    switch (message_type) {
        case 1005U: g_stats.completed_type_1005++; break;
        case 1033U: g_stats.completed_type_1033++; break;
        case 1074U: g_stats.completed_type_1074++; break;
        case 1094U: g_stats.completed_type_1094++; break;
        case 1114U: g_stats.completed_type_1114++; break;
        case 1124U: g_stats.completed_type_1124++; break;
        default: break;
    }

    if (g_queue_count >= GNSS_RTCM_QUEUE_DEPTH) {
        EvictQueueHead();
        g_stats.queue_evictions++;
    }

    tail = (uint8_t)((g_queue_head + g_queue_count) % GNSS_RTCM_QUEUE_DEPTH);
    memcpy(g_queue[tail].frame, frame, frame_bytes);
    g_queue[tail].frame_bytes = frame_bytes;
    g_queue[tail].message_type = message_type;
    g_queue[tail].ttl_ms = ttl_ms;
    g_queue[tail].enqueued_ms = monotonic_ms;
    g_queue_count++;
    g_stats.queued_frames++;
    if (g_queue_count > g_stats.queue_high_watermark) {
        g_stats.queue_high_watermark = g_queue_count;
    }
    g_last_completed_frame_ms = monotonic_ms;
    g_has_last_completed_frame = 1U;
}

int GnssRtcmInjection_Init(uint8_t local_node)
{
    if (local_node < 1U || local_node > 3U) {
        g_ready = 0U;
        return -1;
    }
#ifndef GNSS_RTCM_INJECTION_HOST_TEST
    if (g_mutex == NULL) g_mutex = osMutexNew(NULL);
    if (g_mutex == NULL) {
        g_ready = 0U;
        return -1;
    }
#endif
    Lock();
    memset(g_queue, 0, sizeof(g_queue));
    memset(g_completed_frame, 0, sizeof(g_completed_frame));
    memset(&g_stats, 0, sizeof(g_stats));
    memset(&g_reassembler, 0, sizeof(g_reassembler));
    g_queue_head = 0U;
    g_queue_count = 0U;
    g_local_node = local_node;
    g_runtime_mode = GNSS_RTCM_BOOT_MODE;
    g_armed_session_epoch = 0U;
    g_lease_expires_ms = 0U;
    g_has_last_fragment = 0U;
    g_has_last_completed_frame = 0U;
    g_has_last_action = 0U;
    g_ready = 1U;
    GnssRtcmReassemblerV3_Init(&g_reassembler, local_node);
    Unlock();
    return 0;
}

int GnssRtcmInjection_ConfigureRuntime(
    const GnssRtcmModeCommand *command,
    uint64_t monotonic_ms)
{
    uint8_t local_mask;
    if (g_ready == 0U || command == NULL || command->target_mask == 0U ||
        (command->target_mask & ~GNSS_V3_TARGET_ALL_NODES) != 0U ||
        command->mode > GNSS_RTCM_INJECTION_CAPABILITY) return -1;
    local_mask = (uint8_t)(1U << (g_local_node - 1U));
    if ((command->target_mask & local_mask) == 0U) return 1;
    if (command->mode == GNSS_RTCM_INJECTION_DISABLED) {
        if (command->lease_seconds != 0U) return -1;
    } else if (command->session_epoch == 0U ||
               command->lease_seconds < GNSS_RTCM_MIN_LEASE_SECONDS ||
               command->lease_seconds > GNSS_RTCM_MAX_LEASE_SECONDS ||
               monotonic_ms > UINT64_MAX - (uint64_t)command->lease_seconds * 1000U) {
        return -1;
    }

    Lock();
    if (command->mode == GNSS_RTCM_INJECTION_DISABLED) {
        DisableRuntime();
    } else {
        if (g_runtime_mode != command->mode ||
            g_armed_session_epoch != command->session_epoch) {
            ResetSessionState();
        }
        g_runtime_mode = command->mode;
        g_armed_session_epoch = command->session_epoch;
        g_lease_expires_ms = monotonic_ms + (uint64_t)command->lease_seconds * 1000U;
    }
    Unlock();
    return 0;
}

GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptFragment(
    const uint8_t *payload,
    uint16_t payload_bytes,
    uint64_t monotonic_ms)
{
    GnssRtcmFragmentViewV3 fragment;
    GnssRtcmReassemblyStatusV3 status;
    uint16_t completed_bytes = 0U;
    uint16_t message_type = 0U;

    if (g_ready == 0U) return GNSS_RTCM_REASSEMBLY_REJECTED;
    if (GnssTransportV3_DecodeRtcmFragment(payload, payload_bytes, &fragment) != 0) {
        Lock();
        g_stats.rejected_fragments++;
        Unlock();
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }

    Lock();
    EnforceLease(monotonic_ms);
    if (g_runtime_mode == GNSS_RTCM_INJECTION_DISABLED ||
        fragment.transport.session_epoch != g_armed_session_epoch) {
        g_stats.rejected_fragments++;
        Unlock();
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    status = GnssRtcmReassemblerV3_Push(
        &g_reassembler, payload, payload_bytes, monotonic_ms, 0U,
        g_completed_frame, sizeof(g_completed_frame), &completed_bytes, &message_type
    );
    if (status != GNSS_RTCM_REASSEMBLY_REJECTED) {
        g_last_fragment_ms = monotonic_ms;
        g_has_last_fragment = 1U;
    }
    if (status == GNSS_RTCM_REASSEMBLY_COMPLETE) {
        EnqueueCompleted(g_completed_frame, completed_bytes, message_type,
                         fragment.transport.ttl_ms, monotonic_ms);
    }
    Unlock();
    return status;
}

GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptPayload(
    const uint8_t *payload,
    uint16_t payload_bytes,
    uint64_t monotonic_ms)
{
    uint16_t offsets[GNSS_RTCM_BATCH_MAX_FRAGMENTS];
    uint16_t lengths[GNSS_RTCM_BATCH_MAX_FRAGMENTS];
    GnssRtcmFragmentViewV3 fragment;
    GnssRtcmReassemblyStatusV3 aggregate = GNSS_RTCM_REASSEMBLY_DUPLICATE;
    uint16_t offset;
    uint8_t count;
    uint8_t index;

    if (payload == NULL || payload_bytes > FIELD_LINK_MAX_PAYLOAD_BYTES) {
        Lock();
        g_stats.rejected_fragments++;
        Unlock();
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    if (payload_bytes < 3U || payload[0] != 0x47U || payload[1] != 0x33U || payload[2] != 0x42U) {
        return GnssRtcmInjection_AcceptFragment(payload, payload_bytes, monotonic_ms);
    }

    if (payload_bytes < GNSS_RTCM_BATCH_HEADER_BYTES || payload[3] != 1U ||
        payload[5] != 0U || payload[6] != 0U || payload[7] != 0U) {
        Lock();
        g_stats.rejected_fragments++;
        Unlock();
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    count = payload[4];
    if (count < 2U || count > GNSS_RTCM_BATCH_MAX_FRAGMENTS) {
        Lock();
        g_stats.rejected_fragments++;
        Unlock();
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }

    offset = GNSS_RTCM_BATCH_HEADER_BYTES;
    for (index = 0U; index < count; ++index) {
        uint32_t end;
        if ((uint32_t)offset + 2U > payload_bytes) break;
        lengths[index] = (uint16_t)(((uint16_t)payload[offset] << 8) | payload[offset + 1U]);
        offset = (uint16_t)(offset + 2U);
        offsets[index] = offset;
        end = (uint32_t)offset + lengths[index];
        if (lengths[index] == 0U || end > payload_bytes ||
            GnssTransportV3_DecodeRtcmFragment(payload + offset, lengths[index], &fragment) != 0) {
            break;
        }
        offset = (uint16_t)end;
    }
    if (index != count || offset != payload_bytes) {
        Lock();
        g_stats.rejected_fragments++;
        Unlock();
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }

    for (index = 0U; index < count; ++index) {
        GnssRtcmReassemblyStatusV3 status = GnssRtcmInjection_AcceptFragment(
            payload + offsets[index], lengths[index], monotonic_ms
        );
        if (status == GNSS_RTCM_REASSEMBLY_REJECTED) return status;
        if (status == GNSS_RTCM_REASSEMBLY_COMPLETE) {
            aggregate = status;
        } else if (status == GNSS_RTCM_REASSEMBLY_ACCEPTED &&
                   aggregate != GNSS_RTCM_REASSEMBLY_COMPLETE) {
            aggregate = status;
        }
    }
    return aggregate;
}

int GnssRtcmInjection_TryDequeue(
    uint64_t monotonic_ms,
    uint8_t *frame,
    uint16_t frame_capacity,
    uint16_t *frame_bytes,
    uint16_t *message_type)
{
    GnssRtcmQueueSlot *slot;
    if (g_ready == 0U || frame == NULL || frame_bytes == NULL) return -1;
    *frame_bytes = 0U;

    Lock();
    EnforceLease(monotonic_ms);
    if (g_runtime_mode == GNSS_RTCM_INJECTION_DISABLED) {
        Unlock();
        return 0;
    }
    while (g_queue_count > 0U) {
        uint32_t age_limit;
        slot = &g_queue[g_queue_head];
        age_limit = QueueAgeLimit(slot->ttl_ms);
        if (monotonic_ms < slot->enqueued_ms || monotonic_ms - slot->enqueued_ms > age_limit) {
            EvictQueueHead();
            g_stats.queue_expired_frames++;
            continue;
        }
        if (slot->frame_bytes > frame_capacity) {
            Unlock();
            return -1;
        }
        memcpy(frame, slot->frame, slot->frame_bytes);
        *frame_bytes = slot->frame_bytes;
        if (message_type != NULL) *message_type = slot->message_type;
        EvictQueueHead();
        Unlock();
        return 1;
    }
    Unlock();
    return 0;
}

void GnssRtcmInjection_RecordProbe(uint16_t frame_bytes, uint64_t monotonic_ms)
{
    if (g_ready == 0U) return;
    Lock();
    g_stats.probe_validated_frames++;
    g_stats.probe_validated_bytes += frame_bytes;
    g_last_action_ms = monotonic_ms;
    g_has_last_action = 1U;
    Unlock();
}

void GnssRtcmInjection_RecordInjected(uint16_t frame_bytes, uint64_t monotonic_ms)
{
    if (g_ready == 0U) return;
    Lock();
    g_stats.injected_frames++;
    g_stats.injected_bytes += frame_bytes;
    g_last_action_ms = monotonic_ms;
    g_has_last_action = 1U;
    Unlock();
}

void GnssRtcmInjection_RecordWriteError(uint8_t partial_write)
{
    if (g_ready == 0U) return;
    Lock();
    g_stats.uart_write_errors++;
    if (partial_write != 0U) g_stats.uart_partial_writes++;
    Unlock();
}

void GnssRtcmInjection_RecordInjectionDrop(void)
{
    if (g_ready == 0U) return;
    Lock();
    g_stats.injection_dropped_frames++;
    Unlock();
}

void GnssRtcmInjection_GetStats(GnssRtcmInjectionStats *stats)
{
    if (stats == NULL) return;
    if (g_ready == 0U) {
        memset(stats, 0, sizeof(*stats));
        return;
    }
    Lock();
    *stats = g_stats;
    stats->accepted_fragments += g_reassembler.accepted_fragments;
    stats->duplicate_fragments += g_reassembler.duplicate_fragments;
    stats->rejected_fragments += g_reassembler.rejected_fragments;
    stats->completed_frames += g_reassembler.completed_frames;
    stats->crc_errors += g_reassembler.crc_errors;
    stats->expired_assemblies += g_reassembler.expired_assemblies;
    stats->capacity_evictions += g_reassembler.capacity_evictions;
    stats->ttl_unverified_fragments += g_reassembler.ttl_unverified_fragments;
    stats->queue_pending = g_queue_count;
    Unlock();
}

void GnssRtcmInjection_GetRuntimeStatus(
    uint64_t monotonic_ms,
    GnssRtcmRuntimeStatus *status)
{
    uint32_t fragment_age;
    uint32_t frame_age;
    uint32_t action_age;
    if (status == NULL) return;
    memset(status, 0, sizeof(*status));
    status->last_fragment_age_ms = GNSS_RTCM_AGE_UNAVAILABLE;
    status->last_completed_frame_age_ms = GNSS_RTCM_AGE_UNAVAILABLE;
    status->last_action_age_ms = GNSS_RTCM_AGE_UNAVAILABLE;
    if (g_ready == 0U) return;

    Lock();
    EnforceLease(monotonic_ms);
    status->mode = g_runtime_mode;
    status->state_flags = GNSS_RTCM_STATE_READY;
    status->queue_pending = g_queue_count;
    status->queue_high_watermark = (uint8_t)(g_stats.queue_high_watermark > 255U
        ? 255U : g_stats.queue_high_watermark);
    status->session_epoch = g_armed_session_epoch;
    if (g_runtime_mode != GNSS_RTCM_INJECTION_DISABLED) {
        status->state_flags |= GNSS_RTCM_STATE_SESSION_ARMED | GNSS_RTCM_STATE_LEASE_VALID;
        status->lease_remaining_ms = g_lease_expires_ms > monotonic_ms
            ? (uint32_t)(g_lease_expires_ms - monotonic_ms)
            : 0U;
    }
    fragment_age = AgeMs(monotonic_ms, g_last_fragment_ms, g_has_last_fragment);
    frame_age = AgeMs(monotonic_ms, g_last_completed_frame_ms, g_has_last_completed_frame);
    action_age = AgeMs(monotonic_ms, g_last_action_ms, g_has_last_action);
    status->last_fragment_age_ms = fragment_age;
    status->last_completed_frame_age_ms = frame_age;
    status->last_action_age_ms = action_age;
    if (fragment_age <= GNSS_RTCM_MAX_QUEUE_AGE_MS) status->state_flags |= GNSS_RTCM_STATE_FRAGMENT_RECENT;
    if (frame_age <= GNSS_RTCM_MAX_QUEUE_AGE_MS) status->state_flags |= GNSS_RTCM_STATE_FRAME_RECENT;
    if (action_age <= GNSS_RTCM_MAX_QUEUE_AGE_MS) status->state_flags |= GNSS_RTCM_STATE_ACTION_RECENT;
    Unlock();
}

void GnssRtcmInjection_GetAckWindow(GnssRtcmAckWindow *window)
{
    uint8_t index;
    if (window == NULL) return;
    memset(window, 0, sizeof(*window));
    if (g_ready == 0U) return;

    Lock();
    if (g_runtime_mode != GNSS_RTCM_INJECTION_DISABLED &&
        g_reassembler.has_active_session != 0U &&
        g_reassembler.has_highest_sequence != 0U) {
        window->session_valid = 1U;
        window->session_epoch = g_reassembler.active_session_epoch;
        window->highest_sequence = g_reassembler.highest_sequence;
        for (index = 0U; index < g_reassembler.completed_sequence_count; ++index) {
            uint32_t delta = window->highest_sequence - g_reassembler.completed_sequences[index];
            if (delta < GNSS_RTCM_V3_RECENT_COMPLETED) {
                window->completed_bitmap |= (uint16_t)(1U << delta);
            }
        }
    }
    Unlock();
}

#else

int GnssRtcmModeCommand_Decode(const char *payload, int payload_bytes, GnssRtcmModeCommand *command)
{
    (void)payload; (void)payload_bytes; (void)command; return -1;
}
int GnssRtcmInjection_Init(uint8_t local_node) { (void)local_node; return 0; }
int GnssRtcmInjection_ConfigureRuntime(const GnssRtcmModeCommand *command, uint64_t monotonic_ms)
{ (void)command; (void)monotonic_ms; return -1; }
void GnssRtcmInjection_GetRuntimeStatus(uint64_t monotonic_ms, GnssRtcmRuntimeStatus *status)
{
    (void)monotonic_ms;
    if (status != NULL) {
        memset(status, 0, sizeof(*status));
        status->state_flags = GNSS_RTCM_STATE_READY;
        status->last_fragment_age_ms = GNSS_RTCM_AGE_UNAVAILABLE;
        status->last_completed_frame_age_ms = GNSS_RTCM_AGE_UNAVAILABLE;
        status->last_action_age_ms = GNSS_RTCM_AGE_UNAVAILABLE;
    }
}
GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptFragment(
    const uint8_t *payload, uint16_t payload_bytes, uint64_t monotonic_ms)
{ (void)payload; (void)payload_bytes; (void)monotonic_ms; return GNSS_RTCM_REASSEMBLY_REJECTED; }
GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptPayload(
    const uint8_t *payload, uint16_t payload_bytes, uint64_t monotonic_ms)
{ (void)payload; (void)payload_bytes; (void)monotonic_ms; return GNSS_RTCM_REASSEMBLY_REJECTED; }
int GnssRtcmInjection_TryDequeue(
    uint64_t monotonic_ms, uint8_t *frame, uint16_t frame_capacity,
    uint16_t *frame_bytes, uint16_t *message_type)
{
    (void)monotonic_ms; (void)frame; (void)frame_capacity; (void)message_type;
    if (frame_bytes != NULL) *frame_bytes = 0U;
    return 0;
}
void GnssRtcmInjection_RecordProbe(uint16_t frame_bytes, uint64_t monotonic_ms)
{ (void)frame_bytes; (void)monotonic_ms; }
void GnssRtcmInjection_RecordInjected(uint16_t frame_bytes, uint64_t monotonic_ms)
{ (void)frame_bytes; (void)monotonic_ms; }
void GnssRtcmInjection_RecordWriteError(uint8_t partial_write) { (void)partial_write; }
void GnssRtcmInjection_RecordInjectionDrop(void) {}
void GnssRtcmInjection_GetStats(GnssRtcmInjectionStats *stats)
{ if (stats != NULL) memset(stats, 0, sizeof(*stats)); }
void GnssRtcmInjection_GetAckWindow(GnssRtcmAckWindow *window)
{ if (window != NULL) memset(window, 0, sizeof(*window)); }

#endif
