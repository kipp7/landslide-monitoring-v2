#include "tongxiao_alarm.h"

#include <stdio.h>
#include <string.h>

#include "alarm_config.h"
#include "los_task.h"

static AlarmSnapshot g_snapshot;
static uint32_t g_phase_ms;
static uint32_t g_voice_elapsed_ms;
static uint32_t g_next_voice_delay_ms;
static uint32_t g_voice_priority_remaining_ms;
static uint32_t g_self_test_remaining_ms;
static uint8_t g_all_clear_repeats_remaining;

#define SELF_TEST_DURATION_MS 3000U
#define CRITICAL_FIRST_REPEAT_DELAY_MS 25000U
#define ALL_CLEAR_REPEAT_INTERVAL_MS 12000U
#define ALL_CLEAR_TOTAL_PLAYS 3U
#define PREPARE_VOICE_PRIORITY_MS 18000U
#define EVACUATE_VOICE_PRIORITY_MS 24000U
#define EVACUATE_REPEAT_VOICE_PRIORITY_MS 8000U

static uint32_t VoicePriorityDurationMs(AlarmPhraseId phrase)
{
    switch (phrase) {
        case ALARM_PHRASE_PREPARE_01: return PREPARE_VOICE_PRIORITY_MS;
        case ALARM_PHRASE_EVACUATE_01: return EVACUATE_VOICE_PRIORITY_MS;
        case ALARM_PHRASE_EVACUATE_REPEAT_01: return EVACUATE_REPEAT_VOICE_PRIORITY_MS;
        default: return 0;
    }
}

static void ConfigureVoiceSchedule(const AlarmDesiredState *desired, bool play_voice)
{
    uint32_t requested_interval_ms;

    g_voice_elapsed_ms = 0;
    g_next_voice_delay_ms = 0;
    g_all_clear_repeats_remaining = 0;
    if (!play_voice || desired == NULL) return;

    requested_interval_ms = (uint32_t)desired->voice_repeat_seconds * 1000U;
    if (desired->state == ALARM_STATE_ACTIVE && requested_interval_ms > 0) {
        g_next_voice_delay_ms = desired->severity == ALARM_SEVERITY_CRITICAL &&
            requested_interval_ms < CRITICAL_FIRST_REPEAT_DELAY_MS
            ? CRITICAL_FIRST_REPEAT_DELAY_MS
            : requested_interval_ms;
    } else if (desired->state == ALARM_STATE_IDLE &&
        desired->voice_phrase == ALARM_PHRASE_ALL_CLEAR_01) {
        g_all_clear_repeats_remaining = ALL_CLEAR_TOTAL_PLAYS - 1U;
        g_next_voice_delay_ms = requested_interval_ms > 0
            ? requested_interval_ms
            : ALL_CLEAR_REPEAT_INTERVAL_MS;
    }
}

static void BuildEffectiveDesired(const AlarmSnapshot *snapshot, AlarmDesiredState *effective,
    bool voice_priority_active)
{
    *effective = snapshot->desired;
    if (snapshot->self_test_active) {
        effective->state = ALARM_STATE_ACTIVE;
        effective->severity = ALARM_SEVERITY_HIGH;
        effective->buzzer = true;
        effective->motor = true;
        effective->rgb = ALARM_RGB_RED_FLASH;
        effective->display = ALARM_DISPLAY_SELF_TEST;
        effective->voice_phrase = ALARM_PHRASE_NONE;
        effective->voice_repeat_seconds = 0;
    } else if ((snapshot->locally_silenced || voice_priority_active) &&
        effective->state == ALARM_STATE_ACTIVE) {
        effective->buzzer = false;
        effective->motor = false;
    }
}

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
    g_next_voice_delay_ms = 0;
    g_voice_priority_remaining_ms = 0;
    g_self_test_remaining_ms = 0;
    g_all_clear_repeats_remaining = 0;

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
    AlarmDesiredState effective;
    bool play_voice;
    bool voice_priority_active;
    uint32_t voice_priority_ms;

    if (desired == NULL || desired->revision == 0) return -1;

    LOS_TaskLock();
    if (desired->revision <= g_snapshot.desired.revision) {
        LOS_TaskUnlock();
        return 1;
    }
    g_snapshot.desired = *desired;
    g_snapshot.voice_armed = allow_voice && TONGXIAO_VOICE_ENABLED &&
        desired->voice_phrase != ALARM_PHRASE_NONE;
    g_snapshot.locally_silenced = false;
    g_snapshot.self_test_active = false;
    g_phase_ms = 0;
    g_self_test_remaining_ms = 0;
    ConfigureVoiceSchedule(desired, g_snapshot.voice_armed);
    voice_priority_ms = g_snapshot.voice_armed
        ? VoicePriorityDurationMs(desired->voice_phrase)
        : 0;
    g_voice_priority_remaining_ms = voice_priority_ms;
    render = g_snapshot;
    play_voice = g_snapshot.voice_armed;
    voice_priority_active = g_voice_priority_remaining_ms > 0;
    LOS_TaskUnlock();

    BuildEffectiveDesired(&render, &effective, voice_priority_active);
    AlarmOutputs_Tick(&effective, 0);
    AlarmDisplay_Render(&render);
    if (play_voice) {
        if (voice_priority_ms > 0) {
            printf("Voice priority active phrase=%s quiet_ms=%u\n",
                AlarmPhrase_Name(render.desired.voice_phrase), (unsigned int)voice_priority_ms);
        }
        AlarmVoice_Play(render.desired.voice_phrase);
    }

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
    AlarmDesiredState effective;
    AlarmPhraseId repeat_phrase = ALARM_PHRASE_NONE;
    bool render_changed = false;
    bool voice_priority_active;
    uint32_t voice_priority_ms = 0;

    LOS_TaskLock();
    g_phase_ms += elapsed_ms;
    if (g_voice_priority_remaining_ms > 0) {
        g_voice_priority_remaining_ms = elapsed_ms >= g_voice_priority_remaining_ms
            ? 0
            : g_voice_priority_remaining_ms - elapsed_ms;
    }
    if (g_snapshot.self_test_active) {
        if (elapsed_ms >= g_self_test_remaining_ms) {
            g_self_test_remaining_ms = 0;
            g_snapshot.self_test_active = false;
            g_phase_ms = 0;
            render_changed = true;
        } else {
            g_self_test_remaining_ms -= elapsed_ms;
        }
    }
    if (g_snapshot.voice_armed && g_next_voice_delay_ms > 0) {
        g_voice_elapsed_ms += elapsed_ms;
        if (g_voice_elapsed_ms >= g_next_voice_delay_ms) {
            g_voice_elapsed_ms = 0;
            if (g_snapshot.desired.state == ALARM_STATE_ACTIVE &&
                g_snapshot.desired.voice_repeat_seconds > 0) {
                repeat_phrase = g_snapshot.desired.severity == ALARM_SEVERITY_CRITICAL
                    ? ALARM_PHRASE_EVACUATE_REPEAT_01
                    : g_snapshot.desired.voice_phrase;
                voice_priority_ms = VoicePriorityDurationMs(repeat_phrase);
                g_voice_priority_remaining_ms = voice_priority_ms;
                g_next_voice_delay_ms = (uint32_t)g_snapshot.desired.voice_repeat_seconds * 1000U;
            } else if (g_snapshot.desired.state == ALARM_STATE_IDLE &&
                g_snapshot.desired.voice_phrase == ALARM_PHRASE_ALL_CLEAR_01 &&
                g_all_clear_repeats_remaining > 0) {
                repeat_phrase = ALARM_PHRASE_ALL_CLEAR_01;
                --g_all_clear_repeats_remaining;
                g_next_voice_delay_ms = g_all_clear_repeats_remaining > 0
                    ? (uint32_t)g_snapshot.desired.voice_repeat_seconds * 1000U
                    : 0;
                if (g_next_voice_delay_ms == 0 && g_all_clear_repeats_remaining > 0) {
                    g_next_voice_delay_ms = ALL_CLEAR_REPEAT_INTERVAL_MS;
                }
            } else {
                g_next_voice_delay_ms = 0;
            }
        }
    }
    current = g_snapshot;
    voice_priority_active = g_voice_priority_remaining_ms > 0;
    LOS_TaskUnlock();

    BuildEffectiveDesired(&current, &effective, voice_priority_active);
    AlarmOutputs_Tick(&effective, g_phase_ms);
    if (render_changed) AlarmDisplay_Render(&current);
    if (repeat_phrase != ALARM_PHRASE_NONE) {
        if (voice_priority_ms > 0) {
            printf("Voice priority active phrase=%s quiet_ms=%u\n",
                AlarmPhrase_Name(repeat_phrase), (unsigned int)voice_priority_ms);
        }
        AlarmVoice_Play(repeat_phrase);
    }
}

void AlarmController_Snapshot(AlarmSnapshot *out)
{
    if (out == NULL) return;
    LOS_TaskLock();
    *out = g_snapshot;
    LOS_TaskUnlock();
}

void AlarmController_HandleButton(AlarmButton button)
{
    AlarmSnapshot render;
    AlarmDesiredState effective;
    bool changed = false;
    bool voice_priority_active;

    LOS_TaskLock();
    switch (button) {
        case ALARM_BUTTON_UP:
            if (g_snapshot.desired.state == ALARM_STATE_IDLE) {
                g_snapshot.self_test_active = true;
                g_snapshot.voice_armed = false;
                g_voice_elapsed_ms = 0;
                g_next_voice_delay_ms = 0;
                g_voice_priority_remaining_ms = 0;
                g_all_clear_repeats_remaining = 0;
                g_self_test_remaining_ms = SELF_TEST_DURATION_MS;
                g_phase_ms = 0;
                changed = true;
            }
            break;
        case ALARM_BUTTON_DOWN:
            if (g_snapshot.self_test_active) {
                g_snapshot.self_test_active = false;
                g_self_test_remaining_ms = 0;
                g_phase_ms = 0;
                changed = true;
            }
            break;
        case ALARM_BUTTON_LEFT:
            if (g_snapshot.desired.state == ALARM_STATE_ACTIVE && !g_snapshot.locally_silenced) {
                g_snapshot.locally_silenced = true;
                g_snapshot.voice_armed = false;
                g_voice_elapsed_ms = 0;
                g_next_voice_delay_ms = 0;
                g_voice_priority_remaining_ms = 0;
                changed = true;
            }
            break;
        case ALARM_BUTTON_RIGHT:
            if (g_snapshot.desired.state == ALARM_STATE_ACTIVE && g_snapshot.locally_silenced) {
                g_snapshot.locally_silenced = false;
                g_phase_ms = 0;
                changed = true;
            }
            break;
        default:
            break;
    }
    render = g_snapshot;
    voice_priority_active = g_voice_priority_remaining_ms > 0;
    LOS_TaskUnlock();

    if (!changed) {
        printf("Button action ignored for current alarm state\n");
        return;
    }
    BuildEffectiveDesired(&render, &effective, voice_priority_active);
    AlarmOutputs_Tick(&effective, 0);
    AlarmDisplay_Render(&render);
    printf("Local controls updated: silenced=%d self_test=%d\n",
        render.locally_silenced, render.self_test_active);
}
