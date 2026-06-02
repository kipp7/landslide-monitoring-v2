---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-supervision-plan/tasks
---

## 1. Specification

- [x] 1.1 Define the RK3568 edge supervision plan as a read-only sidecar contract.
- [x] 1.2 Define OpenClaw/Hermes boundaries so they consume the plan without controlling gateway core.

## 2. Implementation

- [x] 2.1 Extend `field-link-monitor` with an automation plan builder.
- [x] 2.2 Expose `GET /v1/automation`.
- [x] 2.3 Keep `/healthz` and `/v1/summary` backward compatible.
- [x] 2.4 Add `hermes-edge-supervisor` as a read-only RK3568 sidecar consuming `/v1/automation`.
- [x] 2.5 Expose `GET /v1/supervision` from the Hermes sidecar.
- [x] 2.6 Train and export a lightweight RandomForest edge diagnosis model.
- [x] 2.7 Load the model in `hermes-edge-supervisor` and emit `aiDiagnosis`.
- [x] 2.8 Expand the model feature set across link, network, node, parser, task queue, and local resource signals.
- [x] 2.9 Preserve the sidecar shape for future additional edge models.
- [x] 2.10 Expand the feature set to 64 operational features and retrain the exported RandomForest artifact.
- [x] 2.11 Add `aiModels[]` registry output for future edge models.
- [x] 2.12 Add safe Hermes action endpoints for display/natural-language intent routing.

## 3. Operations

- [x] 3.1 Update RK3568 runtime check scripts to validate `/v1/automation`.
- [x] 3.2 Document the OpenClaw/Hermes read-only consumption boundary.
- [x] 3.3 Deploy to RK3568 and refresh the latest runtime evidence artifact.
- [x] 3.4 Install `lsmv2-hermes-edge-supervisor.service` on RK3568.

## 4. Verification

- [x] 4.1 Build `@lsmv2/field-link-monitor`.
- [x] 4.2 Validate the OpenSpec change.
- [x] 4.3 Run a local proof against fixture source files.
- [x] 4.4 Build `@lsmv2/hermes-edge-supervisor`.
- [x] 4.5 Verify RK3568 SSH and on-device Hermes supervision endpoint.
- [x] 4.6 Verify on-device model inference with `modelLoaded=true`.
- [x] 4.7 Verify on-device expanded feature inference with 38 features.
- [x] 4.8 Verify local HTTP smoke for intent catalog, action recheck, model load, 64-feature inference, and `aiModels[]`.
- [x] 4.9 Run RK3568 board-local pressure test for `/v1/supervision` and `/v1/actions/recheck`.
- [x] 4.10 Preserve stress-test JSON/Markdown reports and competition backup materials.
