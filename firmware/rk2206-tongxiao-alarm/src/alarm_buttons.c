#include "tongxiao_alarm.h"

#include <stdio.h>

#include "iot_adc.h"
#include "iot_errno.h"

#define BUTTON_ADC_CHANNEL 7
#define BUTTON_DEBOUNCE_MS 80U

#define BUTTON_UP_MAX 155U
#define BUTTON_RIGHT_MAX 310U
#define BUTTON_DOWN_MAX 465U
#define BUTTON_LEFT_MAX 992U

static bool g_buttons_ready;
static AlarmButton g_candidate;
static AlarmButton g_stable;
static uint32_t g_candidate_ms;

static AlarmButton DecodeButton(unsigned int adc_value)
{
    if (adc_value <= BUTTON_UP_MAX) return ALARM_BUTTON_UP;
    if (adc_value <= BUTTON_RIGHT_MAX) return ALARM_BUTTON_RIGHT;
    if (adc_value <= BUTTON_DOWN_MAX) return ALARM_BUTTON_DOWN;
    if (adc_value <= BUTTON_LEFT_MAX) return ALARM_BUTTON_LEFT;
    return ALARM_BUTTON_NONE;
}

static const char *ButtonName(AlarmButton button)
{
    switch (button) {
        case ALARM_BUTTON_UP: return "up/self-test";
        case ALARM_BUTTON_DOWN: return "down/stop-test";
        case ALARM_BUTTON_LEFT: return "left/local-silence";
        case ALARM_BUTTON_RIGHT: return "right/resume";
        default: return "released";
    }
}

void AlarmButtons_Init(void)
{
    g_candidate = ALARM_BUTTON_NONE;
    g_stable = ALARM_BUTTON_NONE;
    g_candidate_ms = 0;
    g_buttons_ready = IoTAdcInit(BUTTON_ADC_CHANNEL) == IOT_SUCCESS;
    if (g_buttons_ready) printf("ADC buttons ready on channel %u\n", BUTTON_ADC_CHANNEL);
    else printf("ADC button initialization failed\n");
}

void AlarmButtons_Tick(uint32_t elapsed_ms)
{
    unsigned int adc_value;
    AlarmButton sampled;

    if (!g_buttons_ready) return;
    if (IoTAdcGetVal(BUTTON_ADC_CHANNEL, &adc_value) != IOT_SUCCESS) return;
    sampled = DecodeButton(adc_value);

    if (sampled != g_candidate) {
        g_candidate = sampled;
        g_candidate_ms = 0;
        return;
    }

    if (g_candidate_ms < BUTTON_DEBOUNCE_MS) {
        g_candidate_ms += elapsed_ms;
        if (g_candidate_ms < BUTTON_DEBOUNCE_MS) return;
    }

    if (g_stable == g_candidate) return;
    g_stable = g_candidate;
    if (g_stable != ALARM_BUTTON_NONE) {
        printf("Button pressed: %s adc=%u\n", ButtonName(g_stable), adc_value);
        AlarmController_HandleButton(g_stable);
    }
}
