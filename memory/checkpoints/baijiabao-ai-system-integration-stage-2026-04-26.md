---
title: baijiabao-ai-system-integration-stage-2026-04-26
type: note
tags:
- checkpoint
- ai
- regional-model
- system-integration
status: active
permalink: landslide-monitoring-v2-mainline/memory/checkpoints/baijiabao-ai-system-integration-stage-2026-04-26
---

# Checkpoint: Baijiabao AI System Integration Stage 2026-04-26

## Objective

Use Baijiabao as the first complete AI sample line that connects model execution, system integration, product display, and competition / paper documentation.

## Last Confirmed State

- Baijiabao v14 displacement forecast model is runtime-registered as a `forecast` artifact.
- The model predicts future `24h` surface displacement increment in `mm`.
- The warning/risk model remains separate and owns `riskScore / riskLevel`.
- PostgreSQL, API, and desktop HTTP mapper proof has passed:
  - report:
    - `artifacts/models/regional-experts/phase1-displacement-forecast/desk-http-forecast-field-proof.report.json`
  - latest prediction id:
    - `c6838594-012a-4b2c-a4aa-32a644e03cf3`
  - forecast value:
    - `0.411357063187622 mm`
  - horizon:
    - `24h`
  - required features:
    - satisfied
- Desktop pages already have code paths to display forecast output as product-facing deformation prediction.

## In Progress

The next discussion is no longer whether the model exists. The next discussion is how to integrate and expose the forecast in the existing system cleanly.

## Next Actions

- Decide where forecast should appear in product UX:
  - Analysis summary
  - GPS monitoring page
  - export/report output
  - competition evidence package
- Keep `ai_predictions.payload.forecastInference` as the extension carrier unless querying forecast fields becomes operationally necessary.
- Keep typed client mapping as the software contract:
  - `AiPrediction.forecastInference`
- Preserve the warning/forecast split:
  - warning uses `riskScore / riskLevel`
  - displacement forecast uses `predictedDisplacementMm`

## Risks

- Do not describe `93.72%` as displacement prediction accuracy.
- Do not write forecast output into top-level `risk_score / risk_level`.
- Do not add database columns prematurely.
- Do not let deferred sensor families such as groundwater, tunnel flow, or tunnel settlement block phase-1 system integration.

## 2026-04-26 UI Terminology And Export Update

- Desktop product terminology has been tightened:
  - user-facing `GPS deformation / GPS analysis / AI displacement forecast` wording is now expressed as `deformation monitoring / deformation analysis / AI deformation forecast`.
  - underlying API contracts, `gps_*` telemetry keys, `api.gps`, `/api/v1/gps/*` routes, CSS classes, and file/module names were intentionally left unchanged to avoid breaking existing integrations.
- `forecastInference` is now carried into deformation monitoring reports:
  - JSON analysis export includes the raw typed forecast object.
  - TXT report includes AI deformation forecast value, horizon, model version/key, and required-feature status.
- Desktop build proof passed:
  - `npm run build --workspace landslide-monitor-desk`
  - only the existing Vite large chunk warning remains.

## 2026-04-26 Prediction Tab Productization

- The deformation monitoring `预测分析` tab now has a dedicated `AI形变预测` section.
- It exposes four product-facing blocks:
  - future deformation increment from `forecastInference.predictedDisplacementMm`
  - forecast window and point context
  - forecast model status with version as secondary text
  - warning reference, keeping calibrated risk separate from forecast
- The former copy action was removed because this is a normal model-output display area, not an operator review workflow.
- Desktop build proof passed:
  - `npm run build --workspace landslide-monitor-desk`
  - only the existing Vite large chunk warning remains.

## 2026-04-27 Prediction Tab Product Copy Polish

- The `AI形变预测` area was simplified from a technical/explanatory block into a product-facing status panel.
- The first pass visible cards focused on:
  - `预计增量`
  - `预测窗口`
  - `模型状态`
  - `风险参考`
- The follow-up multidimensional pass expanded the top panel to eight compact cards:
  - `预计增量`
  - `当前位移`
  - `形变速度`
  - `趋势方向`
  - `预测置信`
  - `数据质量`
  - `模型状态`
  - `风险参考`
- User-facing copy no longer exposes implementation terms such as `forecastInference`, `risk_score`, `score/threshold`, or long model keys in the main page.
- The added dimensions reuse existing data only: typed forecast output, derived analysis, chart data, quality score, baseline status, and risk calibration.
- The deformation monitoring route now supports the `tab` query parameter, so `/app/gps-monitoring?tab=prediction` can open the prediction tab directly for demos and visual review.
- The risk/forecast boundary is still preserved:
  - AI deformation forecast shows short-term increment.
  - warning level remains independently judged by the risk model.
- Desktop build proof passed:
  - `npm run build --workspace landslide-monitor-desk`
  - only the existing Vite large chunk warning remains.

## Resume Prompt

Continue from this checkpoint. First confirm the latest proof report still passes, then discuss or implement the cleanest product/system integration path for `forecastInference` without changing the existing architecture.
