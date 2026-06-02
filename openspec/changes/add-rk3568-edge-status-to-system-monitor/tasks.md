---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-status-to-system-monitor/tasks
---

## 1. Specification

- [x] 1.1 Define the read-only `fieldEdge` contract on top of the existing `/api/v1/system/status` health-summary model
- [x] 1.2 Define the allowed evidence inputs for `fieldEdge` and forbid live SSH/serial access in request handling
- [x] 1.3 Define `/ops/system-monitor` rendering and fallback behavior when `fieldEdge` is unavailable

## 2. Backend

- [x] 2.1 Add a thin report reader in `services/api` that resolves latest RK3568 evidence artifacts from the repo
- [x] 2.2 Extend `/api/v1/system/status` to include `fieldEdge` without breaking existing top-level fields
- [x] 2.3 Keep current `postgres` / `clickhouse` / `kafka` / `emqx` summary semantics unchanged
- [x] 2.4 Extend `/api/v1/system/status` to include `hermesEdge` from RK3568 Hermes supervisor and stress-test artifacts
- [x] 2.5 Add derived Hermes `volatilitySurface` data for RK3568 edge health instability visualization

## 3. Web

- [x] 3.1 Extend `apps/web` system monitor API typing to include the optional `fieldEdge` block
- [x] 3.2 Add an RK3568 edge status card/section to `/ops/system-monitor`
- [x] 3.3 Render graceful “unavailable/stale” states without hiding the existing center summary
- [x] 3.4 Extend the Windows desktop system monitor page with a Hermes Edge Agent status card on the existing page
- [x] 3.5 Render the RK3568 edge AI health volatility surface inside the existing Windows desktop system monitor page

## 4. Verification

- [x] 4.1 Verify the API still returns the old health-summary fields exactly as before
- [x] 4.2 Verify `fieldEdge` is populated from the latest evidence artifacts when they exist
- [x] 4.3 Verify `/ops/system-monitor` can display both center summary and RK3568 edge summary together
- [x] 4.4 Record latest evidence and update journal/memory after implementation
- [x] 4.5 Verify desktop build after adding `hermesEdge`
- [x] 4.6 Verify API build after adding `hermesEdge`
- [x] 4.7 Verify API and desktop builds after adding the volatility surface
