#ifndef APP_SHARED_PORT_SCHEDULER_H
#define APP_SHARED_PORT_SCHEDULER_H

/*
 * Deprecated experiment:
 * This shared-port scheduler line is not the active mainline for the current field topology.
 * Keep it disabled unless hardware ownership is explicitly revisited later.
 */

#include "../config/app_config.h"
#include "sensor_data.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    SHARED_PORT_MESSAGE_NONE = 0,
    SHARED_PORT_MESSAGE_COMMAND = 1,
    SHARED_PORT_MESSAGE_ACK_OR_RESULT = 2,
    SHARED_PORT_MESSAGE_NORMAL_TELEMETRY = 3,
} SharedPortMessageKind;

typedef struct {
    SharedPortMessageKind kind;
    char payload[SHARED_PORT_MAX_PAYLOAD_BYTES];
    int len;
    int use_retry;
    unsigned int telemetry_seq;
    char node_key[64];
    char command_id[64];
    char command_type[64];
    unsigned int quiet_window_ms;
} SharedPortScheduledMessage;

void SharedPortScheduler_Init(void);
int SharedPortScheduler_IsEnabled(void);
void SharedPortScheduler_Advance(unsigned int elapsed_ms);
int SharedPortScheduler_InQuietWindow(void);
int SharedPortScheduler_EnqueueCommand(
    const char *command_type,
    const char *command_id,
    const char *payload,
    int len
);
int SharedPortScheduler_EnqueueAckOrResult(
    const char *command_type,
    const char *command_id,
    const char *payload,
    int len
);
int SharedPortScheduler_EnqueueNormalTelemetry(
    const char *node_key,
    unsigned int telemetry_seq,
    const char *payload,
    int len
);
int SharedPortScheduler_DequeueNext(SharedPortScheduledMessage *out);
void SharedPortScheduler_BeginQuietWindow(
    const char *command_type,
    const char *command_id
);

#ifdef __cplusplus
}
#endif

#endif // APP_SHARED_PORT_SCHEDULER_H
