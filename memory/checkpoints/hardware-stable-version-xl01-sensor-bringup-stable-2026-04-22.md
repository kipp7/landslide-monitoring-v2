---
title: hardware-stable-version-xl01-sensor-bringup-stable-2026-04-22
type: note
tags:
- checkpoint
status: active
permalink: landslide-monitoring-v2-mainline/memory/checkpoints/hardware-stable-version-xl01-sensor-bringup-stable-2026-04-22
---

# Checkpoint: hardware-stable-version-xl01-sensor-bringup-stable-2026-04-22

## Objective

Freeze the current external RK2206 firmware baseline after sensor bring-up and runtime stabilization so later sessions can resume protocol cleanup without re-deriving whether the board is alive.

## Last Confirmed State

- the active external firmware workspace is:
  - `F:\2\openharmony\txsmartropenharmony\vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.0`
- the current live board identity is:
  - `device_id=00000000-0000-0000-0000-000000000002`
- Beijing-time serial proof now confirms:
  - `2026-04-22 05:50:10`:
    - `MPU6050` initialized successfully after the added boot retry / settle logic
  - `2026-04-22 05:50:13`:
    - configuration summary printed:
      - `SHT30: ON ready=yes`
      - `MPU6050: ON ready=yes`
  - `2026-04-22 05:50:17`:
    - telemetry send succeeded with:
      - `Temp:24.8C`
      - `Humi:49.8%`
      - `Tilt:0.25deg/38.72deg`
      - `GPS:(22.681738,110.195404)`
  - commands for:
    - `...0001`
    - `...0003`
    are ignored as expected mismatch traffic
- the earlier crash line is mitigated in source:
  - `ProcessTask` stack size increased
  - upload/shared-port worker stack sizes increased
  - `g_process_command_json` removes a large command buffer from `ProcessTask` stack
  - `g_field_link_rx_message` removes a decoded message object from the UART RX hot path stack
- sparse-metrics diagnostics now exist:
  - `PrintSparseMetricsDiagnostic()` logs valid-flag readiness on:
    - `TELEMETRY_ENVELOPE_ERR_EMPTY_METRICS`
- current board evidence now proves all target sensors on the active image can produce data:
  - `SHT30`
  - `MPU6050`
  - `GPS`
- the second-pass protocol cleanup source fixes are now also in tree:
  - `DataProcessTask` drains all queued platform commands instead of stalling queued follow-up commands until fresh RX arrives
  - GPS stale-fix timeout now uses `LOS_MS2Tick(...)` instead of comparing millisecond constants directly to raw tick counters
  - command ingress now requires `issued_ts` in both the XL01 prefilter and the command parser
  - ACK send path now waits briefly after local UART write success before higher-level follow-up actions continue
- the latest runtime-stability fixes are now also in tree:
  - telemetry snapshot access is protected by a sensor-data mutex
  - serial summary / send status lines were normalized to ASCII
  - `MPU6050` register read/write calls now retry before declaring failure
  - boot-time `MPU6050_Init()` now retries as a whole after a short I2C settle delay
  - runtime `MPU6050` recovery now retries initialization automatically and marks the device offline after repeated read failures
- the current frozen rollback baseline is stored in repo:
  - `backups/openharmony-snapshots/xl01_landslide_monitor_v1.0-20260422-061927.zip`
  - `backups/openharmony-snapshots/xl01_landslide_monitor_v1.0-20260422-061927.status.txt`
  - `backups/openharmony-snapshots/xl01_landslide_monitor_v1.0-20260422-061927.sha256.txt`
  - `SHA256 = 1DA353C76ABC1AFDE3A794D723F21145E15C8DB9FCD64B171245AA12887B4C47`

## In Progress

- the board runtime is now considered healthy enough to leave bring-up and enter validation for:
  - sensor read
  - `poll_latest_telemetry`
  - telemetry send
- the main remaining work is no longer primary bring-up, but verification depth:
  - reboot / restart ACK-before-reset proof on real hardware
  - repeated reboot success-rate validation for `MPU6050`
  - longer soak validation for sporadic `MPU6050` read failures
  - ingress-drop failure semantics when command queue / frame assembly rejects input

## Next Actions

- preserve `xl01_landslide_monitor_v1.0-20260422-061927` as the rollback point before any further firmware edits
- run a Beijing-time reboot validation set:
  - `10` consecutive cold/warm restarts
  - record how many boots reach `MPU6050 initialized successfully!` and `ready=yes`
- run a longer stability window:
  - `30-60` minutes of continuous runtime
  - watch for any renewed `MPU6050 read failed` lines
- verify on-device:
  - two back-to-back commands no longer leave the second command stuck in the queue
  - GPS becomes invalid about `5` seconds after valid-fix traffic disappears
  - `reboot` / `restart_device` ACK can be observed before reset
  - ingress overload or malformed command cases do not silently disappear without operator evidence

## Risks

- the external OpenHarmony tree is broadly dirty and contains many unrelated modifications outside this sample path
- current verification is still based on user-provided serial logs, not a locally reproduced full OpenHarmony rebuild in this session
- protocol-layer semantics are still not fully aligned with mainline gateway/docs even though the board now looks healthy
- queue-full / invalid-json / command-assembly-overflow cases still lack a `failed` ACK path at the ingress layer
- the dormant `FIELD_NODE_ROLE_SOURCE_CONTROLLER` path still has initialization ordering risk if re-enabled later
- the latest fixes reduce but do not yet statistically eliminate intermittent boot-time `MPU6050` timing failures
- future sessions could mistake the older `2026-04-22 00:13` backup for the live frozen baseline unless this checkpoint is used first

## Resume Prompt

Continue from this checkpoint, treat `xl01_landslide_monitor_v1.0-20260422-061927` as the current rollback baseline, verify repeated Beijing-time reboot success for `...0002` first, then resume protocol-truthfulness cleanup only if the new stability window stays clean.
