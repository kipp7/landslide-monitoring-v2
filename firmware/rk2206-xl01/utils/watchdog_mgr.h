/*
 * Watchdog Manager
 * System stability and watchdog management
 */

#ifndef UTILS_WATCHDOG_MGR_H
#define UTILS_WATCHDOG_MGR_H

#include "../config/app_config.h"

/**
 * Initialize watchdog (if enabled)
 */
void Watchdog_Init(void);

/**
 * Feed the watchdog (if enabled)
 */
void Watchdog_Feed(void);

/**
 * Whether the current build can perform a watchdog-backed restart.
 */
int Watchdog_RebootSupported(void);

/**
 * Arm a watchdog-backed reboot and stop further feeding.
 * Returns the effective scheduled delay in milliseconds, or 0 when unsupported.
 */
unsigned int Watchdog_RequestReboot(unsigned int delay_ms);

#endif // UTILS_WATCHDOG_MGR_H
