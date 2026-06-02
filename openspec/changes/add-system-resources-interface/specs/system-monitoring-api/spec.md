---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-system-resources-interface/specs/system-monitoring-api/spec
---

## ADDED Requirements

### Requirement: Separate Resource Status Model
The system SHALL expose a dedicated resource-status interface separate from the health-summary interface.

#### Scenario: Query system resources
- **WHEN** a client requests `/api/v1/system/resources`
- **THEN** the API SHALL return CPU, memory, and disk resource usage fields
- **AND** the response SHALL not reuse the health-summary shape from `/api/v1/system/status`

### Requirement: Preserve Health Summary Model
The system SHALL preserve `/api/v1/system/status` as the health-summary model.

#### Scenario: Query system health summary
- **WHEN** a client requests `/api/v1/system/status`
- **THEN** the API SHALL continue returning service health summary fields such as postgres, clickhouse, kafka, source, note, and items
- **AND** it SHALL not be redefined as a CPU/memory/disk resource endpoint