#include "tongxiao_alarm.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "MQTTClient.h"
#include "alarm_config.h"
#include "cJSON.h"
#include "config_network.h"
#include "los_task.h"

#define MQTT_BUFFER_BYTES 2048

static unsigned char g_send_buffer[MQTT_BUFFER_BYTES];
static unsigned char g_read_buffer[MQTT_BUFFER_BYTES];
static Network g_network;
static MQTTClient g_client;

static const char *DeviceTimestamp(void)
{
    /* RK2206 has no trusted wall clock before an NTP service is added. */
    return "1970-01-01T00:00:00Z";
}

static int PublishText(const char *topic, const char *payload, bool retained)
{
    MQTTMessage message;
    memset(&message, 0, sizeof(message));
    message.qos = QOS1;
    message.retained = retained ? 1 : 0;
    message.payload = (void *)payload;
    message.payloadlen = strlen(payload);
    return MQTTPublish(&g_client, topic, &message);
}

static void PublishPresence(const char *status)
{
    cJSON *root = cJSON_CreateObject();
    cJSON *meta;
    char *payload;
    if (root == NULL) return;
    cJSON_AddNumberToObject(root, "schema_version", 1);
    cJSON_AddStringToObject(root, "device_id", TONGXIAO_DEVICE_ID);
    cJSON_AddStringToObject(root, "event_ts", DeviceTimestamp());
    cJSON_AddStringToObject(root, "status", status);
    meta = cJSON_AddObjectToObject(root, "meta");
    cJSON_AddStringToObject(meta, "fw", TONGXIAO_FIRMWARE_VERSION);
    cJSON_AddStringToObject(meta, "role", "tongxiao_alarm_terminal");
    payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        PublishText(TONGXIAO_PRESENCE_TOPIC, payload, true);
        cJSON_free(payload);
    }
    cJSON_Delete(root);
}

static void PublishReported(void)
{
    AlarmSnapshot snapshot;
    cJSON *root = cJSON_CreateObject();
    cJSON *outputs;
    char *payload;
    if (root == NULL) return;
    AlarmController_Snapshot(&snapshot);

    cJSON_AddNumberToObject(root, "schema_version", 1);
    cJSON_AddStringToObject(root, "device_id", TONGXIAO_DEVICE_ID);
    cJSON_AddNumberToObject(root, "applied_revision", (double)snapshot.desired.revision);
    cJSON_AddStringToObject(root, "reported_ts", DeviceTimestamp());
    cJSON_AddStringToObject(root, "state", AlarmState_Name(snapshot.desired.state));
    cJSON_AddStringToObject(root, "severity", AlarmSeverity_Name(snapshot.desired.severity));
    outputs = cJSON_AddObjectToObject(root, "outputs");
    cJSON_AddBoolToObject(outputs, "buzzer", snapshot.desired.buzzer);
    cJSON_AddBoolToObject(outputs, "motor", snapshot.desired.motor);
    cJSON_AddStringToObject(outputs, "rgb", AlarmRgb_Name(snapshot.desired.rgb));
    cJSON_AddStringToObject(outputs, "display", AlarmDisplay_Name(snapshot.desired.display));
    if (snapshot.voice_armed && snapshot.desired.voice_phrase != ALARM_PHRASE_NONE)
        cJSON_AddStringToObject(outputs, "voice_phrase_id", AlarmPhrase_Name(snapshot.desired.voice_phrase));
    else
        cJSON_AddNullToObject(outputs, "voice_phrase_id");
    cJSON_AddStringToObject(root, "firmware_version", TONGXIAO_FIRMWARE_VERSION);
    cJSON_AddNullToObject(root, "rssi_dbm");
    cJSON_AddNullToObject(root, "last_error");

    payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        if (PublishText(TONGXIAO_REPORTED_TOPIC, payload, true) != 0) printf("reported publish failed\n");
        cJSON_free(payload);
    }
    cJSON_Delete(root);
}

static void DesiredArrived(MessageData *data)
{
    AlarmDesiredState desired;
    int parse_result;
    int apply_result;
    bool allow_voice;

    parse_result = AlarmDesired_Parse((const char *)data->message->payload,
        (uint32_t)data->message->payloadlen, &desired);
    if (parse_result != 0) {
        printf("Invalid desired payload ignored\n");
        return;
    }

    /* Retained delivery means boot/reconnect restoration and must stay silent. */
    allow_voice = data->message->retained == 0;
    apply_result = AlarmController_ApplyDesired(&desired, allow_voice);
    if (apply_result < 0) printf("Desired revision=%llu failed\n", (unsigned long long)desired.revision);
    else PublishReported();
}

static void ConfigureWifi(void)
{
    static uint8_t mac_address[6] = { 0x00, 0xDC, 0xB6, 0x90, 0x22, 0x06 };
    static unsigned char wifi_mode[] = "STA";
    static unsigned char ssid[] = TONGXIAO_WIFI_SSID;
    static unsigned char password[] = TONGXIAO_WIFI_PASSWORD;
    FlashDeinit();
    FlashInit();
    VendorSet(VENDOR_ID_WIFI_MODE, wifi_mode, 3);
    VendorSet(VENDOR_ID_MAC, mac_address, sizeof(mac_address));
    VendorSet(VENDOR_ID_WIFI_ROUTE_SSID, ssid, sizeof(ssid));
    VendorSet(VENDOR_ID_WIFI_ROUTE_PASSWD, password, sizeof(password));
}

static int ConnectMqtt(void)
{
    static char host[] = TONGXIAO_MQTT_HOST;
    static char client_id[] = TONGXIAO_DEVICE_ID;
    static char username[] = TONGXIAO_MQTT_USERNAME;
    static char password[] = TONGXIAO_MQTT_PASSWORD;
    static char will_topic[] = TONGXIAO_PRESENCE_TOPIC;
    static char will_payload[320];
    MQTTPacket_connectData connect_data = MQTTPacket_connectData_initializer;
    int result;

    snprintf(will_payload, sizeof(will_payload),
        "{\"schema_version\":1,\"device_id\":\"%s\",\"event_ts\":\"%s\","
        "\"status\":\"offline\",\"meta\":{\"fw\":\"%s\",\"role\":\"tongxiao_alarm_terminal\"}}",
        TONGXIAO_DEVICE_ID, DeviceTimestamp(), TONGXIAO_FIRMWARE_VERSION);

    NetworkInit(&g_network);
    result = NetworkConnect(&g_network, host, TONGXIAO_MQTT_PORT);
    if (result != 0) return result;
    MQTTClientInit(&g_client, &g_network, 3000, g_send_buffer, sizeof(g_send_buffer),
        g_read_buffer, sizeof(g_read_buffer));

    connect_data.MQTTVersion = 4;
    connect_data.clientID.cstring = client_id;
    connect_data.username.cstring = username;
    connect_data.password.cstring = password;
    connect_data.keepAliveInterval = TONGXIAO_MQTT_KEEPALIVE_SECONDS;
    connect_data.cleansession = 1;
    connect_data.willFlag = 1;
    connect_data.will.topicName.cstring = will_topic;
    connect_data.will.message.cstring = will_payload;
    connect_data.will.qos = 1;
    connect_data.will.retained = 1;

    result = MQTTConnect(&g_client, &connect_data);
    if (result != 0) return result;
    result = MQTTSubscribe(&g_client, TONGXIAO_DESIRED_TOPIC, QOS1, DesiredArrived);
    if (result != 0) return result;
    return 0;
}

void AlarmMqtt_Run(void)
{
    uint32_t presence_seconds;
    int result;
    ConfigureWifi();

    while (1) {
        AlarmController_SetNetworkStatus(false, false);
        SetWifiModeOff();
        result = SetWifiModeOn();
        if (result != 0) {
            printf("Wi-Fi connect failed SSID=%s code=%d\n", TONGXIAO_WIFI_SSID, result);
            LOS_Msleep(3000);
            continue;
        }
        AlarmController_SetNetworkStatus(true, false);

        result = ConnectMqtt();
        if (result != 0) {
            printf("MQTT connect failed host=%s code=%d\n", TONGXIAO_MQTT_HOST, result);
            NetworkDisconnect(&g_network);
            LOS_Msleep(2000);
            continue;
        }

        printf("MQTT connected topic=%s\n", TONGXIAO_DESIRED_TOPIC);
        AlarmController_SetNetworkStatus(true, true);
        PublishPresence("online");
        PublishReported();
        presence_seconds = 0;

        while (1) {
            result = MQTTYield(&g_client, 1000);
            if (result != 0 && result != 255) break;
            ++presence_seconds;
            if (presence_seconds >= TONGXIAO_PRESENCE_INTERVAL_SECONDS) {
                PublishPresence("online");
                presence_seconds = 0;
            }
        }

        printf("MQTT disconnected code=%d; reconnecting\n", result);
        AlarmController_SetNetworkStatus(true, false);
        MQTTDisconnect(&g_client);
        NetworkDisconnect(&g_network);
        LOS_Msleep(2000);
    }
}
