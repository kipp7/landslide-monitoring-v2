---
title: field-mainline-phase-baseline-2026-04-14
type: note
tags:
- checkpoint
status: active
permalink: landslide-monitoring-v2-mainline/memory/checkpoints/field-mainline-phase-baseline-2026-04-14
---

# Checkpoint: field-mainline-phase-baseline-2026-04-14

## Objective

Freeze the current landslide field-program baseline so future sessions can resume from the real mainline state instead of re-deriving it from long journals.

## Last Confirmed State

- `MemPalace` is now a usable first retrieval layer for this workspace:
  - project palace path:
    - `.tools/mempalace/palace`
  - current project wing:
    - `landslide_monitoring_v2_mainline`
  - verified commands:
    - `status`
    - `search`
    - `wake-up` with UTF-8 env
- the current field mainline should be read as:
  - `3 x RK2206 field nodes -> center XL01 -> RK3568 /dev/ttyS3 -> MQTT/API/Web`
- the southbound runtime on RK3568 is already engineered and running:
  - service:
    - `lsmv2-field-gateway.service`
  - serial:
    - `/dev/ttyS3`
    - `115200`
  - field link mode:
    - `cobs-crc-v1`
  - southbound polling:
    - enabled
    - `poll_latest_telemetry`
- the center/software side is already closed for the current phase:
  - `field-center-rk3568-operator-entry-latest.json`
    - `accepted = true`
  - `field-software-read-path-adaptation-latest.json`
    - `accepted = true`
  - API/Web metrics contract is already aligned for:
    - node A
    - node B
    - node C
- the current live field boundary is frozen as:
  - `A/B stable, C pending`
- latest field runtime evidence shows:
  - node `A = online`
  - node `B = online`
  - node `C = configured`
  - `rejectedMessages = 0`
  - `interleavingSuspected = 0`
  - edge quality summary:
    - `accepted = true`
    - `overallLevel = attention`
    - `node_a = healthy`
    - `node_b = healthy`
    - `node_c = attention (deferred)`
- desk delivery is already in a releasable state:
  - `docs/unified/reports/desk-win-production-handoff-latest.json`
    - `ready = true`

## In Progress

- keep the current stage synchronized across:
  - `MemPalace`
  - `memory/`
  - `docs/unified/reports/*latest.json`
- avoid regressing into old interpretations where:
  - already-finished RK3568 engineering work is treated as pending
  - `node C` is allowed to redefine the whole mainline as failed

## Next Actions

- treat `MemPalace search` as the first resume step for future sessions
- keep the current stage frozen as:
  - `A/B stable, C pending`
- when `node C` hardware is replaced with the same board type as `A/B`, re-run:
  - RK3568 runtime
  - edge-link quality
  - command/ack proof
- after `node C` is recovered, move the next major phase into:
  - RK3568 long-run operations and resilience
  - RK2206 low-power and extra-sensor work
  - edge-side monitoring / sidecar expansion

## Risks

- old reports from earlier red windows can still confuse the current state if they are read without checking timestamps
- `node C` board variance can still consume time if it is treated as a software-mainline problem instead of a field hardware issue
- if `memory/` and `MemPalace` are not updated after major milestones, future sessions may drift back into full-journal rereads

## Resume Prompt

Resume this repository by first running `MemPalace status` and a targeted `MemPalace search` on the current field phase, then verify with the latest RK3568 runtime and edge-link-quality reports before making any new status claim.
