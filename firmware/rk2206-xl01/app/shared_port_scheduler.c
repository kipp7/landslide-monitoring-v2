/*
 * Deprecated experiment:
 * This file remains in-tree only as a disabled prototype for earlier center-side scheduling exploration.
 * It is not the active execution line for the current hardware topology.
 */

#include "shared_port_scheduler.h"

#include <stdio.h>
#include <string.h>

#include "cmsis_os2.h"
#include "../config/app_config.h"

typedef struct {
    char payload[SHARED_PORT_MAX_PAYLOAD_BYTES];
    int len;
    int ready;
    char command_id[64];
    char command_type[64];
    unsigned int quiet_window_ms;
} SharedPortPriorityLane;

typedef struct {
    char node_key[64];
    char payload[SHARED_PORT_MAX_PAYLOAD_BYTES];
    int len;
    int ready;
    unsigned int telemetry_seq;
} SharedPortTelemetrySlot;

static osMutexId_t g_scheduler_mutex = NULL;
static SharedPortPriorityLane g_command_lane = {0};
static SharedPortPriorityLane g_ack_lane = {0};
static SharedPortTelemetrySlot g_telemetry_slots[SHARED_PORT_NODE_SLOT_COUNT] = {0};
static unsigned int g_quiet_remaining_ms = 0;
static unsigned int g_next_telemetry_slot = 0;

static void SharedPortScheduler_Lock(void)
{
    if (g_scheduler_mutex != NULL) {
        osMutexAcquire(g_scheduler_mutex, osWaitForever);
    }
}

static void SharedPortScheduler_Unlock(void)
{
    if (g_scheduler_mutex != NULL) {
        osMutexRelease(g_scheduler_mutex);
    }
}

static int CopyBoundedPayload(char *dst, int dst_size, const char *src, int len)
{
    if (dst == NULL || src == NULL || dst_size <= 1 || len <= 0 || len >= dst_size) {
        return -1;
    }

    memcpy(dst, src, (size_t)len);
    dst[len] = '\0';
    return len;
}

static void CopyBoundedString(char *dst, int dst_size, const char *src)
{
    if (dst == NULL || dst_size <= 0) {
        return;
    }

    if (src == NULL) {
        dst[0] = '\0';
        return;
    }

    strncpy(dst, src, (size_t)dst_size - 1);
    dst[dst_size - 1] = '\0';
}

static unsigned int ResolveQuietWindowMs(const char *command_type)
{
    if (command_type == NULL) {
        return 0;
    }

    if (strcmp(command_type, "manual_collect") == 0 ||
        strcmp(command_type, "set_config") == 0) {
        return SHARED_PORT_COMMAND_QUIET_WINDOW_MS;
    }

    return 0;
}

static int StagePriorityLane(
    SharedPortPriorityLane *lane,
    const char *command_type,
    const char *command_id,
    const char *payload,
    int len,
    unsigned int quiet_window_ms
)
{
    if (lane == NULL || payload == NULL || len <= 0) {
        return -1;
    }

    if (lane->ready) {
        return -1;
    }

    if (CopyBoundedPayload(lane->payload, sizeof(lane->payload), payload, len) <= 0) {
        return -1;
    }

    lane->len = len;
    lane->ready = 1;
    lane->quiet_window_ms = quiet_window_ms;
    CopyBoundedString(lane->command_type, sizeof(lane->command_type), command_type);
    CopyBoundedString(lane->command_id, sizeof(lane->command_id), command_id);
    return len;
}

void SharedPortScheduler_Init(void)
{
    if (g_scheduler_mutex == NULL) {
        g_scheduler_mutex = osMutexNew(NULL);
    }

    SharedPortScheduler_Lock();
    memset(&g_command_lane, 0, sizeof(g_command_lane));
    memset(&g_ack_lane, 0, sizeof(g_ack_lane));
    memset(&g_telemetry_slots, 0, sizeof(g_telemetry_slots));
    g_quiet_remaining_ms = 0;
    g_next_telemetry_slot = 0;
    SharedPortScheduler_Unlock();
}

int SharedPortScheduler_IsEnabled(void)
{
#if ENABLE_SHARED_PORT_SOURCE_CONTROL
    return 1;
#else
    return 0;
#endif
}

void SharedPortScheduler_Advance(unsigned int elapsed_ms)
{
    if (!SharedPortScheduler_IsEnabled() || elapsed_ms == 0) {
        return;
    }

    SharedPortScheduler_Lock();
    if (g_quiet_remaining_ms > elapsed_ms) {
        g_quiet_remaining_ms -= elapsed_ms;
    } else {
        g_quiet_remaining_ms = 0;
    }
    SharedPortScheduler_Unlock();
}

int SharedPortScheduler_InQuietWindow(void)
{
    int active;

    if (!SharedPortScheduler_IsEnabled()) {
        return 0;
    }

    SharedPortScheduler_Lock();
    active = g_quiet_remaining_ms > 0 ? 1 : 0;
    SharedPortScheduler_Unlock();
    return active;
}

int SharedPortScheduler_EnqueueCommand(
    const char *command_type,
    const char *command_id,
    const char *payload,
    int len
)
{
    int ret;

    if (!SharedPortScheduler_IsEnabled()) {
        return -1;
    }

    SharedPortScheduler_Lock();
    ret = StagePriorityLane(
        &g_command_lane,
        command_type,
        command_id,
        payload,
        len,
        ResolveQuietWindowMs(command_type)
    );
    SharedPortScheduler_Unlock();
    return ret;
}

int SharedPortScheduler_EnqueueAckOrResult(
    const char *command_type,
    const char *command_id,
    const char *payload,
    int len
)
{
    int ret;

    if (!SharedPortScheduler_IsEnabled()) {
        return -1;
    }

    SharedPortScheduler_Lock();
    ret = StagePriorityLane(&g_ack_lane, command_type, command_id, payload, len, 0);
    SharedPortScheduler_Unlock();
    return ret;
}

int SharedPortScheduler_EnqueueNormalTelemetry(
    const char *node_key,
    unsigned int telemetry_seq,
    const char *payload,
    int len
)
{
    int i;
    int target = -1;

    if (!SharedPortScheduler_IsEnabled() || node_key == NULL || payload == NULL || len <= 0) {
        return -1;
    }

    SharedPortScheduler_Lock();
    for (i = 0; i < SHARED_PORT_NODE_SLOT_COUNT; ++i) {
        if (g_telemetry_slots[i].ready && strcmp(g_telemetry_slots[i].node_key, node_key) == 0) {
            target = i;
            break;
        }
        if (!g_telemetry_slots[i].ready && target < 0) {
            target = i;
        }
    }

    if (target >= 0 &&
        CopyBoundedPayload(g_telemetry_slots[target].payload, sizeof(g_telemetry_slots[target].payload), payload, len) > 0) {
        CopyBoundedString(g_telemetry_slots[target].node_key, sizeof(g_telemetry_slots[target].node_key), node_key);
        g_telemetry_slots[target].telemetry_seq = telemetry_seq;
        g_telemetry_slots[target].len = len;
        g_telemetry_slots[target].ready = 1;
        SharedPortScheduler_Unlock();
        return len;
    }

    SharedPortScheduler_Unlock();
    return -1;
}

int SharedPortScheduler_DequeueNext(SharedPortScheduledMessage *out)
{
    int i;
    int slot_index;

    if (!SharedPortScheduler_IsEnabled() || out == NULL) {
        return 0;
    }

    SharedPortScheduler_Lock();
    memset(out, 0, sizeof(*out));

    if (g_ack_lane.ready) {
        out->kind = SHARED_PORT_MESSAGE_ACK_OR_RESULT;
        out->len = g_ack_lane.len;
        out->use_retry = 0;
        out->quiet_window_ms = g_ack_lane.quiet_window_ms;
        CopyBoundedPayload(out->payload, sizeof(out->payload), g_ack_lane.payload, g_ack_lane.len);
        CopyBoundedString(out->command_type, sizeof(out->command_type), g_ack_lane.command_type);
        CopyBoundedString(out->command_id, sizeof(out->command_id), g_ack_lane.command_id);
        memset(&g_ack_lane, 0, sizeof(g_ack_lane));
        SharedPortScheduler_Unlock();
        return out->len;
    }

    if (g_command_lane.ready) {
        out->kind = SHARED_PORT_MESSAGE_COMMAND;
        out->len = g_command_lane.len;
        out->use_retry = 0;
        out->quiet_window_ms = g_command_lane.quiet_window_ms;
        CopyBoundedPayload(out->payload, sizeof(out->payload), g_command_lane.payload, g_command_lane.len);
        CopyBoundedString(out->command_type, sizeof(out->command_type), g_command_lane.command_type);
        CopyBoundedString(out->command_id, sizeof(out->command_id), g_command_lane.command_id);
        memset(&g_command_lane, 0, sizeof(g_command_lane));
        SharedPortScheduler_Unlock();
        return out->len;
    }

    if (g_quiet_remaining_ms > 0) {
        SharedPortScheduler_Unlock();
        return 0;
    }

    for (i = 0; i < SHARED_PORT_NODE_SLOT_COUNT; ++i) {
        slot_index = (int)((g_next_telemetry_slot + (unsigned int)i) % SHARED_PORT_NODE_SLOT_COUNT);
        if (!g_telemetry_slots[slot_index].ready) {
            continue;
        }

        out->kind = SHARED_PORT_MESSAGE_NORMAL_TELEMETRY;
        out->len = g_telemetry_slots[slot_index].len;
        out->use_retry = 1;
        out->telemetry_seq = g_telemetry_slots[slot_index].telemetry_seq;
        CopyBoundedPayload(out->payload, sizeof(out->payload), g_telemetry_slots[slot_index].payload, g_telemetry_slots[slot_index].len);
        CopyBoundedString(out->node_key, sizeof(out->node_key), g_telemetry_slots[slot_index].node_key);
        memset(&g_telemetry_slots[slot_index], 0, sizeof(g_telemetry_slots[slot_index]));
        g_next_telemetry_slot = (unsigned int)((slot_index + 1) % SHARED_PORT_NODE_SLOT_COUNT);
        SharedPortScheduler_Unlock();
        return out->len;
    }

    SharedPortScheduler_Unlock();
    return 0;
}

void SharedPortScheduler_BeginQuietWindow(
    const char *command_type,
    const char *command_id
)
{
    unsigned int quiet_ms = ResolveQuietWindowMs(command_type);

    (void)command_id;
    if (!SharedPortScheduler_IsEnabled() || quiet_ms == 0) {
        return;
    }

    SharedPortScheduler_Lock();
    if (quiet_ms > g_quiet_remaining_ms) {
        g_quiet_remaining_ms = quiet_ms;
    }
    SharedPortScheduler_Unlock();
#if PLATFORM_COMMAND_RX_LOG_MODE
    printf("[SRC CTRL QUIET] type=%s quiet_ms=%u\n", command_type != NULL ? command_type : "(null)", quiet_ms);
#endif
}
