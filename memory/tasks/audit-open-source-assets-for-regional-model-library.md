---
title: audit-open-source-assets-for-regional-model-library
type: note
tags:
- task
- ai
- research
- regional-model
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/audit-open-source-assets-for-regional-model-library
---

# Task: audit-open-source-assets-for-regional-model-library

## Goal

Produce a reliable, implementation-oriented shortlist of truly reusable open-source models, frameworks, datasets, and reference repos for the regional expert model library route.

## Current State

- `C` has been chosen as the architecture direction.
- Monthly journal already records:
  - the regional expert library route
  - latest research references
  - initial reuse screening
- Durable memory now records:
  - the architecture decision
  - the reusable asset map
- Initial due diligence has confirmed:
  - `Chronos`, `TimesFM`, `Uni2TS`, `Time-MoE`, `fev`, `USGS thresholds`, `LHASA`, `Sen12Landslides`
  - several landslide-specific repos have no explicit code license

## Constraints

- Prefer `Apache-2.0`, `MIT`, public-domain, or otherwise clear production-friendly licenses.
- Avoid binding the main production path to `NC` or unclear-license assets.
- Keep the current repo entry point centered on `services/ai-prediction-worker`.
- Do not let the remote-sensing branch derail the first online sensor-warning path.

## Plan

- Finish the reusable asset shortlist with license caveats.
- Turn the shortlist into a first-phase implementation stack.
- Define which assets are:
  - production candidates
  - research-only references
  - remote-sensing branch only
- Feed the result into the future `RegionProfile` and `RegionExpertPackage` design.

## Open Questions

- Will published `Moirai` weights ever be used beyond research verification?
- Should `LHASA` be wrapped as an offline prior generator or only used for regional analysis?
- Which first batch of public regional datasets will become the initial regional experts?

## Done When

- A stable shortlist exists with license status, direct role, and integration recommendation.
- The team can start defining schemas and implementation modules without redoing open-source due diligence.
