# 白家堡位移预测元融合挑战记录（2026-04）

## 结论

当前 `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` 仍然是主推位移预测模型。本轮新增的 v20 元融合挑战没有带来可升主模型的稳定提升。

最佳验证集候选仍是 v14 复跑种子：

- candidate: `v14-balanced-seed`
- validation count: `1352`
- MAE: `0.633062 mm`
- RMSE: `0.893643 mm`
- R2: `0.123555`
- Direction Accuracy: `58.36%`
- Within 1mm: `80.77%`
- Threshold Agreement: `86.32%`
- P90 AE: `1.391217 mm`

OOF 元融合候选：

- candidate: `v20-oof-convex-meta-ensemble`
- OOF-selected weights:
  - `v14-balanced-seed`: `0`
  - `v17-decomp-balanced-seed`: `0`
  - `v17-decomp-mae-seed`: `1`
- validation count: `1352`
- MAE: `0.632273 mm`
- RMSE: `0.896937 mm`
- R2: `0.117081`
- Direction Accuracy: `58.73%`
- Within 1mm: `80.77%`
- Threshold Agreement: `86.02%`
- P90 AE: `1.407855 mm`

对比当前主模型 v14：

- v14 latest MAE: `0.633075 mm`
- v14 latest RMSE: `0.893631 mm`
- v14 latest R2: `0.123579`
- v14 latest P90 AE: `1.392424 mm`

结论是：decomp 分支在 MAE 上略低，但 RMSE、R2、Threshold Agreement 和 P90 均弱于 v14。OOF 元选择没有学到一个真正优于 v14 的融合权重，而是退化为选择 decomp MAE seed。因此 v20 只作为 `meta-ensemble-ablation` 保留，不升主模型。

## 本轮脚本

可复跑脚本：

- `scripts/dev/regional-model-library/run-baijiabao-displacement-meta-ensemble-challengers.mjs`

产物：

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-meta-ensemble-challengers/baijiabao-displacement-meta-ensemble-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-meta-ensemble-challengers/baijiabao-displacement-meta-ensemble-challengers.report.md`

## 方法

本轮专门验证一个问题：`v14` 主模型、`v17` decomp balanced seed 和 `v17` decomp MAE seed 是否能通过泄漏安全元融合形成更好的综合模型。

脚本执行方式：

- 只读现有白家堡 `train / validation future-labels window-features jsonl`。
- 保持字段兼容：
  - target: `labels.displacementLabel`
  - base features: `metricsNormalized`
  - point identity: `rawRef.originalFields.point_id`
- 重新构造泄漏安全分解特征：
  - train 只使用同一点位更早 train 历史和当前可观测累计位移状态。
  - validation 从 train 历史初始化，只滚动使用更早 validation 观测和当前可观测状态。
- 对每个 seed 使用 nested chronological OOF：
  - 外层 OOF 生成元学习训练预测。
  - 内层 OOF 学习 seed 自身的 Huber 输出校准和 `point + month` 残差校正。
- 元融合只允许 convex weights，并在训练 OOF 预测上选择，不使用验证集搜索融合权重。

## 已尝试候选

| Rank | Candidate | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `v14-balanced-seed` | `0.633062` | `0.893643` | `0.123555` | `58.36%` | `80.77%` | `86.32%` | `1.391217` |
| 2 | `v17-decomp-balanced-seed` | `0.632386` | `0.896829` | `0.117295` | `59.02%` | `80.77%` | `85.95%` | `1.402604` |
| 3 | `v20-oof-convex-meta-ensemble` | `0.632273` | `0.896937` | `0.117081` | `58.73%` | `80.77%` | `86.02%` | `1.407855` |
| 4 | `v17-decomp-mae-seed` | `0.632273` | `0.896937` | `0.117081` | `58.73%` | `80.77%` | `86.02%` | `1.407855` |

## 写作边界

可以写：

> 本文进一步测试了 OOF 约束下的元融合机制，将 v14 主模型、分解特征均衡候选和分解特征 MAE 候选作为种子模型。训练集 OOF 元选择最终退化为分解特征 MAE 候选，验证集 MAE 略低但 RMSE、R2 和 P90 误差均弱于 v14，说明在当前白家堡单区域数据规模下，简单元融合不能替代 analog + OOF 细化软工况残差校正主模型。

不要写：

- 不要写“v20 元融合超过主模型”。
- 不要把 `0.632273 mm` 单独写成最终主指标。
- 不要把 v20 接入在线 worker，除非后续在 RMSE/R2/P90 等均衡指标上超过 v14。

## 下一步

- 当前不建议继续对 v14/decomp 做简单凸融合。
- 若继续优化位移预测，优先补更多三峡监测数据，再做跨滑坡体区域专家迁移或图时序模型。
- 在单一白家堡数据上，下一步更适合做论文材料整理、模型注册和系统字段映射验证，而不是继续堆复杂模型。
