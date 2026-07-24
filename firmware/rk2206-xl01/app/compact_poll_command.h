#ifndef APP_COMPACT_POLL_COMMAND_H
#define APP_COMPACT_POLL_COMMAND_H

#ifdef __cplusplus
extern "C" {
#endif

#define COMPACT_POLL_COMMAND_BYTES 10
#define COMPACT_POLL_NODE_SLOT_MS 340U

int CompactPollCommand_IsValid(const char *payload, int payload_len);
unsigned int CompactPollCommand_NodeDelayMs(const char *legacy_node_label);

#ifdef __cplusplus
}
#endif

#endif // APP_COMPACT_POLL_COMMAND_H
