# 白家堡位移预测序列模型挑战记录（2026-04）

## 结论

当前 `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` 仍然是主推位移预测模型。本轮新增的同点位历史序列挑战模型没有超过 v14。

最佳序列候选：

- feature set: `leakage-safe-point-sequence-lookback-20`
- model: `sequence-flatten-gradient-boosting-huber`
- validation count: `1352`
- MAE: `0.648417 mm`
- RMSE: `0.917798 mm`
- R2: `0.075533`
- Direction Accuracy: `54.25%`
- Within 1mm: `80.33%`
- Threshold Agreement: `88.46%`
- P90 AE: `1.414032 mm`

对比 v14：

- v14 MAE: `0.633075 mm`
- v14 RMSE: `0.893631 mm`
- v14 R2: `0.123579`
- v14 Direction Accuracy: `58.28%`
- v14 Within 1mm: `80.77%`
- v14 Threshold Agreement: `86.32%`
- v14 P90 AE: `1.392424 mm`

因此，当前不能把 GRU / TCN / flatten sequence 写成超过主模型的路线。它们可以作为 `v18-sequence-ablation`，证明在白家堡三点位、小样本、短期位移增量任务上，直接把历史窗口塞进序列模型不如当前 analog + OOF Huber + 软工况残差专家集成。

## 本轮脚本

可复跑脚本：

- `scripts/dev/regional-model-library/run-baijiabao-displacement-sequence-challengers.py`

产物：

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-sequence-challengers/baijiabao-displacement-sequence-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-sequence-challengers/baijiabao-displacement-sequence-challengers.report.md`

## 样本构造

- 训练样本：`5739`
- 验证样本：`1352`
- target: `labels.displacementLabel`
- 预测目标：未来 `24h` 位移增量，单位 `mm`
- sequence rule:
  - 只使用同一点位历史行。
  - train 样本只使用同一点位更早 train 历史。
  - validation 样本从 train 历史初始化，然后只滚动使用更早 validation 观测。
  - 当前样本的目标标签不进入当前输入。
- lookback:
  - `6`
  - `12`
  - `20`

输入特征：

- 位移当前值与 6h/24h/72h 变化。
- 降雨当前值与 6h/24h/72h 累积。
- 库水位当前值与 6h/24h/72h 变化。
- 历史已知位移增量标签作为历史状态。
- 当前行标记。
- 点位 one-hot。
- 月份 sin/cos。
- 泄漏安全滚动上下文：
  - history count
  - 位移 rolling mean
  - residual to mean
  - slope
  - volatility
  - range
  - rainfall rolling mean
  - reservoir rolling slope

## 已尝试候选

| Rank | Feature set | Model | Lookback | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `leakage-safe-point-sequence-lookback-20` | `sequence-flatten-gradient-boosting-huber` | `20` | `0.648` | `0.918` | `0.0755` | `54.25%` | `80.33%` | `88.46%` | `1.414` |
| 2 | `leakage-safe-point-sequence-lookback-12` | `sequence-flatten-gradient-boosting-huber` | `12` | `0.647` | `0.918` | `0.0751` | `55.51%` | `80.33%` | `88.39%` | `1.413` |
| 3 | `leakage-safe-point-sequence-lookback-6` | `sequence-flatten-gradient-boosting-huber` | `6` | `0.648` | `0.919` | `0.0741` | `55.98%` | `80.25%` | `88.31%` | `1.431` |
| 4 | `leakage-safe-point-sequence-lookback-12` | `sequence-flatten-extra-trees` | `12` | `0.654` | `0.925` | `0.0615` | `52.60%` | `79.22%` | `88.68%` | `1.436` |
| 5 | `leakage-safe-point-sequence-lookback-6` | `gru-smoothl1-hidden-32` | `6` | `0.665` | `0.928` | `0.0546` | `55.67%` | `80.40%` | `88.24%` | `1.468` |
| 6 | `leakage-safe-point-sequence-lookback-20` | `gru-smoothl1-hidden-16` | `20` | `0.665` | `0.929` | `0.0524` | `57.17%` | `79.51%` | `88.17%` | `1.421` |

## 解释

本轮结果说明，序列模型不是“只要上深度学习就提升”。当前白家堡数据只有 `ZD1 / ZD2 / ZD3` 三个主要监测点，训练样本量也不大，短期位移增量标签噪声较高。直接训练 GRU / TCN 容易学到平滑或阈值偏好，Threshold Agreement 较高，但 MAE、RMSE、R2 和方向判断弱于 v14。

当前更合理的技术路线是：

- 保持 v14 作为主模型。
- 把本轮序列模型写成消融实验，说明直接序列深度模型未带来增益。
- 如果后续继续做深度时序，不应继续直接喂窗口，而应改为：
  - 累计位移序列建模。
  - 先分解趋势项/周期项/残差项。
  - 再做 `decomp + TCN/GRU` 或物理约束残差模型。
  - 等黄土坡、三峡更多滑坡体数据补齐后，再做跨滑坡体图时序模型。

## 写作边界

- 不要写“GRU/TCN 提升了位移预测精度”。
- 可以写“本文对 GRU、轻量 TCN 和 flatten sequence baseline 进行了对照，结果显示在当前小样本区域监测数据上，深度序列模型未超过 analog + OOF 校准专家集成主模型”。
- 可以写“序列模型在阈值状态一致性上有一定参考价值，但不作为主模型”。
