#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "../drivers/sensors/rs485_read_diagnostics.h"
#include "../drivers/sensors/rs485_read_retry_policy.h"

static void InitCycle(FieldRs485CycleDiagnostics *cycle, uint32_t uptime_s)
{
    memset(cycle, 0, sizeof(*cycle));
    cycle->completed_uptime_s = uptime_s;
    cycle->duration_ms = 1760U;
    cycle->enabled_mask =
        FIELD_RS485_PATH_SOIL_MASK |
        FIELD_RS485_PATH_SOIL_EC_MASK |
        FIELD_RS485_PATH_TILT_MASK;
    FieldRs485_PathCycleInit(&cycle->paths[FIELD_RS485_PATH_SOIL_INDEX], 1);
    FieldRs485_PathCycleInit(&cycle->paths[FIELD_RS485_PATH_SOIL_EC_INDEX], 1);
    FieldRs485_PathCycleInit(&cycle->paths[FIELD_RS485_PATH_TILT_INDEX], 1);
    FieldRs485_PathCycleInit(&cycle->paths[FIELD_RS485_PATH_RAIN_INDEX], 0);
}

int main(void)
{
    FieldRs485CycleDiagnostics cycle;
    FieldRs485RuntimeDiagnostics runtime;
    FieldRs485PathCycleDiagnostics disabled;

    memset(&runtime, 0, sizeof(runtime));
    InitCycle(&cycle, 100U);

    FieldRs485_PathCycleRecordAttempt(
        &cycle.paths[FIELD_RS485_PATH_SOIL_INDEX], RS485_MODBUS_ERR_TIMEOUT);
    FieldRs485_PathCycleRecordAttempt(
        &cycle.paths[FIELD_RS485_PATH_SOIL_INDEX], RS485_MODBUS_OK);
    cycle.valid_mask |= FIELD_RS485_PATH_SOIL_MASK;

    FieldRs485_PathCycleRecordAttempt(
        &cycle.paths[FIELD_RS485_PATH_SOIL_EC_INDEX], RS485_MODBUS_ERR_CRC);
    FieldRs485_PathCycleRecordAttempt(
        &cycle.paths[FIELD_RS485_PATH_SOIL_EC_INDEX], RS485_MODBUS_ERR_TIMEOUT);

    FieldRs485_PathCycleRecordAttempt(
        &cycle.paths[FIELD_RS485_PATH_TILT_INDEX], RS485_MODBUS_ERR_ADDR);
    assert(!RS485_ReadShouldRetry(RS485_MODBUS_ERR_ADDR, 0U, 1U));
    assert(FieldRs485_CycleHasFinalFailure(&cycle));

    FieldRs485_RuntimeDiagnosticsRecordCycle(&runtime, &cycle);
    assert(runtime.completed_cycles == 1U);
    assert(runtime.last_completed_uptime_s == 100U);
    assert(runtime.last_duration_ms == 1760U && runtime.max_duration_ms == 1760U);
    assert(runtime.current_valid_mask == FIELD_RS485_PATH_SOIL_MASK);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].attempts == 2U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].first_attempt_failures == 1U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].retry_recoveries == 1U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].final_failures == 0U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].last_event_flags ==
           (FIELD_RS485_EVENT_FIRST_FAILURE | FIELD_RS485_EVENT_RETRY_RECOVERED));
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_EC_INDEX].final_failures == 1U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_EC_INDEX].consecutive_final_failures == 1U);
    assert(runtime.paths[FIELD_RS485_PATH_TILT_INDEX].attempts == 1U);
    assert(runtime.paths[FIELD_RS485_PATH_TILT_INDEX].final_failures == 1U);

    InitCycle(&cycle, 103U);
    cycle.duration_ms = 240U;
    FieldRs485_PathCycleRecordAttempt(
        &cycle.paths[FIELD_RS485_PATH_SOIL_INDEX], RS485_MODBUS_OK);
    FieldRs485_PathCycleRecordAttempt(
        &cycle.paths[FIELD_RS485_PATH_TILT_INDEX], RS485_MODBUS_OK);
    cycle.valid_mask = FIELD_RS485_PATH_SOIL_MASK | FIELD_RS485_PATH_TILT_MASK;
    assert(!FieldRs485_CycleHasFinalFailure(&cycle));
    FieldRs485_RuntimeDiagnosticsRecordCycle(&runtime, &cycle);

    assert(runtime.completed_cycles == 2U);
    assert(runtime.last_duration_ms == 240U && runtime.max_duration_ms == 1760U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_EC_INDEX].skipped_cycles == 1U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_EC_INDEX].consecutive_final_failures == 1U);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_EC_INDEX].last_event_flags ==
           (FIELD_RS485_EVENT_FIRST_FAILURE | FIELD_RS485_EVENT_FINAL_FAILURE));
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_EC_INDEX].last_event_uptime_s == 100U);
    assert(runtime.paths[FIELD_RS485_PATH_TILT_INDEX].consecutive_final_failures == 0U);
    assert(runtime.paths[FIELD_RS485_PATH_TILT_INDEX].last_event_flags ==
           FIELD_RS485_EVENT_RECOVERED_AFTER_FINAL);
    assert(runtime.paths[FIELD_RS485_PATH_TILT_INDEX].last_event_uptime_s == 103U);

    runtime.completed_cycles = UINT32_MAX;
    runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].cycles = UINT32_MAX;
    runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].attempts = UINT32_MAX;
    FieldRs485_RuntimeDiagnosticsRecordCycle(&runtime, &cycle);
    assert(runtime.completed_cycles == UINT32_MAX);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].cycles == UINT32_MAX);
    assert(runtime.paths[FIELD_RS485_PATH_SOIL_INDEX].attempts == UINT32_MAX);

    FieldRs485_PathCycleInit(&disabled, 0);
    FieldRs485_PathCycleRecordAttempt(&disabled, RS485_MODBUS_OK);
    assert(disabled.attempted == 0U && disabled.attempts == 0U);
    assert(disabled.first_status == RS485_MODBUS_ERR_INVALID);
    assert(disabled.final_status == RS485_MODBUS_ERR_INVALID);
    assert(!FieldRs485_CycleHasFinalFailure(NULL));

    puts("RS485 read diagnostics host test passed");
    return 0;
}
