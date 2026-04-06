---
title: hardware-stable-version-xl01-uplink-stable-2026-04-06
type: note
tags:
- checkpoint
status: active
permalink: landslide-monitoring-v2-mainline/memory/checkpoints/hardware-stable-version-xl01-uplink-stable-2026-04-06
---

# Checkpoint: hardware-stable-version-xl01-uplink-stable-2026-04-06

## Objective

Carry the RK2206 + XL01 transparent serial work from stable uplink proof into the next downlink/command-consume proof without losing the now-working air-link baseline.

## Last Confirmed State

- center-node serial logs are now readable and stable again
- the center node received a valid telemetry frame as chunked ASCII JSON on `2026-04-06`
- the observed frame included normal payload fields such as:
  - `schema_version=1`
  - `seq=21`
  - `temperature_c=29.5`
  - `humidity_pct=50.1`
  - `tilt_x_deg=5.12`
  - `gps_latitude=22.543200`
  - `meta.install_label=FIELD-NODE-A`
- this confirms the current chunked transparent-uplink configuration is the correct frozen baseline
- a first transparent downlink proof is now also complete on `2026-04-06`
- `manual_collect` was sent through center-node `COM5` with:
  - `ChunkStrategy=whole`
  - `ReadAfterWriteSeconds=20`
- the returned capture contained all three expected proof layers:
  - a matching command ack with `status=acked`
  - a manual-triggered telemetry frame with `upload_trigger=manual_collect`
  - persisted command metadata:
    - `meta.last_command_type=manual_collect`
    - `meta.last_command_id=9b839b88-46bc-4029-887d-8da10bd6e605`
    - `meta.last_command_uptime_s=1903`
- a second command class is now proven too:
  - `set-report-300` was sent through center-node `COM5`
  - the returned ack showed:
    - `status=acked`
    - `result.applied=true`
    - `result.runtime_config.report_interval_s=300`
  - the user confirmed the live upload cadence actually changed to `300s`
- the fast baseline has now been restored:
  - `set-report-5` was sent through center-node `COM5`
  - the returned ack showed:
    - `status=acked`
    - `result.runtime_config.report_interval_s=5`
  - the user confirmed the live upload cadence returned to `5s`
  - follow-up telemetry preserved the matching `last_command_id=3a516d8d-998c-4281-821c-5dffa530a1f7`
- the mismatch guard is now proven too:
  - `mismatch` was sent through center-node `COM5`
  - the injected command carried:
    - `device_id=99999999-9999-4999-8999-999999999999`
    - `command_id=50f08cef-15f7-4eb1-98d6-7b7714b7035d`
  - no ack for that mismatch command appeared in the 20-second capture
  - follow-up telemetry kept the previous accepted command metadata:
    - `meta.last_command_type=set_config`
    - `meta.last_command_id=3a516d8d-998c-4281-821c-5dffa530a1f7`
    - `meta.last_command_uptime_s=3661`

## In Progress

- durable memory and the monthly journal are being updated to reflect that aligned and mismatch transparent proofs are now complete
- the next transition is from direct transparent proof to MQTT relay proof

## Next Actions

- keep the current wiring and transparent-serial settings unchanged
- treat center-node `COM5` + `ChunkStrategy=whole` as the current frozen-good baseline
- after that, move to relay proof rather than reopening UART-route debugging
- if relay work is deferred, preserve the current baseline and stop changing ports, wiring, or serial mode

## Risks

- the USB dock may not enumerate both CH340 devices consistently, which can hide the real peer port
- changing wiring or serial settings now would destroy the newly proven good uplink + downlink baseline
- future failures on other commands may still come from command semantics or runtime state rather than transport
- future port remapping, dock enumeration drift, or switching back to non-baseline modes can recreate the earlier false-failure symptoms

## Resume Prompt

Continue from this checkpoint by preserving the current `COM5` transparent baseline at `report_interval_s=5`; transparent aligned commands and mismatch guard are now proven, so the next meaningful step is MQTT relay proof.
