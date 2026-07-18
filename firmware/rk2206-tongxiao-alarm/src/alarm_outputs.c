#include "tongxiao_alarm.h"

#include <stdio.h>

#include "iot_pwm.h"

#define BUZZER_PWM EPWMDEV_PWM5_M0
#define MOTOR_PWM EPWMDEV_PWM6_M0
#define RGB_RED_PWM EPWMDEV_PWM1_M1
#define RGB_GREEN_PWM EPWMDEV_PWM7_M1
#define RGB_BLUE_PWM EPWMDEV_PWM0_M1

#define BUZZER_DUTY 50U
#define BUZZER_FREQUENCY_HZ 2000U
#define MOTOR_DUTY 70U
#define MOTOR_FREQUENCY_HZ 1000U
#define MOTOR_START_DELAY_MS 100U

static bool g_buzzer_on;
static bool g_motor_on;
static bool g_red_on;
static bool g_green_on;
static bool g_blue_on;

static void SetPwm(unsigned int port, bool enabled, unsigned int duty, unsigned int frequency, bool *current)
{
    if (*current == enabled) return;
    if (enabled) {
        if (IoTPwmStart(port, duty, frequency) != 0) printf("IoTPwmStart failed port=%u\n", port);
    } else {
        if (IoTPwmStop(port) != 0) printf("IoTPwmStop failed port=%u\n", port);
    }
    *current = enabled;
}

static void SetRgb(bool red, bool green, bool blue)
{
    SetPwm(RGB_RED_PWM, red, 70, 1000, &g_red_on);
    SetPwm(RGB_GREEN_PWM, green, 35, 1000, &g_green_on);
    SetPwm(RGB_BLUE_PWM, blue, 50, 1000, &g_blue_on);
}

void AlarmOutputs_Init(void)
{
    unsigned int ports[] = { BUZZER_PWM, MOTOR_PWM, RGB_RED_PWM, RGB_GREEN_PWM, RGB_BLUE_PWM };
    unsigned int i;
    for (i = 0; i < sizeof(ports) / sizeof(ports[0]); ++i) {
        if (IoTPwmInit(ports[i]) != 0) printf("IoTPwmInit failed port=%u\n", ports[i]);
        IoTPwmStop(ports[i]);
    }
    g_buzzer_on = false;
    g_motor_on = false;
    g_red_on = false;
    g_green_on = false;
    g_blue_on = false;
}

void AlarmOutputs_Tick(const AlarmDesiredState *desired, uint32_t phase_ms)
{
    bool motor_pulse_on;
    bool pulse_on;
    uint32_t phase_in_period;
    uint32_t period_ms;

    if (desired == NULL) return;
    if (desired->state == ALARM_STATE_SILENCED) {
        SetPwm(BUZZER_PWM, false, BUZZER_DUTY, BUZZER_FREQUENCY_HZ, &g_buzzer_on);
        SetPwm(MOTOR_PWM, false, MOTOR_DUTY, MOTOR_FREQUENCY_HZ, &g_motor_on);
        SetRgb(true, true, false);
        return;
    }
    if (desired->state != ALARM_STATE_ACTIVE) {
        SetPwm(BUZZER_PWM, false, BUZZER_DUTY, BUZZER_FREQUENCY_HZ, &g_buzzer_on);
        SetPwm(MOTOR_PWM, false, MOTOR_DUTY, MOTOR_FREQUENCY_HZ, &g_motor_on);
        SetRgb(false, false, false);
        return;
    }

    period_ms = desired->severity == ALARM_SEVERITY_CRITICAL ? 400U : 1000U;
    phase_in_period = phase_ms % period_ms;
    pulse_on = phase_in_period < (period_ms / 2U);
    /* Give the buzzer a clean attack before the motor's startup current reaches the shared rail. */
    motor_pulse_on = pulse_on && phase_in_period >= MOTOR_START_DELAY_MS;
    SetPwm(BUZZER_PWM, desired->buzzer && pulse_on, BUZZER_DUTY, BUZZER_FREQUENCY_HZ, &g_buzzer_on);
    SetPwm(MOTOR_PWM, desired->motor && motor_pulse_on, MOTOR_DUTY, MOTOR_FREQUENCY_HZ, &g_motor_on);

    if (desired->rgb == ALARM_RGB_AMBER_SOLID) SetRgb(true, true, false);
    else if (desired->rgb == ALARM_RGB_OFF) SetRgb(false, false, false);
    else SetRgb(pulse_on, false, false);
}
