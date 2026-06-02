---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-field-hardware-gateway-architecture/tasks
---

## 1. Truth Consolidation
- [x] 1.1 Consolidate existing firmware/device identity/MQTT/IoT adapter truth into one architecture baseline (`docs/unified/reports/field-uplink-platform-closure-baseline.md`)
- [x] 1.2 Mark which decisions are already accepted vs still open (`docs/unified/reports/field-uplink-platform-closure-baseline.md`)
- [x] 1.3 Record the recommended boundary between field node, field gateway, and central platform (`docs/unified/reports/field-uplink-platform-closure-baseline.md`, `design.md`)

## 2. Architecture Design
- [ ] 2.1 Define the three-layer field architecture: node, gateway, platform
- [ ] 2.2 Define the gateway adaptation responsibility and what MUST NOT leak into the platform core
- [ ] 2.3 Define deployment topology principles for mountainous/slopes scenarios
- [ ] 2.4 Define signal, power, buffering, and redundancy strategy
- [ ] 2.5 Evaluate `Ubuntu + RK3568` as a gateway hardware/software profile

## 3. Interface & Data Strategy
- [ ] 3.1 Define `field_node_id -> device_id(UUID)` mapping strategy
- [x] 3.2 Define telemetry field mapping from field packets to platform `TelemetryEnvelope` (`docs/unified/reports/field-uplink-platform-closure-baseline.md`)
- [ ] 3.3 Define `install_label` naming, uniqueness scope, and non-identity usage rules
- [ ] 3.4 Define the field telemetry profile: required fields, optional fields, and excluded high-frequency fields
- [ ] 3.5 Define length budget and framing constraints for the field link profile
- [ ] 3.6 Define high-frequency vs low-frequency telemetry layering strategy
- [x] 3.7 Define phase boundary: stage 1 uplink only, stage 2 commands/acks/config (`design.md`, `docs/unified/reports/field-uplink-platform-closure-baseline.md`)
- [ ] 3.8 Define observability boundaries for node health, gateway health, and platform ingest health

## 4. Rollout & Governance
- [ ] 4.1 Define field pilot rollout strategy and acceptance gates
- [ ] 4.2 Define operational fallback strategy for gateway/node failure
- [ ] 4.3 Document open questions that must be decided before implementation starts

## 5. Software-First Integration Plan
- [ ] 5.1 Define node-to-gateway debugging interface and message reconstruction strategy
- [ ] 5.2 Define a software-only node simulator profile for field telemetry profile validation
- [x] 5.3 Define gateway-to-platform adapter responsibilities for MQTT and optional HTTP uplink (`design.md`, `docs/unified/reports/field-uplink-platform-closure-baseline.md`)
- [ ] 5.4 Define a software-only gateway simulator or adapter harness for platform-side integration
- [x] 5.5 Define phased validation order: node-gateway, gateway-platform, then end-to-end rehearsal (`design.md`, `docs/unified/reports/field-uplink-platform-closure-baseline.md`)
- [x] 5.6 Define what evidence each phase must produce before real hardware rollout (`design.md`, `docs/unified/reports/field-uplink-platform-closure-baseline.md`)

## 6. Concrete Software Debug Blueprint
- [ ] 6.1 Define the minimal node simulator outputs: normal packet, low-frequency packet, duplicate packet, oversized packet, replay packet
- [ ] 6.2 Define the gateway adapter input contract: framing, integrity check, reconstruction, spool entry format
- [ ] 6.3 Define the gateway adapter output contract for MQTT uplink
- [ ] 6.4 Define the optional HTTP uplink contract for early adapter verification
- [ ] 6.5 Define the platform-side acceptance probes: schema acceptance, ingest acceptance, API visibility, Desk/Web visibility
- [ ] 6.6 Define the debug artifact set for each rehearsal run: payload samples, adapter logs, spool snapshots, platform proof bundle

## 7. Execution-Level Rehearsal Definition
- [ ] 7.1 Freeze the node simulator packet classes and file formats
- [ ] 7.2 Freeze the gateway adapter spool record schema and replay semantics
- [ ] 7.3 Freeze the minimum MQTT topic/payload contract used by the adapter rehearsal
- [ ] 7.4 Freeze the minimum HTTP adapter contract used only for early debugging fallback
- [ ] 7.5 Freeze the platform acceptance probe checklist and pass/fail criteria
- [ ] 7.6 Freeze the rehearsal evidence directory layout and naming rules

## 8. Build-vs-Buy Tooling Evaluation
- [ ] 8.1 Evaluate mature off-the-shelf tools for serial-to-platform rehearsal
- [ ] 8.2 Distinguish which tools are suitable for temporary debugging versus long-term gateway architecture
- [ ] 8.3 Record the recommended tool stack for quick rehearsal, probe, and production-bound edge adapter development
