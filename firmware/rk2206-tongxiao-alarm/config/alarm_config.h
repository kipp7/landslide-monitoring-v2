#ifndef TONGXIAO_ALARM_CONFIG_H
#define TONGXIAO_ALARM_CONFIG_H

/* Deployment-specific network values are injected by the local build script. */
#define TONGXIAO_WIFI_SSID ""
#define TONGXIAO_WIFI_PASSWORD ""

#define TONGXIAO_MQTT_HOST ""
#define TONGXIAO_MQTT_PORT 1883

#define TONGXIAO_DEVICE_ID "00000000-0000-4000-8000-000000022206"
#define TONGXIAO_MQTT_USERNAME TONGXIAO_DEVICE_ID
#define TONGXIAO_MQTT_PASSWORD ""

#define TONGXIAO_FIRMWARE_VERSION "1.2.3"
#define TONGXIAO_MQTT_KEEPALIVE_SECONDS 30
#define TONGXIAO_PRESENCE_INTERVAL_SECONDS 30

/*
 * Leave disabled until the SU03-T project has power-on/wake replies removed
 * and a cold-boot silence test has passed. No UART initialization occurs at 0.
 */
#define TONGXIAO_VOICE_ENABLED 0

#define TONGXIAO_DESIRED_TOPIC "alarm/desired/" TONGXIAO_DEVICE_ID
#define TONGXIAO_REPORTED_TOPIC "alarm/reported/" TONGXIAO_DEVICE_ID
#define TONGXIAO_PRESENCE_TOPIC "presence/" TONGXIAO_DEVICE_ID

#endif
