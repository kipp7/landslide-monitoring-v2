---
title: rk3568-edge-display-model-prediction-2026-08-11
type: note
permalink: landslide-monitoring-v2-mainline/memory/checkpoints/rk3568-edge-display-model-prediction-2026-08-11
tags:
- checkpoint,rk3568,display,model,prediction,rollback
---

# Checkpoint: RK3568 Edge Display Model Prediction

## Objective

Add a second 1024x600 RK3568 display page for model iteration, validation metrics,
future displacement, landslide probability, factor contribution, convergence, and
confidence. Every visible value must come from an authoritative database record,
model artifact, or deterministic business calculation. Missing data must remain
explicitly unavailable and must never be replaced by demo, random, or synthetic data.

## Last Confirmed State

- The stable traffic dashboard source is backed up in private repository
  `kipp7/rk3568-edge-display`.
- Rollback commit: `9d3aa3c`.
- Rollback tag: `rk3568-ui-baseline-20260811`.
- The baseline passed 20 Vitest tests, TypeScript type checking, and a production Vite
  build before it was tagged and pushed.
- The writable UI remote is now `https://github.com/kipp7/rk3568-edge-display.git`.
- The original open-source remote is retained as
  `https://github.com/Anti2077/Quantum-Leap.git` under the `upstream` name.
- The current page uses the light traffic-monitor palette and is optimized for the
  fixed 1024x600 RK3568 display.
- Physical A/B/C nodes are intentionally powered off for battery charging. Historical
  database data is available and is sufficient for implementation and offline
  validation.

## Data Integrity Rules

- Never convert an offline node into a zero-valued measurement.
- Show source observation time and freshness independently from UI refresh time.
- Metric definitions, evaluation windows, model version, dataset/site identity, and
  prediction horizon must be returned with the values or derived from a versioned
  model artifact.
- Accuracy, precision, recall, and F1 must be calculated from persisted labelled
  predictions or loaded from a verified evaluation artifact. Do not infer them from
  health scores.
- Displacement forecasts and probability horizons must come from a real model run.
  The UI may render confidence intervals only when the backend supplies valid lower
  and upper bounds.
- Factor contribution must come from the model explanation output for the same run;
  static percentages are prohibited.
- Iteration count means persisted successful training/adaptation iterations, not page
  refreshes, process starts, or MQTT messages.

## In Progress

- Audit the production database schema, API routes, RK3568 summary service, and model
  artifacts to map every proposed field to an authoritative source.
- Implement the backend summary contract and the lightweight React display page only
  after the field-level source map is proven.

## Next Actions

- Inspect current production and local service versions without changing network or
  telemetry services.
- Query existing historical telemetry and prediction tables read-only.
- Add deterministic calculations and tests for the model-display summary contract.
- Add the page switch and model page with explicit unavailable and stale states.
- Verify 1024x600 rendering, memory, CPU, frame pacing, startup recovery, and telemetry
  upload stability before deployment acceptance.

## Risks

- The business repository working tree contains unrelated in-progress changes. Commit
  only files explicitly belonging to this display task.
- A/B/C nodes being offline means fresh end-to-end sensor ingest cannot be proven until
  they are powered again; historical-data calculations and UI behavior can still be
  verified now.
- Existing model or database fields may use definitions different from the draft UI.
  The implementation must follow authoritative definitions rather than preserve a
  placeholder label.
- UI work must not restart, reconfigure, or contend with MQTT, field-gateway, telemetry
  spool, database, or network failover services.

## Rollback

- In the UI repository, check out tag `rk3568-ui-baseline-20260811` or commit `9d3aa3c`.
- Rebuild the tagged source and deploy through the existing RK3568 display installer.
- Do not roll back telemetry history, network configuration, database state, or the
  field gateway when rolling back only the display.

## Resume Prompt

Continue the RK3568 model prediction page from the backed-up UI baseline. Prove a real
database, API, or model-artifact source for every field before rendering it. Use
historical data while A/B/C are powered off, preserve explicit stale/unavailable
states, and verify display resource use does not degrade telemetry upload stability.
