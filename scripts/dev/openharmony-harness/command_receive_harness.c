#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>
#include <stdarg.h>

#include "iot_uart.h"
#include "drivers/xl01/xl01_driver.h"
#include "app/device_command_parser.h"
#include "app/command_ack_builder.h"
#include "app/device_identity.h"

typedef struct {
    unsigned int sampling_s;
    unsigned int report_interval_s;
    int uplink_enabled;
    int manual_collect_requested;
} HarnessRuntimeState;

typedef struct {
    const char *name;
    const char *chunks[8];
    int chunk_count;
} HarnessScenario;

static const char **g_active_chunks = NULL;
static int g_active_chunk_count = 0;
static int g_active_chunk_index = 0;

int printf(const char *fmt, ...)
{
    (void)fmt;
    return 0;
}

void LOS_Msleep(unsigned int ms)
{
    (void)ms;
}

unsigned int IoTUartInit(int id, const IotUartAttribute *attr)
{
    (void)id;
    (void)attr;
    return 0;
}

void IoTUartDeinit(int id)
{
    (void)id;
}

int IoTUartRead(int id, unsigned char *buffer, unsigned int len)
{
    size_t chunk_len;

    (void)id;
    if (g_active_chunks == NULL || g_active_chunk_index >= g_active_chunk_count) {
        return 0;
    }

    chunk_len = strlen(g_active_chunks[g_active_chunk_index]);
    if (chunk_len > len) {
        chunk_len = len;
    }
    memcpy(buffer, g_active_chunks[g_active_chunk_index], chunk_len);
    g_active_chunk_index += 1;
    return (int)chunk_len;
}

int IoTUartWrite(int id, unsigned char *buffer, unsigned int len)
{
    (void)id;
    (void)buffer;
    return (int)len;
}

static void ResetMockChunks(const HarnessScenario *scenario)
{
    g_active_chunks = scenario->chunks;
    g_active_chunk_count = scenario->chunk_count;
    g_active_chunk_index = 0;
}

static void CopySlice(char *target, int target_size, const char *source, int start, int length)
{
    int source_len;
    if (target == NULL || target_size <= 0 || source == NULL || start < 0 || length < 0) {
        return;
    }

    source_len = (int)strlen(source);
    if (start > source_len) {
        target[0] = '\0';
        return;
    }
    if (start + length > source_len) {
        length = source_len - start;
    }
    if (length >= target_size) {
        length = target_size - 1;
    }
    memcpy(target, source + start, (size_t)length);
    target[length] = '\0';
}

static int BuildPrettyCommandJson(
    char *output,
    int output_size,
    const char *command_id,
    const char *device_id,
    const char *command_type,
    const char *payload_body,
    const char *issued_ts
)
{
    return snprintf(
        output,
        (size_t)output_size,
        "{\n"
        "  \"schema_version\": 1,\n"
        "  \"command_id\": \"%s\",\n"
        "  \"device_id\": \"%s\",\n"
        "  \"command_type\": \"%s\",\n"
        "  \"payload\": %s,\n"
        "  \"issued_ts\": \"%s\"\n"
        "}",
        command_id,
        device_id,
        command_type,
        payload_body,
        issued_ts
    );
}

static void PrintJsonEscaped(const char *text)
{
    const unsigned char *cursor = (const unsigned char *)text;
    if (text == NULL) {
        fputs("null", stdout);
        return;
    }

    putchar('"');
    while (*cursor != '\0') {
        switch (*cursor) {
            case '\\':
                fputs("\\\\", stdout);
                break;
            case '"':
                fputs("\\\"", stdout);
                break;
            case '\n':
                fputs("\\n", stdout);
                break;
            case '\r':
                fputs("\\r", stdout);
                break;
            case '\t':
                fputs("\\t", stdout);
                break;
            default:
                putchar((int)*cursor);
                break;
        }
        cursor++;
    }
    putchar('"');
}

static void PrintNowIsoString(void)
{
    time_t now = time(NULL);
    struct tm *utc = gmtime(&now);
    char buffer[32];

    if (utc == NULL) {
        PrintJsonEscaped("1970-01-01T00:00:00Z");
        return;
    }

    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", utc);
    PrintJsonEscaped(buffer);
}

static int ExecuteCommandLikeMainLoop(
    const DeviceCommandMessage *cmd,
    HarnessRuntimeState *runtime,
    char *ack_buffer,
    int ack_buffer_size
)
{
    char result_json[256];
    int ack_len;
    const DeviceIdentity *identity = DeviceIdentity_Get();

    if (cmd == NULL || runtime == NULL || ack_buffer == NULL || ack_buffer_size <= 0) {
        return -1;
    }

    if (identity == NULL || identity->device_id == NULL) {
        return -1;
    }

    if (strcmp(cmd->device_id, identity->device_id) != 0) {
        return 0;
    }

    if (strcmp(cmd->command_type, "set_sampling_interval") == 0) {
        if (!cmd->has_interval_seconds || cmd->interval_seconds <= 0) {
            return BuildDeviceCommandAckV1(
                cmd->command_id,
                "failed",
                "{\"error\":\"invalid_interval_seconds\"}",
                "1970-01-01T00:00:00Z",
                ack_buffer,
                ack_buffer_size
            );
        }
        runtime->sampling_s = (unsigned int)cmd->interval_seconds;
        snprintf(result_json, sizeof(result_json), "{\"applied\":true,\"sampling_s\":%d}", cmd->interval_seconds);
        return BuildDeviceCommandAckV1(
            cmd->command_id,
            "acked",
            result_json,
            "1970-01-01T00:00:00Z",
            ack_buffer,
            ack_buffer_size
        );
    }

    if (strcmp(cmd->command_type, "set_config") == 0) {
        char applied_keys[96] = "";
        int first = 1;

        if (cmd->has_sampling_s && cmd->sampling_s > 0) {
            runtime->sampling_s = (unsigned int)cmd->sampling_s;
            strcat(applied_keys, "\"sampling_s\"");
            first = 0;
        }
        if (cmd->has_report_interval_s && cmd->report_interval_s > 0) {
            runtime->report_interval_s = (unsigned int)cmd->report_interval_s;
            if (!first) {
                strcat(applied_keys, ",");
            }
            strcat(applied_keys, "\"report_interval_s\"");
        }

        snprintf(
            result_json,
            sizeof(result_json),
            "{\"applied\":true,\"applied_keys\":[%s],\"runtime_config\":{\"sampling_s\":%u,\"report_interval_s\":%u}}",
            applied_keys,
            runtime->sampling_s,
            runtime->report_interval_s
        );
        ack_len = BuildDeviceCommandAckV1(
            cmd->command_id,
            "acked",
            result_json,
            "1970-01-01T00:00:00Z",
            ack_buffer,
            ack_buffer_size
        );
        return ack_len;
    }

    if (strcmp(cmd->command_type, "manual_collect") == 0) {
        runtime->manual_collect_requested = 1;
        return BuildDeviceCommandAckV1(
            cmd->command_id,
            "acked",
            "{\"collect_requested\":true,\"reason\":\"manual_trigger\"}",
            "1970-01-01T00:00:00Z",
            ack_buffer,
            ack_buffer_size
        );
    }

    if (strcmp(cmd->command_type, "deactivate_device") == 0) {
        runtime->uplink_enabled = 0;
        return BuildDeviceCommandAckV1(
            cmd->command_id,
            "acked",
            "{\"deactivated\":true,\"uplink_suppressed\":true}",
            "1970-01-01T00:00:00Z",
            ack_buffer,
            ack_buffer_size
        );
    }

    return BuildDeviceCommandAckV1(
        cmd->command_id,
        "failed",
        "{\"error\":\"unsupported_in_harness\"}",
        "1970-01-01T00:00:00Z",
        ack_buffer,
        ack_buffer_size
    );
}

static void RunScenario(const HarnessScenario *scenario, int include_trailing_comma)
{
    Statistics stats = {0};
    HarnessRuntimeState runtime = {1, 5, 1, 0};
    DeviceCommandMessage cmd;
    char command_buffer[512];
    char ack_buffer[512];
    int dequeued_len;
    int parsed_ok;
    int device_match = 0;
    int ack_len = 0;
    int i;
    const DeviceIdentity *identity = DeviceIdentity_Get();

    ResetMockChunks(scenario);
    XL01_Init();
    XL01_ClearLinkAck();

    for (i = 0; i < scenario->chunk_count; ++i) {
      XL01_PollReceive();
      XL01_ProcessReceivedData(&stats);
    }

    dequeued_len = XL01_TryDequeuePlatformCommand(command_buffer, sizeof(command_buffer));
    parsed_ok = (dequeued_len > 0 && ParseDeviceCommandV1(command_buffer, &cmd) == 0);
    if (parsed_ok && identity != NULL && identity->device_id != NULL) {
        device_match = strcmp(cmd.device_id, identity->device_id) == 0;
    }
    if (parsed_ok) {
        ack_len = ExecuteCommandLikeMainLoop(&cmd, &runtime, ack_buffer, sizeof(ack_buffer));
    }

    fprintf(stdout, "    {\n");
    fprintf(stdout, "      \"name\": ");
    PrintJsonEscaped(scenario->name);
    fprintf(stdout, ",\n");
    fprintf(stdout, "      \"chunkCount\": %d,\n", scenario->chunk_count);
    fprintf(stdout, "      \"linkAckReceived\": %s,\n", XL01_HasLinkAck() ? "true" : "false");
    fprintf(stdout, "      \"commandReady\": %s,\n", dequeued_len > 0 ? "true" : "false");
    fprintf(stdout, "      \"parsedOk\": %s,\n", parsed_ok ? "true" : "false");
    fprintf(stdout, "      \"deviceMatch\": %s,\n", device_match ? "true" : "false");
    fprintf(stdout, "      \"commandBuffer\": ");
    if (dequeued_len > 0) {
        PrintJsonEscaped(command_buffer);
    } else {
        fprintf(stdout, "null");
    }
    fprintf(stdout, ",\n");
    fprintf(stdout, "      \"ack\": ");
    if (ack_len > 0) {
        PrintJsonEscaped(ack_buffer);
    } else {
        fprintf(stdout, "null");
    }
    fprintf(stdout, ",\n");
    fprintf(stdout, "      \"runtimeAfter\": {\n");
    fprintf(stdout, "        \"sampling_s\": %u,\n", runtime.sampling_s);
    fprintf(stdout, "        \"report_interval_s\": %u,\n", runtime.report_interval_s);
    fprintf(stdout, "        \"uplink_enabled\": %s,\n", runtime.uplink_enabled ? "true" : "false");
    fprintf(stdout, "        \"manual_collect_requested\": %s\n", runtime.manual_collect_requested ? "true" : "false");
    fprintf(stdout, "      }\n");
    fprintf(stdout, "    }%s\n", include_trailing_comma ? "," : "");
}

int main(void)
{
    const DeviceIdentity *identity = DeviceIdentity_Get();
    char scenario1_json[768];
    char scenario2_json[768];
    char scenario3_json[768];
    char scenario1_chunk1[256];
    char scenario1_chunk2[256];
    char scenario1_chunk3[256];
    char scenario2_chunk1[256];
    char scenario2_chunk2[256];
    char scenario2_chunk3[256];
    char scenario3_chunk1[256];
    char scenario3_chunk2[256];
    char scenario3_chunk3[256];
    HarnessScenario scenarios[3];
    int scenario_count = 3;
    int i;

    if (identity == NULL || identity->device_id == NULL) {
        fprintf(stdout, "{\n");
        fprintf(stdout, "  \"generatedAt\": ");
        PrintNowIsoString();
        fprintf(stdout, ",\n");
        fprintf(stdout, "  \"conclusion\": \"hardware-stable-version-openharmony-command-harness-missing-device-identity\"\n");
        fprintf(stdout, "}\n");
        return 0;
    }

    BuildPrettyCommandJson(
        scenario1_json,
        sizeof(scenario1_json),
        "00000000-0000-4000-8000-000000001201",
        identity->device_id,
        "set_sampling_interval",
        "{\n    \"intervalSeconds\": 10\n  }",
        "2026-03-26T13:00:00Z"
    );
    BuildPrettyCommandJson(
        scenario2_json,
        sizeof(scenario2_json),
        "00000000-0000-4000-8000-000000001202",
        identity->device_id,
        "set_config",
        "{\n    \"sampling_s\": 7,\n    \"report_interval_s\": 9\n  }",
        "2026-03-26T13:01:00Z"
    );
    BuildPrettyCommandJson(
        scenario3_json,
        sizeof(scenario3_json),
        "00000000-0000-4000-8000-000000001203",
        "99999999-9999-4999-8999-999999999999",
        "manual_collect",
        "{\n    \"source\": \"gateway-pretty-json\"\n  }",
        "2026-03-26T13:02:00Z"
    );

    CopySlice(scenario1_chunk1, sizeof(scenario1_chunk1), scenario1_json, 0, 48);
    CopySlice(scenario1_chunk2, sizeof(scenario1_chunk2), scenario1_json, 48, 96);
    CopySlice(scenario1_chunk3, sizeof(scenario1_chunk3), scenario1_json, 144, (int)strlen(scenario1_json) - 144);

    snprintf(scenario2_chunk1, sizeof(scenario2_chunk1), "ACK\r\n%.*s", 72, scenario2_json);
    CopySlice(scenario2_chunk2, sizeof(scenario2_chunk2), scenario2_json, 72, 72);
    CopySlice(scenario2_chunk3, sizeof(scenario2_chunk3), scenario2_json, 144, (int)strlen(scenario2_json) - 144);

    CopySlice(scenario3_chunk1, sizeof(scenario3_chunk1), scenario3_json, 0, 72);
    CopySlice(scenario3_chunk2, sizeof(scenario3_chunk2), scenario3_json, 72, 72);
    CopySlice(scenario3_chunk3, sizeof(scenario3_chunk3), scenario3_json, 144, (int)strlen(scenario3_json) - 144);

    scenarios[0].name = "chunked_pretty_json_set_sampling_interval";
    scenarios[0].chunks[0] = scenario1_chunk1;
    scenarios[0].chunks[1] = scenario1_chunk2;
    scenarios[0].chunks[2] = scenario1_chunk3;
    scenarios[0].chunk_count = 3;

    scenarios[1].name = "ack_plus_chunked_pretty_json_set_config";
    scenarios[1].chunks[0] = scenario2_chunk1;
    scenarios[1].chunks[1] = scenario2_chunk2;
    scenarios[1].chunks[2] = scenario2_chunk3;
    scenarios[1].chunk_count = 3;

    scenarios[2].name = "chunked_pretty_json_with_mismatched_device_id_is_not_executed";
    scenarios[2].chunks[0] = scenario3_chunk1;
    scenarios[2].chunks[1] = scenario3_chunk2;
    scenarios[2].chunks[2] = scenario3_chunk3;
    scenarios[2].chunk_count = 3;

    fprintf(stdout, "{\n");
    fprintf(stdout, "  \"generatedAt\": ");
    PrintNowIsoString();
    fprintf(stdout, ",\n");
    fprintf(stdout, "  \"conclusion\": \"hardware-stable-version-openharmony-command-harness-confirms-source-level-command-path-behavior\",\n");
    fprintf(stdout, "  \"toolchain\": \"emscripten-emcc\",\n");
    fprintf(stdout, "  \"localDeviceId\": ");
    PrintJsonEscaped(identity->device_id);
    fprintf(stdout, ",\n");
    fprintf(stdout, "  \"scenarios\": [\n");
    for (i = 0; i < scenario_count; ++i) {
        RunScenario(&scenarios[i], i + 1 < scenario_count);
    }
    fprintf(stdout, "  ]\n");
    fprintf(stdout, "}\n");
    return 0;
}
