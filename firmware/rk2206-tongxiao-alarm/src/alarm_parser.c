#include "tongxiao_alarm.h"

#include <stdio.h>
#include <string.h>

#include "alarm_config.h"
#include "cJSON.h"

static int CopyString(cJSON *object, const char *name, char *target, size_t target_size, bool required)
{
    cJSON *item = cJSON_GetObjectItemCaseSensitive(object, name);
    const char *value;
    if (item == NULL || cJSON_IsNull(item)) {
        if (required) return -1;
        target[0] = '\0';
        return 0;
    }
    value = cJSON_GetStringValue(item);
    if (value == NULL || strlen(value) >= target_size) return -1;
    memcpy(target, value, strlen(value) + 1);
    return 0;
}

static int ParseState(const char *value, AlarmState *out)
{
    if (strcmp(value, "idle") == 0) *out = ALARM_STATE_IDLE;
    else if (strcmp(value, "active") == 0) *out = ALARM_STATE_ACTIVE;
    else if (strcmp(value, "silenced") == 0) *out = ALARM_STATE_SILENCED;
    else return -1;
    return 0;
}

static int ParseSeverity(const char *value, AlarmSeverity *out)
{
    if (strcmp(value, "normal") == 0) *out = ALARM_SEVERITY_NORMAL;
    else if (strcmp(value, "low") == 0) *out = ALARM_SEVERITY_LOW;
    else if (strcmp(value, "medium") == 0) *out = ALARM_SEVERITY_MEDIUM;
    else if (strcmp(value, "high") == 0) *out = ALARM_SEVERITY_HIGH;
    else if (strcmp(value, "critical") == 0) *out = ALARM_SEVERITY_CRITICAL;
    else return -1;
    return 0;
}

static int ParseRgb(const char *value, AlarmRgbMode *out)
{
    if (strcmp(value, "off") == 0) *out = ALARM_RGB_OFF;
    else if (strcmp(value, "red_flash") == 0) *out = ALARM_RGB_RED_FLASH;
    else if (strcmp(value, "red_fast_flash") == 0) *out = ALARM_RGB_RED_FAST_FLASH;
    else if (strcmp(value, "amber_solid") == 0) *out = ALARM_RGB_AMBER_SOLID;
    else return -1;
    return 0;
}

static int ParseDisplay(const char *value, AlarmDisplayMode *out)
{
    if (strcmp(value, "standby") == 0) *out = ALARM_DISPLAY_STANDBY;
    else if (strcmp(value, "risk") == 0) *out = ALARM_DISPLAY_RISK;
    else if (strcmp(value, "silenced") == 0) *out = ALARM_DISPLAY_SILENCED;
    else if (strcmp(value, "all_clear") == 0) *out = ALARM_DISPLAY_ALL_CLEAR;
    else if (strcmp(value, "self_test") == 0) *out = ALARM_DISPLAY_SELF_TEST;
    else return -1;
    return 0;
}

static int ParsePhrase(const char *value, AlarmPhraseId *out)
{
    if (strcmp(value, "PREPARE_01") == 0) *out = ALARM_PHRASE_PREPARE_01;
    else if (strcmp(value, "EVACUATE_01") == 0) *out = ALARM_PHRASE_EVACUATE_01;
    else if (strcmp(value, "EVACUATE_REPEAT_01") == 0) *out = ALARM_PHRASE_EVACUATE_REPEAT_01;
    else if (strcmp(value, "ALL_CLEAR_01") == 0) *out = ALARM_PHRASE_ALL_CLEAR_01;
    else if (strcmp(value, "SELF_TEST_01") == 0) *out = ALARM_PHRASE_SELF_TEST_01;
    else return -1;
    return 0;
}

int AlarmDesired_Parse(const char *json, uint32_t length, AlarmDesiredState *out)
{
    cJSON *root = NULL;
    cJSON *schema;
    cJSON *device;
    cJSON *revision;
    cJSON *state;
    cJSON *severity;
    cJSON *outputs;
    cJSON *buzzer;
    cJSON *motor;
    cJSON *rgb;
    cJSON *display;
    cJSON *voice;
    cJSON *alert;
    int result = -1;

    if (json == NULL || out == NULL || length == 0 || length > 2048) return -1;
    memset(out, 0, sizeof(*out));
    root = cJSON_ParseWithLength(json, length);
    if (root == NULL) goto done;

    schema = cJSON_GetObjectItemCaseSensitive(root, "schema_version");
    device = cJSON_GetObjectItemCaseSensitive(root, "device_id");
    revision = cJSON_GetObjectItemCaseSensitive(root, "revision");
    state = cJSON_GetObjectItemCaseSensitive(root, "state");
    severity = cJSON_GetObjectItemCaseSensitive(root, "severity");
    outputs = cJSON_GetObjectItemCaseSensitive(root, "outputs");
    if (!cJSON_IsNumber(schema) || schema->valueint != 1 ||
        !cJSON_IsString(device) || strcmp(device->valuestring, TONGXIAO_DEVICE_ID) != 0 ||
        !cJSON_IsNumber(revision) || revision->valuedouble < 1 ||
        !cJSON_IsString(state) || !cJSON_IsString(severity) || !cJSON_IsObject(outputs)) goto done;

    out->revision = (uint64_t)revision->valuedouble;
    if (ParseState(state->valuestring, &out->state) != 0 ||
        ParseSeverity(severity->valuestring, &out->severity) != 0) goto done;

    buzzer = cJSON_GetObjectItemCaseSensitive(outputs, "buzzer");
    motor = cJSON_GetObjectItemCaseSensitive(outputs, "motor");
    rgb = cJSON_GetObjectItemCaseSensitive(outputs, "rgb");
    display = cJSON_GetObjectItemCaseSensitive(outputs, "display");
    voice = cJSON_GetObjectItemCaseSensitive(outputs, "voice");
    if (!cJSON_IsBool(buzzer) || !cJSON_IsBool(motor) || !cJSON_IsString(rgb) || !cJSON_IsString(display)) goto done;
    out->buzzer = cJSON_IsTrue(buzzer);
    out->motor = cJSON_IsTrue(motor);
    if (ParseRgb(rgb->valuestring, &out->rgb) != 0 || ParseDisplay(display->valuestring, &out->display) != 0) goto done;

    out->voice_phrase = ALARM_PHRASE_NONE;
    if (voice != NULL && !cJSON_IsNull(voice)) {
        cJSON *phrase = cJSON_GetObjectItemCaseSensitive(voice, "phrase_id");
        cJSON *repeat = cJSON_GetObjectItemCaseSensitive(voice, "repeat_seconds");
        if (!cJSON_IsObject(voice) || !cJSON_IsString(phrase) || !cJSON_IsNumber(repeat) ||
            repeat->valueint < 0 || repeat->valueint > 300 ||
            ParsePhrase(phrase->valuestring, &out->voice_phrase) != 0) goto done;
        out->voice_repeat_seconds = (uint16_t)repeat->valueint;
    }

    alert = cJSON_GetObjectItemCaseSensitive(root, "alert");
    if (alert != NULL && !cJSON_IsNull(alert)) {
        if (!cJSON_IsObject(alert) ||
            CopyString(alert, "alert_id", out->alert_id, sizeof(out->alert_id), false) != 0 ||
            CopyString(alert, "station_id", out->station_id, sizeof(out->station_id), false) != 0 ||
            CopyString(alert, "title", out->title, sizeof(out->title), true) != 0 ||
            CopyString(alert, "message", out->message, sizeof(out->message), true) != 0) goto done;
    }
    result = 0;

done:
    cJSON_Delete(root);
    return result;
}
