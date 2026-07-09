#ifndef APP_DEVICE_COMMAND_PARSER_H
#define APP_DEVICE_COMMAND_PARSER_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char command_id[64];
    char device_id[64];
    char command_type[64];
    int has_sampling_s;
    int sampling_s;
    int has_report_interval_s;
    int report_interval_s;
    int has_interval_seconds;
    int interval_seconds;
} DeviceCommandMessage;

int ParseDeviceCommandV1(const char *json, DeviceCommandMessage *out);

#ifdef __cplusplus
}
#endif

#endif // APP_DEVICE_COMMAND_PARSER_H
