#include "gnss_rtcm_injection.h"

#include <string.h>

#if GNSS_RTCM_INJECTION_MODE != GNSS_RTCM_INJECTION_DISABLED

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

static void EnqueueCompleted(
    const uint8_t *frame,
    uint16_t frame_bytes,
    uint16_t message_type,
    uint32_t ttl_ms,
    uint64_t monotonic_ms
)
{
    uint8_t tail;

    switch (message_type) {
        case 1005U:
            g_stats.completed_type_1005++;
            break;
        case 1033U:
            g_stats.completed_type_1033++;
            break;
        case 1074U:
            g_stats.completed_type_1074++;
            break;
        case 1094U:
            g_stats.completed_type_1094++;
            break;
        case 1114U:
            g_stats.completed_type_1114++;
            break;
        case 1124U:
            g_stats.completed_type_1124++;
            break;
        default:
            break;
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
}

int GnssRtcmInjection_Init(uint8_t local_node)
{
    if (local_node < 1U || local_node > 3U) {
        g_ready = 0U;
        return -1;
    }
#ifndef GNSS_RTCM_INJECTION_HOST_TEST
    if (g_mutex == NULL) {
        g_mutex = osMutexNew(NULL);
    }
    if (g_mutex == NULL) {
        g_ready = 0U;
        return -1;
    }
#endif
    Lock();
    memset(g_queue, 0, sizeof(g_queue));
    memset(g_completed_frame, 0, sizeof(g_completed_frame));
    memset(&g_stats, 0, sizeof(g_stats));
    g_queue_head = 0U;
    g_queue_count = 0U;
    g_ready = 1U;
    GnssRtcmReassemblerV3_Init(&g_reassembler, local_node);
    Unlock();
    return 0;
}

GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptFragment(
    const uint8_t *payload,
    uint16_t payload_bytes,
    uint64_t monotonic_ms
)
{
    GnssRtcmFragmentViewV3 fragment;
    GnssRtcmReassemblyStatusV3 status;
    uint16_t completed_bytes = 0U;
    uint16_t message_type = 0U;

    if (g_ready == 0U) {
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    if (GnssTransportV3_DecodeRtcmFragment(payload, payload_bytes, &fragment) != 0) {
        Lock();
        g_reassembler.rejected_fragments++;
        Unlock();
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }

    Lock();
    status = GnssRtcmReassemblerV3_Push(
        &g_reassembler,
        payload,
        payload_bytes,
        monotonic_ms,
        0U,
        g_completed_frame,
        sizeof(g_completed_frame),
        &completed_bytes,
        &message_type
    );
    if (status == GNSS_RTCM_REASSEMBLY_COMPLETE) {
        EnqueueCompleted(
            g_completed_frame,
            completed_bytes,
            message_type,
            fragment.transport.ttl_ms,
            monotonic_ms
        );
    }
    Unlock();
    return status;
}

int GnssRtcmInjection_TryDequeue(
    uint64_t monotonic_ms,
    uint8_t *frame,
    uint16_t frame_capacity,
    uint16_t *frame_bytes,
    uint16_t *message_type
)
{
    GnssRtcmQueueSlot *slot;

    if (g_ready == 0U || frame == NULL || frame_bytes == NULL) {
        return -1;
    }
    *frame_bytes = 0U;

    Lock();
    while (g_queue_count > 0U) {
        uint32_t age_limit;
        slot = &g_queue[g_queue_head];
        age_limit = QueueAgeLimit(slot->ttl_ms);
        if (monotonic_ms < slot->enqueued_ms ||
            monotonic_ms - slot->enqueued_ms > age_limit) {
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
        if (message_type != NULL) {
            *message_type = slot->message_type;
        }
        EvictQueueHead();
        Unlock();
        return 1;
    }
    Unlock();
    return 0;
}

void GnssRtcmInjection_RecordProbe(uint16_t frame_bytes)
{
    if (g_ready == 0U) {
        return;
    }
    Lock();
    g_stats.probe_validated_frames++;
    g_stats.probe_validated_bytes += frame_bytes;
    Unlock();
}

void GnssRtcmInjection_RecordInjected(uint16_t frame_bytes)
{
    if (g_ready == 0U) {
        return;
    }
    Lock();
    g_stats.injected_frames++;
    g_stats.injected_bytes += frame_bytes;
    Unlock();
}

void GnssRtcmInjection_RecordWriteError(uint8_t partial_write)
{
    if (g_ready == 0U) {
        return;
    }
    Lock();
    g_stats.uart_write_errors++;
    if (partial_write != 0U) {
        g_stats.uart_partial_writes++;
    }
    Unlock();
}

void GnssRtcmInjection_RecordInjectionDrop(void)
{
    if (g_ready == 0U) {
        return;
    }
    Lock();
    g_stats.injection_dropped_frames++;
    Unlock();
}

void GnssRtcmInjection_GetStats(GnssRtcmInjectionStats *stats)
{
    if (stats == NULL) {
        return;
    }
    if (g_ready == 0U) {
        memset(stats, 0, sizeof(*stats));
        return;
    }
    Lock();
    *stats = g_stats;
    stats->accepted_fragments = g_reassembler.accepted_fragments;
    stats->duplicate_fragments = g_reassembler.duplicate_fragments;
    stats->rejected_fragments = g_reassembler.rejected_fragments;
    stats->completed_frames = g_reassembler.completed_frames;
    stats->crc_errors = g_reassembler.crc_errors;
    stats->expired_assemblies = g_reassembler.expired_assemblies;
    stats->capacity_evictions = g_reassembler.capacity_evictions;
    stats->ttl_unverified_fragments = g_reassembler.ttl_unverified_fragments;
    stats->queue_pending = g_queue_count;
    Unlock();
}

#else

int GnssRtcmInjection_Init(uint8_t local_node)
{
    (void)local_node;
    return 0;
}

GnssRtcmReassemblyStatusV3 GnssRtcmInjection_AcceptFragment(
    const uint8_t *payload, uint16_t payload_bytes, uint64_t monotonic_ms)
{
    (void)payload;
    (void)payload_bytes;
    (void)monotonic_ms;
    return GNSS_RTCM_REASSEMBLY_REJECTED;
}

int GnssRtcmInjection_TryDequeue(
    uint64_t monotonic_ms, uint8_t *frame, uint16_t frame_capacity,
    uint16_t *frame_bytes, uint16_t *message_type)
{
    (void)monotonic_ms;
    (void)frame;
    (void)frame_capacity;
    (void)message_type;
    if (frame_bytes != NULL) {
        *frame_bytes = 0U;
    }
    return 0;
}

void GnssRtcmInjection_RecordProbe(uint16_t frame_bytes) { (void)frame_bytes; }
void GnssRtcmInjection_RecordInjected(uint16_t frame_bytes) { (void)frame_bytes; }
void GnssRtcmInjection_RecordWriteError(uint8_t partial_write) { (void)partial_write; }
void GnssRtcmInjection_RecordInjectionDrop(void) {}

void GnssRtcmInjection_GetStats(GnssRtcmInjectionStats *stats)
{
    if (stats != NULL) {
        memset(stats, 0, sizeof(*stats));
    }
}

#endif
