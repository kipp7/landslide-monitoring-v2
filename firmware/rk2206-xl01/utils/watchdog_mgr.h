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

#endif // UTILS_WATCHDOG_MGR_H
