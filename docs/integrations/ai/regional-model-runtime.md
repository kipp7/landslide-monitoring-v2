---
title: regional-model-runtime
type: note
permalink: landslide-monitoring-v2-mainline/docs/integrations/ai/regional-model-runtime
---

# Regional Model Runtime

本文固定 `services/ai-prediction-worker` 当前区域模型运行时边界，避免后续把离线训练、在线路由、历史窗口和 payload 证据链重新混在一起。

## 1) 在线边界

- 在线推理入口固定为：
  - `services/ai-prediction-worker/src/index.ts`
- 在线运行时只负责：
  - 消费 `telemetry.raw.v1`
  - 解析设备到 `stationCode / slopeCode / regionCode`
  - 构建运行态特征
  - 选择 artifact
  - 执行 `single-stage` 或 `two-stage` artifact 推理，必要时回退 heuristic
  - 写入 `ai_predictions`
  - 发布 `ai.predictions.v1`
- 离线接入、样本构建、训练、replay 评测仍固定在：
  - `libs/regional-model-library/*`
  - `scripts/dev/regional-model-library/*`
  - `.tmp/regional-model-library/*`

## 2) 历史窗口模式

当前 worker 不再只看单条 telemetry。

运行时现在支持固定窗口：

- `6h`
- `24h`
- `72h`

窗口数据源优先级：

1. `ClickHouse telemetry_raw`
2. 当前正在处理的 `telemetry.raw.v1` 消息并入窗口
3. 若 ClickHouse 未配置或不可用，则自动退回 `telemetry-only-v1`

当前窗口模式值：

- `clickhouse+telemetry-v1`
- `telemetry-only-v1`

说明：

- `device_state` 只是最新影子，不参与历史窗口聚合
- 历史窗口主时间轴仍以 `received_ts` 为准
- 当前消息会并入窗口，避免和 `telemetry-writer` 的落库时序产生竞态

## 3) 当前 canonical runtime features

当前 worker 运行态直接产出的基础 canonical key：

- `displacementSurfaceMm`
- `crackDisplacementMm`
- `rainfallCurrentMm`
- `reservoirLevelM`
- `groundwaterLevelM`
- `airTemperatureC`
- `beidouDispX`
- `beidouDispY`
- `beidouDispZ`
- `tunnelFlowRate`
- `displacement_abs_mm`
- `tilt_abs_deg`
- `vibration_abs_g`

当前 worker 额外产出的窗口特征键规则：

- `<canonicalKey>_last_<6h|24h|72h>`
- `<canonicalKey>_delta_<6h|24h|72h>`
- `<canonicalKey>_mean_<6h|24h|72h>`
- `<canonicalKey>_min_<6h|24h|72h>`
- `<canonicalKey>_max_<6h|24h|72h>`
- `rainfallCurrentMm_sum_<6h|24h|72h>`

注意：

- `delta` 仅在窗口内至少有两点时生成
- 当前仍不是完整两段式基线；这些窗口特征是两段式和 replay 重排的运行态底座

## 4) Payload Evidence

`ai_predictions.payload` 当前应至少保留这些运行态证据：

- `windowSummary`
  - `sourceMode`
  - `historySource`
  - `historyError`
  - `requestedWindows`
  - `coverage`
  - `backfilledFeatureKeys`
- `featureSummary`
  - `presentFeatureKeys`
  - `backfilledFeatureKeys`
  - `displacementAbsMm`
  - `displacementDelta24h`
  - `rainfallSum24h`
  - `rainfallSum72h`
  - `historyMode`
  - `historyError`
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
    - `stageKey`
    - `outputKey`
    - `score`
    - `rawScore`
    - `topContributions`
  - `stage2`
    - `stageKey`
    - `outputKey`
    - `score`
    - `rawScore`
    - `topContributions`
- `warningFactors`
- `traceRefs`
  - `historySource`
  - `historyMode`
  - `historyError`
  - `regionCode`
  - `slopeCode`
  - `stationCode`
  - `nodeCode`
  - `gatewayCode`

说明：

- `payload.matchTrace.replayScore` 只是当前选中候选在运行时解析出的 replay 分数
- 它不是完整 replay 报告，也不是整份 artifact metadata 的原样透传
- `payload.fieldAdaptation` 用于解释模型字段如何适配系统字段；它不要求前端或原始数据直接使用模型字段名
- 当前稳定映射链固定为：
  - `telemetry.metrics / ClickHouse telemetry_raw.sensor_key aliases`
  - `worker canonical feature`
  - `model requiredFeatureKey`
  - `ai_predictions.payload evidence`

## 5) Environment Variables

`services/ai-prediction-worker/.env.example` 现在的关键变量分为三组。

Kafka:

- `KAFKA_BROKERS`
- `KAFKA_CLIENT_ID`
- `KAFKA_GROUP_ID`
- `KAFKA_TOPIC_TELEMETRY_RAW`
- `KAFKA_TOPIC_AI_PREDICTIONS`

Storage / runtime history:

- `POSTGRES_URL` 或 `POSTGRES_HOST/PORT/USER/PASSWORD/DATABASE`
- `CLICKHOUSE_URL`
- `CLICKHOUSE_USERNAME`
- `CLICKHOUSE_PASSWORD`
- `CLICKHOUSE_DATABASE`
- `CLICKHOUSE_TABLE`

Model / artifact:

- `PREDICT_HORIZON_SECONDS`
- `ARTIFACT_ROOT_DIR`
- `FEATURE_HISTORY_LOOKBACK_HOURS`

兼容说明：

- `CLICKHOUSE_URL` 未配置时，worker 仍可运行
- 未配置 ClickHouse 时自动退回 `telemetry-only-v1`

## 6) 当前未完成项

当前仍未完成：

- 基于真实区域样本训练出来的生产级 artifact registry
- `FEV / TIME` 级 replay leaderboard 接入

## 7) Static Prior Path

当前已经允许把区域静态先验直接放进 `stations.metadata`，不需要额外新建运行时服务。

当前 worker 会优先从这些 region-side 路径读取 `landCover`：

- `stationMetadata.staticFactors.landCover`
- `stationMetadata.properties.staticFactors.landCover`
- `stationMetadata.regionProfile.properties.staticFactors.landCover`
- `metadata` 下同等路径

当前推荐的最小 authoritative 落点是：

- `stations.metadata.staticFactors.landCover`

原因：

- 这和 worker 当前最优先读取路径一致
- 不需要把完整 `RegionProfile` 大对象塞进 runtime metadata
- 已经被 `model-matcher.ts` 的静态 prior 逻辑直接消费
- 站点侧还能额外保留一个轻量：
  - `stations.metadata.regionProfileRef`
  只做来源追溯，不承担运行时解析

离线到在线的当前建议接法：

1. 先用 `scripts/dev/regional-model-library/build-clcd-region-profiles.ts` 产出 `CLCD` 区域 profile
2. 再把 profile 中的 `properties.staticFactors.landCover` 回填到 `stations.metadata.staticFactors.landCover`
3. 同时写一个轻量 `stations.metadata.regionProfileRef`
4. artifact 侧用 `scripts/dev/regional-model-library/build-land-cover-affinity.ts` 生成 `artifact.metadata.landCoverAffinity`
5. 训练时继续使用 `train-linear-risk-model.ts --artifact-metadata-file ...`

当前回填辅助脚本：

- `scripts/dev/backfill-station-region-profile.ps1`
  - 默认从 `CLCD` profile 目录读取 profile
  - 可用 `BindingsFile` 绑定运行时站点与 `sourceRegionCode`
  - 默认先做 plan-only；只有显式 `-Apply` 才会调用 `/api/v1/stations/:id`
- `scripts/dev/regional-model-library/build-station-region-binding.ts`
  - 可从观测数据集元数据坐标自动生成 `BindingsFile`
  - 当前做法是把数据集元数据中心点匹配到现有 `CLCD` region profile 的 `bboxWgs84`
  - 适合第一波 `custom runtime regionCode -> CLCD county sourceRegionCode` 落地

## 8) 当前 matcher 状态

当前 matcher 已经不是 first-hit。

现在的 worker 路由顺序是：

1. 收集 `station / slope / region / global` 四层候选集
2. 先按：
   - scope priority
   - feature coverage
   - training sample count
   - training dataset breadth
   做基础评分
3. 若 artifact 顶层 `metadata` 中已有 replay-style 分数，则再走一层 metadata-driven rerank hook
4. 最终把 top candidate trace 写回 payload

当前 rerank mode 现在有四种：

- `base-only`
- `static-prior`
- `metadata-replay`
- `metadata-replay+static-prior`

说明：

- 当前 repo-native 标准写回路径固定为：
  - `artifact.metadata.replaySummary.updatedAt`
  - `artifact.metadata.replaySummary.sampleCount`
  - `artifact.metadata.replaySummary.accuracy`
  - `artifact.metadata.replaySummary.precision`
  - `artifact.metadata.replaySummary.recall`
  - `artifact.metadata.replaySummary.f1`
  - `artifact.metadata.replaySummary.brier`
  - `artifact.metadata.replaySummary.auc`
  - `artifact.metadata.replaySummary.primaryScore`
- 当前 matcher 优先消费：
  - `artifact.metadata.replaySummary.primaryScore`
- 当前静态 prior 侧还会读取：
  - `artifact.metadata.landCoverAffinity`
  - `artifact.metadata.staticPrior.landCoverAffinity`
  - `artifact.metadata.routing.landCoverAffinity`
  - `artifact.metadata.matcher.landCoverAffinity`
- 为了兼容旧写法，matcher 仍向下兼容其他 replay-style key
- 这已经能支撑 `candidate-set + replay hook` 主线
- 但还不是最终的 learned rerank
- 后面 `FEV / TIME` 或本地 leaderboard 成绩到位后，应继续写回 artifact metadata，再提升这层 rerank 质量
- 当前 matcher 会识别 artifact 的运行角色：
  - `metadata.operationalRole`
  - `metadata.routing.operationalRole`
  - `metadata.matcher.operationalRole`
- `operationalRole = "confirmation"` 或 `"confirmation-challenger"` 的 artifact 不参与抢占主预警模型；它们只作为辅助输出进入 `payload.confirmationInference / payload.secondaryInferences[]`
- `operationalRole = "forecast"` 的 artifact 不参与抢占主预警模型；它们只作为位移预测输出进入 `payload.forecastInference / payload.secondaryInferences[]`
- 主预警模型仍由 candidate-set rerank 选择，确认模型由同一 `station / slope / region / global` 候选范围按角色收集后独立执行

因此当前结论应写成：

- `worker 已具备历史窗口特征、两段式 artifact/runtime 与 payload 中间证据`
- 不是：
  - `区域模型主线已经彻底完成`

## 9) 当前已验证离线基线

截至 `2026-04-22`，当前已经有一条可被 runtime 直接消费的离线基线：

- registry:
  - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-035-explicit-no-crack/registry.json`
- 当前已写回的 replay metadata 来源：
  - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-035-explicit-no-crack/evaluation-report.max-balanced-accuracy.writeback.json`
- 当前 matcher 可直接消费：
  - `artifact.metadata.replaySummary.primaryScore`

当前这条基线的 phase-1 required feature 结论应保持为：

- `displacementSurfaceMm`
- `rainfallCurrentMm`
- `reservoirLevelM`

说明：

- `crackDisplacementMm`
  当前还不能视为这条长时序 station expert 的稳定 required feature
- 原因不是 runtime 不支持它
- 而是当前 `Baijiabao` 真实观测里：
  - 无稳定 `point_id <-> crack_id` 对应关系
  - 且 crack 监测时段明显短于主 GNSS 时段
- 因此当前 runtime 主线应把 `crack` 视为：
  - `auxiliary`
  - 或后续 `challenger` 分支
- 当前这一结论也已经被离线训练策略显式固化：
  - `train-linear-risk-model.ts --exclude-features crackDisplacementMm`

## 10) Baijiabao 字段适配状态

当前 Baijiabao 正式候选和两个 challenger 已有字段适配校验脚本：

- `scripts/dev/regional-model-library/check-baijiabao-runtime-field-adaptation.mjs`

当前输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-runtime-field-adaptation/baijiabao-runtime-field-adaptation.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-runtime-field-adaptation/baijiabao-runtime-field-adaptation.report.md`

当前结论：

- `published`
  - required features:
    - `41`
  - canonical inputs:
    - `displacementSurfaceMm`
    - `rainfallCurrentMm`
    - `reservoirLevelM`
  - status:
    - supported
- `balancedChallenger`
  - required features:
    - `27`
  - canonical inputs:
    - `rainfallCurrentMm`
    - `reservoirLevelM`
  - status:
    - supported
- `lowFalsePositiveChallenger`
  - required features:
    - `14`
  - canonical inputs:
    - `reservoirLevelM`
  - status:
    - supported

当前可接受的关键系统输入别名：

- `displacementSurfaceMm`
  - `displacementSurfaceMm`
  - `displacement_mm`
  - `displacement`
  - `disp_mm`
  - `gps_displacement_mm`
  - `cumulative_displacement_mm`
- `rainfallCurrentMm`
  - `rainfallCurrentMm`
  - `rainfall_mm`
  - `rain_mm`
  - `precipitation_mm`
  - `precipitation`
  - `rainfall`
- `reservoirLevelM`
  - `reservoirLevelM`
  - `reservoir_level_m`
  - `water_level_m`
  - `level_m`

运行约束：

- 这些模型都依赖 `6h / 24h / 72h` 历史窗口字段
- 因此线上应优先保证 ClickHouse `telemetry_raw` 中对应 `sensor_key` 连续落库
- 若只有单条 telemetry 当前值，基础字段能解析，但窗口特征不足时模型会进入 missing-required-features fallback

## 11) Baijiabao 双模型运行策略

当前已验证一版不改数据库结构的双模型运行时：

- registry builder:
  - `scripts/dev/regional-model-library/build-baijiabao-dual-runtime-registry.mjs`
- runtime smoke:
  - `scripts/dev/regional-model-library/check-baijiabao-dual-runtime-output.mjs`
- DB e2e smoke:
  - `scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs --artifact-root-dir .tmp/regional-model-library/out/artifacts/baijiabao-dual-runtime-registry --expected-model-key baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1 --expected-calibration-threshold 0.184245 --expected-confirmation-model-key baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`

当前角色分配：

- `primary-warning`
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - 用途:
    - 顶层 `model_key / risk_score / risk_level`
  - 当前阈值:
    - `artifact.metadata.replaySummary.threshold = 0.184245`
- `confirmation`
  - model:
    - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
  - 用途:
    - `payload.confirmationInference`
    - `payload.secondaryInferences[]`
    - 低误报确认、巡查优先级、人工复核辅助

已验证结果：

- `check-baijiabao-dual-runtime-output.mjs`
  - pass
  - primary:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - confirmation:
    - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
  - 两个模型 `fieldAdaptation.supported = true`
- `run-baijiabao-monitoring-e2e-smoke.mjs` 双模型 registry
  - pass
  - PostgreSQL `ai_predictions.payload` 已能读回：
    - `confirmationInference.modelKey`
    - `confirmationInference.operationalRole`
    - `confirmationInference.fieldAdaptation.supported`
    - `secondaryInferences.length = 1`

设计边界：

- 不把确认模型提升为顶层预测结果
- 不为了双模型新增 PostgreSQL 列
- 不把模型字段名反向推给设备、前端或数据库
- 字段适配仍通过 `payload.fieldAdaptation` 和 `payload.confirmationInference.fieldAdaptation` 解释

## 12) Baijiabao promotion 稳定性门槛

当前 promotion 不能只看 overall BA / AUC / F1，还必须看：

- lead-time episode hit rate
- seasonal recall
- point-level recall
- false-positive pressure

稳定性检查脚本：

- `scripts/dev/regional-model-library/check-baijiabao-challenger-stability.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-challenger-stability/baijiabao-challenger-stability.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-challenger-stability/baijiabao-challenger-stability.report.md`

当前样本事实：

- validation samples:
  - `1458`
- positives:
  - `108`
- positive episodes:
  - `81`
- point ids:
  - `ZD1`
  - `ZD2`
  - `ZD3`

当前稳定性结果：

- `published`
  - BA:
    - `0.6103`
  - precision:
    - `0.1463`
  - recall:
    - `0.4095`
  - FP / FN:
    - `251 / 62`
  - 7-day lead hit rate:
    - `0.3580`
  - gate:
    - blocked
- `primaryWarningChallenger`
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - BA:
    - `0.6216`
  - precision:
    - `0.2033`
  - recall:
    - `0.3524`
  - FP / FN:
    - `145 / 68`
  - 7-day lead hit rate:
    - `0.2840`
  - gate:
    - blocked
- `confirmationChallenger`
  - model:
    - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
  - BA:
    - `0.6065`
  - precision:
    - `0.7419`
  - recall:
    - `0.2190`
  - FP / FN:
    - `8 / 82`
  - 7-day lead hit rate:
    - `0.1235`
  - gate:
    - blocked as top-level warning model

关键 blocker：

- `primaryWarningChallenger`
  - false positives 明显下降：
    - `251 -> 145`
  - precision 明显上升：
    - `0.1463 -> 0.2033`
  - 但 winter recall 为：
    - `0`
  - autumn recall 只有：
    - `0.0417`
  - 7-day lead hit rate 只有：
    - `0.2840`
- `confirmationChallenger`
  - 满足低误报确认模型定位：
    - FP:
      - `8`
    - precision:
      - `0.7419`
  - 但 recall 和 lead hit rate 太低，不能作为顶层预警模型。

当前执行结论：

- 保留双模型 runtime。
- 不覆盖 published registry。
- `primaryWarningChallenger` 继续作为主预警候选，不做正式 promotion。
- `confirmationChallenger` 可以继续作为 `payload.confirmationInference` 的确认/巡查证据。
- 下一步应优先解决 seasonal/lead-time 问题，而不是继续盲目扩大网格。

## 13) Baijiabao seasonal / lead-time 修复筛查

在 stability gate 失败后，已经补做三个更细的筛查脚本：

- `scripts/dev/regional-model-library/check-baijiabao-seasonal-threshold-policy.mjs`
  - 用 train split 学全局/分季节阈值
  - 用 validation split 检查是否能补 seasonal recall 和 lead hit rate
  - 输出：
    - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-threshold-policy/baijiabao-seasonal-threshold-policy.report.json`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-threshold-policy/baijiabao-seasonal-threshold-policy.report.md`
- `scripts/dev/regional-model-library/check-baijiabao-seasonal-feature-gap.mjs`
  - 检查各季节正负样本的单变量可分性
  - 判断当前主预警模型缺了哪些季节触发特征
  - 输出：
    - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-feature-gap/baijiabao-seasonal-feature-gap.report.json`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-feature-gap/baijiabao-seasonal-feature-gap.report.md`
- `scripts/dev/regional-model-library/check-baijiabao-hybrid-seasonal-policy.mjs`
  - 评估保守 hybrid：
    - 主模型仍用 `rainfall-reservoir`
    - autumn / winter 时尝试用现有 displacement booster 补触发
  - booster 阈值从 train split 学习，validation split 验证
  - 输出：
    - `.tmp/regional-model-library/out/artifacts/baijiabao-hybrid-seasonal-policy/baijiabao-hybrid-seasonal-policy.report.json`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-hybrid-seasonal-policy/baijiabao-hybrid-seasonal-policy.report.md`

筛查结论：

- 分季节阈值不是可上线修复：
  - baseline BA:
    - `0.6216`
  - baseline FP:
    - `145`
  - baseline lead hit rate:
    - `0.2840`
  - `train-season-maximize-f2` 可以把 recall 提到：
    - `0.6286`
  - 也可以把 lead hit rate 提到：
    - `0.6420`
  - 但代价是：
    - FP:
      - `801`
    - precision:
      - `0.0761`
    - BA:
      - `0.5129`
  - 所以不能作为 runtime policy。
- 简单 hybrid booster 也不是可上线修复：
  - 用 train split 学出来的 displacement-reservoir / compact-process / current-all-no-crack booster 阈值
  - 在 validation 的 autumn / winter 没有带来新增有效命中
  - 所有 hybrid policy 都等同 primary-only baseline
- feature-gap 说明当前主因不是阈值：
  - validation winter 最强可用信号包括：
    - `displacementSurfaceMm_delta_24h`
    - `displacementSurfaceMm_delta_72h`
  - 这些特征不在当前 `rainfall-reservoir` 主预警候选里
  - autumn 主要由 `reservoirLevelM_delta_24h / 72h` 方向变化驱动，但 score overlap 很重

当前执行结论：

- 不改 runtime threshold policy。
- 不加入 seasonal threshold hack。
- 不加入现有模型 OR hybrid hack。
- 下一步应做新的 `seasonal / trigger-aware challenger`：
  - 显式测试 displacement delta evidence
  - 保持 false-positive guardrail
  - 单独看 autumn / winter label semantics
  - 必要时重新定义 lead-time episode 评价，而不是只调阈值

## 14) Baijiabao trigger-aware challenger 筛查

当前已完成第一版 trigger-aware 离线筛查，但不改变 runtime。

脚本：

- `scripts/dev/regional-model-library/check-baijiabao-trigger-aware-challenger.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-challenger/baijiabao-trigger-aware-challenger.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-challenger/baijiabao-trigger-aware-challenger.report.md`

筛查方式：

- 主模型保持：
  - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
- primary threshold 保持：
  - `0.184245`
- train split 用于选择 trigger policy。
- validation split 用于最终 guardrail。
- 候选 trigger 只针对：
  - `winter`
  - `autumn`
  - `autumn + winter`
- 候选特征包括：
  - `displacementSurfaceMm_delta_24h`
  - `displacementSurfaceMm_delta_72h`
  - `reservoirLevelM_delta_24h`
  - `reservoirLevelM_delta_72h`
  - `reservoirLevelM`
  - `rainfallCurrentMm`
  - `rainfallCurrentMm_sum_24h`
  - `rainfallCurrentMm_sum_72h`

样本事实：

- train rows:
  - `5782`
- train episodes:
  - `307`
- validation rows:
  - `1434`
- validation episodes:
  - `79`
- evaluated candidate policies:
  - `251`

baseline validation 结果：

- model:
  - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
- BA:
  - `0.6216`
- precision:
  - `0.2033`
- recall:
  - `0.3524`
- FP / FN:
  - `145 / 68`
- lead hit rate:
  - `0.2911`
- worst season recall:
  - `0`

当前最稳妥的 trigger-aware 离线候选：

- policy:
  - `trigger-autumn-winter-displacementSurfaceMm_delta_24h-low--0.8`
- trigger:
  - autumn / winter 时，`displacementSurfaceMm_delta_24h <= -0.8`
- BA:
  - `0.6245`
- precision:
  - `0.1630`
- recall:
  - `0.4190`
- FP / FN:
  - `226 / 61`
- lead hit rate:
  - `0.6329`
- pre-alert rate:
  - `0.5696`
- worst season recall:
  - `0.1538`
- worst point recall:
  - `0.4000`

解释：

- 这条 trigger-aware policy 证明 `displacement delta` 对 autumn / winter 提前量有价值。
- 它把 lead hit rate 从 `0.2911` 提升到 `0.6329`，并把 winter recall 从 `0` 提升到 `0.1538`。
- 但 FP 从 `145` 增加到 `226`，precision 从 `0.2033` 降到 `0.1630`。
- 因此它只能进入“离线 challenger policy / 待复核 artifact”阶段，不能直接改 runtime threshold 或覆盖 registry。

当前执行结论：

- 不改 runtime。
- 不覆盖 published registry。
- 不把 trigger rule 写成线上硬规则。
- 下一步应把该候选做成可复现的 offline challenger artifact / policy metadata，并补做：
  - autumn / winter label semantics review
  - event episode 边界复核
  - 更严格 FP 成本门槛
  - 目标区域人工可解释性复核

## 15) Baijiabao trigger-aware policy card / strict review

当前已把 trigger-aware 结果收敛成独立 policy card，而不是 runtime registry。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-trigger-aware-policy-card.mjs`

默认宽松候选输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card/baijiabao-trigger-aware-policy-card.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card/baijiabao-trigger-aware-promotion-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card/baijiabao-trigger-aware-policy-card.md`

严格候选输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-policy-card.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-promotion-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-policy-card.md`

严格候选：

- key:
  - `trigger-autumn-winter-displacementSurfaceMm_delta_24h-low--1.2`
- trigger:
  - autumn / winter 时，`displacementSurfaceMm_delta_24h <= -1.2`
- runtimePromotionStatus:
  - `candidate-review-required`
- baseline:
  - BA:
    - `0.6216`
  - precision:
    - `0.2033`
  - recall:
    - `0.3524`
  - FP / FN:
    - `145 / 68`
  - lead hit rate:
    - `0.2911`
- strict trigger-aware:
  - BA:
    - `0.6315`
  - precision:
    - `0.1875`
  - recall:
    - `0.4000`
  - FP / FN:
    - `182 / 63`
  - lead hit rate:
    - `0.4810`
  - newly alerted TP / FP:
    - `5 / 37`
  - newly hit episodes:
    - `15`
  - newly pre-alerted episodes:
    - `10`
  - strict gate:
    - `pass`
  - FP growth:
    - `1.2552`
  - precision drop:
    - `0.0158`

解释：

- `<= -0.8` 是 lead-time 增益最大的宽松策略，但 FP 和 precision 代价太大，已保持 blocked。
- `<= -1.2` 是当前更稳妥的 strict policy candidate，说明 displacement delta 可以进入下一代模型家族。
- 但它仍不直接进入 runtime registry，原因是：
  - 当前 label 来自 future displacement delta 派生，不是人工标注灾情事件。
  - validation 样本仍带有 `duplicate_point_timestamp_rows` 质量标记。
  - 新增告警仍有 `37` 个 FP，需要人工核对是否属于可接受巡查噪声。

当前执行结论：

- 不把 policy card 放入 `registry.json`。
- 不让 matcher 自动选择该 policy。
- 下一步应做：
  - raw observation 级别复核新增 TP / FP 样例
  - 重新训练一个显式包含 `displacementSurfaceMm_delta_24h` 的 model-family challenger
  - 不再用纯 hard rule 作为最终线上方案

## 16) Baijiabao displacement-delta model family challenger

当前已把 trigger-aware 发现转成一个离线模型家族实验，而不是线上 hard rule。

代码：

- `scripts/dev/regional-model-library/run-baijiabao-monitoring-challenger-grid.mjs`
  - 新增 feature family:
    - `rainfall-reservoir-displacement-delta`
  - 当前只作为 offline challenger:
    - `promotionEligible: false`
- `scripts/dev/regional-model-library/check-baijiabao-challenger-stability.mjs`
  - 新增可选 `--model key=role=registryPath`
  - 用于临时检查离线 challenger，不改变默认模型集合

raw review 输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-new-alert-review.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-new-episode-review.csv`

raw review 结论：

- strict policy 新增告警:
  - `42`
- 新增 TP / FP:
  - `5 / 37`
- 新增命中 episodes:
  - `15`
- 新增提前命中 episodes:
  - `10`
- `warningHitLabel`:
  - `1434 / 1434` 为 `derived-threshold`
- `displacementLabel`:
  - `1434 / 1434` 为 `derived-future-delta`
- 严格重复点位检查：
  - `point_id + eventTs` duplicate groups:
    - `0`
  - `stationCode + eventTs` duplicate groups:
    - `506`
  - 解释：
    - station/date 重复是因为 `ZD1 / ZD2 / ZD3` 同站同日，不应直接视为点位重复。
    - 当前 `duplicate_point_timestamp_rows` flag 更像过宽质量标记，不能单独当作点位重复证据。

delta-family grid 输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/challenger-grid.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/leaderboard.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/registry.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/best-delta-balanced.registry.json`

当前 delta-family 定义：

- `rainfallCurrentMm*`
- `reservoirLevelM*`
- `displacementSurfaceMm_delta_24h`
- `displacementSurfaceMm_delta_72h`
- 不包含：
  - displacement absolute
  - displacement last / mean / min / max
  - crack

覆盖率说明：

- `displacementSurfaceMm_delta_24h` train coverage:
  - `5742 / 5842`
  - `0.9829`
- 因此该 family 的 `minFeatureCoverage` 固定为：
  - `0.98`
- validation evaluated rows:
  - `1352`
  - 低于当前主预警的 `1434`

delta-family balanced 结果：

- model:
  - `baijiabao.challenger.rainfall-reservoir-displacement-delta.mean-diff.linear-risk-v1`
- threshold:
  - `0.181512`
- BA:
  - `0.6222`
- precision:
  - `0.1882`
- recall:
  - `0.3646`
- FP / FN:
  - `151 / 61`
- AUC:
  - `0.6610`

稳定性检查：

- 输出：
  - `.tmp/regional-model-library/out/artifacts/baijiabao-delta-family-stability/baijiabao-challenger-stability.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-delta-family-stability/baijiabao-challenger-stability.report.md`
- lead hit rate:
  - `0.2840`
- worst season recall:
  - `0`
- gate:
  - blocked
- blockers:
  - precision below `0.20`
  - seasonal recall below `0.20`
  - lead hit rate below `0.50`

当前执行结论：

- 这个模型家族没有解决 seasonal / lead-time blocker。
- 它证明 displacement delta 纳入模型后可以略微提升 BA/AUC，并维持 recall 过线，但没有改善提前量。
- 当前不应接 runtime。
- 下一步不应继续堆简单 linear feature family。
- 更有价值的方向是：
  - label semantics review
  - episode 边界复核
  - 把 displacement-delta 作为 seasonal gate / mixture-of-experts 输入，而不是直接并入一个全局线性模型

## 17) Baijiabao label / episode review and bounded seasonal MoE

当前已补一轮离线 label / episode 边界复核和 bounded seasonal / MoE 评估。

新增脚本：

- `scripts/dev/regional-model-library/review-baijiabao-trigger-aware-label-episodes.mjs`
  - 复核 strict trigger-aware 新增告警与同点位后续 positive episode 的距离
  - 输出：
    - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-label-episode-review/baijiabao-trigger-aware-label-episode-review.report.json`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-label-episode-review/baijiabao-trigger-aware-label-episode-review.report.md`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-label-episode-review/baijiabao-trigger-aware-label-episode-review.rows.csv`
- `scripts/dev/regional-model-library/check-baijiabao-seasonal-moe-policy.mjs`
  - 评估 bounded seasonal gate / MoE policy
  - 只读取现有 validation JSONL 和 registry artifact
  - 不写 runtime registry
  - 输出：
    - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-moe-policy/baijiabao-seasonal-moe-policy.report.json`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-moe-policy/baijiabao-seasonal-moe-policy.report.md`

label / episode review 当前结论：

- validation rows:
  - `1458`
- positive episodes:
  - `81`
- strict policy 新增告警:
  - `42`
- 新增 TP / FP:
  - `5 / 37`
- 37 个新增 FP 中：
  - `7` 个在同点位 `3d` 内进入后续 positive episode
  - `10` 个在 `7d` 内进入后续 positive episode
  - `23` 个在 `14d` 内进入后续 positive episode
  - `31` 个在 `30d` 内进入后续 positive episode
  - `6` 个在 `30d` 内没有后续 positive episode
- 如果把 `<=14d` 的后续 positive 视作可能提前信号，则新增告警的 adjusted precision 可从 immediate-only `0.1190` 上升到 `0.6667`
- 严格重复检查：
  - `point_id + eventTs` duplicate groups:
    - `0`
  - `stationCode + eventTs` duplicate groups:
    - `508`
  - 解释仍为：
    - `ZD1 / ZD2 / ZD3` 同站同日导致 station/date 重复
    - 不能把它直接当作点位重复

bounded seasonal / MoE 当前结论：

- primary baseline:
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - threshold:
    - `0.184245`
  - BA:
    - `0.6216`
  - precision:
    - `0.2033`
  - recall:
    - `0.3524`
  - FP / FN:
    - `145 / 68`
  - lead hit rate:
    - `0.2911`
- strict seasonal gate:
  - key:
    - `seasonal-gate.strict-24h-delta.review`
  - trigger:
    - autumn / winter
    - `displacementSurfaceMm_delta_24h <= -1.2`
  - BA:
    - `0.6315`
  - precision:
    - `0.1875`
  - recall:
    - `0.4000`
  - FP / FN:
    - `182 / 63`
  - lead hit rate:
    - `0.4810`
  - autumn recall:
    - `0.2083`
  - winter recall:
    - `0.0769`
  - review status:
    - `bounded-review-candidate`
  - promotion rehearsal:
    - blocked
- loose 24h gate:
  - key:
    - `seasonal-gate.lead-24h-delta.exploratory`
  - lead hit rate:
    - `0.6329`
  - FP:
    - `226`
  - precision:
    - `0.1630`
  - status:
    - exploratory only
- 72h recall ceiling gate:
  - key:
    - `seasonal-gate.winter-recall-72h.exploratory`
  - winter recall:
    - `0.3077`
  - FP:
    - `288`
  - precision:
    - `0.1479`
  - status:
    - exploratory only
- MoE delta-confirmed strict gate:
  - key:
    - `moe.delta-confirmed-strict-24h.offline`
  - seasonalHitCount:
    - `5`
  - result:
    - effectively collapses back to primary-only baseline
  - conclusion:
    - current delta-family expert cannot confirm the strict trigger while preserving lead-time gain

当前执行结论：

- strict 24h seasonal gate 是当前最好的 bounded offline review candidate。
- 它仍不能上线或写入正式 registry。
- promotion blockers:
  - lead hit rate `0.4810` 仍低于 `0.50`
  - winter recall `0.0769` 仍低于 `0.20`
  - policy 明确保持 `promotionEligible: false`
  - 标签仍是 `derived-threshold / derived-future-delta`，不是人工灾情事件真值
- runtime 继续保持现状：
  - 不改 threshold
  - 不改 matcher
  - 不覆盖 published registry
  - 不新增 PostgreSQL schema

## 18) Baijiabao episode-boundary sensitivity

当前已新增 episode-boundary sensitivity 评估，目标是区分：

- 单日 derived label 下的真实误报
- 后续很快进入 positive episode 的提前信号
- 不适合直接算 FP 的 episode 前灰区样本

新增脚本：

- `scripts/dev/regional-model-library/check-baijiabao-episode-boundary-sensitivity.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-boundary-sensitivity/baijiabao-episode-boundary-sensitivity.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-boundary-sensitivity/baijiabao-episode-boundary-sensitivity.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-boundary-sensitivity/baijiabao-episode-boundary-sensitivity.results.csv`

样本事实：

- raw samples:
  - `1461`
- evaluated rows:
  - `1434`
- immediate positive / negative:
  - `105 / 1329`
- original positive episodes:
  - `79`
- immediate negative rows that enter a same-point positive episode within:
  - `7d`:
    - `396`
  - `14d`:
    - `654`
  - `30d`:
    - `961`

关键结论：

- 不应该简单把 `<=14d` pre-positive negatives 全部转正：
  - 这会把 `654` 个 immediate negative 变成 positive
  - 正样本语义会过宽
  - `preSignal14d-as-positive` 下整体 BA 反而只有约 `0.5482`
- 更合理的下一步是定义 episode 前灰区：
  - `exclude-preSignal14d-negatives`
  - 先不把这些样本当硬 FP
- 在 14 天灰区剔除读法下，strict 24h seasonal gate 仍是最强策略：
  - policy:
    - `seasonal-gate.strict-24h-delta.review`
  - BA:
    - `0.6474`
  - precision:
    - `0.3717`
  - recall:
    - `0.4000`
  - FP / FN:
    - `71 / 63`
  - autumn recall:
    - `0.2083`
  - winter recall:
    - `0.0769`
  - excluded grey-zone rows:
    - `654`

当前执行结论：

- strict 24h seasonal gate 的主要价值不是“马上上线”，而是证明当前标签窗口过窄会低估提前信号。
- 下一步应先固化 episode-boundary grey-zone label policy。
- 不应直接重训一个使用 `preSignal14d-as-positive` 的模型。
- runtime 仍不变：
  - 不接 strict gate
  - 不接 loose gate
  - 不接 72h exploratory gate
  - 不接 MoE delta-confirmed gate

## 19) Baijiabao episode grey-zone label policy and retraining review

当前已把 episode 前灰区固化成离线 label overlay，并做了一轮受控重训/评估。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-episode-grey-zone-label-policy.mjs`
- `scripts/dev/regional-model-library/build-baijiabao-grey-zone-training-review.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao-episode-grey-zone-label-policy.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao-episode-grey-zone-label-policy.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.train.episode-grey-zone-labels.jsonl`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.validation.episode-grey-zone-labels.jsonl`
- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-grey-zone-label/challenger-grid.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-grey-zone-label/leaderboard.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-label-stability/baijiabao-challenger-stability.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-label-original-label-stability/baijiabao-challenger-stability.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-training-review/baijiabao-grey-zone-training-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-training-review/baijiabao-grey-zone-training-review.report.md`

label overlay 规则：

- 保留原始：
  - `warningHitLabel`
- 新增 immediate trace：
  - `warningHitLabelImmediate`
- 新增三态边界标签：
  - `warningHitLabelEpisodeBoundary`
  - values:
    - `positive`
    - `pre_episode_grey_zone`
    - `negative`
- 新增二分类训练标签：
  - `warningHitLabelEpisodeGreyZoneExcluded`
  - `positive -> true`
  - `negative -> false`
  - `pre_episode_grey_zone -> null`
- 新增 FP 成本标记：
  - `warningHitLabelEpisodeGreyZoneExcludedFalsePositiveCostEligible`

灰区样本量：

- train:
  - samples:
    - `5838`
  - positives:
    - `572`
  - pre-episode grey zone:
    - `1808`
  - hard negatives:
    - `3458`
  - binary usable:
    - `4030`
- validation:
  - samples:
    - `1458`
  - positives:
    - `108`
  - pre-episode grey zone:
    - `667`
  - hard negatives:
    - `683`
  - binary usable:
    - `791`

灰区标签重训结果：

- grid best eligible:
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - threshold mode:
    - `maximize-f1`
  - threshold:
    - `0.306578`
  - grey-zone validation:
    - BA `0.6306`
    - precision `0.4487`
    - recall `0.3241`
    - FP/FN `43/73`
    - lead hit rate `0.2469`
  - status:
    - blocked
- grey-zone balanced threshold:
  - threshold:
    - `0.095392`
  - grey-zone validation:
    - BA `0.6539`
    - precision `0.2004`
    - recall `0.8333`
    - FP/FN `359/18`
    - lead hit rate `0.8148`
    - old gate:
      - pass
  - original immediate-label validation:
    - BA `0.5941`
    - precision `0.0937`
    - recall `0.8333`
    - FP/FN `871/18`
    - gate:
      - blocked

当前执行结论：

- 灰区标签 overlay 是有用的离线样本治理资产。
- 但灰区标签重训出的模型不能直接上线。
- `greyZoneBalanced` 只是在灰区剔除口径下过旧 gate；回到原始 immediate 标签时误报压力不可接受。
- 下一步不能把 grey-zone model 写入 runtime registry。
- 后续应调整 promotion gate：
  - 同时报告 `grey-zone-excluded label read`
  - 同时报告 `original immediate label read`
  - 对灰区样本单独报告 `review workload`
  - 不允许只在灰区剔除口径过 gate 就 promotion

## 20) Baijiabao cross-label promotion gate

当前已把灰区标签重训后的 promotion 判断固化成单独离线门禁。

脚本：

- `scripts/dev/regional-model-library/check-baijiabao-cross-label-promotion-gate.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-cross-label-promotion-gate/baijiabao-cross-label-promotion-gate.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-cross-label-promotion-gate/baijiabao-cross-label-promotion-gate.report.md`

门禁目的：

- 同一个候选必须同时报告：
  - `grey-zone-excluded`
  - `immediate-derived`
- 不能只用灰区剔除口径证明模型可用。
- 必须显式报告灰区复核工作量：
  - validation grey-zone rows:
    - `667`
  - validation grey-zone ratio:
    - `0.4575`
  - false-positive cost marker:
    - `warningHitLabelEpisodeGreyZoneExcludedFalsePositiveCostEligible`

默认 promotion thresholds：

- grey-zone BA >= `0.62`
- grey-zone precision >= `0.20`
- grey-zone recall >= `0.35`
- immediate BA >= `0.62`
- immediate precision >= `0.20`
- immediate recall >= `0.35`
- lead hit rate >= `0.50`
- worst season recall >= `0.20`
- worst point recall >= `0.20`
- immediate FP <= `250`
- immediate FP growth from grey-zone read <= `2.5`
- immediate precision retention >= `0.5`
- BA drop from grey-zone to immediate read <= `0.04`

当前结果：

- overall status:
  - `blocked`
- passedCandidateCount:
  - `0`
- `greyZoneF1`:
  - grey-zone BA:
    - `0.6306`
  - grey-zone precision:
    - `0.4487`
  - grey-zone recall:
    - `0.3241`
  - grey-zone lead hit rate:
    - `0.2469`
  - immediate BA:
    - `0.6146`
  - immediate precision:
    - `0.2147`
  - immediate FP:
    - `128`
  - gate:
    - blocked
- `greyZoneBalanced`:
  - grey-zone BA:
    - `0.6539`
  - grey-zone precision:
    - `0.2004`
  - grey-zone recall:
    - `0.8333`
  - grey-zone lead hit rate:
    - `0.8148`
  - immediate BA:
    - `0.5941`
  - immediate precision:
    - `0.0937`
  - immediate FP:
    - `871`
  - gate:
    - blocked

当前执行结论：

- 灰区标签可以继续作为离线样本治理资产。
- 灰区训练模型不能写入 runtime registry。
- `greyZoneBalanced` 被明确判定为“灰区口径通过、原始 immediate 口径崩塌”的反例。
- 后续如果继续训练 seasonal expert 或 MoE，必须先通过这个 cross-label gate，再进入 controlled promotion rehearsal。

## 21) Baijiabao seasonal expert challenger

当前已完成第一版真正训练型 seasonal expert challenger，而不是继续手写 hard gate。

脚本：

- `scripts/dev/regional-model-library/check-baijiabao-seasonal-expert-challenger.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-challenger/baijiabao-seasonal-expert-challenger.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-challenger/baijiabao-seasonal-expert-challenger.report.md`

训练方式：

- primary 仍固定为：
  - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - threshold:
    - `0.184245`
- booster 只面向：
  - autumn
  - winter
- booster label:
  - `warningHitLabelEpisodeGreyZoneExcluded`
- booster model:
  - `baijiabao.offline.seasonal-autumn-winter.logistic-balanced-l2.booster-v1`
- booster train rows:
  - `2073`
- positives / negatives:
  - `181 / 1892`
- selected features:
  - `displacementSurfaceMm_delta_24h`
  - `displacementSurfaceMm_delta_72h`
  - `reservoirLevelM_delta_24h`
  - `reservoirLevelM_delta_72h`
  - `reservoirLevelM`
  - `reservoirLevelM_mean_72h`
  - `rainfallCurrentMm`
  - `rainfallCurrentMm_sum_24h`
  - `rainfallCurrentMm_sum_72h`

primary baseline:

- grey-zone-excluded:
  - BA:
    - `0.6303`
  - precision:
    - `0.3978`
  - recall:
    - `0.3426`
  - FP:
    - `56`
  - lead hit:
    - `0.2716`
  - worst season recall:
    - `0`
- immediate-derived:
  - BA:
    - `0.6176`
  - precision:
    - `0.2033`
  - recall:
    - `0.3426`
  - FP:
    - `145`
  - lead hit:
    - `0.2840`
  - worst season recall:
    - `0`

seasonal expert result:

- `maximize-balanced-accuracy` / `maximize-f1` threshold:
  - threshold:
    - `0.545602`
  - grey-zone BA:
    - `0.6261`
  - grey-zone precision:
    - `0.3585`
  - grey-zone recall:
    - `0.3519`
  - grey-zone FP:
    - `68`
  - grey-zone lead hit:
    - `0.2840`
  - immediate BA:
    - `0.6167`
  - immediate precision:
    - `0.1919`
  - immediate recall:
    - `0.3519`
  - immediate FP:
    - `160`
  - immediate lead hit:
    - `0.3086`
  - gate:
    - blocked
- `guarded-recall` threshold:
  - threshold:
    - `0.290563`
  - grey-zone lead hit:
    - `0.6296`
  - immediate lead hit:
    - `0.6790`
  - immediate FP:
    - `795`
  - immediate precision:
    - `0.0788`
  - gate:
    - blocked

当前执行结论：

- 训练型 seasonal booster 有轻微 recall / lead 增益，但不能过 cross-label gate。
- 保守阈值只把 immediate lead hit 从 `0.2840` 提升到 `0.3086`，不解决核心 blocker。
- 激进阈值能把 lead hit 提到 `0.6790`，但 FP 爆到 `795`，不可用。
- 这说明当前 Baijiabao 现有字段下，autumn/winter 问题不是继续换阈值或简单训练 booster 能解决的。
- 后续实质推进应转向：
  - 人工事件真值 / 标签复核
  - 补更多区域或更多触发过程特征
  - 再训练更强的 seasonal expert
  - 仍然不改 runtime registry

## 22) Baijiabao seasonal expert failure review

当前已把 seasonal expert 的失败原因进一步落到可人工复核 CSV。

脚本：

- `scripts/dev/regional-model-library/review-baijiabao-seasonal-expert-failures.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/baijiabao-seasonal-expert-failure-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/baijiabao-seasonal-expert-failure-review.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/seasonal-positive-review.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/winter-positive-review.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/conservative-incremental-alert-review.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/guarded-recall-alert-pressure-review.csv`

关键事实：

- target-season rows:
  - `767`
- target-season immediate positives:
  - `40`
- target-season immediate negatives:
  - `724`
- conservative incremental alerts:
  - `16`
- guarded incremental alerts:
  - `684`
- winter immediate positives:
  - `13`
- winter conservative hits:
  - `0`
- winter guarded hits:
  - `11`

分季节 score overlap：

- autumn immediate positives booster score:
  - p50:
    - `0.4359`
  - p90:
    - `0.5133`
- autumn immediate negatives booster score:
  - p50:
    - `0.4790`
  - p90:
    - `0.5380`
- winter immediate positives booster score:
  - p50:
    - `0.4823`
  - p90:
    - `0.5131`
- winter immediate negatives booster score:
  - p50:
    - `0.4777`
  - p90:
    - `0.4977`

当前执行结论：

- 保守阈值能控制 FP，但冬季 recall 仍为 `0`。
- 激进阈值能找回 `11 / 13` 个 winter positives，但同时产生 `261` 个 winter incremental alerts 和总计 `684` 个 target-season incremental alerts。
- winter 正负样本 booster 分数高度重叠，说明这不是继续调阈值能解决的问题。
- 下一步应优先：
  - 人工核对 `winter-positive-review.csv`
  - 核对 `guarded-recall-alert-pressure-review.csv` 中高压告警是否真的是 pre-signal
  - 或引入独立触发证据，而不是继续扩简单线性 seasonal booster

## 23) Baijiabao guarded alert pressure / review queue

当前已把 guarded-recall 高压告警进一步拆成 episode proximity 和 run-level review queue。

脚本：

- `scripts/dev/regional-model-library/review-baijiabao-guarded-alert-pressure-episodes.mjs`
- `scripts/dev/regional-model-library/check-baijiabao-seasonal-review-queue-policy.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/baijiabao-guarded-alert-pressure-episode-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-episode-proximity.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-runs.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy/baijiabao-seasonal-review-queue-policy.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy/seasonal-review-queue-items.csv`

guarded daily alert pressure:

- guarded incremental alerts:
  - `684`
- immediate positives:
  - `31`
- grey-zone pre-episode alerts:
  - `288`
- hard negatives within 30d:
  - `134`
- hard negatives without positive within 30d:
  - `228`
- alert runs:
  - `60`
- longest single run:
  - `50` rows

run-level review queue:

- daily alerts:
  - `684`
- review queue items:
  - `60`
- compression ratio:
  - `0.0877`
- useful review items:
  - `39`
- isolated review items:
  - `21`
- useful item ratio:
  - `0.65`
- by utility class:
  - contains immediate positive:
    - `23`
  - contains pre-episode grey-zone:
    - `9`
  - contains hard-negative within 30d:
    - `7`
  - isolated background alert run:
    - `21`

当前执行结论：

- guarded booster 不适合作为每日风险预测模型。
- guarded booster 可能适合作为离线 review queue / 人工复核队列的候选信号。
- 这个方向不应写入顶层 `risk_score / risk_level`，也不应覆盖 runtime registry。
- 若后续要产品化，只能作为 review-only workflow，并且必须先人工核对 `seasonal-review-queue-items.csv`。

## 24) Baijiabao seasonal review-only artifact

当前已把 seasonal guarded booster 的“可用但不能上线”状态固化成正式离线复核产物，而不是运行时模型。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-artifact.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/baijiabao-seasonal-review-queue-artifact.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/baijiabao-seasonal-review-queue-card.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-useful.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-isolated.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-winter.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-combined.csv`

artifact contract:

- artifact key:
  - `baijiabao.offline.seasonal-review-queue.v1`
- artifact type:
  - `offline_review_queue_v1`
- status:
  - `review-only-candidate`
- runtime registry eligible:
  - `false`
- promotion eligible:
  - `false`

queue summary:

- daily guarded incremental alerts:
  - `684`
- review queue items:
  - `60`
- compression ratio:
  - `0.0877`
- useful review items:
  - `39`
- isolated review items:
  - `21`
- useful item ratio:
  - `0.65`
- human review samples:
  - useful:
    - `20`
  - isolated:
    - `12`
  - winter:
    - `20`

硬边界：

- 不写入 `artifacts/models/*/registry.json`。
- 不进入 `services/ai-prediction-worker` 路由。
- 不映射为顶层 `risk_score / risk_level`。
- 不新增 PostgreSQL schema。
- 不把 `reviewItem.utilityClass` 当作最终预测标签。

当前执行结论：

- 这一步解决的是“怎么复用 guarded booster 的信息价值”，不是模型 promotion。
- 当前最合理路径是先人工复核 `human-review-sample-*.csv`。
- 只有人工验证这些 run 确实有过程意义后，才考虑做 review-only UI / workflow。
- 当前双模型 runtime 继续保持不变。

## 25) Baijiabao seasonal review queue annotation template / summary checker

当前已把 review-only 队列推进到可人工标注、可自动汇总的闭环。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-annotation-template.mjs`
- `scripts/dev/regional-model-library/check-baijiabao-seasonal-review-queue-annotation-summary.mjs`
- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-annotation-batch.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/seasonal-review-queue-annotation-template.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/baijiabao-seasonal-review-queue-annotation-template.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/baijiabao-seasonal-review-queue-annotation-template.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/seasonal-review-queue-annotation-summary.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/seasonal-review-queue-annotation-invalid.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/seasonal-review-queue-annotation-batch-1.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/baijiabao-seasonal-review-queue-annotation-batch-1.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/baijiabao-seasonal-review-queue-annotation-batch-1.report.md`

关键修正：

- `human-review-sample-combined.csv` 是抽样拼接包，不是唯一 item 表。
- 当前输入抽样包：
  - rows:
    - `52`
- 当前完整 review queue:
  - unique review items:
    - `60`
- 当前标注模板：
  - unique review items:
    - `60`
  - rows with sample evidence:
    - `41`
  - duplicate sample rows removed:
    - `11`
- 后续所有人工指标必须按 `reviewItemId` 去重，不能按 CSV 行数直接统计。

人工标注字段：

- `humanReviewStatus`
  - `pending | reviewed | skipped`
- `humanFinalClass`
  - `true_pre_signal | process_related | label_boundary_artifact | expected_noise | instrumentation_issue | unclear`
- `humanUseful`
  - `yes | no | unsure`
- `humanConfidence`
  - `low | medium | high`
- `displacementEvidence`
  - `yes | no | unclear`
- `triggerEvidence`
  - `yes | no | unclear`
- `instrumentNoiseSuspected`
  - `yes | no | unclear`
- `reviewer`
- `reviewedAt`
- `reviewNotes`
- `rawEvidenceNeeded`

当前 summary 状态：

- decision status:
  - `pending-human-review`
- unique review items:
  - `60`
- reviewed items:
  - `0`
- invalid rows:
  - `0`

Batch-1 复核包：

- batch items:
  - `24`
- utility class mix:
  - contains immediate positive:
    - `8`
  - contains pre-episode grey-zone:
    - `5`
  - contains hard-negative within 30d:
    - `5`
  - isolated background alert run:
    - `6`
- season mix:
  - autumn:
    - `11`
  - winter:
    - `11`
  - autumn|winter:
    - `2`
- point coverage:
  - ZD1:
    - `7`
  - ZD2:
    - `7`
  - ZD3:
    - `10`

自动汇总口径：

- review precision:
  - denominator:
    - unique `reviewItemId` with `humanReviewStatus = reviewed`
  - numerator:
    - `humanUseful = yes`
    - or `humanFinalClass in true_pre_signal / process_related / label_boundary_artifact`
- winter useful ratio:
  - denominator:
    - reviewed unique `reviewItemId` where `seasonSet` contains `winter`
  - numerator:
    - winter denominator rows judged useful by the same rule

硬边界：

- 该标注闭环只能支持是否进入 review-only workflow。
- 它不能把 guarded booster 提升为顶层预警模型。
- 不写 runtime registry。
- 不改 `services/ai-prediction-worker`。
- 不改 PostgreSQL schema。

## 26) Baijiabao Batch-1 Evidence Pack

当前已为 Batch-1 生成日级证据包，人工复核不再只看 item 摘要。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-evidence-pack.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/baijiabao-seasonal-review-queue-batch-1-evidence-pack.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/baijiabao-seasonal-review-queue-batch-1-evidence-pack.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/baijiabao-seasonal-review-queue-batch-1-evidence-pack.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-items.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-missing.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-cards.md`

当前映射结果：

- batch items:
  - `24`
- evidence rows:
  - `343`
- missing evidence items:
  - `0`
- row count mismatches:
  - `0`
- daily classification:
  - grey-zone-pre-episode:
    - `169`
  - hard-negative-within-30d-next-positive:
    - `91`
  - hard-negative-no-positive-within-30d:
    - `71`
  - immediate-positive:
    - `12`

证据字段顺序固定为：

- `reviewItemId / pointId / raw_obs_time / eventTs`
- season and month
- classification and boundary labels
- episode proximity flags
- model scores and hit flags
- displacement / reservoir / rainfall features
- raw trace fields and `sampleId`

当前执行结论：

- Batch-1 的 `24 / 24` 个 review items 均已映射到 run 和日级 evidence rows。
- `rowCount` 与日级 evidence rows 数量全部一致。
- 该证据包只服务人工复核。
- 它不能支持 runtime promotion，不进入 registry，不改 worker，不改 PostgreSQL schema。

## 27) Baijiabao Batch-1 Suggested Labels Sidecar

当前已为 Batch-1 生成机器建议标签 sidecar，用于人工复核前预排序。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-suggested-labels.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-annotations.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-labels.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/baijiabao-seasonal-review-queue-batch-1-suggested-labels.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/baijiabao-seasonal-review-queue-batch-1-suggested-labels.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/baijiabao-seasonal-review-queue-batch-1-suggested-labels.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-label-cards.md`

说明：

- `batch-1-suggested-labels.csv` 是当前正式 sidecar 文件名。
- `batch-1-suggested-annotations.csv` 是同内容兼容别名，不能当作人工标注结果。

当前建议分布：

- batch items:
  - `24`
- suggested useful:
  - yes:
    - `16`
  - no:
    - `6`
  - unsure:
    - `2`
- suggested class:
  - true_pre_signal:
    - `6`
  - process_related:
    - `4`
  - label_boundary_artifact:
    - `6`
  - expected_noise:
    - `6`
  - unclear:
    - `2`
- suggested confidence:
  - high:
    - `2`
  - medium:
    - `18`
  - low:
    - `4`

sidecar 边界：

- 不回写 `humanReviewStatus / humanFinalClass / humanUseful / humanConfidence` 等人工字段。
- `check-baijiabao-seasonal-review-queue-annotation-summary.mjs` 仍只统计人工字段，不读取 suggested sidecar。
- suggested labels 只能用于人工复核排序和提示。
- 不支持 runtime promotion。
- 不写 registry，不改 worker，不改 PostgreSQL schema。

## 28) Baijiabao Batch-1 Human Review Workbook

当前已把 Batch-1 annotation、evidence items 和 suggested labels 合并成可人工填写的复核工作表。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-review-workbook.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.xlsx`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/baijiabao-seasonal-review-queue-batch-1-review-workbook.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/baijiabao-seasonal-review-queue-batch-1-review-workbook.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-cards.md`

summary checker 验证输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/seasonal-review-queue-annotation-summary.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/seasonal-review-queue-annotation-invalid.rows.csv`

当前结果：

- workbook rows:
  - `24`
- missing evidence items:
  - `0`
- duplicate suggested ids:
  - `0`
- duplicate evidence ids:
  - `0`
- human review status:
  - pending:
    - `24`
- human conclusion field filled:
  - `0`
- summary checker:
  - decisionStatus:
    - `pending-human-review`
  - inputRows / uniqueReviewItems:
    - `24 / 24`
  - invalidRows:
    - `0`

工作表边界：

- 按 `reviewItemId` 合并三张表。
- Excel 工作簿包含 `batch-1-review`、`README`、`allowed-values` 三张 sheet。
- 人工字段位于 `batch-1-review` 前部，默认仅 `humanReviewStatus=pending`。
- `humanFinalClass / humanUseful / humanConfidence / displacementEvidence / triggerEvidence / instrumentNoiseSuspected / reviewNotes` 不自动填。
- `suggested*` 字段只作为只读参考列。
- 填完 CSV 后可直接运行 `check-baijiabao-seasonal-review-queue-annotation-summary.mjs --annotation-csv <filled-workbook.csv>`。
- 该工作表不支持 runtime promotion，不写 registry，不改 worker，不改 PostgreSQL schema。

## 29) Baijiabao Batch-1 Review Workbook Export Loop

当前已补齐“人工填写 Excel 后回收成 CSV”的脚本，避免人工手动另存 CSV 时破坏字段名或列顺序。

脚本：

- `scripts/dev/regional-model-library/export-baijiabao-seasonal-review-queue-batch-1-review-workbook-csv.mjs`

默认输入：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.xlsx`
- sheet:
  - `batch-1-review`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export/batch-1-human-review-workbook.exported.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export/baijiabao-seasonal-review-queue-batch-1-review-workbook-export.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export/baijiabao-seasonal-review-queue-batch-1-review-workbook-export.report.md`

summary checker round-trip 验证输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/seasonal-review-queue-annotation-summary.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/seasonal-review-queue-annotation-invalid.rows.csv`

当前 round-trip 结果：

- exported rows:
  - `24`
- unique review items:
  - `24`
- duplicate review item ids:
  - `0`
- missing review item id rows:
  - `0`
- missing human columns:
  - `0`
- reviewed rows:
  - `0`
- copied suggestion warning rows:
  - `0`
- summary checker:
  - decisionStatus:
    - `pending-human-review`
  - invalidRows:
    - `0`

使用方式：

1. 人工填写 `batch-1-human-review-workbook.xlsx` 的 `batch-1-review` sheet。
2. 运行 `node scripts/dev/regional-model-library/export-baijiabao-seasonal-review-queue-batch-1-review-workbook-csv.mjs --workbook-xlsx <filled.xlsx>`。
3. 运行 `node scripts/dev/regional-model-library/check-baijiabao-seasonal-review-queue-annotation-summary.mjs --annotation-csv .tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export/batch-1-human-review-workbook.exported.csv`。

边界：

- exporter 只做 Excel -> CSV 回收和轻量结构检查。
- `copiedSuggestionRows` 只是风险提示，不自动判错。
- 真正的人工指标仍由 summary checker 计算。
- 不接 runtime，不改 registry，不改 worker，不改 PostgreSQL schema。

## 30) Baijiabao Batch-1 Auto Review Dry-Run

当前已生成 Batch-1 自动弱标注 dry-run，用于压力测试 review-only workflow 是否值得继续产品化。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.mjs`

输入：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-rows.csv`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/batch-1-auto-review-dry-run.annotation.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/batch-1-auto-review-dry-run.annotation.xlsx`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.report.md`

summary checker 输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run-summary/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run-summary/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run-summary/seasonal-review-queue-annotation-summary.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run-summary/seasonal-review-queue-annotation-invalid.rows.csv`

dry-run 规则：

- 不直接复制 `suggestedFinalClass / suggestedUseful / suggestedConfidence`。
- 采用保守规则，严格正例必须同时满足 immediate、usefulRatio、位移证据、触发证据和 evidenceRows 条件。
- 根据证据字段重算：
  - `immediatePositiveDays`
  - `greyZoneDays`
  - `within30Days`
  - `isolatedDays`
  - 日级位移 24h / 72h 最大绝对变化
  - 72h 降雨最大值
  - 72h 库水位最大绝对变化
  - conservative hit days
- 输出 `reviewer=auto-dry-run:rule-v1`。
- 所有 `reviewNotes` 带 `AUTO_DRY_RUN_ONLY`。

dry-run summary：

- reviewedItems:
  - `24`
- invalidRows:
  - `0`
- usefulItems:
  - `14`
- reviewPrecision:
  - `0.5833333333333334`
- winterReviewedItems:
  - `13`
- winterUsefulItems:
  - `8`
- winterUsefulRatio:
  - `0.6153846153846154`
- decisionStatus:
  - `manual-review-supports-review-only-workflow`

dry-run class distribution：

- true_pre_signal:
  - `3`
- process_related:
  - `7`
- label_boundary_artifact:
  - `4`
- expected_noise:
  - `3`
- unclear:
  - `7`

边界：

- 该结果只能说明 review-only workflow 值得继续产品化。
- 该结果不是人工专家真值。
- 不能将该 dry-run 当作主模型性能。
- 不接 runtime，不改 registry，不改 worker，不改 PostgreSQL schema。

## 31) Baijiabao Review-Only Workflow Candidate Artifact

当前已把 auto dry-run 的结果整理成面向软件层读取的 review-only workflow candidate artifact。

脚本：

- `scripts/dev/regional-model-library/build-baijiabao-review-only-workflow-candidate.mjs`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.items.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.report.md`

artifact identity：

- artifactKey:
  - `baijiabao.review-only.workflow-candidate.auto-dry-run.v1`
- artifactType:
  - `review_only_workflow_candidate_v1`
- status:
  - `auto-dry-run-candidate`

product gate：

- reviewOnlyWorkflowCandidate:
  - `true`
- runtimePromotionAllowed:
  - `false`
- requiresHumanConfirmationBeforeUserFacingClaim:
  - `true`

candidate summary：

- itemCount:
  - `24`
- severity:
  - high:
    - `3`
  - medium:
    - `11`
  - needs-evidence:
    - `7`
  - low:
    - `3`
- recommended action:
  - prioritize-manual-review:
    - `3`
  - review-process-evidence:
    - `7`
  - review-label-window:
    - `4`
  - request-raw-evidence:
    - `7`
  - archive-as-control:
    - `3`

软件层接入边界：

- 可以驱动桌面端“AI 离线复核队列”页面。
- 不写顶层 `risk_score / risk_level`。
- 不进入 `services/ai-prediction-worker` registry。
- 不改 PostgreSQL schema。
- 若要进入用户可见产品话术，仍需人工确认或外部事件真值支撑。

## 32) Desk Analysis Review-Only Queue Snapshot

当前已完成桌面端最小只读接入：在 `apps/desk` 的数据分析页展示白家堡 review-only workflow candidate。

新增脚本：

- `scripts/dev/regional-model-library/export-baijiabao-review-only-workflow-candidate-desk-snapshot.mjs`

新增前端快照：

- `apps/desk/src/data/baijiabaoReviewQueueSnapshot.ts`

更新页面：

- `apps/desk/src/views/AnalysisPage.tsx`
- `apps/desk/src/views/analysis.css`

接入方式：

- 构建时从 `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.json` 生成轻量 TypeScript snapshot。
- 数据分析页的“运行研判摘要”卡片内展示：
  - 队列总数
  - dry precision
  - winter useful
  - 前 5 条复核候选
  - severity
  - recommended action
  - auto class
  - 运行时边界提示

当前展示口径：

- itemCount:
  - `24`
- reviewPrecision:
  - `58.3%`
- winterUsefulRatio:
  - `61.5%`
- product gate:
  - `reviewOnlyWorkflowCandidate=true`
  - `runtimePromotionAllowed=false`
  - `requiresHumanConfirmationBeforeUserFacingClaim=true`

边界：

- 该页面读取的是离线候选快照，不调用 prediction worker。
- 不写 `risk_score / risk_level`。
- 不写 model registry。
- 不改 PostgreSQL schema。
- 后续若要动态读取最新产物，应新增桌面壳文件读取或后端 review-queue API；不要让前端直接依赖 `.tmp` 路径。

## 33) Desk Analysis Review-Only Queue Workbench

当前已把桌面端 `AI 离线复核队列` 从前 5 条摘要推进为卡片内完整工作台。

更新页面：

- `apps/desk/src/views/AnalysisPage.tsx`
- `apps/desk/src/views/analysis.css`

实现方式：

- 仍读取构建时 TypeScript snapshot：
  - `apps/desk/src/data/baijiabaoReviewQueueSnapshot.ts`
- 不新增路由。
- 不新增 API。
- 不改数据库 schema。
- 不接 `services/ai-prediction-worker`。

当前产品能力：

- 展示完整 `24` 条 review-only queue items。
- 支持本地筛选：
  - severity
  - recommendedAction
  - pointId
- 支持点击队列项查看详情：
  - sourceReviewItemId
  - pointId / priority
  - window start/end/duration/season
  - evidenceRowCount
  - immediatePositiveDays
  - greyZoneDays
  - within30Days
  - isolatedDays
  - classificationMix
  - maxBoosterScore
  - autoReview finalClass/useful/confidence/rule/rawEvidenceNeeded/warning
- 页面保留边界提示：
  - `auto-dry-run`
  - `review-only`
  - 需人工确认后才能作为用户可见结论

边界：

- `sourceSummary.reviewPrecision` 仍只能显示为 dry-run 指标。
- `maxBoosterScore` 只能作为证据摘要分数，不能作为最终风险分数。
- `severity`、`recommendedAction`、`autoReview.*` 只是复核队列排序/分流参考。
- 不写顶层 `risk_score / risk_level`。
- 不进入 runtime registry。
- 不允许 runtime promotion。

验证：

- `npm run build --workspace apps/desk`
  - passed
- `openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- `git diff --check -- apps/desk/src/views/AnalysisPage.tsx apps/desk/src/views/analysis.css`
  - passed with CRLF/LF warnings only

## 35) Baijiabao v14 Forecast Runtime And Desktop HTTP Proof

当前 Baijiabao v14 位移预测模型已经完成运行时和桌面 HTTP 链路证明。

模型定位：

- model:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
- modelVersion:
  - `0.14.0`
- artifactType:
  - `calibrated_prediction_regression_v1`
- operationalRole:
  - `forecast`
- 目标：
  - 未来 `24h` 地表位移增量
- 单位：
  - `mm`

运行时写入位置：

- `payload.forecastInference`
- `payload.secondaryInferences[]`

产品侧读取方式：

- 桌面端不直接解析页面内裸 JSON。
- `apps/desk/src/api/httpClient.ts` 会把 `payload.forecastInference` 映射成 `AiPrediction.forecastInference`。
- 若直接字段缺失，也会从 `payload.secondaryInferences[]` 中识别 forecast-like 输出。

已验证脚本：

- `scripts/dev/check-desk-ai-forecast-field.ts`
  - mock/client mapper proof
- `scripts/dev/check-desk-ai-forecast-http-field.ts`
  - PostgreSQL seed + `/api/v1/ai/predictions` + desktop HTTP mapper proof

当前 HTTP proof 报告：

- `artifacts/models/regional-experts/phase1-displacement-forecast/desk-http-forecast-field-proof.report.json`

最新 HTTP proof 结论：

- `pass=true`
- seeded prediction:
  - `payload.forecastInference` 存在
- HTTP mapper:
  - `forecastInference.predictedDisplacementMm = 0.411357063187622`
  - `forecastInference.horizonSpec = "24h"`
  - `forecastInference.requiredFeaturesSatisfied = true`
  - `forecastInference.missingFeatureKeys = []`
- 主风险模型仍保持：
  - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
- forecast 模型没有写入顶层：
  - `model_key`
  - `risk_score`
  - `risk_level`

边界：

- 这是位移预测 / forecast，不是预警分类。
- 不新增 PostgreSQL 列。
- 不修改 `/api/v1/ai/predictions` 顶层响应壳。
- 不把 forecast 输出写成 `riskScore`。

## 36) Baijiabao v21 Forecast Production-main Promotion

当前 Baijiabao 位移预测 runtime registry 已将 v21 后校准候选提升为 forecast production-main，并保留 v14 为可回滚备份。

当前 active forecast 模型：

- displayName:
  - `BJB-DP-ENS-POSTCAL-BALANCED-v21`
- modelKey:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-postcalibrated-balanced-v21`
- modelVersion:
  - `0.21.0`
- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v21.prediction-regression-v1.json`
- registry:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- registry role:
  - `production-main`

备份模型：

- displayName:
  - `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
- registry role:
  - `backup-previous-main`
- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json`

备份目录：

- `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v21-2026-05-05T10-01-14-185Z/`

备份清单：

- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v21-production-backup-manifest.json`

promotion 报告：

- `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v21-production.report.json`

运行时验证：

- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - loaded model:
    - `baijiabao.displacement.pointwise-fixed-expert-ensemble-postcalibrated-balanced-v21@0.21.0`
  - evaluated samples:
    - `1352`
  - MAE:
    - `0.629723294`
  - RMSE:
    - `0.892410971`
  - R2:
    - `0.125969256`
  - Direction Accuracy:
    - `59.91%`
  - Within 1mm:
    - `80.70%`
  - P90 Absolute Error:
    - `1.379252474 mm`
  - pipeline smoke forecast:
    - present
    - required features satisfied
    - forecast model key is v21

构建验证：

- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

边界：

- v21 仍是位移预测 / forecast，不写入 `risk_score / risk_level`。
- v21 复用 v14 的运行时必需字段，不要求数据库 schema 或桌面字段变化。
- v21 的提升来自 `point + displacementTrend` 后校准；如果后续追求论文级最严格口径，应继续把该后校准并入完整 chronological OOF 主训练。

## 37) Baijiabao v22 Support-calibrated Forecast Production-main

当前 runtime forecast registry 已进一步切换到 v22 support-set calibrated production-main。v22 的目标是比 v21 更接近正式生产路径：先用 2023-07 至 2024-03 的本地支持集校准，再用 2024-04 至 2024-12 的未来保留集验证。

当前 active forecast 模型：

- displayName:
  - `BJB-DP-ENS-SUPPORT-CAL-v22`
- modelKey:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-v22`
- modelVersion:
  - `0.22.0`
- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v22.prediction-regression-v1.json`
- registry role:
  - `production-main`

备份链：

- v21:
  - `backup-previous-main`
- v14:
  - `backup-v14-oof-main`
- v22 promotion backup:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v22-2026-05-05T10-10-41-084Z/`
- v22 backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v22-production-backup-manifest.json`

support-set 验证：

- calibration support set:
  - `639` samples, `eventTs < 2024-04-01T00:00:00.000Z`
- future holdout:
  - `713` samples, `eventTs >= 2024-04-01T00:00:00.000Z`
- holdout baseline:
  - MAE `0.664111492`
  - RMSE `0.940473151`
  - R2 `0.198359890`
- holdout selected v22:
  - MAE `0.661239758`
  - RMSE `0.936965942`
  - R2 `0.204327688`
  - Within 1mm `79.24%`
- holdout tradeoff:
  - Direction Accuracy lower by about `1.26 pp`
  - Threshold-state Agreement lower by about `0.28 pp`

Full runtime decomposition after refitting selected support correction on all available support rows:

- evaluated samples:
  - `1352`
- MAE:
  - `0.6263070948659626`
- RMSE:
  - `0.8856069067653007`
- R2:
  - `0.1392463010552235`
- Direction Accuracy:
  - `58.36%`
- Within 1mm:
  - `81.14%`
- P90 Absolute Error:
  - `1.3676232698847706 mm`

Runtime and build checks:

- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - loaded v22
  - forecast inference present
  - required features satisfied
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Boundary:

- v22 was the production-main forecast artifact before v23.
- v22 still outputs displacement forecast only and must not be written to `risk_score / risk_level`.
- v22 uses the same runtime required fields as v14/v21, so no DB or desktop schema change is required.
- For paper writing, distinguish the future-holdout validation metrics from the full support-refit runtime metrics.

## 38) Baijiabao v23 Support-guarded Forecast Production-main

当前 runtime forecast registry 已进一步切换到 v23 support-guarded production-main。v23 的目标不是单纯压低全量 runtime RMSE，而是在时间顺序 future holdout 上满足更保守的生产门槛：MAE/RMSE/R2 改善，同时 Direction / Within1mm / Threshold-state 不低于 baseline。

当前 active forecast 模型：

- displayName:
  - `BJB-DP-ENS-SUPPORT-GUARDED-v23`
- modelKey:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-guarded-v23`
- modelVersion:
  - `0.23.0`
- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
- registry role:
  - `production-main`

备份链：

- v22:
  - `backup-previous-main`
- v21:
  - `backup-v21-postcalibrated-main`
- v14:
  - `backup-v14-oof-main`
- v23 promotion backup:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v23-2026-05-05T13-01-25-310Z/`
- v23 backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23-production-backup-manifest.json`

Future-holdout production screen:

- calibration support set:
  - `639` samples, `eventTs < 2024-04-01T00:00:00.000Z`
- future holdout:
  - `713` samples, `eventTs >= 2024-04-01T00:00:00.000Z`
- holdout baseline:
  - MAE `0.664111492`
  - RMSE `0.940473151`
  - R2 `0.198359890`
  - Direction Accuracy `60.17%`
  - Within 1mm `78.82%`
  - Threshold-state Agreement `84.15%`
- holdout selected v23:
  - MAE `0.662702595`
  - RMSE `0.940097275`
  - R2 `0.199000539`
  - Direction Accuracy `60.31%`
  - Within 1mm `78.96%`
  - Threshold-state Agreement `84.15%`

Full runtime decomposition after refitting selected support correction:

- evaluated samples:
  - `1352`
- MAE:
  - `0.6261632461448894`
- RMSE:
  - `0.8863636177712738`
- R2:
  - `0.1377747224948398`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.07%`
- Threshold-state Agreement:
  - `86.17%`
- P90 Absolute Error:
  - `1.3667404378328487 mm`

Runtime and build checks:

- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - loaded v23
  - forecast inference present
  - required features satisfied
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Boundary:

- v23 is the current production-main forecast artifact.
- v22 remains the previous-main backup and has slightly stronger full runtime RMSE/R2.
- v23 still outputs displacement forecast only and must not be written to `risk_score / risk_level`.
- v23 uses the same runtime required fields as v14/v21/v22, so no DB or desktop schema change is required.

## 39) Baijiabao v24 Two-holdout Challenger Not Promoted

在 v23 之后继续补做了一个更严格的 two-holdout challenger，但没有提升为 runtime production-main。

Script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-two-holdout-production.mjs`

Split:

- calibration:
  - `eventTs < 2024-01-01T00:00:00.000Z`
  - `433` samples
- development holdout:
  - `2024-01-01T00:00:00.000Z <= eventTs < 2024-07-01T00:00:00.000Z`
  - `447` samples
- final holdout:
  - `eventTs >= 2024-07-01T00:00:00.000Z`
  - `472` samples

Candidate:

- displayName:
  - `BJB-DP-ENS-TWO-HOLDOUT-GUARDED-v24`
- selected key:
  - `twoholdout-point-displacementTrend-mc12-sh90-mb0p08-s0p15`
- dimensions:
  - `point + displacementTrend`

Final holdout result:

- MAE:
  - `0.644783156 -> 0.644485032`
- RMSE:
  - `0.924532695 -> 0.924515845`
- R2:
  - `0.057002227 -> 0.057036601`
- Direction Accuracy:
  - `56.99% -> 57.20%`
- Within 1mm:
  - `80.08% -> 80.08%`
- Threshold-state Agreement:
  - `84.96% -> 84.96%`

Full runtime check:

- evaluated:
  - `1352`
- MAE:
  - `0.632161`
- RMSE:
  - `0.892837`
- R2:
  - `0.125134`
- Direction Accuracy:
  - `58.21%`
- Within 1mm:
  - `80.77%`
- Threshold-state Agreement:
  - `86.32%`

Decision:

- Do not promote v24.
- v24 is useful as a rigorous two-holdout challenger and writing evidence.
- Current production-main remains v23 because v23 has stronger full runtime MAE/RMSE/R2/Within1mm while still satisfying the earlier future-holdout production guard.

## 40) Baijiabao v25 V23-layer Challenger Not Promoted

继续尝试了以当前 v23 production-main 为 base 的二层 residual 校准。该路线没有生成可晋级 artifact。

Run:

- script:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-two-holdout-production.mjs`
- base artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
- output dir:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-v23-layer-two-holdout-production`

Search result:

- tested configs:
  - `7056`
- passed development guard:
  - `855`
- passed final guard:
  - `2`
- passed both development and final guards:
  - `0`

Best development candidate:

- key:
  - `twoholdout-point-displacementTrend-mc12-sh20-mb0p04-s1`
- development holdout:
  - MAE `0.611967614 -> 0.609317660`
  - RMSE `0.851868995 -> 0.850337952`
  - R2 `0.275915826 -> 0.278516244`
- final holdout:
  - MAE `0.638182151 -> 0.639848809`
  - RMSE `0.915682717 -> 0.918425817`
  - R2 `0.074969286 -> 0.069418778`

Decision:

- Do not promote v25.
- No v25 artifact is generated because no candidate passed both development and final production guards.
- Current runtime production-main remains v23, with existing v22/v21/v14 backup chain unchanged.

## 41) Baijiabao v26/v27 Ensemble Search Not Promoted

继续测试了多版本 artifact 集成，目的是判断是否可以在不改字段、不改 runtime 架构的前提下，把 v22 的幅值优势和 v23 的生产保守性合并。

v26 script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-ensemble-production-challengers.mjs`

v26 output:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-ensemble-production-challengers/baijiabao-displacement-ensemble-production-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-ensemble-production-challengers/baijiabao-displacement-ensemble-production-challengers.leaderboard.csv`

v26 result:

- tested configs:
  - `178`
- all-split magnitude improvers:
  - `16`
- all-split magnitude + direction improvers:
  - `0`
- production guard pass:
  - `0`

Best magnitude candidate:

- key:
  - `ensemble-v230p6-v220p4`
- all delta against v23:
  - MAE `-0.000236695`
  - RMSE `-0.000556790`
  - R2 `+0.001082914`
  - Direction Accuracy `-0.96 pp`
- final delta against v23:
  - MAE `-0.001204197`
  - RMSE `-0.002291944`
  - R2 `+0.004624889`
  - Direction Accuracy `-0.64 pp`

v27 calibrated ensemble follow-up:

- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-calibrated-ensemble-followup/baijiabao-displacement-calibrated-ensemble-followup.report.json`
- searched:
  - pair blends among `v22 / v23 / v24 / v21`
  - slope `0.94` to `1.06`
  - intercept `-0.06` to `0.06`
- production guard pass:
  - `0`

Decision:

- Do not promote v26 or v27.
- Current production-main remains v23.
- The current blocker is direction / state stability, not inability to shave a small amount of MAE/RMSE.

## 34) Desk Analysis Review-Only Queue Export Handoff

当前已给桌面端 review-only queue workbench 补齐最小人工交接入口。

更新页面：

- `apps/desk/src/views/AnalysisPage.tsx`
- `apps/desk/src/views/analysis.css`

当前产品能力：

- `导出CSV`：
  - 导出当前筛选后的 review-only queue items。
  - CSV 使用 UTF-8 BOM，便于 Excel 打开。
  - 导出文件名形如 `baijiabao-review-queue-filtered-YYYYMMDD-HHmmss.csv`。
  - 导出字段包含自动证据字段和空白人工字段：
    - `humanReviewStatus`
    - `humanFinalClass`
    - `humanUseful`
    - `humanConfidence`
    - `humanNotes`
- `复制证据`：
  - 复制当前选中复核项的证据摘要。
  - 包含 reviewItem、point、priority、severity、recommendedAction、window、season、evidence counts、classification mix、maxBoosterScore、autoReview、rule、warning、boundary。
  - 文本明确标注 `AUTO_DRY_RUN_ONLY`、`REVIEW_ONLY`、not `risk_score/risk_level`、requires human confirmation。
- `重置筛选`：
  - 当筛选条件启用时显示，用于快速回到完整 `24` 条队列。

边界：

- 导出的 CSV 是人工交接表，不是 summary checker 的正式 annotation workbook。
- `autoReview.*` 仍不能被当作人工专家真值。
- `maxBoosterScore` 仍不能作为最终风险分数。
- 不写顶层 `risk_score / risk_level`。
- 不接 runtime registry。
- 不改 PostgreSQL schema。

验证：

- `npm run build --workspace apps/desk`
  - passed
- `openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- `git diff --check -- apps/desk/src/views/AnalysisPage.tsx apps/desk/src/views/analysis.css`
  - passed with CRLF/LF warnings only

## 42) Baijiabao v28 State-protected Production-main

v28 已将 v23 之后定位出的“幅值误差下降会破坏方向/状态稳定性”问题转成可执行机制：在 v23 基础上做 residual correction，但只有当校正不会改变预测正负号、也不会改变 `1.3mm` 位移阈值状态时才应用校正，否则自动回退 v23 原预测。

Runtime capability added:

- `libs/regional-model-library/src/contracts/prediction-regression-artifact.ts`
  - `residualCorrection.preserveSign`
  - `residualCorrection.preserveThresholdAbs`
  - derived correction dimensions:
    - `rainfall24hBucket`
    - `rainfall72hBucket`
    - `displacementDelta72hBucket`
    - `reservoirDelta72hBucket`

Training and promotion scripts:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-state-protected-production.mjs`
- `scripts/dev/regional-model-library/promote-baijiabao-displacement-v28-production.mjs`

Current production registry:

- production-main:
  - `BJB-DP-ENS-STATE-PROTECTED-v28`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-state-protected-v28@0.28.0`
- backup-previous-main:
  - `BJB-DP-ENS-SUPPORT-GUARDED-v23`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-guarded-v23@0.23.0`

Selection screen against v23:

- selected key:
  - `stateprot-month-rainfall72hBucket-displacementTrend-mc20-sh20-mb0p08-s1`
- selected dimensions:
  - `month + rainfall72hBucket + displacementTrend`
- development holdout:
  - no regression on MAE/RMSE/R2/Direction/Within/Threshold/P90
- final holdout:
  - MAE `0.638182151 -> 0.636014753`
  - RMSE `0.915682717 -> 0.912245359`
  - R2 `0.074969286 -> 0.081901149`
  - Direction Accuracy unchanged
  - Within 1mm `80.72% -> 80.93%`
  - Threshold-state Agreement unchanged
  - P90 AE `1.463547273 -> 1.470107927`
- holdout from `2024-04-01`:
  - MAE `0.658648663 -> 0.657213864`
  - RMSE `0.934047225 -> 0.931817989`
  - R2 `0.209277121 -> 0.213046962`
  - Direction Accuracy unchanged
  - Within 1mm `79.38% -> 79.52%`
  - Threshold-state Agreement unchanged
  - P90 AE `1.455761254 -> 1.454012587`

Full runtime refit check:

- evaluated: `1352`
- MAE: `0.623418465`
- RMSE: `0.880074724`
- R2: `0.149966573`
- Direction Accuracy: `59.17%`
- Within 1mm: `81.36%`
- P90 AE: `1.355051782 mm`
- `forecastInference` present and model key is v28.
- `npm run build --workspace @lsmv2/ai-prediction-worker` passed.

Production boundary:

- v28 is still a displacement forecast model for future 24h displacement delta in `mm`.
- v28 must not be written as `risk_score / risk_level`.
- The final split P90 is slightly higher, so paper/product writing should describe v28 as a state-protected mean-error/R2 improvement with recorded tail-risk caveat, not as every metric being globally best.

## 43) Baijiabao v30 Tail-guarded Calibration Production-main

v29 先尝试在 v23 base 上增加 P90 non-regression guard。它相对 v23 可通过，但直接对比当前 v28 production-main 时 RMSE、R2、final/holdout P90 均不占优，因此不晋级。

v30 改为在 v28 上做第二层状态保护校正，并修正训练脚本的生产守门逻辑：候选筛选通过后，还必须用最终写出的 artifact 重新跑 runtime 指标；如果最终 artifact 因 refit 造成 dev/final/holdout 退化，则 `promoteAllowed=false`。

Current production registry:

- production-main:
  - `BJB-DP-ENS-V28-LAYER-TAIL-GUARDED-CAL-v30`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v28-layer-tail-guarded-calibration-v30@0.30.0`
- backup-previous-main:
  - `BJB-DP-ENS-STATE-PROTECTED-v28`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-state-protected-v28@0.28.0`

v30 guard:

- base: v28 production artifact.
- final correction scope: `calibration` only, not full-validation refit.
- selected key: `stateprot-point-month-displacementTrend-mc20-sh20-mb0p1-s1`.
- final artifact verification passed all/dev/final/holdout guards with P90 non-regression.

Runtime check:

- evaluated: `1352`
- skipped: `109`
- MAE: `0.623084152`
- RMSE: `0.879748988`
- R2: `0.150595691`
- Direction Accuracy: `59.17%`
- Within 1mm: `81.51%`
- P90 AE: `1.355051782 mm`
- `forecastInference` present and model key is v30.

Compared with v28 runtime:

- all MAE: `-0.000334313`
- all RMSE: `-0.000325736`
- all R2: `+0.000629118`
- final MAE: `-0.000316677`
- final RMSE: `-0.000777915`
- final R2: `+0.001555407`
- final P90 AE: `-0.019419753 mm`
- Direction and threshold-state agreement do not regress.

Production files:

- artifact: `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v30.prediction-regression-v1.json`
- registry: `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- promotion report: `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v30-production.report.json`
- backup manifest: `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v30-production-backup-manifest.json`
- rollback backup: `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v30-2026-05-06T03-33-41-918Z/`
- competition evidence: `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v30-tail-guarded-calibration`

Production boundary:

- v30 is still a displacement forecast model for future 24h displacement delta in `mm`.
- v30 must not be written as `risk_score / risk_level`.
- v30 is an incremental tail-guarded hardening over v28, not a new model-family breakthrough.

## 44) Baijiabao v31 Final Production-main And Boundary Stop

v31 continued the same calibration-scope tail-guarded path from v30 and produced one more meaningful small improvement. A follow-up v32 was also explored and passed guards, but the all-MAE gain was only about `0.000008638 mm`, below the promotion threshold used for this run. v32 is therefore kept as boundary evidence instead of being promoted.

Current production registry:

- production-main:
  - `BJB-DP-ENS-V30-LAYER-TAIL-GUARDED-CAL-v31`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v30-layer-tail-guarded-calibration-v31@0.31.0`
- backup-previous-main:
  - `BJB-DP-ENS-V28-LAYER-TAIL-GUARDED-CAL-v30`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v28-layer-tail-guarded-calibration-v30@0.30.0`

v31 guard:

- base: v30 production artifact.
- final correction scope: `calibration` only.
- selected key: `stateprot-point-month-displacementTrend-mc20-sh45-mb0p04-s1`.
- final artifact verification passed all/dev/final/holdout guards with P90 non-regression.

Runtime check:

- evaluated: `1352`
- skipped: `109`
- MAE: `0.622914074`
- RMSE: `0.879500694`
- R2: `0.151075083`
- Direction Accuracy: `59.17%`
- Within 1mm: `81.51%`
- P90 AE: `1.355051782 mm`
- `forecastInference` present and model key is v31.

Compared with v30 runtime:

- all MAE: `-0.000170078`
- all RMSE: `-0.000248294`
- all R2: `+0.000479392`
- final MAE: `-0.000139192`
- final RMSE: `-0.000431679`
- final R2: `+0.000862548`
- final P90 AE: `-0.024520625 mm`
- Direction and threshold-state agreement do not regress.

Production files:

- artifact: `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v31.prediction-regression-v1.json`
- registry: `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- promotion report: `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v31-production.report.json`
- backup manifest: `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v31-production-backup-manifest.json`
- rollback backup: `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v31-2026-05-06T07-07-55-089Z/`
- competition evidence: `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v31-tail-guarded-calibration`

Production boundary:

- v31 is still a displacement forecast model for future 24h displacement delta in `mm`.
- v31 must not be written as `risk_score / risk_level`.
- v31 was a production-main for the tail-guarded calibration path before v33.
- v32 is boundary evidence only because its incremental gain was below the meaningful promotion threshold.

## 45) Baijiabao v33 Dev-group-gated State-protected Production-main

v33 addresses the problem found after v31/v32: some richer regime corrections, especially displacement or reservoir bucket groups, can improve all/dev metrics but become unstable on the final split. The fix is not a new runtime field or schema change. The training script now supports an optional `DEV_GROUP_GATED=1` path, where each local residual-correction group must first pass a development-split no-regression gate before it can enter final/holdout production screening.

Current production registry:

- production-main:
  - `BJB-DP-ENS-V31-DEV-GATED-STATEPROT-v33`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33@0.33.0`
- backup-previous-main:
  - `BJB-DP-ENS-V30-LAYER-TAIL-GUARDED-CAL-v31`
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v30-layer-tail-guarded-calibration-v31@0.31.0`

v33 guard:

- base: v31 production artifact.
- final correction scope: `calibration` only.
- dev group gate: enabled with `DEV_GROUP_MIN_COUNT=8`.
- selected key: `stateprot-point-displacementDelta72hBucket-mc8-sh30-mb0p06-s0p65`.
- selected dimensions: `point + displacementDelta72hBucket`.
- group filtering: `11` calibration bias groups found, `1` kept after dev-group validation, `10` dropped.
- final artifact verification passed all/dev/final/holdout guards with P90 non-regression.

Runtime check:

- evaluated: `1352`
- skipped: `109`
- MAE: `0.622452582`
- RMSE: `0.879313702`
- R2: `0.151436027`
- Direction Accuracy: `59.17%`
- Within 1mm: `81.51%`
- P90 AE: `1.346605093 mm`
- `forecastInference` present and model key is v33.

Compared with v31 runtime:

- all MAE: `-0.000461492`
- all RMSE: `-0.000186992`
- all R2: `+0.000360944`
- all P90 AE: `-0.008446689 mm`
- dev MAE: `-0.000395728`
- final MAE: `-0.000814500`
- holdout MAE: `-0.000918988`
- Direction, Within 1mm, and threshold-state agreement do not regress.

Production files:

- artifact: `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v33.prediction-regression-v1.json`
- registry: `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- promotion report: `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v33-production.report.json`
- backup manifest: `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v33-production-backup-manifest.json`
- rollback backup: `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v33-2026-05-06T07-17-50-853Z/`
- competition evidence: `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v33-dev-gated-state-protected`

Production boundary:

- v33 is still a displacement forecast model for future 24h displacement delta in `mm`.
- v33 must not be written as `risk_score / risk_level`.
- v33 keeps the existing worker/runtime field contract and only changes the offline model artifact.
- The improvement is still incremental, but it is more meaningful than v32 and is backed by dev-group gating, final artifact verification, runtime smoke, backup manifest, and Excel/chart evidence.
