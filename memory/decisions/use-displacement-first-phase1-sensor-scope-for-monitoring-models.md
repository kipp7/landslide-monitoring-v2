---
title: use-displacement-first-phase1-sensor-scope-for-monitoring-models
type: note
tags:
- decision
- ai
- regional-model
- displacement
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/use-displacement-first-phase1-sensor-scope-for-monitoring-models
---

# Decision: use-displacement-first-phase1-sensor-scope-for-monitoring-models

## Context

The Badong-Huangtupo open-access monitoring cluster now includes displacement, crack, rainfall, groundwater, pore-pressure, tunnel settlement, tunnel flow, temperature, and water-content related families. The first product-facing model line must stay aligned with fields that the current software layer can use cleanly and should not expand into hard-to-productize sensors only because the raw files exist.

## Decision

- Use displacement as the only required phase-1 sensor family for the Badong-Huangtupo core displacement sample factory and baseline model.
- Treat weather rainfall and cave crack as optional context features when coverage exists.
- Defer these families from phase-1 required features:
  - groundwater depth
  - groundwater temperature
  - pore pressure
  - tunnel settlement
  - tunnel flow
  - slip-belt temperature and water content
  - cave-water temperature

## Rationale

- The current Badong-Huangtupo rainfall coverage in core samples is only about `16%` for `24h / 72h` rainfall windows, so requiring rainfall would unnecessarily discard useful displacement samples.
- Groundwater, pore-pressure, tunnel, temperature, and water-content signals are mechanistically useful but are not stable required fields in the current product path.
- Tunnel settlement is a different deformation target and should not be merged into the primary displacement label without a separate task policy.
- The cleanest first route is a product-aligned displacement backbone, with optional hydrometeorological or crack context added only when present.

## Consequences

- `BADONG_HUANGTUPO_PACK.requiredSensors` is narrowed to `["displacement"]`.
- `weather-rainfall` and `cave-crack` remain available as optional context features.
- The Badong-Huangtupo core sample factory emits displacement-first samples and records deferred sensor families in its report.
- The first Badong-Huangtupo baseline should be described as an open-access regional support-set proof, not as the main high-metric displacement model.
- The main paper/competition displacement metric line remains the Baijiabao v14 model until stronger cross-region monitoring coverage is available.

## Follow-up

- Keep application-gated Huangtupo surface displacement and cave rainfall as high-value data requests.
- Add groundwater, pore-pressure, tunnel flow, and tunnel settlement back only as explicit ablation/challenger branches.
- Do not promote a model that depends on deferred-only sensors into the current online worker path.
