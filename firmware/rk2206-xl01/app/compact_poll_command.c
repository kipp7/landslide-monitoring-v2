#include "compact_poll_command.h"

static int IsHexDigit(char value)
{
    return (value >= '0' && value <= '9') ||
           (value >= 'A' && value <= 'F') ||
           (value >= 'a' && value <= 'f');
}

int CompactPollCommand_IsValid(const char *payload, int payload_len)
{
    int index;

    if (payload == 0 || payload_len != COMPACT_POLL_COMMAND_BYTES) {
        return 0;
    }
    if (payload[0] != 'P' || payload[1] != '1') {
        return 0;
    }
    for (index = 2; index < COMPACT_POLL_COMMAND_BYTES; ++index) {
        if (!IsHexDigit(payload[index])) {
            return 0;
        }
    }
    return 1;
}

unsigned int CompactPollCommand_NodeDelayMs(const char *legacy_node_label)
{
    if (legacy_node_label == 0 || legacy_node_label[1] != '\0') {
        return 0U;
    }
    if (legacy_node_label[0] == 'B') {
        return COMPACT_POLL_NODE_SLOT_MS;
    }
    if (legacy_node_label[0] == 'C') {
        return COMPACT_POLL_NODE_SLOT_MS * 2U;
    }
    return 0U;
}
