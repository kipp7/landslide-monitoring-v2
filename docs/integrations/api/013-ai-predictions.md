---
title: 013-ai-predictions
type: note
permalink: landslide-monitoring-v2-mainline/docs/integrations/api/013-ai-predictions
---

# 13) AI Predictions（风险预测）

权限：`data:view`

数据来源：
- AI predictions 由 `services/ai-prediction-worker` 生成并写入 PostgreSQL `ai_predictions`（见 `docs/integrations/storage/postgres/tables/20-ai-predictions.sql`）。

## 1) API（`/api/v1`）

### 1.1 列表查询

**GET** `/ai/predictions`

Query（均可选）：
- `page` / `pageSize`
- `deviceId`：UUID
- `stationId`：UUID
- `modelKey`
- `riskLevel`：`low | medium | high`
- `startTime` / `endTime`：RFC3339 UTC（按 `created_at` 过滤）

响应 `data`：
- `page` / `pageSize` / `total`
- `list[]`：预测记录

### 1.2 详情

**GET** `/ai/predictions/{predictionId}`

响应 `data`：单条预测记录。

## 2) Legacy 兼容（`/api`）

为对齐旧前端 `POST /api/ai-prediction`（Next route）调用，API service 提供兼容端点：

- `POST /api/ai-prediction`
  - body 兼容：`{ "sensorData": [ { "device_id": "uuid", "...": "..." } ] }`
  - 返回字段：`analysis` / `result` / `probability` / `timestamp` / `recommendation`

说明：
- 当前兼容端点基于简化启发式规则生成结果，并将可解析的 `device_id` 记录进 `ai_predictions`，便于统一查询与审计。

## 3) 当前 payload 扩展约定

当前正式查询契约仍保持顶层字段稳定，模型运行细节继续放在 `payload`。

当前在线 worker 已稳定写入的 payload 子段包括：

- `windowSummary`
  - 当前运行态窗口模式、窗口覆盖情况、历史数据来源、回退状态
- `featureSummary`
  - 当前关键特征摘要，如：
    - `displacementAbsMm`
    - `displacementDelta24h`
    - `rainfallSum24h`
    - `rainfallSum72h`
    - `historyMode`
- `matchedModelKey`
- `matchedModelVersion`
- `matchedScopeType`
- `matchedScopeKey`
- `matchedArtifactType`
- `matchScore`
- `requiredFeaturesSatisfied`
- `missingFeatureKeys`
- `fieldAdaptation`
  - `supported`
  - `modelKey`
  - `requiredFeatureCount`
  - `presentRequiredFeatureCount`
  - `missingFeatureKeys`
  - `canonicalInputs`
  - `acceptedSensorKeys`
  - `historicalWindowRequired`
  - `fields[]`
    - `modelRequiredFeatureKey`
    - `canonicalFeatureKey`
    - `aggregate`
    - `window`
    - `runtimeSource`
    - `acceptedSensorKeys`
    - `present`
    - `evidencePath`
- `matchTrace`
  - `rerankMode`
  - `selectedReason`
  - `replayScore`
  - `candidateSet`
- `fallbackReason`
- `stageOutputs`
  - `stage1`
    - 位移/趋势中间证据
  - `stage2`
    - 最终 warning 风险结果
- `warningFactors`
- `calibrationThreshold`
- `scoreOverThreshold`
- `calibratedRiskLevel`
- `riskCalibration`
  - `threshold`
  - `scoreOverThreshold`
  - `calibratedRiskLevel`
  - `source`
- `confirmationInference`
  - 可选；当 registry 中存在 `metadata.operationalRole = "confirmation"` 的同区域 artifact 时写入
  - 当前用于把低误报确认模型作为辅助证据，不覆盖顶层 `risk_score / risk_level`
  - 子字段与主 inference 保持同类结构：
    - `operationalRole`
    - `modelKey`
    - `modelVersion`
    - `riskScore`
    - `riskLevel`
    - `riskCalibration`
    - `fieldAdaptation`
    - `stageOutputs`
    - `warningFactors`
- `forecastInference`
  - 可选；当 registry 中存在 `metadata.operationalRole = "forecast"` 的同区域位移预测 artifact 时写入
  - 当前用于承载 Baijiabao v14 未来 `24h` 位移增量预测，不覆盖顶层 `risk_score / risk_level`
  - 关键字段：
    - `operationalRole = "forecast"`
    - `modelKey`
    - `modelVersion`
    - `artifactType = "calibrated_prediction_regression_v1"`
    - `labelKey`
    - `horizonSpec`
    - `targetUnit`
    - `predictedValue`
    - `predictedDisplacementMm`
    - `requiredFeaturesSatisfied`
    - `missingFeatureKeys`
    - `pointId`
- `secondaryInferences`
  - 可选数组；当前可承载 `confirmationInference` 和 `forecastInference`
  - 后续可扩展为巡查优先级、人工复核、不同 operating policy 的辅助模型输出
- `traceRefs`

说明：

- `payload.matchTrace.replayScore` 是当前命中 artifact 的运行时 replay 重排分数
- 它通常来自 `artifact.metadata.replaySummary.primaryScore` 的解析结果
- `payload.riskCalibration.threshold` 是当前命中 artifact 的运行时校准阈值，Baijiabao monitoring candidate 当前来自 `artifact.metadata.replaySummary.threshold`
- `payload.scoreOverThreshold` 表示 `riskScore / calibrationThreshold`，用于解释为什么较低原始分数仍可能被校准为中风险
- `payload.fieldAdaptation` 表示当前命中模型的字段适配证据链，路径固定为：
  - `telemetry.metrics / ClickHouse telemetry_raw.sensor_key`
  - `worker canonical feature`
  - `model requiredFeatureKey`
  - `ai_predictions.payload evidence`
- `payload.confirmationInference` 是辅助模型输出，不改变本条预测记录的顶层 `model_key`、`risk_score`、`risk_level`
- `payload.forecastInference` 是位移预测输出，不改变本条预测记录的顶层 `model_key`、`risk_score`、`risk_level`
- 当前 Baijiabao 双模型运行策略是：
  - 主预警：`baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - 确认/巡查：`baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
  - 写入位置：`payload.confirmationInference` 与 `payload.secondaryInferences[]`
- 当前 Baijiabao 位移 forecast 运行策略是：
  - forecast：`baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
  - 写入位置：`payload.forecastInference` 与 `payload.secondaryInferences[]`
  - 桌面 HTTP proof：`artifacts/models/regional-experts/phase1-displacement-forecast/desk-http-forecast-field-proof.report.json`
- 外部 API 本轮没有新增顶层字段；完整 replay 报告仍留在离线评测产物里

## 4) 当前运行态窗口说明

当前 `services/ai-prediction-worker` 已经支持固定历史窗口：

- `6h`
- `24h`
- `72h`

数据源优先级：

1. `ClickHouse telemetry_raw`
2. 当前正在处理的 telemetry 消息并入窗口
3. 若 ClickHouse 未配置或不可用，则自动回退到 `telemetry-only-v1`

补充说明见：

- `docs/integrations/ai/regional-model-runtime.md`
