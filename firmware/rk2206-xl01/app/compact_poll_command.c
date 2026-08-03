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

    if (payload == 0 || payload_len < 2 || payload[0] != 'P') {
        return 0;
    }
    if (payload[1] == '1') {
        if (payload_len != COMPACT_POLL_COMMAND_BYTES) return 0;
        index = 2;
    } else if (payload[1] == '2') {
        if (payload_len != COMPACT_TARGETED_POLL_COMMAND_BYTES ||
            (payload[2] != 'A' && payload[2] != 'B' && payload[2] != 'C')) {
            return 0;
        }
        index = 3;
    } else {
        return 0;
    }
    for (; index < payload_len; ++index) {
        if (!IsHexDigit(payload[index])) {
            return 0;
        }
    }
    return 1;
}

int CompactPollCommand_TargetMatches(const char *payload, const char *legacy_node_label)
{
    if (payload == 0 || legacy_node_label == 0 || legacy_node_label[1] != '\0') {
        return 0;
    }
    if (payload[1] == '1') return 1;
    return payload[1] == '2' && payload[2] == legacy_node_label[0];
}

unsigned int CompactPollCommand_ResponseDelayMs(const char *payload, const char *legacy_node_label)
{
    if (!CompactPollCommand_TargetMatches(payload, legacy_node_label) || payload[1] == '2') {
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
