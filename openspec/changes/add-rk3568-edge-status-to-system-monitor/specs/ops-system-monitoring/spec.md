---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-status-to-system-monitor/specs/ops-system-monitoring/spec
---

## ADDED Requirements

### Requirement: RK3568 Edge Summary In Ops System Monitor
The operations system monitor SHALL display RK3568 edge runtime status when the backend provides the `fieldEdge` or `hermesEdge` summary.

#### Scenario: Edge status is available
- **WHEN** `/ops/system-monitor` receives a populated `fieldEdge` block from `/api/v1/system/status`
- **THEN** the page SHALL display the RK3568 overall level, score, network mode, serial/MQTT state, and soak acceptance summary
- **AND** the page SHALL display node-level status for the configured field nodes
- **AND** the existing center-side system summary SHALL remain visible on the same page

#### Scenario: Hermes Agent status is available
- **WHEN** the Windows desktop system monitor receives a populated `hermesEdge` block from `/api/v1/system/status`
- **THEN** the page SHALL display Hermes service state, model loaded state, diagnosis type, confidence, feature count, natural-language readiness, stress-test summary, and protected-core safety flags
- **AND** when `hermesEdge.volatilitySurface` is present, the page SHALL display an RK3568 edge AI health volatility surface on the same system monitor page
- **AND** the Hermes status SHALL remain part of the existing system monitor page instead of requiring a separate page

#### Scenario: Edge status is unavailable
- **WHEN** `/ops/system-monitor` does not receive a usable `fieldEdge` summary
- **THEN** the page SHALL keep rendering the existing center-side system summary
- **AND** it SHALL show an explicit unavailable or stale state for the RK3568 section instead of silently hiding the condition
