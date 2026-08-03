#ifndef APP_COMPACT_POLL_COMMAND_H
#define APP_COMPACT_POLL_COMMAND_H

#ifdef __cplusplus
extern "C" {
#endif

#define COMPACT_POLL_COMMAND_BYTES 10
#define COMPACT_TARGETED_POLL_COMMAND_BYTES 11
#define COMPACT_POLL_NODE_SLOT_MS 340U
#define COMPACT_TARGETED_POLL_MARKER "compact-targeted-v1 P2 singleflight"

int CompactPollCommand_IsValid(const char *payload, int payload_len);
int CompactPollCommand_TargetMatches(const char *payload, const char *legacy_node_label);
unsigned int CompactPollCommand_ResponseDelayMs(const char *payload, const char *legacy_node_label);

#ifdef __cplusplus
}
#endif

#endif // APP_COMPACT_POLL_COMMAND_H
