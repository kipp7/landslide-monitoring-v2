---
title: rk3568-yx75r-rs485-alarm-baseline
type: note
tags:
- reference
- rk3568
- rs485
- yx75r
- alarm
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/rk3568-yx75r-rs485-alarm-baseline
---

# Reference: rk3568-yx75r-rs485-alarm-baseline

## Purpose

Record the verified RK3568-side YX75R sound-light alarm baseline so future sessions do not reopen the RK2206-side electrical compatibility rabbit hole.

## Hardware Boundary

- RK2206 remains the field sensing node.
- RK3568 is the preferred short-term alarm actuator path.
- CX3568-A onboard RS485 maps to Linux device `/dev/ttyS7`.
- Existing XL01 center link uses `/dev/ttyS3`; do not use `/dev/ttyS3` for the alarm actuator.
- CX3568-A RS485 connector definition from the board manual:
  - `1 GND`
  - `2 485B`
  - `3 485A`
  - `4 VCC 3.3V output`
- Do not power YX75R from the RS485 connector `3.3V` pin.
- YX75R requires independent `DC 12V-24V` power; manual suggests at least `DC12V` and about `1-2A` available for normal audio output.

## Verified Runtime Facts

- RK3568 host:
  - IP: `192.168.124.179`
  - user: `linaro`
  - hostname: `rk3568-ubuntu`
- `/dev/ttyS7` is available and not owned by `lsmv2-field-gateway.service`.
- RK3568 has `pyserial 3.5` available.
- Successful YX75R Modbus RTU settings:
  - port: `/dev/ttyS7`
  - baud: `9600`
  - data format: `8N1`
  - device address: `01`
- Verified standard echo frames:
  - flash on: `01 06 00 C2 00 03 68 37`
  - play file `01/001`: `01 06 30 0F 01 01 76 99`
  - light off: `01 06 00 C2 00 06 A8 34`
  - stop play: `01 06 00 16 00 01 A9 CE`
- User confirmed audio output after RK3568-side track scan.
- YX75R query findings:
  - software volume was `30`
  - FLASH file count was `7`
- Temporary software volume was lowered to `8/30` using:
  - `01 06 00 06 00 08 68 0D`

## Important Caveats

- YX75R software volume setting may reset after reboot according to the manual.
- Future alarm actuator service should initialize a safe demonstration volume before triggering sound.
- Wind speed/direction sensor now shares the RK3568 RS485 bus; confirm its Modbus address and baud rate before polling it with YX75R on the same bus.
- Avoid address conflicts with YX75R default `01`.

## Next Engineering Step

OpenSpec proposal `add-rk3568-alarm-actuation-loop` has been created and validated.

Implemented platform boundary as of 2026-05-11:

- API route: `/api/v1/field-alarm/status`
- API route: `/api/v1/field-alarm/actions`
- API env: `RK3568_ALARM_ACTUATOR_URL`
- Desktop client domain: `api.fieldAlarm`
- Desktop Device Management sound-light controls now call platform-level field alarm actions, not RK2206 `buzzer_on/off`.
- Data visualization big screen (`apps/desk/src/views/AnalysisPage.tsx`) reads field alarm state and reuses the existing red critical state.
- RK3568 sidecar service: `services/rk3568-alarm-actuator`
  - default dry-run: true
  - default port: `18087`
  - default serial: `/dev/ttyS7`
  - refuses `/dev/ttyS3`
  - default demo volume: `5/30`
  - sends verified YX75R frames through RK3568 pyserial in real mode.
- Rule seed:
  - JSON: `docs/integrations/rules/examples/rule-tilt-mutation-field-alarm.v1.json`
  - seeding script: `scripts/dev/seed-tilt-mutation-field-alarm-rule.ps1`
  - current demo threshold: `tilt_x_deg` or `tilt_y_deg` delta over 5 telemetry points >= `0.45 deg` or <= `-0.45 deg`
  - severity: `high`, so it is eligible for physical alarm escalation.

Runtime notes:

- Local actuator dry-run smoke passed:
  - `alarm_on`: `010600060008680D`, `010600C200036837`, `0106300F01017699`
  - `alarm_off`: `010600C20006A834`, `010600160001A9CE`
- Current API container was rebuilt and restarted after adding field-alarm routes.
- API smoke with admin login succeeded:
  - `/api/v1/field-alarm/status` returns `state=normal`, `activeCount=0`, `actuator.state=not_configured` until the RK3568 sidecar URL is configured.
- Device command smoke now reaches `sent` state for `manual_collect`, confirming the desktop/API/Kafka/command-dispatcher path is not blocked at API dispatch.
- SSH non-interactive deploy to `linaro@192.168.124.179` is currently blocked by password/public-key auth, so RK3568 real sidecar deployment still needs interactive SSH credentials or manual copy/start.

2026-05-11 update:

- Demonstration volume was lowered from `8/30` to `5/30`.
- Volume initialization frame for `5/30`: `010600060005A9C8`.
- `services/rk3568-alarm-actuator` now defaults to `demoVolume=5`.
- RK3568 real sidecar is deployed as `lsmv2-rk3568-alarm-actuator.service`.
- Board service state verified:
  - `active`
  - `enabled`
  - `dryRun=false`
  - `/dev/ttyS7 9600 8N1 address=1 volume=5`
- Center API runtime is configured with `RK3568_ALARM_ACTUATOR_URL=http://192.168.124.179:18087`.
- API status smoke verified:
  - actuator `available=true`
  - actuator `dryRun=false`
  - detail contains `volume=5`
- API silent action smoke verified with `alarm_off`; real `alarm_on` was intentionally not triggered during this preparation step.

2026-05-11 sound playback fix:

- Root cause of "light works but sound is abnormal":
  - `01 06 00 C2 00 03 68 37` is light-only; it never plays voice by design.
  - The previous actuator `alarm_on` used folder/file playback `01 06 30 0F 01 01 76 99`.
  - On the current YX75R FLASH layout, folder/file playback echoes correctly but does not enter playback state.
- Verified sound-capable paths on RK3568 `/dev/ttyS7`:
  - `01 06 60 03 00 01 A6 0A`: physical track 1, no light; playback state briefly becomes playing, but the track is too short for stable alarm presentation.
  - `01 06 30 03 00 01 B7 0A`: physical track 1 with D1 kept flashing; playback state briefly becomes playing and light remains flashing.
  - `01 06 30 08 00 01 C6 C8`: loop physical track 1 with D1 kept flashing; playback state remains playing and `soundLight` reports physical track 1 + constant flash.
- Current production actuator behavior:
  - `alarm_on`: set volume to `5/30`, then send `01 06 30 08 00 01 C6 C8`.
  - `alarm_off` / `silence`: send stop loop `01 06 00 19 00 01 99 CD`, stop playback `01 06 00 16 00 01 A9 CE`, then light off `01 06 00 C2 00 06 A8 34`.
- Deployment:
  - Updated `services/rk3568-alarm-actuator/dist/index.js`, `src/index.ts`, and `README.md` on RK3568 under `/home/linaro/landslide-monitoring-v2-mainline`.
  - Board backup path: `/home/linaro/landslide-monitoring-v2-mainline/.backups/rk3568-alarm-actuator-20260511-184256`.
  - Restarted `lsmv2-rk3568-alarm-actuator.service`; service is `active/enabled`.
- End-to-end validation:
  - Direct actuator HTTP `/alarm_on` returned echoes `01 06 00 06 00 05 A9 C8` and `01 06 30 08 00 01 C6 C8`.
  - During active window, YX75R status returned playback `正在播放` and `soundLight` note `正在播放物理曲目 1，灯光一直爆闪`.
  - Center API `/api/v1/field-alarm/actions` also reached the actuator and returned the same active playback/sound-light state.

2026-05-11 desktop review loop update:

- Data visualization big screen no longer uses a full-screen blocking spinner while entering or refreshing the page; background refresh is represented by the existing live-dot state only.
- The active field alarm banner now opens an in-place `人工确认复核` modal instead of requiring a separate page.
- Field alarm actions now support review lifecycle actions:
  - `ack`: sends RK3568 actuator `/silence` and writes an `ALERT_ACK` event when `alertId` is available; the UI keeps the alarm visible as under review.
  - `resolve`: sends RK3568 actuator `/alarm_off` and writes an `ALERT_RESOLVE` event when `alertId` is available; the UI clears the red critical alarm state after review.
- `field-alarm/status` no longer treats a plain actuator `alarm_off` as an under-review event. Under-review state is derived from actual `ALERT_ACK` records.
- Review records are kept in both `alert_events` and `operation_logs`:
  - `alert_events`: `ALERT_ACK` / `ALERT_RESOLVE`
  - `operation_logs`: module `field_alarm`, action `ack` / `resolve`
