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
- The API implementation is commit `6bc29167` on branch
  `feature/rk3568-model-page-20260811`, with PR
  `https://github.com/kipp7/landslide-monitoring-v2/pull/361`.
- The UI implementation, including the cold-start display recovery change, is commit
  `a7ef6e2` on branch
  `feature/model-prediction-page-20260811`, with PR
  `https://github.com/kipp7/rk3568-edge-display/pull/1`.
- The model page is deployed on the RK3568 and is reachable through the private local
  display service at `http://127.0.0.1:1420/`.
- The board is reached through the cloud-hosted reverse SSH path: cloud loopback port
  `22079` terminates at the RK3568 SSH service. Direct Wi-Fi SSH was not used for this
  deployment.

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

## Verified Implementation

- The authenticated read-only endpoint is
  `/api/v1/edge-display/model-summary`. It uses a dedicated display token, a 30-second
  server cache, a read-only model-artifact mount, and does not write display polling to
  `api_logs`.
- The dedicated cloud runtime `lsmv2_edge_display_summary_api` listens only on
  `127.0.0.1:18089`; its root filesystem and model artifact mount are read-only. The
  observed runtime footprint was approximately 29 MiB with negligible CPU use.
- The RK3568 reverse tunnel permits only the required model-summary loopback target.
  The board-side proxy refreshes every 60 seconds and serves its last valid disk cache
  during an upstream outage.
- The UI provides `01 实时态势` and `02 模型预测` tabs, removes the synthetic traffic
  demo path, and renders missing live values as `--` rather than zero.
- Current-station evaluation is explicitly `未评估`. Future displacement is explicitly
  `不可用` until trusted displacement inputs exist. Baijiabao v22 appears only as a
  provenance-backed regional reference.
- The fixed `1024x600` model page has no Canvas or continuous animation. CDP verification
  reported a `1024x600` viewport and document, 236 elements, and no overflowing element.
- Frontend verification passed TypeScript, production build, and 25 tests. API
  verification passed the build and all 12 route tests.
- A production cross-check compared the authenticated summary endpoint with PostgreSQL,
  the signed model artifact, and the versioned Baijiabao evaluation artifact. All 86
  checks passed. The confirmed snapshot was model version `20260810T211304Z`, 44
  persisted versions, 993 current-station predictions in 24 hours, risk score `0.0721`,
  `offline` data status, and 1 of 6 available features.
- A controlled RK3568 reboot produced a new boot ID. The reverse SSH path returned in
  approximately 30-40 seconds; graphical target completed in 16.2 seconds. Display,
  field gateway, field-link monitor, Hermes supervisor, and reverse tunnel services all
  returned to `active` without manual intervention.
- After reboot, the display HTTP endpoint, model-summary proxy, Chromium kiosk, MQTT
  connection, and queue state all recovered. `spoolPending=0`, `publishFailures=0`.
- With the model page idle, the measured five-second Chromium CPU delta was `0.0%` and
  aggregate Chromium PSS was 373.8 MiB. The 3.9 GiB board had approximately 3.13 GiB
  available; the Python display proxy used approximately 10 MiB.
- The first physical power-up sometimes left the 10.1-inch HDMI panel blue even though
  Xorg and Chromium had started. The deployed script was forcing a generic
  `1024x600_60.00` 49 MHz timing while the panel EDID advertises native `1024x600`
  51.25 MHz (`60.05 Hz`). The kiosk now waits for a valid EDID, prefers the native
  timing, forces HDMI RGB 24-bit, rechecks the mode during the cold-boot window, and
  restarts Chromium after an unexpected exit.
- Two software reboots returned through the reverse tunnel without manual recovery.
  The final active mode was EDID-native `1024x600 60.05 Hz`, RGB, 24-bit, with a good
  HDMI link. Terminating Chromium caused a new browser PID to appear automatically;
  the field gateway, link monitor, and reverse tunnel remained active.
- On the animated traffic page, the whole Chromium process group measured 373.6 MiB PSS
  and 129.2% of one CPU core across a 10-second sample. It remains pinned to CPU cores
  2 and 3 at `nice=10`. During the same sample, the field gateway used 35.9 MiB and
  0.7% CPU, with approximately 3.13 GiB memory available system-wide.

## In Progress

- Await review and merge of the API and UI pull requests.
- Keep the deployed sidecar and RK3568 display under observation while A/B/C remain
  intentionally powered off.
- Await one real power-off/power-on observation of the HDMI panel. Software reboot
  evidence is not sufficient to close the physical cold-start issue.

## Next Actions

- Review and merge API PR `#361` and UI PR `#1`.
- Perform one true cold-power boot and confirm that the first power-up shows the UI,
  with `1024x600 60.05 Hz`, RGB 24-bit still active after the boot window.
- When the A/B/C nodes are powered again, verify fresh serial reads, live MQTT publish
  age, database arrival, and UI counter updates end to end.
- Recheck memory and publish latency with all three nodes actively producing data.
- Preserve HDMI at `1024x600` until the MIPI panel is commissioned; validate the actual
  MIPI timing and output name before changing the kiosk display script.

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
- Field-link monitoring currently reports critical freshness because all three nodes
  are powered off. MQTT itself remains connected with an empty spool and zero publish
  failures; do not treat the expected node-offline state as an uplink failure.
- The EDID-native timing fix is verified across software reboot only. A real power-cycle
  can expose panel-controller timing that software reboot cannot reproduce, so the
  first-power-up blue-screen issue remains open until that physical test passes.
- The NTRIP client has observed upstream `ECONNRESET` reconnects. This is separate from
  MQTT and the display deployment and should be investigated only within the GNSS/NTRIP
  task boundary.

## Rollback

- In the UI repository, check out tag `rk3568-ui-baseline-20260811` or commit `9d3aa3c`.
- Rebuild the tagged source and deploy through the existing RK3568 display installer.
- Do not roll back telemetry history, network configuration, database state, or the
  field gateway when rolling back only the display.

## Resume Prompt

Continue from API PR `#361` and UI PR `#1`. The model page and EDID-native HDMI recovery
are deployed, and software reboot verification passed. First perform a true power-off
and first-power-up display test; do not close the blue-screen issue based on software
reboot alone. Preserve the dedicated read-only endpoint, stale-cache fallback, explicit
unavailable states, and protected MQTT/field-gateway boundary. When A/B/C return,
perform the remaining fresh end-to-end publish and database-arrival validation before
declaring production acceptance.
