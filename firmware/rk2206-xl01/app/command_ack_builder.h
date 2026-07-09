#ifndef APP_COMMAND_ACK_BUILDER_H
#define APP_COMMAND_ACK_BUILDER_H

#ifdef __cplusplus
extern "C" {
#endif

int BuildDeviceCommandAckV1(
    const char *command_id,
    const char *status,
    const char *result_json_fragment,
    const char *ack_ts,
    char *output,
    int output_size
);

#ifdef __cplusplus
}
#endif

#endif // APP_COMMAND_ACK_BUILDER_H
