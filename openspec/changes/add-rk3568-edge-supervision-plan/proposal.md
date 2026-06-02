---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-supervision-plan/proposal
---

# Change: Add RK3568 edge supervision plan

## Why

RK3568 already has a read-only `field-link-monitor` sidecar, but OpenClaw/Hermes and local operator surfaces need a cleaner task-level contract than raw dimensions. Without that contract, automation risks either becoming vague documentation or incorrectly competing with `field-gateway`.

## What Changes

- Add a read-only edge supervision plan on top of `field-link-monitor`.
- Expose `GET /v1/automation` for OpenClaw/Hermes/local display sidecars.
- Convert link dimensions into task-level recommendations with explicit automation boundaries.
- Add a Hermes-style RK3568 supervisor sidecar that consumes `/v1/automation` and exposes `/v1/supervision`.
- Add a safe Hermes action API for display/natural-language layers to trigger read-only recheck/report flows.
- Add `aiModels[]` registry output so later edge models can be added without reshaping the gateway contract.
- Forbid sidecars from restarting `field-gateway`, taking over serial ingest, switching Wi-Fi, or writing gateway state.

## Impact

- Affected specs: `rk3568-edge-supervision`
- Affected code: `services/field-link-monitor`, `services/hermes-edge-supervisor`, RK3568 install/check scripts, sidecar docs
- Compatibility: additive HTTP endpoint and additive `automation` block; existing `/healthz` and `/v1/summary` remain available.
