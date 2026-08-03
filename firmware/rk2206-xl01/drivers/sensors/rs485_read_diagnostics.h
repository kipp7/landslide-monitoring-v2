#ifndef DRIVERS_SENSORS_RS485_READ_DIAGNOSTICS_H
#define DRIVERS_SENSORS_RS485_READ_DIAGNOSTICS_H

#include <stdint.h>
#include <stddef.h>

#include "rs485_modbus.h"

#define FIELD_RS485_PATH_COUNT 4U
#define FIELD_RS485_PATH_SOIL_INDEX 0U
#define FIELD_RS485_PATH_SOIL_EC_INDEX 1U
#define FIELD_RS485_PATH_TILT_INDEX 2U
#define FIELD_RS485_PATH_RAIN_INDEX 3U

#define FIELD_RS485_PATH_SOIL_MASK (1U << FIELD_RS485_PATH_SOIL_INDEX)
#define FIELD_RS485_PATH_SOIL_EC_MASK (1U << FIELD_RS485_PATH_SOIL_EC_INDEX)
#define FIELD_RS485_PATH_TILT_MASK (1U << FIELD_RS485_PATH_TILT_INDEX)
#define FIELD_RS485_PATH_RAIN_MASK (1U << FIELD_RS485_PATH_RAIN_INDEX)
#define FIELD_RS485_PATH_ALL_MASK ((1U << FIELD_RS485_PATH_COUNT) - 1U)

#define FIELD_RS485_EVENT_FIRST_FAILURE (1U << 0)
#define FIELD_RS485_EVENT_RETRY_RECOVERED (1U << 1)
#define FIELD_RS485_EVENT_FINAL_FAILURE (1U << 2)
#define FIELD_RS485_EVENT_RECOVERED_AFTER_FINAL (1U << 3)
#define FIELD_RS485_EVENT_SKIPPED (1U << 4)

typedef struct {
    uint8_t enabled;
    uint8_t attempted;
    uint8_t attempts;
    uint8_t reserved;
    int8_t first_status;
    int8_t final_status;
    uint8_t reserved_tail[2];
} FieldRs485PathCycleDiagnostics;

typedef struct {
    uint32_t completed_uptime_s;
    uint32_t duration_ms;
    uint8_t enabled_mask;
    uint8_t valid_mask;
    uint8_t reserved[2];
    FieldRs485PathCycleDiagnostics paths[FIELD_RS485_PATH_COUNT];
} FieldRs485CycleDiagnostics;

typedef struct {
    uint32_t cycles;
    uint32_t attempts;
    uint32_t first_attempt_failures;
    uint32_t retry_recoveries;
    uint32_t final_failures;
    uint32_t skipped_cycles;
    uint32_t consecutive_final_failures;
    uint32_t last_event_uptime_s;
    int8_t last_first_status;
    int8_t last_final_status;
    uint8_t last_attempts;
    uint8_t last_event_flags;
} FieldRs485PathRuntimeDiagnostics;

typedef struct {
    uint32_t completed_cycles;
    uint32_t last_completed_uptime_s;
    uint32_t last_duration_ms;
    uint32_t max_duration_ms;
    uint8_t enabled_mask;
    uint8_t current_valid_mask;
    uint8_t reserved[2];
    FieldRs485PathRuntimeDiagnostics paths[FIELD_RS485_PATH_COUNT];
} FieldRs485RuntimeDiagnostics;

static inline uint32_t FieldRs485_SaturatingAddU32(uint32_t value, uint32_t increment)
{
    if (UINT32_MAX - value < increment) {
        return UINT32_MAX;
    }
    return value + increment;
}

static inline void FieldRs485_PathCycleInit(
    FieldRs485PathCycleDiagnostics *path,
    int enabled)
{
    if (path == NULL) {
        return;
    }
    path->enabled = enabled ? 1U : 0U;
    path->attempted = 0U;
    path->attempts = 0U;
    path->reserved = 0U;
    path->first_status = (int8_t)RS485_MODBUS_ERR_INVALID;
    path->final_status = (int8_t)RS485_MODBUS_ERR_INVALID;
    path->reserved_tail[0] = 0U;
    path->reserved_tail[1] = 0U;
}

static inline void FieldRs485_PathCycleRecordAttempt(
    FieldRs485PathCycleDiagnostics *path,
    int status)
{
    if (path == NULL || !path->enabled) {
        return;
    }
    if (!path->attempted) {
        path->attempted = 1U;
        path->first_status = (int8_t)status;
    }
    if (path->attempts != UINT8_MAX) {
        path->attempts++;
    }
    path->final_status = (int8_t)status;
}

static inline int FieldRs485_CycleHasFinalFailure(
    const FieldRs485CycleDiagnostics *cycle)
{
    unsigned int index;

    if (cycle == NULL) {
        return 0;
    }
    for (index = 0U; index < FIELD_RS485_PATH_COUNT; ++index) {
        const FieldRs485PathCycleDiagnostics *path = &cycle->paths[index];
        if (path->enabled && path->attempted && path->final_status != RS485_MODBUS_OK) {
            return 1;
        }
    }
    return 0;
}

static inline void FieldRs485_RuntimeDiagnosticsRecordCycle(
    FieldRs485RuntimeDiagnostics *runtime,
    const FieldRs485CycleDiagnostics *cycle)
{
    unsigned int index;

    if (runtime == NULL || cycle == NULL) {
        return;
    }

    runtime->completed_cycles = FieldRs485_SaturatingAddU32(runtime->completed_cycles, 1U);
    runtime->last_completed_uptime_s = cycle->completed_uptime_s;
    runtime->last_duration_ms = cycle->duration_ms;
    if (cycle->duration_ms > runtime->max_duration_ms) {
        runtime->max_duration_ms = cycle->duration_ms;
    }
    runtime->enabled_mask = cycle->enabled_mask & FIELD_RS485_PATH_ALL_MASK;
    runtime->current_valid_mask = cycle->valid_mask & runtime->enabled_mask;

    for (index = 0U; index < FIELD_RS485_PATH_COUNT; ++index) {
        const FieldRs485PathCycleDiagnostics *source = &cycle->paths[index];
        FieldRs485PathRuntimeDiagnostics *target = &runtime->paths[index];
        uint8_t event_flags = 0U;

        if (!source->enabled || (runtime->enabled_mask & (1U << index)) == 0U) {
            continue;
        }

        target->cycles = FieldRs485_SaturatingAddU32(target->cycles, 1U);
        if (!source->attempted || source->attempts == 0U) {
            target->skipped_cycles = FieldRs485_SaturatingAddU32(target->skipped_cycles, 1U);
            /* Preserve the most recent real final failure while a dependent path
             * is deliberately skipped during its reprobe backoff. */
            if ((target->last_event_flags & FIELD_RS485_EVENT_FINAL_FAILURE) == 0U) {
                event_flags = FIELD_RS485_EVENT_SKIPPED;
            }
        } else {
            target->attempts = FieldRs485_SaturatingAddU32(target->attempts, source->attempts);
            if (source->first_status != RS485_MODBUS_OK) {
                target->first_attempt_failures =
                    FieldRs485_SaturatingAddU32(target->first_attempt_failures, 1U);
                event_flags |= FIELD_RS485_EVENT_FIRST_FAILURE;
            }

            if (source->final_status == RS485_MODBUS_OK) {
                if (source->first_status != RS485_MODBUS_OK) {
                    target->retry_recoveries =
                        FieldRs485_SaturatingAddU32(target->retry_recoveries, 1U);
                    event_flags |= FIELD_RS485_EVENT_RETRY_RECOVERED;
                }
                if (target->consecutive_final_failures > 0U) {
                    event_flags |= FIELD_RS485_EVENT_RECOVERED_AFTER_FINAL;
                }
                target->consecutive_final_failures = 0U;
            } else {
                target->final_failures = FieldRs485_SaturatingAddU32(target->final_failures, 1U);
                target->consecutive_final_failures =
                    FieldRs485_SaturatingAddU32(target->consecutive_final_failures, 1U);
                event_flags |= FIELD_RS485_EVENT_FINAL_FAILURE;
            }
        }

        if (event_flags != 0U) {
            target->last_event_uptime_s = cycle->completed_uptime_s;
            target->last_first_status = source->first_status;
            target->last_final_status = source->final_status;
            target->last_attempts = source->attempts;
            target->last_event_flags = event_flags;
        }
    }
}

#endif // DRIVERS_SENSORS_RS485_READ_DIAGNOSTICS_H
