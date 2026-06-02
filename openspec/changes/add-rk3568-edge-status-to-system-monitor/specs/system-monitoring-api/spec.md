---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-status-to-system-monitor/specs/system-monitoring-api/spec
---

## ADDED Requirements

### Requirement: RK3568 Edge Runtime Status Extension
The system SHALL allow `/api/v1/system/status` to expose optional read-only `fieldEdge` and `hermesEdge` blocks alongside the existing health-summary fields.

#### Scenario: Latest RK3568 evidence is available
- **WHEN** the API can read the latest RK3568 edge evidence artifacts from the local repository
- **THEN** `/api/v1/system/status` SHALL include a `fieldEdge` block
- **AND** the block SHALL include edge summary facts such as `generatedAt`, `accepted`, `currentBoundary`, overall runtime level, and node runtime status
- **AND** the existing top-level health-summary fields such as `postgres`, `clickhouse`, `kafka`, `emqx`, `source`, `note`, and `items` SHALL remain present

#### Scenario: Latest Hermes supervisor evidence is available
- **WHEN** the API can read the latest RK3568 Hermes supervisor and stress-test artifacts from the local repository
- **THEN** `/api/v1/system/status` SHALL include a `hermesEdge` block
- **AND** the block SHALL include service state, model loaded state, model type, model version, feature count, diagnosis type, confidence, intent readiness, safety boundary, and stress-test summary facts
- **AND** the block SHALL include an optional `volatilitySurface` summary derived from Hermes diagnosis, source freshness, local resource pressure, and stress latency
- **AND** the existing `fieldEdge` and top-level health-summary fields SHALL remain present

#### Scenario: Latest RK3568 evidence is unavailable
- **WHEN** the expected RK3568 evidence artifacts are missing, unreadable, or stale
- **THEN** `/api/v1/system/status` SHALL still return the existing top-level health-summary model
- **AND** the edge extension SHALL degrade to an unavailable state instead of causing a request failure

### Requirement: No Live Board Access In Request Path
The system SHALL NOT perform SSH, serial, or other live board access while serving `/api/v1/system/status`.

#### Scenario: Serving system status
- **WHEN** a client requests `/api/v1/system/status`
- **THEN** the API SHALL only use locally available summary artifacts or equivalent local evidence sources
- **AND** it SHALL NOT block on RK3568 shell access, serial probing, or runtime command execution
