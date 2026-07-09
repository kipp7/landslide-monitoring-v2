#include "command_ack_builder.h"
#include <stdio.h>
#include "device_identity.h"

int BuildDeviceCommandAckV1(
    const char *command_id,
    const char *status,
    const char *result_json_fragment,
    const char *ack_ts,
    char *output,
    int output_size
)
{
    if (command_id == NULL || status == NULL || ack_ts == NULL || output == NULL || output_size <= 0) {
        return -1;
    }

    const DeviceIdentity *identity = DeviceIdentity_Get();
    if (identity == NULL || identity->device_id == NULL) {
        return -1;
    }

    if (result_json_fragment != NULL && result_json_fragment[0] != '\0') {
        return snprintf(
            output,
            (size_t)output_size,
            "{\"schema_version\":1,"
            "\"command_id\":\"%s\","
            "\"device_id\":\"%s\","
            "\"ack_ts\":\"%s\","
            "\"status\":\"%s\","
            "\"result\":%s"
            "}\n",
            command_id,
            identity->device_id,
            ack_ts,
            status,
            result_json_fragment
        );
    }

    return snprintf(
        output,
        (size_t)output_size,
        "{\"schema_version\":1,"
        "\"command_id\":\"%s\","
        "\"device_id\":\"%s\","
        "\"ack_ts\":\"%s\","
        "\"status\":\"%s\""
        "}\n",
        command_id,
        identity->device_id,
        ack_ts,
        status
    );
}
