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

## In Progress

- durable memory and the monthly journal are being updated to reflect that uplink is no longer the blocker
- the next transition is from uplink stabilization to a first non-destructive downlink proof

## Next Actions

- keep the current wiring and chunked-uplink settings unchanged
- when the current dock/USB layout is stable, record the active serial-port mapping again
- use the center-node side to issue one non-destructive command, preferably `manual_collect`
- verify command consumption from the next uplink payload using:
  - `meta.last_command_type`
  - `meta.last_command_id`
  - `meta.last_command_uptime_s`
- if a separate board debug port is available at the same time, capture board-side logs too, but do not block on that if telemetry metadata is enough

## Risks

- the USB dock may not enumerate both CH340 devices consistently, which can hide the real peer port
- changing wiring or chunk settings now would destroy the newly proven good uplink baseline
- downlink proof may still fail because of peer-port selection or center-node serial role confusion rather than firmware logic

## Resume Prompt

Continue from this checkpoint, first verify that the center node still receives stable chunked JSON uplink unchanged, then execute one non-destructive downlink proof and confirm it from follow-up uplink metadata.
