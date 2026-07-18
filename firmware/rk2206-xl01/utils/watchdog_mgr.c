/*
 * Watchdog Manager Implementation
 */

#include "watchdog_mgr.h"
#include <stdio.h>
#include "iot_watchdog.h"

#if ENABLE_WATCHDOG

static volatile int g_watchdog_feed_suspended = 0;
static volatile unsigned int g_watchdog_reboot_delay_ms = 0;

void Watchdog_Init(void)
{
    g_watchdog_feed_suspended = 0;
    g_watchdog_reboot_delay_ms = 0;
    IoTWatchDogDisable();
    IoTWatchDogEnable(WATCHDOG_TIMEOUT);  // Enable with timeout in seconds
    printf("[OK] Watchdog enabled (timeout: %ds)\n", WATCHDOG_TIMEOUT);
}

void Watchdog_Feed(void)
{
    if (g_watchdog_feed_suspended) {
        return;
    }
    IoTWatchDogKick();
}

int Watchdog_RebootSupported(void)
{
    return 1;
}

unsigned int Watchdog_RequestReboot(unsigned int delay_ms)
{
    unsigned int timeout_s;

    if (delay_ms == 0U) {
        delay_ms = 1000U;
    }

    timeout_s = (delay_ms + 999U) / 1000U;
    if (timeout_s == 0U) {
        timeout_s = 1U;
    }

    g_watchdog_reboot_delay_ms = timeout_s * 1000U;
    g_watchdog_feed_suspended = 1;

    IoTWatchDogDisable();
    IoTWatchDogEnable(timeout_s);

    printf("[REBOOT] watchdog reset armed delay_ms=%u\n", g_watchdog_reboot_delay_ms);
    return g_watchdog_reboot_delay_ms;
}

#else

// Watchdog disabled - dummy implementations
void Watchdog_Init(void)
{
    // No-op
}

void Watchdog_Feed(void)
{
    // No-op
}

int Watchdog_RebootSupported(void)
{
    return 0;
}

unsigned int Watchdog_RequestReboot(unsigned int delay_ms)
{
    (void)delay_ms;
    return 0U;
}

#endif
