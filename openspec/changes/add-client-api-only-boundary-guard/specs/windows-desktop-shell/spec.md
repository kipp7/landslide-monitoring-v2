---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-client-api-only-boundary-guard/specs/windows-desktop-shell/spec
---

# Delta for Windows Desktop Shell

## ADDED Requirements

### Requirement: No Database Runtime in Desktop Shell
`apps/desk-win` MUST remain a native host shell and MUST NOT ship database client packages, database connection strings, or direct datastore access logic.

#### Scenario: Desktop shell package review
- **WHEN** `apps/desk-win` is reviewed for delivery
- **THEN** its package references MUST NOT contain PostgreSQL, ClickHouse, SQL Server, MySQL, SQLite, or similar direct database client libraries

#### Scenario: Desktop shell source review
- **WHEN** a direct database connection string, driver type, or direct datastore call appears in `apps/desk-win`
- **THEN** the boundary check MUST fail and the delivery validation MUST be blocked
