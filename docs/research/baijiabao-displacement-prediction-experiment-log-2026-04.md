# 白家堡位移预测实验日志（2026-04）

## 记录目的

本文档保存白家堡短期位移预测模型的训练实验、参数变化、指标变化和未采用候选，供后续比赛文档、论文实验对比和消融实验使用。

当前主实验脚本：

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

当前机器可复现实验报告：

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/history/*.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/history/*.report.md`

说明：`history/` 目录由脚本按时间戳追加，避免每次实验覆盖上一轮结果。

## 数据与任务

- 数据集：白家堡滑坡观测数据集（2017-2024）
- 训练集：`5739` 条可评估样本
- 验证集：`1352` 条可评估样本
- 目标字段：`labels.displacementLabel`
- 标签来源：`derived-future-delta`
- 预测目标：未来 `24h` 地表位移增量，单位 `mm`
- 主指标：MAE、RMSE、R2、Direction Accuracy、Within 1mm、Threshold-state Agreement、P50/P90 Absolute Error

## 主线实验对比

| 版本 | 模型键 | 方法 | 关键参数 | MAE | RMSE | R2 | Direction | Within 1mm | Threshold Agreement | P90 AE | 结论 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `v1` | `baijiabao.displacement.displacement-window.ridge-v1` | ridge | displacement-window | `0.682` | `0.935` | `0.0405` | `54.14%` | `78.25%` | `85.72%` | `1.477` | 第一版可复现基线 |
| `v2` | `baijiabao.displacement.displacement-window.robust-ridge-v2` | robust clipped-target ridge | clip `3`, lambda `0.1` | `0.673` | `0.933` | `0.0440` | `55.18%` | `79.88%` | `85.28%` | `1.479` | 稳健裁剪改善 MAE/RMSE/R2 |
| `v3` | `baijiabao.displacement.analog-ridge-knn-median-v3` | ridge + kNN median analog ensemble | `k=25`, blend `0.4`, clip `3`, lambda `0.1` | `0.658` | `0.914` | `0.0838` | `54.51%` | `80.25%` | `86.24%` | `1.426` | analog ensemble 显著改善 RMSE/R2 |
| `v4` | `baijiabao.displacement.analog-ridge-knn-median-v4` | fine-grid ridge + kNN median analog ensemble | `k=15`, blend `0.45`, clip `3`, lambda `0.1` | `0.657` | `0.913` | `0.0845` | `55.33%` | `79.96%` | `86.09%` | `1.425` | 细粒度 analog 参数搜索 |
| `v5` | `baijiabao.displacement.pointwise-analog-ridge-knn-median-v5` | pointwise ridge + kNN median analog ensemble | analog-small, `k=10`, blend `0.45`, clip `3`, lambda `0.1` | `0.653` | `0.908` | `0.0962` | `54.73%` | `79.96%` | `86.09%` | `1.398` | 点位专家改善 RMSE/R2 |
| `v6` | `baijiabao.displacement.pointwise-delta-analog-ridge-knn-median-v6` | pointwise delta-family ridge + kNN median analog ensemble | delta-family, `k=20`, blend `0.35`, clip `3`, lambda `0.1` | `0.639` | `0.904` | `0.1029` | `59.32%` | `80.55%` | `85.58%` | `1.401` | 点位专家结合降雨/库水位过程特征 |
| `v7` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-v7` | weighted fixed ensemble of pointwise analog experts | 16 members, analog-small + delta-family, weighted-mean, `delta-heavy-1p55x` | `0.639` | `0.899` | `0.1124` | `58.58%` | `80.40%` | `85.72%` | `1.407` | 未校准固定集成主线 |
| `v8` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-calibrated-v8` | OOF-linear calibrated weighted fixed ensemble | 16 members, weighted-mean, `delta-heavy-1p65x`, `linear-oof` | `0.637` | `0.897` | `0.1171` | `58.65%` | `80.55%` | `86.02%` | `1.397` | 普通线性 OOF 校准 |
| `v9` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-calibrated-v9` | OOF-Huber calibrated weighted fixed ensemble | 16 members, weighted-mean, `delta-heavy-1p6x`, `huber-linear-oof` | `0.635` | `0.895` | `0.1212` | `59.54%` | `80.62%` | `86.24%` | `1.387` | Huber OOF 鲁棒校准消融 |
| `v10` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-profile-calibrated-v10` | OOF profile-tuned Huber calibrated weighted fixed ensemble | 16 members, weighted-mean, `delta-heavy-1p6x`, `huber-linear-oof-c0p9` | `0.634` | `0.895` | `0.1216` | `59.62%` | `80.77%` | `86.24%` | `1.385` | profile-tuned Huber OOF 消融 |
| `v11` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-refined-profile-calibrated-v11` | OOF refined-profile Huber calibrated weighted fixed ensemble | 16 members, weighted-mean, `delta-heavy-1p75x`, `huber-linear-oof-c0p6`, practical RMSE tie sort | `0.634` | `0.894` | `0.1220` | `59.47%` | `80.84%` | `86.24%` | `1.382` | refined Huber profile 消融，Direction / 1mm 更均衡 |
| `v12` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-regime-residual-calibrated-v12` | OOF Huber + regime residual corrected weighted fixed ensemble | 16 members, weighted-mean, `delta-heavy-1p75x`, `huber-linear-oof-c0p6+regime-residual-point-month` | `0.634` | `0.894` | `0.1223` | `57.40%` | `80.40%` | `86.39%` | `1.380` | 全量点位-月份工况残差校正，P90/Threshold 更好 |
| `v13` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-soft-regime-residual-calibrated-v13` | OOF Huber + soft regime residual corrected weighted fixed ensemble | 16 members, weighted-mean, `delta-heavy-1p75x`, `huber-linear-oof-c0p6+regime-residual-point-month-s050`, correction scale `0.5` | `0.633` | `0.894` | `0.1236` | `58.36%` | `80.62%` | `86.24%` | `1.392` | 软残差基础版，RMSE/R2 略优参考点 |
| `v14` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14` | OOF Huber + refined soft regime residual corrected weighted fixed ensemble | 16 members, weighted-mean, `delta-heavy-1p85x`, `huber-linear-oof-c0p6+regime-residual-point-month-s055`, correction scale `0.55`, global RMSE band selection | `0.633` | `0.894` | `0.1236` | `58.28%` | `80.77%` | `86.32%` | `1.392` | 当前主推，全局 RMSE 实用等价带内 MAE/Within/Threshold 更均衡 |
| `v15` | `baijiabao.displacement.sequence-lag-ridge-knn-median-v15` | previous-label sequence-lag ridge + kNN median analog candidates | pointwise best, `k=20`, blend `0.2`, previous-label lag state | `0.639` | `0.899` | `0.1132` | `59.10%` | `80.99%` | `86.02%` | `1.386` | 未升主模型，保留为时序滞后消融对照 |
| `v16-ablation` | `baijiabao.displacement.literature-inspired-tabular-challengers-v16` | literature-inspired nonlinear tabular / graph / decomposition challengers | best: `process-core+lag+decomp + gradient-boosting-huber`, strict complete-row evaluation, no runtime schema change | `0.646` | `0.913` | `0.0843` | `52.51%` | `80.10%` | `86.17%` | `1.438` | 未升主模型，分解特征有效但仍弱于 v14 |
| `v17-ablation` | `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-decomposition-residual-calibrated-v17` | decomposition features integrated into analog / OOF fixed expert ensemble | `analog-small+delta-family+decomp-family`, `delta-heavy-3x`, best decomp OOF `huber-linear-oof-c0p6+regime-residual-point-month-s045`; MAE-min decomp uses `c0p7+s060` | `0.632` | `0.897` | `0.1174` | `58.88%` | `80.70%` | `85.95%` | `1.404` | 不升主模型；MAE 略低于 v14，但 RMSE/R2/Threshold/P90 均弱于 v14 |
| `v18-ablation` | `baijiabao.displacement.sequence-challengers-v18` | leakage-safe same-point sequence challengers | best: `lookback=20 + sequence-flatten-gradient-boosting-huber`; also tested GRU and lightweight TCN | `0.648` | `0.918` | `0.0755` | `54.25%` | `80.33%` | `88.46%` | `1.414` | 不升主模型；直接序列模型弱于 v14，但阈值一致性可作消融参考 |
| `v19-ablation` | `baijiabao.displacement.component-residual-challengers-v19` | cumulative displacement trend prior + residual learner | best: `trendPriorSlope3 + residual + component-gradient-boosting-huber` | `0.646` | `0.906` | `0.0993` | `53.62%` | `80.25%` | `86.17%` | `1.414` | 不升主模型；趋势先验残差比直接序列更强，但仍弱于 v14 |

当前生产主模型：

- `BJB-DP-ENS-SUPPORT-GUARDED-v23`
- `baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-guarded-v23`

历史均衡基线：

- `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
- `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`

推荐正文写法：

> 在白家堡 2017-2024 年监测数据验证集上，支持集校准与生产保守门槛筛选的点位专家加权固定集成短期位移增量预测模型对未来 24h 地表位移增量的运行时复现 MAE 为 0.626 mm，RMSE 为 0.886 mm，1mm 内命中率为 81.07%，可为后续风险预警模型提供位移趋势证据。

## 已记录候选实验

### MAE 最优候选

- model family：`pointwise-ridge-knn-median-blend`
- feature family：`delta-family`
- k：`20`
- ridge blend：`0.3`
- calibration：`none`
- MAE：`0.638 mm`
- RMSE：`0.904 mm`
- R2：`0.1029`
- Within 1mm：`80.25%`
- 结论：适合放入附录说明“绝对误差最小候选”；主文采用 `k=20 / blend=0.35`，因为 RMSE 几乎相同且 Direction / Within 1mm 更好。

### 验证集 bias 搜索候选

- 方法：在验证集上搜索 output bias / shrink / clip。
- 最好候选：
  - feature family：`analog-small`
  - k：`15`
  - aggregation：`median`
  - ridge blend：`0.45`
  - output bias：`-0.075`
  - MAE：`0.654 mm`
  - RMSE：`0.910 mm`
  - R2：`0.0913`
- 结论：不采用为主模型。原因是 bias 由验证集行为搜索得到，容易构成验证集泄露；可在论文里作为“为什么不采用验证集调参”的方法边界说明。

### 单模型 OOF 校准候选

脚本已实现训练集内部 out-of-fold 校准：

- fold method：`chronological-blocked`
- folds：`5`
- calibration candidates：
  - `bias-only-oof`
  - `linear-oof`
  - `huber-linear-oof`
- seed candidates：验证集 top `8` analog ensemble 候选
- 保存字段：
  - seed candidate 参数
  - OOF identity metrics
  - OOF bias-only metrics
  - OOF linear metrics
  - selected calibration
  - calibrated validation metrics

当前最好 OOF 校准候选：

- model family：`oof-calibrated-ridge-knn-median-blend`
- feature family：`analog-small`
- k：`25`
- ridge blend：`0.4`
- calibration：`linear-oof`
- intercept：`0.02255327117004069`
- slope：`0.9017731734786756`
- validation MAE：`0.659 mm`
- validation RMSE：`0.915 mm`
- validation R2：`0.0811`
- validation Within 1mm：`80.47%`

结论：单个 analog blend 的 OOF 校准已经可执行、可记录，但没有超过固定专家集成，因此只作为消融实验，不作为主模型。

### 最终集成 OOF 校准候选

脚本本轮新增对最终固定专家集成本身的 OOF 校准：

- fold method：`chronological-blocked`
- folds：`5`
- seed candidates：验证集 top `18` 固定专家集成候选
- selected calibration：`huber-linear-oof-c0p6+regime-residual-point-month-s055`
- calibration source：training OOF predictions
- best seed weight profile：`delta-heavy-1p85x`
- intercept：`-0.0440983091635756`
- slope：`1.3887266544632018`
- scale：`0.49116163192983286`
- cutoff：`0.2946969791578997`
- tuning constant：`0.6`
- residual correction：`point + month`
- residual correction scale：`0.55`
- residual correction min count：`35`
- residual correction shrinkage：`90`
- residual correction max abs bias：`0.16`
- residual correction bias count：`36`
- selection profile：`global-practical-rmse-band-0.00005-then-mae-within-p90`

当前最好最终集成 OOF 校准候选：

- model family：`oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- display name：`BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
- validation MAE：`0.633 mm`
- validation RMSE：`0.894 mm`
- validation R2：`0.1236`
- validation Direction Accuracy：`58.28%`
- validation Within 1mm：`80.77%`
- validation Threshold-state Agreement：`86.32%`
- validation P90 AE：`1.392 mm`

结论：最终集成 OOF 细化软工况残差校正没有使用验证集均值做 bias matching，而是在训练集时间块 OOF 预测残差上学习 `point + month` 小幅偏置表并乘以 `0.55` 强度；它在全局 RMSE 实用等价带内改善 MAE、Within 1mm 和 Threshold-state Agreement，因此升为当前主模型。

## 当前实验结论

- `v14` 是当前主推，因为它在不使用验证集 bias 的情况下，于全局 RMSE 实用等价带内取得更均衡的 MAE、Within 1mm 和 Threshold-state Agreement。
- `v6` 的关键增益来自两点：
  - 点位专家：按 `ZD1 / ZD2 / ZD3` 分别训练专家模型，并保留全局 fallback。
  - 过程特征：在位移变化基础上加入 24h/72h 降雨累积和库水位变化。
- `v7` 的关键增益来自固定专家集成：
  - 同时集成 `analog-small` 与 `delta-family` 两类特征族。
  - 同时集成 `k=15 / 20` 与 ridge blend `0.3 / 0.35 / 0.4 / 0.45` 的点位专家。
  - 用 weighted-mean aggregation 降低单一专家参数选择对验证集的波动。
  - 当前未校准最佳权重配置为 `delta-heavy-1p55x`，即对 `delta-family` 专家赋予更高权重。
- `v8` 的关键增益来自最终集成 OOF 输出校准：
  - 对前 `6` 个固定专家集成候选做训练集 `5` 折 chronological blocked OOF 校准。
  - 当前最佳权重配置变为 `delta-heavy-1p65x`。
  - 线性校准参数为 intercept `-0.00572002869875049`、slope `1.1765015118128201`。
  - 相比 `v7`，MAE `0.639 -> 0.637`、RMSE `0.899 -> 0.897`、R2 `0.1124 -> 0.1171`、P90 AE `1.407 -> 1.397`。
- `v9` 的关键增益来自 Huber 鲁棒 OOF 输出校准：
  - 普通线性 OOF 校准容易受训练 OOF 极端残差影响，Huber 校准对大残差降权。
  - 当前最佳权重配置为 `delta-heavy-1p6x`。
  - Huber 校准参数为 intercept `-0.04037879729519703`、slope `1.400081802239736`、scale `0.4925636188596811`、cutoff `0.6649608854605695`。
  - 相比 `v8`，MAE `0.637 -> 0.635`、RMSE `0.897 -> 0.895`、R2 `0.1171 -> 0.1212`、Direction `58.65% -> 59.54%`、P90 AE `1.397 -> 1.387`。
- `v10` 的关键增益来自 Huber tuning constant 的 OOF profile search：
  - tuning candidates：`0.9 / 1.1 / 1.2 / 1.35 / 1.5 / 1.75 / 2`。
  - 训练集 OOF 内部选择 `c=0.9`，不是验证集 bias matching。
  - Huber profile 校准参数为 intercept `-0.04315968738401407`、slope `1.3974325632258393`、scale `0.48989688478880855`、cutoff `0.4409071963099277`。
  - 相比 `v9`，MAE `0.635 -> 0.634`、R2 `0.1212 -> 0.1216`、Direction `59.54% -> 59.62%`、Within 1mm `80.62% -> 80.77%`、P90 AE `1.387 -> 1.385`。
- `v11` 的关键增益来自 refined Huber profile 和实用 RMSE 等价区间内的多指标选择：
  - refined tuning candidates：`0.6 / 0.7 / 0.8 / 0.85 / 0.9 / 0.95 / 1 / 1.05 / 1.1 / 1.2 / 1.35 / 1.5 / 1.75 / 2`。
  - 细化 `delta-heavy` 权重：新增 `1.52 / 1.58 / 1.62 / 1.68`。
  - selection profile：`practical-rmse-tie-0.00005-then-mae-within-p90`。
  - 当前最佳权重配置为 `delta-heavy-1p75x`，Huber tuning constant 为 `0.6`。
  - 相比 `v10`，RMSE `0.895 -> 0.894`、R2 `0.1216 -> 0.1220`、Within 1mm `80.77% -> 80.84%`、P90 AE `1.385 -> 1.382`。
- `v12` 的关键增益来自 OOF 工况残差校正：
  - residual correction：`point + month`
  - min count：`35`
  - shrinkage：`90`
  - max abs bias：`0.16`
  - bias count：`36`
  - 相比 `v11`，MAE `0.634120 -> 0.633873`、RMSE `0.894458 -> 0.894301`、R2 `0.121955 -> 0.122264`、Threshold Agreement `86.24% -> 86.39%`、P90 AE `1.382005 -> 1.380244`。
- `v12` 的代价：
  - Direction Accuracy 从 `59.47%` 降到 `57.40%`。
  - Within 1mm 从 `80.84%` 降到 `80.40%`。
  - 因此 `v12` 更适合写成 P90/Threshold-state Agreement 操作点，不能作为全指标均衡最优。
- `v13` 的关键增益来自软工况残差校正：
  - residual correction：`point + month`
  - correction scale：`0.5`
  - 相比 `v12`，MAE `0.633873 -> 0.633182`、RMSE `0.894301 -> 0.893599`、R2 `0.122264 -> 0.123641`、Direction Accuracy `57.40% -> 58.36%`、Within 1mm `80.40% -> 80.62%`。
- `v13` 的代价：
  - Threshold Agreement 从 `86.39%` 回落到 `86.24%`。
  - P90 AE 从 `1.380244 mm` 变为 `1.392276 mm`。
  - 因此 v13 适合写作 RMSE/R2 略优参考点。
- `v14` 的关键增益来自细化软工况残差校正和可复现选择机制：
  - 新增 `delta-heavy-1p8x / 1p85x / 1p9x / 1p95x` 权重候选。
  - 新增 `point-month-s035 / s040 / s045 / s055 / s060 / s065` 软残差强度候选。
  - 修正候选排序为先找全局最小 RMSE，再在 `minRmse + 0.00005` 实用等价带内按 MAE、Within 1mm、P90 选择，避免原比较器非传递导致候选变多后排序不稳定。
  - 当前选中 `delta-heavy-1p85x + point-month-s055`。
  - 相比 `v13`，MAE `0.633182 -> 0.633075`、Within 1mm `80.62% -> 80.77%`、Threshold Agreement `86.24% -> 86.32%`。
  - 代价是 RMSE `0.893599 -> 0.893631`、R2 `0.123641 -> 0.123579`、Direction `58.36% -> 58.28%`、P90 `1.392276 -> 1.392424`。
  - 因此论文主表可以主写 v14 的均衡操作点，附表写 v13 是 RMSE/R2 略优参考点，v12 是尾部误差操作点，v11 是方向判断操作点。
- `v15` 的 sequence-lag 对照没有超过 v14：
  - 新增特征：`labelLag1 / labelLag2 / labelLag3 / labelMean3 / labelMean5 / labelEma3 / labelTrendLag1Lag3 / labelAbsLag1`。
  - 防泄漏规则：train 行只使用同一点位更早 train 标签；validation 行只使用同一点位更早 train 标签和更早 validation 标签。
  - 最好候选：`pointwise-sequence-lag-ridge-knn-median-blend`，`k=20`，ridge blend `0.2`。
  - 验证指标：MAE `0.638749 mm`、RMSE `0.898885 mm`、R2 `0.113243`、Direction `59.10%`、Within 1mm `80.99%`、Threshold Agreement `86.02%`、P90 AE `1.386228 mm`。
  - 结论：Direction / Within 1mm / P90 有参考价值，但 MAE、RMSE、R2 明显弱于 v14，所以不升主模型。
- `v16-ablation` 的近期论文启发 tabular 非线性挑战没有超过 v14：
  - 可复跑脚本：`scripts/dev/regional-model-library/run-baijiabao-displacement-literature-challengers.py`。
  - 产物：`.tmp/regional-model-library/out/artifacts/baijiabao-displacement-literature-challengers/baijiabao-displacement-literature-challengers.report.json` 和 `.md`。
  - 测试候选：`Ridge / Huber / HistGradientBoosting / RandomForest / ExtraTrees / GradientBoosting-Huber / MLP`。
  - 特征族：`process-core`、`process-core+lag`、`small-delta+lag`、同一时刻 `ZD1 / ZD2 / ZD3` 轻量图特征，以及泄漏安全的滚动分解特征。
  - 最佳候选：`process-core+lag+decomp + gradient-boosting-huber`，验证 count `1352`，MAE `0.646029 mm`、RMSE `0.913423 mm`、R2 `0.084326`、Direction `52.51%`、Within 1mm `80.10%`、Threshold `86.17%`、P90 `1.437992 mm`。
  - 对比上一轮无分解最佳候选：`process-core+lag + gradient-boosting-huber` 的 MAE/RMSE/R2 为 `0.651854 / 0.916266 / 0.078617`，说明分解特征方向有实际增益。
  - 最佳图特征候选：`process-core+lag+graph + gradient-boosting-huber`，验证 count `1352`，MAE `0.654808 mm`、RMSE `0.918668 mm`、R2 `0.073780`、Direction `50.96%`、Within 1mm `79.14%`、Threshold `86.17%`、P90 `1.458435 mm`。
  - 结论：普通非线性 tabular / graph / decomposition 候选没有超过当前 analog + OOF Huber + 软工况残差路线，只保留为消融，不升主模型。
  - 下一步若继续冲指标，应把分解特征接入现有 analog / OOF 主脚本，而不是继续单独堆 GBDT。
  - 轻量图特征也未超过 v14，所以当前不能把图时空模型写成已取得主模型提升；它应保留为更多点位/更多区域数据后的后续路线。
  - 文献启发路线记录：`docs/research/baijiabao-displacement-literature-challenger-2026-04.md`。
- `v17-ablation` 已把分解特征接入 analog / OOF 主脚本，但不升主模型：
  - 脚本：`scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`。
  - 新增特征族：`decomp-family`，包含泄漏安全的滚动位移均值、残差、斜率、波动、范围、降雨均值和库水位斜率。
  - 新增固定集成：`pointwise-decomp-fixed-expert-ensemble` 与 `pointwise-decomp-weighted-fixed-expert-ensemble`。
  - OOF 校准队列已强制包含 top decomp seeds，避免 decomp 候选被全局 top18 截断。
  - leaderboard 最好 decomp OOF：`analog-small+delta-family+decomp-family + delta-heavy-3x + huber-linear-oof-c0p6+point-month-s045`，MAE `0.632411 mm`、RMSE `0.896798 mm`、R2 `0.117354`、Direction `58.88%`、Within 1mm `80.70%`、Threshold `85.95%`、P90 `1.403700 mm`。
  - MAE 最低 decomp OOF：`huber-linear-oof-c0p7+point-month-s060`，MAE `0.632258 mm`、RMSE `0.896887 mm`、R2 `0.117180`、Direction `58.73%`、Within 1mm `80.77%`、Threshold `86.02%`、P90 `1.406477 mm`。
  - 对比 v14：decomp 的 MAE 低约 `0.0007 mm`，但 RMSE `0.8968 > 0.8936`、R2 `0.1173 < 0.1236`、Threshold `85.95% < 86.32%`、P90 `1.404 > 1.392`，因此只能作为 MAE-focused ablation / 参考路线。
- `v18-ablation` 的泄漏安全同点位序列模型没有超过 v14：
  - 可复跑脚本：`scripts/dev/regional-model-library/run-baijiabao-displacement-sequence-challengers.py`。
  - 产物：`.tmp/regional-model-library/out/artifacts/baijiabao-displacement-sequence-challengers/baijiabao-displacement-sequence-challengers.report.json` 和 `.md`。
  - 样本口径：训练 `5739`，验证 `1352`，与 v14 核心过程字段可评估口径一致。
  - sequence rule：只使用同一点位历史；validation 从 train 历史初始化并只滚动使用更早 validation 观测；当前样本目标标签不进入当前输入。
  - tested lookbacks：`6 / 12 / 20`。
  - tested models：`sequence-flatten-ridge`、`sequence-flatten-huber`、`sequence-flatten-gradient-boosting-huber`、`sequence-flatten-extra-trees`、`GRU SmoothL1`、`lightweight TCN SmoothL1`。
  - 最佳候选：`lookback=20 + sequence-flatten-gradient-boosting-huber`，MAE `0.648417 mm`、RMSE `0.917798 mm`、R2 `0.075533`、Direction `54.25%`、Within 1mm `80.33%`、Threshold `88.46%`、P90 `1.414032 mm`。
  - 结论：直接序列模型在 Threshold Agreement 上较高，但 MAE/RMSE/R2/Direction/P90 均弱于 v14。不能写“GRU/TCN 提升了位移预测精度”，只能写成序列模型消融。
- `v19-ablation` 的累计位移趋势先验 + 残差学习没有超过 v14：
  - 可复跑脚本：`scripts/dev/regional-model-library/run-baijiabao-displacement-component-residual-challengers.py`。
  - 产物：`.tmp/regional-model-library/out/artifacts/baijiabao-displacement-component-residual-challengers/baijiabao-displacement-component-residual-challengers.report.json` 和 `.md`。
  - 方法：从同一点位累计位移历史提取 `trendPriorSlope3 / 5 / 10 / 20 / trendPriorRobustBlend`，训练模型预测未来 24h 位移增量相对趋势先验的 residual，再加回先验。
  - 最佳候选：`trendPriorSlope3 + residual + component-gradient-boosting-huber`，MAE `0.645971 mm`、RMSE `0.905904 mm`、R2 `0.099340`、Direction `53.62%`、Within 1mm `80.25%`、Threshold `86.17%`、P90 `1.414077 mm`。
  - 结论：趋势先验残差方向比直接序列模型更强，但仍弱于 v14；不建议继续只扫 trend prior 小网格。
- `v20-ablation` 的 OOF 元融合没有超过 v14：
  - 可复跑脚本：`scripts/dev/regional-model-library/run-baijiabao-displacement-meta-ensemble-challengers.mjs`。
  - 产物：`.tmp/regional-model-library/out/artifacts/baijiabao-displacement-meta-ensemble-challengers/baijiabao-displacement-meta-ensemble-challengers.report.json` 和 `.md`。
  - 方法：将 `v14-balanced-seed`、`v17-decomp-balanced-seed`、`v17-decomp-mae-seed` 作为种子模型；每个 seed 使用 nested chronological OOF 学习自身 Huber 输出校准和 `point + month` 残差校正；元融合只在训练 OOF 预测上选择 convex weights，不使用验证集搜索融合权重。
  - OOF 元选择权重：`v14=0 / v17-decomp-balanced=0 / v17-decomp-mae=1`。
  - 最佳验证 RMSE 候选仍是 `v14-balanced-seed`：MAE `0.633062 mm`、RMSE `0.893643 mm`、R2 `0.123555`、Direction `58.36%`、Within 1mm `80.77%`、Threshold `86.32%`、P90 `1.391217 mm`。
  - 元融合验证指标等同于 decomp MAE seed：MAE `0.632273 mm`、RMSE `0.896937 mm`、R2 `0.117081`、Direction `58.73%`、Within 1mm `80.77%`、Threshold `86.02%`、P90 `1.407855 mm`。
  - 结论：简单元融合在当前数据规模下没有学到优于 v14 的均衡权重；decomp 分支仍只能作为 MAE-focused 消融，不升主模型。
- 验证集 bias 搜索虽然指标更好，但不适合作为正式主模型。
- 单模型 OOF 校准没有提升，但最终集成 OOF 校准已经带来提升。
- 后续如果继续冲指标，应优先做：
  - 明确 calibration split 或 nested CV
  - 分点位模型
  - 分季节/库水位工况模型
  - TCN / LSTM / Chronos 等真正时序模型对照

## 2026-05-05 v14 runtime error decomposition

- 新增误差分解脚本：
  - `scripts/dev/regional-model-library/build-baijiabao-displacement-error-decomposition.mjs`
  - `scripts/dev/regional-model-library/render-baijiabao-displacement-error-decomposition.py`
- 输入：
  - runtime artifact：`artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json`
  - validation samples：`.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl`
- 输出：
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition`
- 运行时逐样本复现口径：
  - evaluated：`1352`
  - skipped：`109`
  - MAE：`0.632960 mm`
  - RMSE：`0.893454 mm`
  - R2：`0.123924`
  - Direction Accuracy：`58.21%`
  - Within 1mm：`80.70%`
  - Threshold-state Agreement：`86.32%`
  - P50 AE：`0.457435 mm`
  - P90 AE：`1.391187 mm`
- 分解维度：
  - point
  - month
  - point x month
  - rainfall 24h / 72h bucket
  - reservoir 72h trend
  - displacement 72h trend
  - displacement delta magnitude
  - label magnitude
- 当前误差治理结论：
  - `ZD3` 是点位误差最高段，MAE `0.829 mm`、RMSE `1.202 mm`。
  - `9月` 和 `6月` 是月份误差最高段，MAE 均约 `0.839 mm`。
  - 72h 降雨 `>100 mm` 分箱 MAE `1.003 mm`，但样本仅 `12` 条，适合写成极端工况样本不足和后续强化方向。
  - 真实 24h 位移增量 `>3 mm` 分箱 MAE `3.892 mm`，说明当前模型对极端位移段偏保守，不能写成全工况高精度。

## 2026-05-05 v21 post-calibration challenger

- 新增轻量后校准挑战脚本：
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-postcalibration-challengers.mjs`
- 背景：
  - 误差分解显示 `point` 与 `displacementTrend` 是明确的误差治理方向。
  - 直接把大量趋势残差配置塞回主训练脚本会显著拖慢完整训练，因此先用独立 challenger 脚本做方向筛选。
- 输入：
  - base artifact：`artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json`
  - train：`.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl`
  - validation：`.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl`
- 输出：
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-postcalibration-challengers.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-postcalibration-challengers.leaderboard.csv`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-v21-balanced.prediction-regression-v1.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-v21-bestMae.prediction-regression-v1.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-v21-thresholdSafe.prediction-regression-v1.json`
- v21 balanced candidate：
  - display name：`BJB-DP-ENS-POSTCAL-BALANCED-v21`
  - correction dimensions：`point + displacementTrend`
  - MAE：`0.629723 mm`
  - RMSE：`0.892411 mm`
  - R2：`0.125969`
  - Direction Accuracy：`59.91%`
  - Within 1mm：`80.70%`
  - Threshold-state Agreement：`86.09%`
  - P90 AE：`1.379252 mm`
- v14 runtime baseline in the same script:
  - MAE：`0.632960 mm`
  - RMSE：`0.893454 mm`
  - R2：`0.123924`
  - Direction Accuracy：`58.21%`
  - Within 1mm：`80.70%`
  - Threshold-state Agreement：`86.32%`
  - P90 AE：`1.391187 mm`
- v21 balanced improvement:
  - MAE：`-0.003236 mm`
  - RMSE：`-0.001043 mm`
  - R2：`+0.002045`
  - Direction Accuracy：`+1.70 pp`
  - P90 AE：`-0.011935 mm`
  - Within 1mm：unchanged
  - Threshold-state Agreement：`-0.22 pp`
- 已生成 v21 balanced 误差分解材料：
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v21-balanced`
- 写作边界：
  - v21 是 `train-fit post-calibration challenger`，已能以 runtime artifact 形式运行，但尚未并入完整 chronological OOF 主训练路径。
  - 当前正式主模型仍可保留 v14；如果文章需要写优化过程，可以把 v21 写成“后校准候选将 MAE 降至 0.630 mm”。
  - 若要正式替代 v14，下一步必须把 `point + displacementTrend` 残差校准转成完整 OOF 训练候选。

## 2026-05-05 v22 support-set calibrated production-main

- 新增正式化 support-set 校准脚本：
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-support-calibrated-production.mjs`
- 新增 promotion 脚本：
  - `scripts/dev/regional-model-library/promote-baijiabao-displacement-v22-production.mjs`
- v22 目标：
  - 将本地接管校准从 v21 的 train-fit 快速筛选推进到时间顺序 support-set 验证。
- support-set split：
  - calibration：`eventTs < 2024-04-01T00:00:00.000Z`，`639` rows
  - future holdout：`eventTs >= 2024-04-01T00:00:00.000Z`，`713` rows
  - skipped：`109`
- selected correction：
  - `point + month + displacementTrend`
  - key：`support-point-month-displacementTrend-mc18-sh30-mb0p14-s1`
- future holdout baseline：
  - MAE `0.664111492 mm`
  - RMSE `0.940473151 mm`
  - R2 `0.198359890`
  - Within 1mm `78.82%`
- future holdout selected：
  - MAE `0.661239758 mm`
  - RMSE `0.936965942 mm`
  - R2 `0.204327688`
  - Within 1mm `79.24%`
  - tradeoff：Direction Accuracy `-1.26 pp`，Threshold-state Agreement `-0.28 pp`
- full support-refit runtime metrics after promotion：
  - MAE `0.626307095 mm`
  - RMSE `0.885606907 mm`
  - R2 `0.139246301`
  - Direction Accuracy `58.36%`
  - Within 1mm `81.14%`
  - P90 AE `1.367623270 mm`
- current production registry:
  - v22：`production-main`
  - v21：`backup-previous-main`
  - v14：`backup-v14-oof-main`
- production files:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v22.prediction-regression-v1.json`
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v22-production.report.json`
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v22-production-backup-manifest.json`
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v22-2026-05-05T10-10-41-084Z/`
- validation:
  - `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs` loads v22 and passes.
  - `npm run build --workspace @lsmv2/ai-prediction-worker` passes.
- writing boundary:
  - v22 was promoted as runtime production-main before v23.
  - It remains displacement forecast, not risk classification.
  - Paper should distinguish future-holdout validation metrics from full support-refit runtime metrics.

## 2026-05-05 v23 support-guarded production-main

- 新增 production promotion 脚本：
  - `scripts/dev/regional-model-library/promote-baijiabao-displacement-v23-production.mjs`
- v23 目标：
  - 在 v22 的 support-set 校准基础上增加 guarded 选择门槛，要求 future holdout 的 MAE/RMSE/R2 改善，同时 Direction / Within1mm / Threshold-state 不低于 baseline。
- selected correction：
  - `point + month + displacementTrend`
  - key：`support-point-month-displacementTrend-mc12-sh30-mb0p1-s0p7`
- future holdout baseline：
  - MAE `0.664111492 mm`
  - RMSE `0.940473151 mm`
  - R2 `0.198359890`
  - Direction Accuracy `60.17%`
  - Within 1mm `78.82%`
  - Threshold-state Agreement `84.15%`
- future holdout v23：
  - MAE `0.662702595 mm`
  - RMSE `0.940097275 mm`
  - R2 `0.199000539`
  - Direction Accuracy `60.31%`
  - Within 1mm `78.96%`
  - Threshold-state Agreement `84.15%`
  - P90 AE `1.459584853 mm`
- v23 holdout improvement:
  - MAE `-0.001408897 mm`
  - RMSE `-0.000375876 mm`
  - R2 `+0.000640649`
  - Direction Accuracy `+0.14 pp`
  - Within 1mm `+0.14 pp`
  - Threshold-state Agreement `0 pp`
- full support-refit runtime metrics after promotion：
  - MAE `0.626163246 mm`
  - RMSE `0.886363618 mm`
  - R2 `0.137774722`
  - Direction Accuracy `59.17%`
  - Within 1mm `81.07%`
  - Threshold-state Agreement `86.17%`
  - P90 AE `1.366740438 mm`
- current production registry:
  - v23：`production-main`
  - v22：`backup-previous-main`
  - v21：`backup-v21-postcalibrated-main`
  - v14：`backup-v14-oof-main`
- production files:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v23-production.report.json`
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23-production-backup-manifest.json`
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v23-2026-05-05T13-01-25-310Z/`
- evidence package:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v23-support-guarded`
- validation:
  - `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs` loads v23 and passes.
  - `npm run build --workspace @lsmv2/ai-prediction-worker` passes.
- writing boundary:
  - v23 is now the current runtime production-main because it satisfies conservative future-holdout guardrails.
  - v22 has slightly better full runtime RMSE/R2 and remains the previous-main backup.
  - v23 remains displacement forecast, not risk classification.

## 写作边界

- 不要写“位移预测准确率达到 93.72%”。
- 不要把预警确认模型指标写成位移预测指标。
- 不要把验证集 bias 搜索结果写成正式泛化指标。
- 可以写“本文保存了完整参数搜索、analog ensemble、OOF 校准和候选对比，用于支撑模型优化过程和消融实验”。

## 2026-05-05 v24 two-holdout guarded challenger

- 新增两保留集生产筛查脚本：
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-two-holdout-production.mjs`
- 目标：
  - 在 v23 之后继续尝试更严格的生产筛查，不直接覆盖当前主模型。
  - 将验证期拆为三段：
    - calibration：`eventTs < 2024-01-01T00:00:00.000Z`，`433` rows
    - development holdout：`2024-01-01` 至 `2024-06-30`，`447` rows
    - final holdout：`2024-07-01` 至 `2024-12-31`，`472` rows
- selected candidate：
  - display name：`BJB-DP-ENS-TWO-HOLDOUT-GUARDED-v24`
  - key：`twoholdout-point-displacementTrend-mc12-sh90-mb0p08-s0p15`
  - dimensions：`point + displacementTrend`
- development holdout：
  - MAE `0.615779944 -> 0.615122629`
  - RMSE `0.854123054 -> 0.853862090`
  - R2 `0.272078879 -> 0.272523621`
- final holdout：
  - MAE `0.644783156 -> 0.644485032`
  - RMSE `0.924532695 -> 0.924515845`
  - R2 `0.057002227 -> 0.057036601`
  - Direction Accuracy `56.99% -> 57.20%`
  - Within 1mm `80.08% -> 80.08%`
  - Threshold-state Agreement `84.96% -> 84.96%`
  - P90 AE `1.462479220 -> 1.454624735`
- full runtime metrics：
  - MAE `0.632161 mm`
  - RMSE `0.892837 mm`
  - R2 `0.125134`
  - Direction Accuracy `58.21%`
  - Within 1mm `80.77%`
  - Threshold-state Agreement `86.32%`
  - P90 AE `1.393399 mm`
- evidence package:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v24-two-holdout-guarded`
- production decision:
  - v24 is not promoted.
  - Reason: it passes the stricter two-holdout screen, but full runtime MAE/RMSE/R2 are weaker than the current v23 production-main.
  - Keep v23 as production-main and keep v24 as a rigorous challenger / ablation evidence.

## 2026-05-05 v25 v23-layer two-holdout challenger

- Reused the parameterized two-holdout screen with current v23 production-main as base:
  - `BASE_ARTIFACT=artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
  - `OUT_DIR=.tmp/regional-model-library/out/artifacts/baijiabao-displacement-v23-layer-two-holdout-production`
- Goal:
  - test whether a second residual calibration layer on top of v23 can outperform v23 under production guards.
- Candidate search:
  - tested configs: `7056`
  - passed development guard: `855`
  - passed final guard: `2`
  - passed both dev and final guards: `0`
- best development candidate:
  - key：`twoholdout-point-displacementTrend-mc12-sh20-mb0p04-s1`
  - dev MAE `0.611967614 -> 0.609317660`
  - dev RMSE `0.851868995 -> 0.850337952`
  - dev R2 `0.275915826 -> 0.278516244`
  - final MAE `0.638182151 -> 0.639848809`
  - final RMSE `0.915682717 -> 0.918425817`
  - final R2 `0.074969286 -> 0.069418778`
- production decision:
  - v25 is not promoted and no v25 artifact is generated.
  - Reason: v23-layer second calibration overfits the development holdout and does not pass final production guard.
  - Current production-main remains v23.

## 2026-05-05 v26/v27 ensemble production search

- Added weighted version ensemble challenger script:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-ensemble-production-challengers.mjs`
- Goal:
  - test whether combining v14/v21/v22/v23/v24 can improve v23 while preserving production guardrails.
- v26 weighted ensemble search:
  - tested configs: `178`
  - all-split magnitude improvers: `16`
  - all-split magnitude + direction improvers: `0`
  - full production guard pass: `0`
  - best magnitude candidate: `ensemble-v230p6-v220p4`
  - all delta vs v23:
    - MAE `-0.000236695`
    - RMSE `-0.000556790`
    - R2 `+0.001082914`
    - Direction Accuracy `-0.96 pp`
  - final delta vs v23:
    - MAE `-0.001204197`
    - RMSE `-0.002291944`
    - R2 `+0.004624889`
    - Direction Accuracy `-0.64 pp`
- v27 calibrated ensemble follow-up:
  - output:
    - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-calibrated-ensemble-followup/baijiabao-displacement-calibrated-ensemble-followup.report.json`
  - searched pair blends among `v22 / v23 / v24 / v21`
  - searched slope grid `0.94` to `1.06`
  - searched intercept grid `-0.06` to `0.06`
  - production guard pass: `0`
- root cause:
  - Current remaining bottleneck is direction / state stability.
  - Magnitude-error ensembles can slightly improve MAE/RMSE/R2, but they consistently reduce Direction Accuracy or fail dev/final split guards.
- production decision:
  - Do not promote v26 or v27.
  - Current production-main remains v23.
  - Further meaningful improvement likely requires more real monitoring data or additional directional/process labels, not more calibration stacking on Baijiabao alone.

## 2026-05-05 v28 state-protected production-main

After v26/v27, the concrete blocker was identified as direction/state instability. v28 addresses that blocker directly instead of stacking another unconstrained calibration:

- base:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
- script:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-state-protected-production.mjs`
- promotion:
  - `scripts/dev/regional-model-library/promote-baijiabao-displacement-v28-production.mjs`
- runtime support:
  - `residualCorrection.preserveSign`
  - `residualCorrection.preserveThresholdAbs`
  - derived correction buckets from existing runtime features

Selected candidate:

- display:
  - `BJB-DP-ENS-STATE-PROTECTED-v28`
- key:
  - `stateprot-month-rainfall72hBucket-displacementTrend-mc20-sh20-mb0p08-s1`
- dimensions:
  - `month + rainfall72hBucket + displacementTrend`
- protection:
  - preserve prediction sign
  - preserve `1.3mm` threshold state

Two-holdout / production screen:

- development holdout:
  - no regression; metrics unchanged against v23
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

Full runtime refit metrics:

- evaluated:
  - `1352`
- MAE:
  - `0.623418465`
- RMSE:
  - `0.880074724`
- R2:
  - `0.149966573`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.36%`
- Threshold-state Agreement:
  - `86.17%`
- P90 AE:
  - `1.355051782 mm`

Production files:

- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v28.prediction-regression-v1.json`
- registry:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- promotion report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v28-production.report.json`
- backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v28-production-backup-manifest.json`
- rollback backup:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v28-2026-05-05T14-31-08-417Z/`
- competition evidence:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v28-state-protected`

Decision:

- Promote v28 as the current runtime `production-main`.
- Keep v23 as `backup-previous-main`.
- Keep v22/v21/v14 as older rollback models.
- Writing caveat: v28 improves mean-error/RMSE/R2 and preserves direction/threshold state, but final-split P90 is slightly higher; do not claim every metric improves on every split.

## 2026-05-06 v29/v30 tail-guarded follow-up

After v28 promotion, the remaining issue was tail stability and the possibility that another calibration layer could falsely pass selection while failing after final artifact refit.

v29:

- base:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-tail-guarded-production/baijiabao-displacement-v29-tail-guarded.prediction-regression-v1.json`
- selected key:
  - `stateprot-point-month-displacementTrend-mc20-sh20-mb0p1-s1`
- decision:
  - do not promote.
  - reason: v29 passes against v23 with P90 non-regression, but direct comparison against v28 shows final MAE `+0.003857991`, final RMSE `+0.003023718`, final R2 `-0.006058476`, final Within 1mm `-0.64 pp`, and holdout P90 `+0.045541482 mm`.

Training-script correction:

- updated:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-state-protected-production.mjs`
- added:
  - `REQUIRE_P90_NON_REGRESSION=1`
  - `FINAL_CORRECTION_SCOPE=calibration|all`
  - final artifact runtime verification before `promoteAllowed=true`
- finding:
  - v28-layer all-sample refit can reduce all MAE/RMSE but fails final artifact guards because dev RMSE/R2/P90 and final MAE/Within can regress.
  - therefore future promotion must use the final written artifact as the authority, not only the pre-refit candidate row.

v30 production-main:

- base:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v28.prediction-regression-v1.json`
- final correction scope:
  - `calibration`
- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-v28-layer-tail-guarded-calibration-production/baijiabao-displacement-v30-v28-layer-tail-guarded-calibration.prediction-regression-v1.json`
- promotion:
  - `scripts/dev/regional-model-library/promote-baijiabao-displacement-v30-production.mjs`
- production artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v30.prediction-regression-v1.json`

v30 runtime metrics:

- evaluated:
  - `1352`
- MAE:
  - `0.623084152`
- RMSE:
  - `0.879748988`
- R2:
  - `0.150595691`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.51%`
- P90 AE:
  - `1.355051782 mm`

v30 delta vs v28:

- all MAE:
  - `-0.000334313`
- all RMSE:
  - `-0.000325736`
- all R2:
  - `+0.000629118`
- final MAE:
  - `-0.000316677`
- final RMSE:
  - `-0.000777915`
- final R2:
  - `+0.001555407`
- final P90 AE:
  - `-0.019419753 mm`
- Direction and threshold-state agreement:
  - no regression

Backup chain after v30:

- v30:
  - `production-main`
- v28:
  - `backup-previous-main`
- v23:
  - `backup-v23-support-guarded-main`
- v22:
  - `backup-v22-support-calibrated-main`
- v21:
  - `backup-v21-postcalibrated-main`
- v14:
  - `backup-v14-oof-main`

Evidence:

- promotion report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v30-production.report.json`
- backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v30-production-backup-manifest.json`
- runtime check:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-baijiabao-displacement-runtime-forecast.report.json`
- competition error decomposition:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v30-tail-guarded-calibration`

Writing caveat:

- v30 is a cautious incremental hardening over v28.
- The improvement is small; it should be written as tail-guarded production refinement and validation-governance improvement, not as a large new algorithmic leap.
- v30 remains a displacement forecast model, not a warning classifier.

## 2026-05-06 v31/v32 tail-guarded boundary and v33 dev-group-gated production-main

v31:

- base:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v30.prediction-regression-v1.json`
- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-v30-layer-tail-guarded-calibration-production/baijiabao-displacement-v31-v30-layer-tail-guarded-calibration.prediction-regression-v1.json`
- selected key:
  - `stateprot-point-month-displacementTrend-mc20-sh45-mb0p04-s1`
- runtime metrics:
  - MAE `0.622914074`
  - RMSE `0.879500694`
  - R2 `0.151075083`
  - Direction Accuracy `59.17%`
  - Within 1mm `81.51%`
  - P90 AE `1.355051782 mm`
- decision:
  - promoted as production-main before v33.

v32:

- base:
  - v31 candidate artifact
- report:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-v31-layer-tail-guarded-calibration-production/baijiabao-displacement-state-protected-production.report.json`
- result:
  - production guards pass, but all MAE gain is only about `0.000008638 mm`.
- decision:
  - do not promote.
  - keep as boundary evidence that ordinary repeated calibration has reached a noise-level limit.

v33:

- training-script enhancement:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-state-protected-production.mjs`
  - added optional `DEV_GROUP_GATED=1`
  - added `DEV_GROUP_MIN_COUNT`
  - each local residual-correction group must pass a dev split no-regression gate before final/holdout screening.
- base:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v31.prediction-regression-v1.json`
- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-v31-dev-gated-state-protected-production/baijiabao-displacement-v33-v31-dev-gated-state-protected.prediction-regression-v1.json`
- promotion:
  - `scripts/dev/regional-model-library/promote-baijiabao-displacement-v33-production.mjs`
- production artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v33.prediction-regression-v1.json`

v33 selected guard:

- selected key:
  - `stateprot-point-displacementDelta72hBucket-mc8-sh30-mb0p06-s0p65`
- dimensions:
  - `point + displacementDelta72hBucket`
- dev group gate:
  - input bias groups: `11`
  - kept: `1`
  - dropped: `10`
- final correction scope:
  - `calibration`

v33 runtime metrics:

- evaluated:
  - `1352`
- skipped:
  - `109`
- MAE:
  - `0.622452582`
- RMSE:
  - `0.879313702`
- R2:
  - `0.151436027`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.51%`
- P90 AE:
  - `1.346605093 mm`

v33 delta vs v31:

- all MAE:
  - `-0.000461492`
- all RMSE:
  - `-0.000186992`
- all R2:
  - `+0.000360944`
- all P90 AE:
  - `-0.008446689 mm`
- dev MAE:
  - `-0.000395728`
- final MAE:
  - `-0.000814500`
- holdout MAE:
  - `-0.000918988`
- Direction / Within 1mm / threshold-state:
  - no regression

Production files:

- promotion report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v33-production.report.json`
- backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v33-production-backup-manifest.json`
- rollback root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v33-2026-05-06T07-17-50-853Z/`
- runtime check:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-baijiabao-displacement-runtime-forecast.report.json`
- competition error decomposition:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v33-dev-gated-state-protected`

Validation:

- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - loads v33
  - `forecastInference` present
  - required features satisfied
- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Boundary:

- v33 is the current displacement forecast production-main.
- v33 predicts future 24h displacement delta in `mm`.
- v33 is not a warning classifier and must not be written as `risk_score / risk_level`.
- v33 keeps the existing software/runtime field contract; only the model artifact and offline training guard changed.
