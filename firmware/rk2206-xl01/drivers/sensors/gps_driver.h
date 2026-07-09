/*
 * GPS Module Driver (current source of truth)
 * UART-based GPS with NMEA protocol parsing.
 *
 * Current project truth:
 * - This file is the only GPS implementation that should be compiled.
 * - Current UART truth: GPS_UART_ID = EUART0_M0 (PB6/PB7).
 * - Historical alternatives such as gps_module.* are deprecated and must not
 *   be used as the active implementation without a new board-level decision.
 */

#ifndef DRIVERS_SENSORS_GPS_DRIVER_H
#define DRIVERS_SENSORS_GPS_DRIVER_H

/**
 * Initialize GPS module
 * @return 0 on success, negative on error
 */
int GPS_Init(void);

/**
 * Poll GPS UART for new data (call regularly from main loop)
 */
void GPS_Poll(void);

/**
 * Read GPS coordinates
 * @param lat Output: latitude in decimal degrees
 * @param lon Output: longitude in decimal degrees
 * @return 0 if GPS has fix, negative if no fix yet
 */
int GPS_Read(float *lat, float *lon);

#endif // DRIVERS_SENSORS_GPS_DRIVER_H
