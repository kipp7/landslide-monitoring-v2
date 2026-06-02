---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-supervision-plan/design
---

## Context

The RK3568 runtime is layered as gateway core plus sidecars. `field-gateway` owns serial ingest, spool, MQTT uplink, and health emission. `field-link-monitor` already observes gateway health and network bootstrap state without writing back.

## Goals / Non-Goals

- Goals: provide a product-level automation plan for OpenClaw/Hermes/local display; keep edge quality signals actionable; preserve gateway core boundaries.
- Non-Goals: execute gateway restarts, switch Wi-Fi, own serial ports, replace the field gateway, or let natural-language/display layers control the gateway core.

## Decisions

- Decision: extend `field-link-monitor` rather than creating a new service.
- Why: it already owns the read-only quality summary and avoids creating a parallel supervision stack.

- Decision: expose `/v1/automation` as task-level JSON.
- Why: OpenClaw/Hermes can consume concise tasks instead of reverse-engineering raw dimensions.

- Decision: make automation advisory-first.
- Why: current field risks are mostly physical/network/shared-port issues; automatic gateway restarts could hide evidence or interrupt uplink.

- Decision: keep natural-language interaction as a safe intent router above Hermes actions.
- Why: the edge diagnosis model is a classifier, not a command-understanding model; display or voice layers can map text to `recheck`, `collect_logs`, and `generate_report` while Hermes enforces read-only boundaries.

- Decision: expose `aiModels[]` alongside the backward-compatible `aiDiagnosis`.
- Why: the current link diagnosis model should not block later addition of health, sensor-quality, or local anomaly models.

## Risks / Trade-offs

- Risk: users may expect “automation” to perform destructive recovery.
- Mitigation: every task carries `automationScope`, `safeToAutomate`, and governance flags.

- Risk: sidecar task names become product language too early.
- Mitigation: public contract uses generic edge supervision wording; OpenClaw/Hermes are named only as consumers.

## Migration Plan

1. Add `/v1/automation` to `field-link-monitor`.
2. Update RK3568 check scripts.
3. Validate locally with fixture health/status files.
4. Deploy to RK3568 after the local proof passes.
