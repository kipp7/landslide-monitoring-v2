---
title: adopt-solution-c-and-open-stack-for-regional-model-library
type: note
tags:
- decision
- ai
- landslide
- regional-model
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/adopt-solution-c-and-open-stack-for-regional-model-library
---

# Decision: adopt-solution-c-and-open-stack-for-regional-model-library

## Context

The project needs a real training and deployment route for landslide prediction that respects strong regional heterogeneity in Chinese public datasets and future field deployments. The team also wants to avoid doing low-value work or getting stuck on research demos that cannot be reused in production.

## Decision

- Adopt:
  - `C. 区域专家模型库 + 学习式匹配 + replay 重排 + 本地接管`
- Treat region as the primary unit of the model library, not as an adapter tag on top of a national model.
- Prefer an open and production-friendly stack for first implementation:
  - `Chronos-2 / Chronos-Bolt` for fallback and challenger
  - `Uni2TS` as the main training scaffold for self-trained regional experts
  - `TimesFM 2.5` for local small-sample adaptation experiments
  - `fev` for replay and rerank evaluation
  - `USGS landslides-thresholds` and `NASA LHASA` as prior / comparator tools, not as the main online predictor
- Treat non-commercial or unclear-license assets carefully:
  - `Moirai` published weights are `cc-by-nc-4.0`
  - `Dataset4LandslideNets` dataset is `CC BY-NC 4.0`
  - several landslide research repos do not expose an explicit code license

## Rationale

- This route matches the actual data reality:
  - public landslide datasets are region-heavy and heterogeneous
- It preserves long-term value:
  - every new region adds a reusable expert package
- It avoids dependence on one giant unified model that is likely to suffer negative transfer
- It uses mature open-source forecasting infrastructure where possible instead of rebuilding everything from scratch
- It keeps licensing risk visible before production coupling

## Consequences

- The online worker should evolve from heuristic scoring into:
  - feature building
  - model matching
  - replay reranking
  - inference orchestration
- The team should train its own regional experts instead of relying on third-party foundation-model weights as the final production artifact.
- Remote-sensing assets should support:
  - region profiling
  - inventory building
  - post-event review
  - not the first online warning path
- Some attractive research repos remain reference-only unless their licensing posture becomes explicit.

## Follow-up

- Define `RegionProfile` and `RegionExpertPackage`
- Audit the first-phase dependency set before implementation coupling
- Add replay-rerank evaluation design around `fev`
- Reserve a licensing decision for any future use of `Moirai` published weights
