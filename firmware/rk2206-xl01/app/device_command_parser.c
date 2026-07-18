#include "device_command_parser.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

static const char *SkipJsonWhitespaceBounded(const char *input, const char *limit)
{
    while (input != NULL && input < limit && isspace((unsigned char)*input)) {
        input++;
    }
    return input;
}

static const char *FindJsonObjectEnd(const char *object_start)
{
    int depth = 0;
    int in_string = 0;
    int escape = 0;
    const char *cursor = object_start;

    if (object_start == NULL || *object_start != '{') {
        return NULL;
    }

    while (cursor != NULL && *cursor != '\0') {
        char ch = *cursor;

        if (escape) {
            escape = 0;
            cursor++;
            continue;
        }

        if (in_string) {
            if (ch == '\\') {
                escape = 1;
            } else if (ch == '"') {
                in_string = 0;
            }
            cursor++;
            continue;
        }

        if (ch == '"') {
            in_string = 1;
        } else if (ch == '{') {
            depth++;
        } else if (ch == '}') {
            depth--;
            if (depth == 0) {
                return cursor;
            }
            if (depth < 0) {
                return NULL;
            }
        }

        cursor++;
    }

    return NULL;
}

static const char *FindJsonValueDelimiter(const char *value_start, const char *object_end)
{
    int depth = 0;
    int in_string = 0;
    int escape = 0;
    const char *cursor = value_start;

    if (value_start == NULL || object_end == NULL || value_start > object_end) {
        return NULL;
    }

    while (cursor <= object_end) {
        char ch = *cursor;

        if (escape) {
            escape = 0;
            cursor++;
            continue;
        }

        if (in_string) {
            if (ch == '\\') {
                escape = 1;
            } else if (ch == '"') {
                in_string = 0;
            }
            cursor++;
            continue;
        }

        if (ch == '"') {
            in_string = 1;
            cursor++;
            continue;
        }

        if (ch == '{' || ch == '[') {
            depth++;
        } else if (ch == '}' || ch == ']') {
            if (depth == 0) {
                return cursor;
            }
            depth--;
        } else if (ch == ',' && depth == 0) {
            return cursor;
        }

        cursor++;
    }

    return NULL;
}

static const char *FindJsonValueStartInObject(const char *object_start, const char *object_end, const char *key)
{
    const char *cursor = NULL;
    size_t key_len = 0;

    if (object_start == NULL || object_end == NULL || key == NULL || *object_start != '{') {
        return NULL;
    }

    cursor = object_start + 1;
    key_len = strlen(key);

    while (cursor < object_end) {
        const char *key_start = NULL;
        const char *key_end = NULL;
        const char *value_start = NULL;
        const char *value_delimiter = NULL;
        int escape = 0;

        cursor = SkipJsonWhitespaceBounded(cursor, object_end);
        if (cursor == NULL || cursor >= object_end) {
            break;
        }

        if (*cursor == ',') {
            cursor++;
            continue;
        }

        if (*cursor != '"') {
            return NULL;
        }

        key_start = ++cursor;
        while (cursor < object_end) {
            if (escape) {
                escape = 0;
            } else if (*cursor == '\\') {
                escape = 1;
            } else if (*cursor == '"') {
                break;
            }
            cursor++;
        }

        if (cursor >= object_end || *cursor != '"') {
            return NULL;
        }

        key_end = cursor;
        cursor++;
        cursor = SkipJsonWhitespaceBounded(cursor, object_end);
        if (cursor == NULL || cursor >= object_end || *cursor != ':') {
            return NULL;
        }

        cursor++;
        value_start = SkipJsonWhitespaceBounded(cursor, object_end + 1);
        if (value_start == NULL || value_start > object_end) {
            return NULL;
        }

        value_delimiter = FindJsonValueDelimiter(value_start, object_end);
        if (value_delimiter == NULL) {
            return NULL;
        }

        if ((size_t)(key_end - key_start) == key_len &&
            memcmp(key_start, key, key_len) == 0) {
            return value_start;
        }

        cursor = value_delimiter + 1;
    }

    return NULL;
}

static int ExtractJsonStringFromObject(
    const char *object_start,
    const char *object_end,
    const char *key,
    char *output,
    int output_size
)
{
    const char *start = NULL;
    const char *end = NULL;
    int len = 0;

    if (output == NULL || output_size <= 1) {
        return -1;
    }

    start = FindJsonValueStartInObject(object_start, object_end, key);
    if (start == NULL || *start != '"') {
        return -1;
    }

    start++;
    end = start;
    while (end <= object_end && *end != '\0') {
        if (*end == '"') {
            break;
        }
        if (*end == '\\') {
            return -1;
        }
        end++;
    }

    if (end > object_end || *end != '"') {
        return -1;
    }

    len = (int)(end - start);
    if (len <= 0 || len >= output_size) {
        return -1;
    }

    memcpy(output, start, (size_t)len);
    output[len] = '\0';
    return 0;
}

static int ExtractJsonIntFromObject(
    const char *object_start,
    const char *object_end,
    const char *key,
    int *value
)
{
    const char *start = NULL;
    const char *value_end = NULL;
    char *end_ptr = NULL;
    long parsed = 0;

    if (object_start == NULL || object_end == NULL || key == NULL || value == NULL) {
        return -1;
    }

    start = FindJsonValueStartInObject(object_start, object_end, key);
    if (start == NULL) {
        return -1;
    }

    parsed = strtol(start, &end_ptr, 10);
    if (end_ptr == start) {
        return -1;
    }

    value_end = FindJsonValueDelimiter(start, object_end);
    if (value_end == NULL) {
        return -1;
    }

    end_ptr = (char *)SkipJsonWhitespaceBounded(end_ptr, value_end);
    if (end_ptr == NULL || end_ptr != value_end) {
        return -1;
    }

    *value = (int)parsed;
    return 0;
}

int ParseDeviceCommandV1(const char *json, DeviceCommandMessage *out)
{
    const char *root = NULL;
    const char *root_end = NULL;
    const char *schema_version = NULL;
    const char *payload = NULL;
    const char *payload_end = NULL;
    const char *time_sync = NULL;
    const char *time_sync_end = NULL;

    if (json == NULL || out == NULL) {
        return -1;
    }

    memset(out, 0, sizeof(DeviceCommandMessage));

    root = SkipJsonWhitespaceBounded(json, json + strlen(json));
    if (root == NULL || *root != '{') {
        return -1;
    }

    root_end = FindJsonObjectEnd(root);
    if (root_end == NULL) {
        return -1;
    }

    schema_version = FindJsonValueStartInObject(root, root_end, "schema_version");
    payload = FindJsonValueStartInObject(root, root_end, "payload");
    if (schema_version == NULL || (int)strtol(schema_version, NULL, 10) != 1) {
        return -1;
    }
    if (payload == NULL || *payload != '{') {
        return -1;
    }

    payload_end = FindJsonObjectEnd(payload);
    if (payload_end == NULL || payload_end > root_end) {
        return -1;
    }

    if (ExtractJsonStringFromObject(root, root_end, "command_id", out->command_id, sizeof(out->command_id)) != 0) {
        return -1;
    }
    if (ExtractJsonStringFromObject(root, root_end, "device_id", out->device_id, sizeof(out->device_id)) != 0) {
        return -1;
    }
    if (ExtractJsonStringFromObject(root, root_end, "command_type", out->command_type, sizeof(out->command_type)) != 0) {
        return -1;
    }
    if (ExtractJsonStringFromObject(root, root_end, "issued_ts", out->issued_ts, sizeof(out->issued_ts)) != 0) {
        return -1;
    }
    if (ExtractJsonStringFromObject(root, root_end, "sent_ts", out->sent_ts, sizeof(out->sent_ts)) == 0) {
        out->has_sent_ts = 1;
    }
    if (ExtractJsonStringFromObject(root, root_end, "gateway_sent_ts", out->gateway_sent_ts, sizeof(out->gateway_sent_ts)) == 0) {
        out->has_gateway_sent_ts = 1;
    }

    time_sync = FindJsonValueStartInObject(root, root_end, "time_sync");
    if (time_sync != NULL && *time_sync == '{') {
        time_sync_end = FindJsonObjectEnd(time_sync);
        if (time_sync_end != NULL && time_sync_end <= root_end &&
            ExtractJsonStringFromObject(time_sync, time_sync_end, "sent_ts", out->time_sync_sent_ts, sizeof(out->time_sync_sent_ts)) == 0) {
            out->has_time_sync_sent_ts = 1;
        }
    }

    if (ExtractJsonIntFromObject(payload, payload_end, "sampling_s", &out->sampling_s) == 0) {
        out->has_sampling_s = 1;
    }
    if (ExtractJsonIntFromObject(payload, payload_end, "report_interval_s", &out->report_interval_s) == 0) {
        out->has_report_interval_s = 1;
    }
    if (ExtractJsonIntFromObject(payload, payload_end, "intervalSeconds", &out->interval_seconds) == 0) {
        out->has_interval_seconds = 1;
    }

    return 0;
}
