# 白家堡位移预测模型卡（2026-04）

## 推荐定位

当前位移预测模型用于补齐“位移预测预警一体化框架”中的第一阶段：

- 展示名称：`BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
- 仓库模型键：`baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
- 模型类型：OOF Huber + 细化软工况残差校正点位专家固定集成短期位移增量预测模型
- 预测目标：未来 `24h` 地表位移增量，单位 `mm`
- 标签字段：`labels.displacementLabel`
- 标签来源：`derived-future-delta`
- 特征族：`analog-small+delta-family`
- 训练方式：weighted fixed ensemble of pointwise robust clipped-target ridge + kNN median analog retrieval + chronological blocked OOF Huber linear calibration + soft regime residual correction
- 核心参数：ridge `lambda=0.1`，目标裁剪 `3 mm`，pointwise min train rows `100`，`16` 个点位专家成员，weighted-mean aggregation，`delta-heavy-1p85x`，`huber-linear-oof-c0p6+regime-residual-point-month-s055` 校准
- 优化策略：用稳健 ridge 保留线性趋势，用 kNN median 检索相似历史位移变化状态，再用训练集时间块 OOF 预测拟合 Huber 鲁棒输出校准，并按 `point + month` 学习小幅残差校正；v14 使用全局 RMSE 实用等价带选择机制，在 `0.00005 mm` RMSE 带内优先选择 MAE、Within 1mm 和 P90 更好的候选
- 推荐用途：位移趋势证据、预警前置特征、两阶段模型中的 `stage1_displacement`

这不是预警分类模型，不应使用 Accuracy / Precision / Specificity 作为主指标。

## 数据与实验设置

- 数据集：白家堡滑坡观测数据集（2017-2024 年）
- 训练样本：`5739`
- 验证样本：`1352`
- 时间切分：使用已有 train / validation future-labels window-features 切分
- 标签口径：从下一组地表位移观测派生未来位移增量
- 主要输入特征：
  - `displacementSurfaceMm_delta_24h`
  - `displacementSurfaceMm_delta_72h`
  - `rainfallCurrentMm_sum_24h`
  - `rainfallCurrentMm_sum_72h`
  - `reservoirLevelM_delta_24h`
  - `reservoirLevelM_delta_72h`
- 点位专家：
  - `ZD1`：训练样本 `1990`
  - `ZD2`：训练样本 `2021`
  - `ZD3`：训练样本 `1728`
- 固定集成成员：
  - feature family：`analog-small` 与 `delta-family`
  - k：`15 / 20`
  - ridge blend weight：`0.3 / 0.35 / 0.4 / 0.45`
  - aggregation：`weighted-mean`
  - weight profile：`delta-heavy-1p85x`
  - calibration：`huber-linear-oof-c0p6+regime-residual-point-month-s055`
  - calibration intercept：`-0.0440983091635756`
  - calibration slope：`1.3887266544632018`
  - calibration scale：`0.49116163192983286`
  - calibration cutoff：`0.2946969791578997`
  - calibration tuning constant：`0.6`
  - residual correction：`point-month-s055`
  - residual correction scale：`0.55`
  - residual correction min count：`35`
  - residual correction shrinkage：`90`
  - residual correction max abs bias：`0.16`
  - residual correction bias count：`36`

## 推荐写入材料的指标

| 指标 | 数值 |
| --- | ---: |
| MAE | `0.633 mm` |
| RMSE | `0.894 mm` |
| R2 | `0.1236` |
| Direction Accuracy | `58.28%` |
| Within 1 mm | `80.77%` |
| Threshold-state Agreement | `86.32%` |
| P50 Absolute Error | `0.473 mm` |
| P90 Absolute Error | `1.392 mm` |

推荐主写：

> 在白家堡 2017-2024 年监测数据验证集上，OOF Huber + 细化软工况残差校正点位专家加权固定集成短期位移增量预测模型对未来 24h 地表位移增量的 MAE 为 0.633 mm，RMSE 为 0.894 mm，R2 为 0.1236，其中 80.77% 的样本预测误差控制在 1 mm 以内，可为后续风险预警模型提供位移趋势证据。

不要把 R2 作为唯一主指标。当前 R2 已提升到 `0.1236`，但短期位移增量仍受噪声和事件边界影响明显，模型更适合定位为区域短期趋势证据模块，而不是全国泛化的高解释度位移回归模型。

## 优化说明

相对前几版：

| 指标 | v1 ridge | v2 robust ridge | v3 analog ensemble | v4 fine-grid analog | v5 pointwise analog | v6 pointwise delta analog | v7 fixed expert ensemble | v8 OOF-linear ensemble | v9 OOF-Huber ensemble | v10 OOF-Huber profile ensemble | v11 OOF-Huber refined profile | v12 OOF-Regime residual | v13 OOF-Soft-Regime residual | v14 OOF-Refined-Soft-Regime |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MAE | `0.682 mm` | `0.673 mm` | `0.658 mm` | `0.657 mm` | `0.653 mm` | `0.639 mm` | `0.639 mm` | `0.637 mm` | `0.635 mm` | `0.634 mm` | `0.634 mm` | `0.634 mm` | `0.633 mm` | `0.633 mm` |
| RMSE | `0.935 mm` | `0.933 mm` | `0.914 mm` | `0.913 mm` | `0.908 mm` | `0.904 mm` | `0.899 mm` | `0.897 mm` | `0.895 mm` | `0.895 mm` | `0.894 mm` | `0.894 mm` | `0.894 mm` | `0.894 mm` |
| R2 | `0.0405` | `0.0440` | `0.0838` | `0.0845` | `0.0962` | `0.1029` | `0.1124` | `0.1171` | `0.1212` | `0.1216` | `0.1220` | `0.1223` | `0.1236` | `0.1236` |
| Direction Accuracy | `54.14%` | `55.18%` | `54.51%` | `55.33%` | `54.73%` | `59.32%` | `58.58%` | `58.65%` | `59.54%` | `59.62%` | `59.47%` | `57.40%` | `58.36%` | `58.28%` |
| Within 1 mm | `78.25%` | `79.88%` | `80.25%` | `79.96%` | `79.96%` | `80.55%` | `80.40%` | `80.55%` | `80.62%` | `80.77%` | `80.84%` | `80.40%` | `80.62%` | `80.77%` |
| Threshold-state Agreement | `85.72%` | `85.28%` | `86.24%` | `86.09%` | `86.09%` | `85.58%` | `85.72%` | `86.02%` | `86.24%` | `86.24%` | `86.24%` | `86.39%` | `86.24%` | `86.32%` |
| P90 Absolute Error | `1.477 mm` | `1.479 mm` | `1.426 mm` | `1.425 mm` | `1.398 mm` | `1.401 mm` | `1.407 mm` | `1.397 mm` | `1.387 mm` | `1.385 mm` | `1.382 mm` | `1.380 mm` | `1.392 mm` | `1.392 mm` |

`v3` 的主要优化来自 `ridge + kNN median` 的 analog ensemble。`v4` 做细粒度参数搜索。`v5` 把模型拆成 `ZD1 / ZD2 / ZD3` 三个点位专家并保留全局 fallback。`v6` 在点位专家基础上引入降雨 24h/72h 累积和库水位 24h/72h 变化。`v7` 进一步把 `analog-small` 与 `delta-family` 下的多个点位专家固定集成为 16 成员 weighted-mean ensemble。`v8` 在最终固定专家集成上新增训练集 `5` 折 chronological blocked OOF 线性校准。`v9` 把普通 OOF 线性校准升级为 Huber 鲁棒线性校准。`v10` 继续在训练集 OOF 内部选择 Huber tuning constant。`v11` 扩展 refined Huber profile 到 `c=0.6` 并细化 `delta-heavy` 权重。`v12` 新增 `point + month` 工况残差校正。`v13` 在 v12 基础上加入 `correctionScale=0.5` 的软残差校正。`v14` 继续加密软残差强度和 `delta-heavy` 权重，并修正候选选择为全局 RMSE 实用等价带内排序，当前选中 `delta-heavy-1p85x + point-month-s055`。`v15` 新增 previous-label sequence-lag 候选族，但未超过 v14，因此仅保留为时序滞后消融对照。`v16-ablation` 参考近期 LSTM、TCN、图时空预测论文路线，补做普通非线性 tabular、轻量图特征与滚动分解特征挑战，最佳 `process-core+lag+decomp + gradient-boosting-huber` 为 MAE `0.646 mm`、RMSE `0.913 mm`、R2 `0.0843`，未超过 v14。`v17-ablation` 已把分解特征接入 analog / OOF 主脚本，最好 decomp OOF 候选 MAE `0.632411 mm`，MAE 最低候选 `0.632258 mm`，但 RMSE、R2、Threshold Agreement 和 P90 均弱于 v14，因此不升主模型。`v18-ablation` 进一步测试同点位历史序列、GRU 和轻量 TCN，最佳 `lookback=20 + sequence-flatten-gradient-boosting-huber` 为 MAE `0.648417 mm`、RMSE `0.917798 mm`、R2 `0.075533`，仍弱于 v14。`v19-ablation` 测试累计位移趋势先验 + 残差学习，最佳 `trendPriorSlope3 + residual + component-gradient-boosting-huber` 为 MAE `0.645971 mm`、RMSE `0.905904 mm`、R2 `0.099340`，比直接序列更强但仍弱于 v14。`v20-ablation` 测试 v14 与两个 decomp seed 的 nested OOF convex 元融合，OOF 选择最终退化为 `v17-decomp-mae-seed`，验证 MAE `0.632273 mm` 但 RMSE `0.896937 mm`、R2 `0.117081`、P90 `1.407855 mm` 均弱于 v14，因此不升主模型。

本轮还保留过两类输出校准：

- 验证集 bias 搜索：最好候选可到 RMSE `0.910 mm`、R2 `0.0913`，但该偏置来自验证集均值搜索，不适合作为主模型指标，因此没有升为正式主推模型。
- 训练集时间块 out-of-fold 校准：脚本现在会对前 `8` 个 analog ensemble 候选和前 `18` 个固定专家集成候选做 `5` 折 chronological blocked OOF 校准实验，并把 `bias-only-oof`、`linear-oof`、不同 tuning constant 的 `huber-linear-oof-*`、工况残差校正候选参数、OOF 指标、验证集指标写入报告；最终固定专家集成的细化软工况残差校正在全局 RMSE 实用等价带内取得更好的 MAE、Within 1mm 和 Threshold-state Agreement，因此升为 `v14` 主模型。

另有 MAE 最优候选：

- model family：`pointwise-ridge-knn-median-blend`
- feature family：`delta-family`
- k：`20`
- ridge blend weight：`0.3`
- MAE：`0.638 mm`
- RMSE：`0.904 mm`
- R2：`0.1029`
- Within 1 mm：`80.25%`

该候选适合附录说明早期“误差绝对值最小候选”。主文推荐 `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`，因为它是在全局 RMSE 实用等价带内更均衡的 MAE / Within 1mm / Threshold 操作点。`v13` 的 RMSE/R2 略优，可作为精度主参考；`v12` 的 P90 更好，可作为尾部误差操作点；`v11` 的 Direction 更高，可作为方向判断操作点。

本轮新增的 `sequence-lag` 对照使用同一点位此前已观测到的位移增量标签构造 `labelLag1 / labelLag2 / labelLag3 / labelMean3 / labelMean5 / labelEma3` 等时序状态特征。为避免泄漏，validation 样本只使用其时间之前的 train 或 validation 历史标签。该候选最好结果为 MAE `0.639 mm`、RMSE `0.899 mm`、R2 `0.1132`，未超过 v14，因此不作为主模型。

本轮新增的 `decomp-family` 已进入主脚本的 analog / OOF 固定专家集成路线，特征包括泄漏安全的滚动位移均值、残差、斜率、波动、范围、降雨均值和库水位斜率。最好 decomp OOF 候选为 `analog-small+delta-family+decomp-family + delta-heavy-3x + huber-linear-oof-c0p6+point-month-s045`，MAE `0.632411 mm`、RMSE `0.896798 mm`、R2 `0.117354`、Direction `58.88%`、Within 1mm `80.70%`、Threshold Agreement `85.95%`、P90 `1.403700 mm`。它只在 MAE 上比 v14 低约 `0.000664 mm`，但 v14 的 RMSE、R2、Threshold Agreement、Within 1mm 和 P90 更均衡，所以当前写成 `v17-decomp-ablation`，不替换主模型。

本轮新增的同点位序列模型对照使用 `lookback=6 / 12 / 20` 的历史观测窗口，并测试 flatten 序列基线、GRU 与轻量 TCN。validation 序列状态从 train 历史初始化，只滚动使用更早 validation 观测，当前样本目标标签不进入输入。最佳候选为 `lookback=20 + sequence-flatten-gradient-boosting-huber`，MAE `0.648417 mm`、RMSE `0.917798 mm`、R2 `0.075533`、Threshold Agreement `88.46%`。它的阈值状态一致性有参考价值，但核心误差指标明显弱于 v14，因此写成 `v18-sequence-ablation`，不作为主模型。

本轮新增的累计位移趋势先验残差模型把同点位历史累计位移转成短窗口趋势先验，再训练模型学习 residual。最佳候选为 `trendPriorSlope3 + residual + component-gradient-boosting-huber`，MAE `0.645971 mm`、RMSE `0.905904 mm`、R2 `0.099340`、Threshold Agreement `86.17%`。它比直接序列模型更强，但仍弱于 v14，因此写成 `v19-component-residual-ablation`，不作为主模型。

本轮新增的元融合挑战把 `v14-balanced-seed`、`v17-decomp-balanced-seed`、`v17-decomp-mae-seed` 作为 seed，并用 nested chronological OOF 学习 seed 校准和 convex meta weights。OOF 选择权重为 `v14=0 / v17-decomp-balanced=0 / v17-decomp-mae=1`，说明简单元融合没有学到优于 v14 的组合。元融合验证 MAE 为 `0.632273 mm`，但 RMSE `0.896937 mm`、R2 `0.117081`、Threshold Agreement `86.02%`、P90 `1.407855 mm` 均弱于 v14，因此写成 `v20-meta-ensemble-ablation`，不作为主模型。

## 与预警模型的关系

当前完整写法应是两阶段：

| 阶段 | 模型 | 输出 | 指标口径 |
| --- | --- | --- | --- |
| Stage 1 | `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` | 未来 24h 位移增量 / 趋势证据 | MAE / RMSE / 误差范围 |
| Stage 2 | `BJB-HC-RES-LR-v1` | 高置信风险确认 | Accuracy / Precision / Specificity |

推荐组合表述：

> 本项目采用“位移预测 + 预警确认”的两阶段建模策略。第一阶段基于监测点位、历史位移变化状态、降雨累积和库水位变化构建 OOF Huber + 细化软工况残差校正加权固定专家集成模型，预测未来 24h 地表位移增量，验证集 MAE 为 0.633 mm、RMSE 为 0.894 mm，R2 为 0.1236；第二阶段结合区域专家预警模型进行高置信风险确认，在验证集上取得 93.72% 的准确率、80.00% 的精确率和 99.62% 的特异性。

## 运行时接入状态

截至 `2026-04-26`，`BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` 已从离线模型推进到 worker 可加载的运行时 forecast artifact：

- 运行时目录：`artifacts/models/regional-experts/phase1-displacement-forecast/`
- 轻量 registry：`artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- 大模型 artifact：`artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json`
- artifact 类型：`calibrated_prediction_regression_v1`
- 运行时角色：`forecast`
- 输出位置：`payloadExt.forecastInference` 与 `payloadExt.secondaryInferences`
- 风险路径边界：worker 主风险匹配会过滤 forecast artifact，v14 不会写入 `riskScore`

运行时 smoke 已通过：

- `npm run build --workspace @lsmv2/regional-model-library`
- `npm run build --workspace @lsmv2/ai-prediction-worker`
- `node scripts/dev/regional-model-library/register-baijiabao-displacement-runtime-artifact.mjs`
- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`

runtime-loaded artifact 复算验证集结果：

| 指标 | 数值 |
| --- | ---: |
| Evaluated Samples | `1352` |
| Skipped Samples | `109` |
| MAE | `0.632960 mm` |
| RMSE | `0.893454 mm` |
| R2 | `0.123924` |
| Direction Accuracy | `58.21%` |
| Within 1 mm | `80.70%` |
| P90 Absolute Error | `1.391187 mm` |

worker pipeline smoke 同时证明：在只注册 forecast artifact、没有主风险 artifact 的场景中，主风险路径仍回退到 `heuristic.v1`，而 `forecastInference` 正常输出位移预测值，所需 `24h / 72h` 窗口特征全部满足。

桌面 HTTP proof 已补齐：

- 脚本：`scripts/dev/check-desk-ai-forecast-http-field.ts`
- 报告：`artifacts/models/regional-experts/phase1-displacement-forecast/desk-http-forecast-field-proof.report.json`
- 结果：`pass=true`
- 证明链路：
  - PostgreSQL `ai_predictions.payload.forecastInference`
  - `/api/v1/ai/predictions`
  - `apps/desk/src/api/httpClient.ts`
  - `AiPrediction.forecastInference`
- 当前 proof 读回：
  - risk model: `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
  - forecast model: `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
  - predicted displacement: `0.411357063187622 mm`
  - horizon: `24h`
  - required features satisfied: `true`

这说明 v14 不只是在 worker 内可运行，也已经能通过真实数据库和 API 被桌面端读取。它仍然只作为 forecast 输出，不写入顶层 `risk_score / risk_level`。

## 产物路径

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-model.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/history/*.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/history/*.report.md`
- `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/register-baijiabao-displacement-runtime-artifact.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/check-baijiabao-displacement-runtime-forecast.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/desk-http-forecast-field-proof.report.json`
- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`
- `scripts/dev/regional-model-library/register-baijiabao-displacement-runtime-artifact.mjs`
- `scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
- `scripts/dev/check-desk-ai-forecast-http-field.ts`
- `docs/research/baijiabao-displacement-prediction-experiment-log-2026-04.md`

## 不要这样写

- 不要写“位移预测准确率达到 93.72%”。
- 不要把 `BJB-HC-RES-LR-v1` 写成位移预测模型。
- 不要把预警模型的 Accuracy / Precision / Specificity 写给位移预测。
- 不要写“位移预测模型已经达到生产级高精度预测”。
- 不要把 `displacementLabel` 写成人工专家标注滑坡事件标签，它是未来位移增量派生标签。

## 推荐定位

这版位移模型最适合定位为：

- 白家堡区域短期位移增量预测主线模型
- 两阶段预警框架中的位移趋势证据模块
- 区域专家模型库的 `forecast` 任务样例
- analog nearest-history 在区域监测时间序列中的可复现样例
- 后续引入 LSTM / TCN / Transformer / Chronos 等时序模型的可复现对照基线

不建议定位为：

- 最终成熟位移预测主模型
- 独立灾害事件判别模型
- 全国泛化位移预测模型
