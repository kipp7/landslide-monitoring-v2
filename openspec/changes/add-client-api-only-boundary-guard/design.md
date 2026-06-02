---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-client-api-only-boundary-guard/design
---

## Summary

This change turns the current client boundary into an enforceable gate instead of leaving it as a documentation-only rule.

## Boundary

- `apps/desk` may read and mutate business data only through the desk API layer
- `apps/desk-win` remains a native shell and may load web assets / host bridge only
- Postgres / ClickHouse access remains server-side only

## Enforcement Strategy

Add a lightweight PowerShell check that:

1. Reads `apps/desk/package.json`
2. Reads `apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj`
3. Scans `apps/desk` and `apps/desk-win` source trees for banned database patterns
4. Emits a JSON report and exits non-zero on violations

## Delivery Integration

The new report must be generated as part of `desk-win` delivery validation and copied into the delivery bundle so the API-only boundary becomes part of the release evidence.
