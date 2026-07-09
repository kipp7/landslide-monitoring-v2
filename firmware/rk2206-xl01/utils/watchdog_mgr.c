/*
 * Watchdog Manager Implementation
 */

#include "watchdog_mgr.h"
#include <stdio.h>
#include "iot_watchdog.h"

#if ENABLE_WATCHDOG

void Watchdog_Init(void)
{
    IoTWatchDogDisable();
    IoTWatchDogEnable(WATCHDOG_TIMEOUT);  // Enable with timeout in seconds
    printf("[OK] Watchdog enabled (timeout: %ds)\n", WATCHDOG_TIMEOUT);
}

void Watchdog_Feed(void)
{
    IoTWatchDogKick();
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

#endif
