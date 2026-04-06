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

## In Progress

- durable memory and the monthly journal are being updated to reflect that the first non-destructive downlink proof is now complete
- the next transition is from first downlink proof to second-class command proof and relay proof

## Next Actions

- keep the current wiring and transparent-serial settings unchanged
- treat center-node `COM5` + `manual_collect` + `ChunkStrategy=whole` as the current frozen-good baseline
- next verify one additional command path:
  - `set-report-300`
  - or mismatch `manual_collect`
- if verifying `set-report-300`, prove success from slower follow-up report cadence and any related metadata
- if verifying mismatch, prove ignore behavior from absence of matching ack and unchanged `last_command_*`
- after that, move to relay proof rather than reopening UART-route debugging

## Risks

- the USB dock may not enumerate both CH340 devices consistently, which can hide the real peer port
- changing wiring or serial settings now would destroy the newly proven good uplink + downlink baseline
- future failures on other commands may still come from command semantics or runtime state rather than transport

## Resume Prompt

Continue from this checkpoint by preserving the current `COM5` transparent baseline, then prove one more non-destructive command class beyond `manual_collect` before moving to MQTT relay.
