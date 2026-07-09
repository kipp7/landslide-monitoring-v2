#include "device_identity.h"
#include "../config/app_config.h"

static const DeviceIdentity kDeviceIdentity = {
    .identity_schema_version = IDENTITY_SCHEMA_VERSION,
    .cred_version = CRED_VERSION,
    .device_id = DEVICE_ID,
    .device_secret = DEVICE_SECRET,
    .install_label = INSTALL_LABEL,
    .legacy_node_label = LEGACY_NODE_LABEL
};

const DeviceIdentity *DeviceIdentity_Get(void)
{
    return &kDeviceIdentity;
}
