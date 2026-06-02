---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-client-api-only-boundary-guard/specs/desk-frontend/spec
---

# Delta for Desk Frontend

## ADDED Requirements

### Requirement: API-Only Data Access Boundary
`apps/desk` MUST consume business data through the desk API contract / client layer and MUST NOT introduce direct connections to PostgreSQL, ClickHouse, or other database stores.

#### Scenario: Frontend reads business data
- **WHEN** the frontend reads devices, stations, telemetry, command state, or system health
- **THEN** it MUST do so via the desk API client layer rather than database drivers, SQL, or direct datastore SDK calls

#### Scenario: Banned database dependency appears
- **WHEN** a database client package, connection string, or direct database symbol is introduced into `apps/desk`
- **THEN** the API-only boundary check MUST fail before delivery sign-off
