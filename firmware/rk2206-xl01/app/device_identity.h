#ifndef APP_DEVICE_IDENTITY_H
#define APP_DEVICE_IDENTITY_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int identity_schema_version;
    int cred_version;
    const char *device_id;
    const char *device_secret;
    const char *install_label;
    const char *legacy_node_label;
} DeviceIdentity;

const DeviceIdentity *DeviceIdentity_Get(void);

#ifdef __cplusplus
}
#endif

#endif // APP_DEVICE_IDENTITY_H
