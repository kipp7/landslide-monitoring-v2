#ifndef TONGXIAO_ALARM_H
#define TONGXIAO_ALARM_H

#include <stdbool.h>
#include <stdint.h>

#define ALARM_ALERT_ID_MAX 64
#define ALARM_STATION_ID_MAX 64
#define ALARM_TITLE_MAX 120
#define ALARM_MESSAGE_MAX 500

typedef enum {
    ALARM_STATE_IDLE = 0,
    ALARM_STATE_ACTIVE,
    ALARM_STATE_SILENCED,
    ALARM_STATE_ERROR
} AlarmState;

typedef enum {
    ALARM_SEVERITY_NORMAL = 0,
    ALARM_SEVERITY_LOW,
    ALARM_SEVERITY_MEDIUM,
    ALARM_SEVERITY_HIGH,
    ALARM_SEVERITY_CRITICAL
} AlarmSeverity;

typedef enum {
    ALARM_RGB_OFF = 0,
    ALARM_RGB_RED_FLASH,
    ALARM_RGB_RED_FAST_FLASH,
    ALARM_RGB_AMBER_SOLID
} AlarmRgbMode;

typedef enum {
    ALARM_DISPLAY_STANDBY = 0,
    ALARM_DISPLAY_RISK,
    ALARM_DISPLAY_SILENCED,
    ALARM_DISPLAY_ALL_CLEAR,
    ALARM_DISPLAY_SELF_TEST
} AlarmDisplayMode;

typedef enum {
    ALARM_PHRASE_NONE = 0,
    ALARM_PHRASE_PREPARE_01,
    ALARM_PHRASE_EVACUATE_01,
    ALARM_PHRASE_EVACUATE_REPEAT_01,
    ALARM_PHRASE_ALL_CLEAR_01,
    ALARM_PHRASE_SELF_TEST_01
} AlarmPhraseId;

typedef struct {
    uint64_t revision;
    AlarmState state;
    AlarmSeverity severity;
    bool buzzer;
    bool motor;
    AlarmRgbMode rgb;
    AlarmDisplayMode display;
    AlarmPhraseId voice_phrase;
    uint16_t voice_repeat_seconds;
    char alert_id[ALARM_ALERT_ID_MAX + 1];
    char station_id[ALARM_STATION_ID_MAX + 1];
    char title[ALARM_TITLE_MAX + 1];
    char message[ALARM_MESSAGE_MAX + 1];
} AlarmDesiredState;

typedef struct {
    AlarmDesiredState desired;
    bool wifi_connected;
    bool mqtt_connected;
    bool voice_armed;
} AlarmSnapshot;

int AlarmDesired_Parse(const char *json, uint32_t length, AlarmDesiredState *out);

void AlarmController_Init(void);
int AlarmController_ApplyDesired(const AlarmDesiredState *desired, bool allow_voice);
void AlarmController_SetNetworkStatus(bool wifi_connected, bool mqtt_connected);
void AlarmController_Tick(uint32_t elapsed_ms);
void AlarmController_Snapshot(AlarmSnapshot *out);

void AlarmOutputs_Init(void);
void AlarmOutputs_Tick(const AlarmDesiredState *desired, uint32_t phase_ms);

void AlarmDisplay_Init(void);
void AlarmDisplay_Render(const AlarmSnapshot *snapshot);

void AlarmVoice_Init(void);
void AlarmVoice_Play(AlarmPhraseId phrase);

const char *AlarmState_Name(AlarmState state);
const char *AlarmSeverity_Name(AlarmSeverity severity);
const char *AlarmRgb_Name(AlarmRgbMode mode);
const char *AlarmDisplay_Name(AlarmDisplayMode mode);
const char *AlarmPhrase_Name(AlarmPhraseId phrase);

void AlarmMqtt_Run(void);

#endif
