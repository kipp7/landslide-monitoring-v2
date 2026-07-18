#include "tongxiao_alarm.h"

#include <stdio.h>
#include <string.h>

#include "los_task.h"

static AlarmSnapshot g_snapshot;
static uint32_t g_phase_ms;
static uint32_t g_voice_elapsed_ms;

const char *AlarmState_Name(AlarmState state)
{
    switch (state) {
        case ALARM_STATE_ACTIVE: return "active";
        case ALARM_STATE_SILENCED: return "silenced";
        case ALARM_STATE_ERROR: return "error";
        default: return "idle";
    }
}

const char *AlarmSeverity_Name(AlarmSeverity severity)
{
    switch (severity) {
        case ALARM_SEVERITY_LOW: return "low";
        case ALARM_SEVERITY_MEDIUM: return "medium";
        case ALARM_SEVERITY_HIGH: return "high";
        case ALARM_SEVERITY_CRITICAL: return "critical";
        default: return "normal";
    }
}

const char *AlarmRgb_Name(AlarmRgbMode mode)
{
    switch (mode) {
        case ALARM_RGB_RED_FLASH: return "red_flash";
        case ALARM_RGB_RED_FAST_FLASH: return "red_fast_flash";
        case ALARM_RGB_AMBER_SOLID: return "amber_solid";
        default: return "off";
    }
}

const char *AlarmDisplay_Name(AlarmDisplayMode mode)
{
    switch (mode) {
        case ALARM_DISPLAY_RISK: return "risk";
        case ALARM_DISPLAY_SILENCED: return "silenced";
        case ALARM_DISPLAY_ALL_CLEAR: return "all_clear";
        case ALARM_DISPLAY_SELF_TEST: return "self_test";
        default: return "standby";
    }
}

const char *AlarmPhrase_Name(AlarmPhraseId phrase)
{
    switch (phrase) {
        case ALARM_PHRASE_PREPARE_01: return "PREPARE_01";
        case ALARM_PHRASE_EVACUATE_01: return "EVACUATE_01";
        case ALARM_PHRASE_EVACUATE_REPEAT_01: return "EVACUATE_REPEAT_01";
        case ALARM_PHRASE_ALL_CLEAR_01: return "ALL_CLEAR_01";
        case ALARM_PHRASE_SELF_TEST_01: return "SELF_TEST_01";
        default: return "";
    }
}

void AlarmController_Init(void)
{
    memset(&g_snapshot, 0, sizeof(g_snapshot));
    g_snapshot.desired.state = ALARM_STATE_IDLE;
    g_snapshot.desired.severity = ALARM_SEVERITY_NORMAL;
    g_snapshot.desired.rgb = ALARM_RGB_OFF;
    g_snapshot.desired.display = ALARM_DISPLAY_STANDBY;
    g_phase_ms = 0;
    g_voice_elapsed_ms = 0;

    AlarmOutputs_Init();
    AlarmVoice_Init();
    AlarmDisplay_Init();
    AlarmOutputs_Tick(&g_snapshot.desired, 0);
    AlarmDisplay_Render(&g_snapshot);
    printf("Tongxiao alarm controller ready: silent outputs enforced\n");
}

int AlarmController_ApplyDesired(const AlarmDesiredState *desired, bool allow_voice)
{
    AlarmSnapshot render;
    bool play_voice;

    if (desired == NULL || desired->revision == 0) return -1;

    LOS_TaskLock();
    if (desired->revision <= g_snapshot.desired.revision) {
        LOS_TaskUnlock();
        return 1;
    }
    g_snapshot.desired = *desired;
    g_snapshot.voice_armed = allow_voice && desired->voice_phrase != ALARM_PHRASE_NONE;
    g_phase_ms = 0;
    g_voice_elapsed_ms = 0;
    render = g_snapshot;
    play_voice = g_snapshot.voice_armed;
    LOS_TaskUnlock();

    AlarmOutputs_Tick(&render.desired, 0);
    AlarmDisplay_Render(&render);
    if (play_voice) AlarmVoice_Play(render.desired.voice_phrase);

    printf("Applied alarm desired revision=%llu state=%s severity=%s voice=%s\n",
        (unsigned long long)render.desired.revision,
        AlarmState_Name(render.desired.state),
        AlarmSeverity_Name(render.desired.severity),
        play_voice ? AlarmPhrase_Name(render.desired.voice_phrase) : "suppressed");
    return 0;
}

void AlarmController_SetNetworkStatus(bool wifi_connected, bool mqtt_connected)
{
    AlarmSnapshot render;
    bool changed;

    LOS_TaskLock();
    changed = g_snapshot.wifi_connected != wifi_connected || g_snapshot.mqtt_connected != mqtt_connected;
    g_snapshot.wifi_connected = wifi_connected;
    g_snapshot.mqtt_connected = mqtt_connected;
    render = g_snapshot;
    LOS_TaskUnlock();

    if (changed) AlarmDisplay_Render(&render);
}

void AlarmController_Tick(uint32_t elapsed_ms)
{
    AlarmSnapshot current;
    AlarmPhraseId repeat_phrase = ALARM_PHRASE_NONE;

    LOS_TaskLock();
    g_phase_ms += elapsed_ms;
    if (g_snapshot.voice_armed && g_snapshot.desired.state == ALARM_STATE_ACTIVE &&
        g_snapshot.desired.voice_repeat_seconds > 0) {
        g_voice_elapsed_ms += elapsed_ms;
        if (g_voice_elapsed_ms >= (uint32_t)g_snapshot.desired.voice_repeat_seconds * 1000U) {
            g_voice_elapsed_ms = 0;
            repeat_phrase = g_snapshot.desired.severity == ALARM_SEVERITY_CRITICAL
                ? ALARM_PHRASE_EVACUATE_REPEAT_01
                : g_snapshot.desired.voice_phrase;
        }
    }
    current = g_snapshot;
    LOS_TaskUnlock();

    AlarmOutputs_Tick(&current.desired, g_phase_ms);
    if (repeat_phrase != ALARM_PHRASE_NONE) AlarmVoice_Play(repeat_phrase);
}

void AlarmController_Snapshot(AlarmSnapshot *out)
{
    if (out == NULL) return;
    LOS_TaskLock();
    *out = g_snapshot;
    LOS_TaskUnlock();
}
