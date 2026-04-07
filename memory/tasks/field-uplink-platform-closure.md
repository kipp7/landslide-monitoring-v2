---
title: field-uplink-platform-closure
type: note
tags:
- task
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/field-uplink-platform-closure
---

# Task: field-uplink-platform-closure

## Goal

Freeze and execute the next major phase after command-route stabilization: prove that real field telemetry can move from the field node path into the central platform write chain and become visible through platform-facing read paths.

## Current State

- the formal command route is now stable and pushed:
  - `Desk/Web -> /api/v1/devices/{deviceId}/commands -> Kafka -> command-dispatcher -> MQTT -> relay -> COM9 -> XL01 -> RK2206 -> cmd_ack/API`
- the current frozen hardware command baseline is:
  - command egress `COM9`
  - board log observation `COM5`
  - transparent `USR`
  - `ChunkStrategy=whole`
  - `report_interval_s=5`
- direct field-side uplink evidence already exists:
  - real telemetry is observable on the center-node side over `COM9`
  - live payloads contain device metrics and metadata such as:
    - `temperature_c`
    - `humidity_pct`
    - `tilt_x_deg`
    - `gps_latitude`
    - `device_id`
- command closure has already been proven and should no longer be the main blocker
- the active OpenSpec change that should govern this next phase already exists:
  - `openspec/changes/add-field-hardware-gateway-architecture`
- the current authority baseline for this phase now exists:
  - `docs/unified/reports/field-uplink-platform-closure-baseline.md`
- the old interpretation that hardware still emits only legacy flat JSON is now partially obsolete:
  - current real telemetry already contains:
    - `schema_version`
    - `device_id`
    - `metrics`
    - `meta`
- the near-term gateway contract is now narrower than earlier March reports implied:
  - primary job is:
    - reconstruction
    - validation
    - light deterministic completion
    - forwarding
    - evidence
  - not a thick legacy-to-envelope rewrite
- the first real-hardware uplink replay proof into platform API state now exists:
  - script:
    - `scripts/dev/run-field-hardware-uplink-replay-full-path.ps1`
  - source sample:
    - `docs/tools/field-rehearsal/payload-samples/hf-hardware-real-20260406-seq21.json`
  - latest report:
    - `docs/unified/reports/field-hardware-uplink-replay-latest.json`
  - latest conclusion:
    - `real-hardware-uplink-replay-reached-platform-api-state`
  - latest proof confirms:
    - replay payload entered `telemetry/{device_id}`
    - host-run `ingest-service` consumed MQTT and wrote Kafka
    - host-run `telemetry-writer` updated `device_state`
    - `/api/v1/data/state/{deviceId}` returned replayed metrics and meta
- product-side Web visibility proof now also exists for the same replayed device:
  - script:
    - `scripts/dev/run-field-hardware-uplink-product-visibility.ps1`
  - latest report:
    - `docs/unified/reports/field-hardware-uplink-product-visibility-latest.json`
  - latest conclusion:
    - `real-hardware-uplink-visible-through-web-product-read-path`
  - latest proof confirms:
    - `http://127.0.0.1:3000/login` and `http://127.0.0.1:3000/device-management` respond normally
    - `http://127.0.0.1:3000/api/v1/auth/login` can proxy login and return JWT
    - `http://127.0.0.1:3000/api/v1/devices` includes the replayed device
    - `http://127.0.0.1:3000/api/v1/data/state/{deviceId}` returns the replayed real-hardware metrics
    - `apps/web/lib/api/*` can read the same device state through the Web-side client path
- a single-command full-path proof line now also exists:
  - script:
    - `scripts/dev/run-field-hardware-uplink-full-proof.ps1`
  - latest report:
    - `docs/unified/reports/field-hardware-uplink-full-proof-latest.json`
  - latest conclusion:
    - `real-hardware-uplink-full-path-reached-platform-and-web`
  - latest proof confirms one command can:
    - ensure `api/web` runtime readiness
    - run real-hardware replay proof
    - run Web product visibility proof
    - emit one summary report with the replayed `deviceId`
- a broader execution-direction authority note now exists for the next stage:
  - `docs/unified/reports/field-program-direction-and-task-split-2026-04.md`
  - it freezes the current program into four workstreams:
    - field link and gateway software mainline
    - RK3568 gateway program
    - RK2206 firmware
    - center deployment/platform topology
- a more formal phased architecture baseline now exists for the next execution stage:
  - `docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md`
  - it binds the next stage to:
    - `3 x RK2206`
    - `1 x RK3568`
    - `1 x center server`
  - and freezes:
    - role boundaries
    - phase order
    - task-package split
- the decisive unfinished boundary is no longer command delivery; it is:
  - gateway-owned adaptation of field telemetry into a platform-acceptable uplink contract
  - and making the field-side ingress path repeatable without depending on ad hoc host-run steps

## Constraints

- do not reopen business command-entry design; formal command entry remains `/api/v1/devices/{deviceId}/commands`
- do not let the central platform core absorb field-private packet adaptation responsibilities
- keep `COM9` as the current command/peer egress truth and `COM5` as board-log observation truth unless hardware facts change again
- next phase should prioritize uplink closure before any new command/ack feature work
- follow the existing OpenSpec change `add-field-hardware-gateway-architecture` rather than creating a competing architecture track

## Plan

- stage 1: truth consolidation
  - completed via:
    - `docs/unified/reports/field-uplink-platform-closure-baseline.md`
  - March adaptation assumptions are now reconciled against April hardware evidence
- stage 2: software-first uplink contract freeze
  - freeze the minimal field packet -> platform contract mapping
  - keep the near-term gateway output as a thin adapter:
    - reconstruction
    - validation
    - light deterministic completion
    - forwarding
  - freeze the evidence set for node-to-gateway and gateway-to-platform rehearsals
- stage 3: platform visibility rehearsal
  - replay path to API state is now proven through:
    - `scripts/dev/run-field-hardware-uplink-replay-full-path.ps1`
  - replay path to Web product read visibility is now proven through:
    - `scripts/dev/run-field-hardware-uplink-product-visibility.ps1`
  - unified full-path rerun entry is now:
    - `scripts/dev/run-field-hardware-uplink-full-proof.ps1`
  - current next focus after visibility proof is:
    - freeze the formal `3 RK2206 + 1 RK3568 + center server` execution line
    - then enter RK3568 / RK2206 / deployment implementation tracks without reopening small proof-level debates

## Open Questions

- should the short-term gateway adapter publish MQTT as the primary rehearsal path immediately, or use HTTP fallback only as a temporary debug side path
- what is the minimal acceptable gateway-side spool/cache record for replay and outage evidence
- phase 1 product proof is now effectively satisfied by:
  - API query visibility
  - Web-side proxy/client visibility
- should `ingest-service` and `telemetry-writer` remain host-run rehearsal processes, or be added to the compose app stack for repeatable local full-path proof

## Done When

- the next phase has a single accepted execution line anchored to `add-field-hardware-gateway-architecture`
- the field uplink contract and mapping boundary are frozen clearly enough to start implementation without reopening architecture debate
- the current authority truth reflects April real-hardware telemetry rather than only March adaptation assumptions
- at least one rehearsal path is defined end-to-end:
  - node/serial input
  - gateway adaptation
  - platform acceptance
  - API/Desk visibility probe
- at least one real-hardware telemetry replay already reaches:
  - MQTT topic
  - `device_state`
  - `/api/v1/data/state/{deviceId}`
- the same replayed telemetry is visible through the Web product read path via:
  - `http://127.0.0.1:3000/api/v1/*`
  - `apps/web/lib/api/*`
- there is a single rerun command that reproduces the current proof boundary:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-hardware-uplink-full-proof.ps1`
- a later session can resume this phase directly from this note without re-deriving the current command-route baseline
