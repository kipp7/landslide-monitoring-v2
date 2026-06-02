---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-client-api-only-boundary-guard/tasks
---

## 1. Boundary Specification
- [x] 1.1 Add API-only data access requirement to `desk-frontend`
- [x] 1.2 Add no-database-runtime requirement to `windows-desktop-shell`
- [x] 1.3 Record the architecture ruling in workspace memory

## 2. Boundary Enforcement
- [x] 2.1 Add a `desk/desk-win` API-only boundary check script
- [x] 2.2 Produce a machine-readable boundary report under `docs/unified/reports/`
- [x] 2.3 Fail the check when banned database dependencies, package references, connection strings, or driver symbols appear in `apps/desk` / `apps/desk-win`

## 3. Delivery Integration
- [x] 3.1 Wire the boundary check into `desk-win` delivery validation
- [x] 3.2 Include the boundary report in the delivery bundle / latest package validation path
- [x] 3.3 Update delivery docs and quality gates so the rule is visible to future sessions
