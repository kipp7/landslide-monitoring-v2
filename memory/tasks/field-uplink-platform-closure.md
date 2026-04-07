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
- the decisive unfinished boundary is no longer command delivery; it is:
  - gateway-owned adaptation of field telemetry into a platform-acceptable uplink contract
  - and proof that the data is visible through ingest/API/Desk-side read paths

## Constraints

- do not reopen business command-entry design; formal command entry remains `/api/v1/devices/{deviceId}/commands`
- do not let the central platform core absorb field-private packet adaptation responsibilities
- keep `COM9` as the current command/peer egress truth and `COM5` as board-log observation truth unless hardware facts change again
- next phase should prioritize uplink closure before any new command/ack feature work
- follow the existing OpenSpec change `add-field-hardware-gateway-architecture` rather than creating a competing architecture track

## Plan

- stage 1: truth consolidation
  - consolidate the already-proven field telemetry facts from journals, unified reports, and hardware task notes
  - mark what is already accepted vs what is still open in `add-field-hardware-gateway-architecture`
- stage 2: software-first uplink contract freeze
  - freeze the minimal field packet -> platform contract mapping
  - decide whether the near-term gateway output is direct `TelemetryEnvelope` or a deterministic adapter layer
  - freeze the evidence set for node-to-gateway and gateway-to-platform rehearsals
- stage 3: platform visibility rehearsal
  - push one real or replayed field telemetry sample through the chosen adapter path
  - prove ingest acceptance
  - prove downstream API visibility
  - prove Desk/Web-visible read-path impact if available

## Open Questions

- should the short-term gateway adapter emit platform-standard `TelemetryEnvelope` directly, or use a temporary HTTP/debug fallback during the earliest rehearsal slice
- what is the minimal acceptable gateway-side spool/cache record for replay and outage evidence
- which read path should be treated as the primary product proof for phase 1:
  - raw ingest acceptance
  - API query visibility
  - Desk/Web UI visibility

## Done When

- the next phase has a single accepted execution line anchored to `add-field-hardware-gateway-architecture`
- the field uplink contract and mapping boundary are frozen clearly enough to start implementation without reopening architecture debate
- at least one rehearsal path is defined end-to-end:
  - node/serial input
  - gateway adaptation
  - platform acceptance
  - API/Desk visibility probe
- a later session can resume this phase directly from this note without re-deriving the current command-route baseline
