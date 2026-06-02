# 白家堡位移预测趋势先验残差挑战记录（2026-04）

## 结论

当前 `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` 仍然是主推位移预测模型。本轮新增的“累计位移趋势先验 + 残差学习”候选比直接序列模型更强，但仍未超过 v14。

最佳趋势先验残差候选：

- prior: `trendPriorSlope3`
- target mode: `residual`
- model: `component-gradient-boosting-huber`
- validation count: `1352`
- MAE: `0.645971 mm`
- RMSE: `0.905904 mm`
- R2: `0.099340`
- Direction Accuracy: `53.62%`
- Within 1mm: `80.25%`
- Threshold Agreement: `86.17%`
- P90 AE: `1.414077 mm`

对比 v14：

- v14 MAE: `0.633075 mm`
- v14 RMSE: `0.893631 mm`
- v14 R2: `0.123579`
- v14 Direction Accuracy: `58.28%`
- v14 Within 1mm: `80.77%`
- v14 Threshold Agreement: `86.32%`
- v14 P90 AE: `1.392424 mm`

因此，趋势先验残差方向有效，但当前不升主模型。它应写成 `v19-component-residual-ablation`。

## 本轮脚本

可复跑脚本：

- `scripts/dev/regional-model-library/run-baijiabao-displacement-component-residual-challengers.py`

产物：

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-component-residual-challengers/baijiabao-displacement-component-residual-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-component-residual-challengers/baijiabao-displacement-component-residual-challengers.report.md`

## 方法

本轮不是直接把历史窗口喂给深度模型，而是更接近分解论文中的思想：

- 从同一点位累计位移历史中提取趋势先验：
  - `trendPriorSlope3`
  - `trendPriorSlope5`
  - `trendPriorSlope10`
  - `trendPriorSlope20`
  - `trendPriorRobustBlend`
- 将未来 `24h` 位移增量拆成：
  - trend prior
  - residual target
- 用模型学习 residual，再加回 trend prior 得到最终预测。

防泄漏规则：

- train 样本只使用同一点位更早 train 历史和当前可观测累计位移状态。
- validation 样本从 train 历史初始化，只滚动使用更早 validation 观测和当前可观测状态。
- 当前样本目标标签不进入输入。

## 已尝试候选

| Rank | Prior | Model | Mode | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `trendPriorSlope3` | `component-gradient-boosting-huber` | `residual` | `0.646` | `0.906` | `0.0993` | `53.62%` | `80.25%` | `86.17%` | `1.414` |
| 2 | `trendPriorRobustBlend` | `component-gradient-boosting-huber` | `residual` | `0.651` | `0.913` | `0.0846` | `53.31%` | `80.18%` | `85.87%` | `1.404` |
| 3 | `trendPriorRobustBlend` | `component-extra-trees` | `residual` | `0.647` | `0.915` | `0.0811` | `53.54%` | `80.62%` | `86.24%` | `1.427` |
| 4 | `trendPriorSlope5` | `component-gradient-boosting-huber` | `residual` | `0.657` | `0.918` | `0.0750` | `54.88%` | `79.81%` | `85.80%` | `1.435` |
| 5 | `trendPriorRobustBlend` | `component-hist-gradient-boosting` | `residual` | `0.650` | `0.918` | `0.0746` | `56.38%` | `80.47%` | `85.95%` | `1.444` |

## 解释

这条路线比直接 GRU / TCN 更合理，因为它把累计位移序列中的趋势部分显式提取出来，再让模型只学习残差。但当前白家堡数据下，短窗口趋势先验本身噪声仍然较大，残差模型没有超过 v14 的相似历史检索 + OOF 校准专家集成。

当前可以写：

> 在进一步的消融实验中，项目测试了累计位移趋势先验与残差学习机制。最佳趋势残差候选的 RMSE 为 0.906 mm，优于直接序列模型，但仍弱于主模型 0.894 mm，说明单点位短窗口趋势分解在当前数据规模下尚不足以替代 analog + OOF 专家集成。

不要写：

- 不要写“趋势分解模型超过主模型”。
- 不要把本轮 `0.646 / 0.906 / 0.0993` 写成最终位移预测主指标。
- 不要把该脚本接入在线 worker，除非后续真正超过 v14 并完成模型注册。

## 下一步

- 不建议继续只在 trend prior 上小网格搜索。
- 如果继续做研究优化，应将累计位移先分解为更稳定的趋势/周期/残差序列，再训练 TCN/GRU。
- 更有价值的是等黄土坡/更多三峡监测数据补齐后做跨滑坡体区域专家迁移，而不是在单一白家堡数据上继续堆复杂模型。
