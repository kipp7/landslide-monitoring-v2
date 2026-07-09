#include "device_command_parser.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

static const char *SkipJsonWhitespace(const char *input)
{
    while (input != NULL && *input != '\0' && isspace((unsigned char)*input)) {
        input++;
    }
    return input;
}

static const char *FindJsonValueStart(const char *json, const char *key)
{
    if (json == NULL || key == NULL) {
        return NULL;
    }

    char pattern[96];
    if (snprintf(pattern, sizeof(pattern), "\"%s\"", key) < 0) {
        return NULL;
    }

    const char *cursor = strstr(json, pattern);
    if (cursor == NULL) {
        return NULL;
    }

    cursor += strlen(pattern);
    cursor = SkipJsonWhitespace(cursor);
    if (cursor == NULL || *cursor != ':') {
        return NULL;
    }

    cursor++;
    cursor = SkipJsonWhitespace(cursor);
    return cursor;
}

static int ExtractJsonString(const char *json, const char *key, char *output, int output_size)
{
    if (output == NULL || output_size <= 1) {
        return -1;
    }

    const char *start = FindJsonValueStart(json, key);
    if (start == NULL || *start != '"') {
        return -1;
    }

    start++;
    const char *end = strchr(start, '"');
    if (end == NULL) {
        return -1;
    }

    int len = (int)(end - start);
    if (len <= 0 || len >= output_size) {
        return -1;
    }

    memcpy(output, start, (size_t)len);
    output[len] = '\0';
    return 0;
}

static int ExtractJsonInt(const char *json, const char *key, int *value)
{
    if (json == NULL || key == NULL || value == NULL) {
        return -1;
    }

    const char *start = FindJsonValueStart(json, key);
    if (start == NULL) {
        return -1;
    }

    char *end_ptr = NULL;
    long parsed = strtol(start, &end_ptr, 10);
    if (end_ptr == start) {
        return -1;
    }

    *value = (int)parsed;
    return 0;
}

int ParseDeviceCommandV1(const char *json, DeviceCommandMessage *out)
{
    if (json == NULL || out == NULL) {
        return -1;
    }

    memset(out, 0, sizeof(DeviceCommandMessage));

    const char *schema_version = FindJsonValueStart(json, "schema_version");
    const char *payload = FindJsonValueStart(json, "payload");
    if (schema_version == NULL || (int)strtol(schema_version, NULL, 10) != 1) {
        return -1;
    }
    if (payload == NULL || *payload != '{') {
        return -1;
    }
    if (ExtractJsonString(json, "command_id", out->command_id, sizeof(out->command_id)) != 0) {
        return -1;
    }
    if (ExtractJsonString(json, "device_id", out->device_id, sizeof(out->device_id)) != 0) {
        return -1;
    }
    if (ExtractJsonString(json, "command_type", out->command_type, sizeof(out->command_type)) != 0) {
        return -1;
    }

    if (ExtractJsonInt(json, "sampling_s", &out->sampling_s) == 0) {
      out->has_sampling_s = 1;
    }
    if (ExtractJsonInt(json, "report_interval_s", &out->report_interval_s) == 0) {
      out->has_report_interval_s = 1;
    }
    if (ExtractJsonInt(json, "intervalSeconds", &out->interval_seconds) == 0) {
      out->has_interval_seconds = 1;
    }

    return 0;
}
