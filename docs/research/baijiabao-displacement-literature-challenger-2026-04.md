# 白家堡位移预测近期论文路线与挑战模型记录（2026-04）

## 结论

当前 `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` 仍然是主推位移预测模型。按近期论文启发补做的非线性树模型、Huber 线性、随机森林、ExtraTrees、MLP 小网络候选，没有超过 v14。

最佳新增挑战模型：

- feature set: `process-core+lag+decomp`
- model: `gradient-boosting-huber`
- validation count: `1352`
- MAE: `0.646029 mm`
- RMSE: `0.913423 mm`
- R2: `0.084326`
- Direction Accuracy: `52.51%`
- Within 1mm: `80.10%`
- Threshold Agreement: `86.17%`
- P90 AE: `1.437992 mm`

对比 v14：

- v14 MAE: `0.633075 mm`
- v14 RMSE: `0.893631 mm`
- v14 R2: `0.123579`
- v14 Within 1mm: `80.77%`
- v14 Threshold Agreement: `86.32%`

因此，不能为了“看起来更新”把普通 GBDT / RF / MLP 强行升为主模型。它们可以写进消融实验，证明直接套通用非线性模型不如当前 analog + OOF Huber + 软工况残差路线。

分解特征相对上一轮普通 tabular 最佳候选有实际改善：

- previous best: `process-core+lag + gradient-boosting-huber`
- previous MAE/RMSE/R2: `0.651854 / 0.916266 / 0.078617`
- decomposition best: `process-core+lag+decomp + gradient-boosting-huber`
- decomposition MAE/RMSE/R2: `0.646029 / 0.913423 / 0.084326`

这说明“分解 + 趋势/残差特征”方向有效，但只靠普通 GBDT 仍不足以超过 v14。该动作已在后续 `v17-ablation` 中接入 analog / OOF 主脚本验证，结果是 MAE 略优但 RMSE/R2/Threshold/P90 弱于 v14，因此当前保留为分解特征消融，不升主模型。

本轮继续补做了 `ZD1 / ZD2 / ZD3` 同时刻轻量图特征：

- graph features: 同一 `eventTs` 下其他点位的 peer mean、self-minus-peer-mean、peer spread、peer count
- train timestamp coverage: `1767 / 2056` 个训练时间戳同时包含 3 个点位
- validation timestamp coverage: `369 / 583` 个验证时间戳同时包含 3 个点位
- best graph-feature candidate: `process-core+lag+graph + gradient-boosting-huber`
- graph candidate MAE: `0.654808 mm`
- graph candidate RMSE: `0.918668 mm`
- graph candidate R2: `0.073780`
- graph candidate Within 1mm: `79.14%`

图特征方向也没有超过 v14。因此当前不能把“图时空模型”写成已经优于主模型，只能写成已验证的后续扩展路线。

## 查到的近期高水平路线

1. `Baijiabao multivariate LSTM`
   - 来源: https://www.mdpi.com/1660-4601/20/2/1167
   - 可复用点: 把位移历史、降雨、库水位作为多变量时序输入，强调外部环境因素对滑坡位移预测的重要性。
   - 对本项目的启发: 我们已经在 v6 之后引入降雨 24h/72h 累积与库水位 24h/72h 变化；下一步若做 LSTM/GRU/TCN，必须用连续序列样本，而不是把当前点位样本硬转成普通 tabular。

2. `LMD-ETS-TCN Baijiabao`
   - 来源: https://www.mdpi.com/2072-4292/15/1/229
   - 可复用点: 先对累计位移序列做分解，再分别建模趋势项和周期/随机项；TCN 负责时间依赖。
   - 对本项目的启发: 这条路线比直接套 TCN 更合理。我们的下一步高价值实验应该是 `cumulative displacement -> decomposition -> residual/periodic component -> TCN or analog`，而不是继续对 v14 做小参数扫。

3. `Three Gorges T-GCN / graph spatiotemporal model`
   - 来源: https://www.mdpi.com/2076-3417/15/8/4491
   - 可复用点: 把多个监测点作为图节点，用空间关系和时间序列联合预测变形。
   - 对本项目的启发: 白家堡有 `ZD1 / ZD2 / ZD3` 多点位，理论上可以做轻量图时序模型。但当前点位数量少，先做 `point graph features / inter-point deltas / graph residual ensemble` 比直接上复杂 GCN 更稳。

4. `Dynamic graph / spatiotemporal graph neural network route`
   - 来源: https://www.mdpi.com/1424-8220/25/15/4754
   - 可复用点: 近年趋势是用动态图表达监测点之间的关系变化，而不是固定单点回归。
   - 对本项目的启发: 等三峡/黄土坡/更多区域监测数据补齐后，区域专家模型库可以把每个滑坡体作为小图，做图时序专家；当前白家堡单站三点位阶段，先保留为研究路线。

## 本轮已尝试的挑战模型

可复跑脚本：

- `scripts/dev/regional-model-library/run-baijiabao-displacement-literature-challengers.py`

产物：

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-literature-challengers/baijiabao-displacement-literature-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-literature-challengers/baijiabao-displacement-literature-challengers.report.md`

候选族：

- `ridge-std`
- `huber-std`
- `hist-gradient-boosting-l2-31`
- `hist-gradient-boosting-l2-15`
- `random-forest`
- `extra-trees`
- `gradient-boosting-huber`
- `mlp-small`
- same-timestamp lightweight graph features:
  - `graphPeerMean`
  - `graphSelfMinusPeerMean`
  - `graphPeerSpread`
  - `graphPeerCount`
- leakage-safe decomposition features:
  - rolling trend slope
  - rolling residual to mean
  - displacement volatility
  - displacement range
  - rainfall rolling mean
  - reservoir rolling slope

特征族：

- `process-core`
- `process-core+lag`
- `small-delta+lag`

字段边界：

- target: `labels.displacementLabel`
- base features: `metricsNormalized`
- point identity: `rawRef.originalFields.point_id`
- lag features: 只使用同一点位更早的标签，validation 行只使用其时间之前的 train / validation 历史标签。
- 没有改数据库 schema、worker payload 或软件层字段。

## 写作建议

可以写：

> 在模型优化过程中，项目进一步复现了近期文献中常见的非线性树模型、鲁棒回归和小型 MLP 候选，并在相同白家堡验证集上进行对照。结果显示，直接使用通用非线性学习器的最佳 RMSE 为 0.916 mm，仍弱于当前 analog + OOF Huber + 软工况残差专家集成模型的 0.894 mm，说明当前模型针对小样本区域监测序列的相似历史检索与时间块 OOF 校准更适合本数据条件。

不要写：

- 不要写“使用深度学习后指标提升”，因为本轮没有提升。
- 不要把普通 GBDT 候选称为主模型。
- 不要把文献中的累计位移预测指标直接和我们的未来 24h 位移增量预测指标做绝对优劣比较。

## 下一步真正值得做

1. `分解 + analog/OOF 主模型`
   - 已接入 `build-baijiabao-displacement-prediction-card.mjs` 并复跑。
   - 最好 decomp OOF 候选：MAE `0.632411 mm`、RMSE `0.896798 mm`、R2 `0.117354`、Direction `58.88%`、Within 1mm `80.70%`、Threshold `85.95%`、P90 `1.403700 mm`。
   - MAE 最低 decomp OOF 候选：MAE `0.632258 mm`、RMSE `0.896887 mm`、R2 `0.117180`、P90 `1.406477 mm`。
   - 结论：只在 MAE 上略优于 v14，但 RMSE/R2/Threshold/P90 弱于 v14，保留为 `v17-decomp-ablation`。

2. `分解 + TCN/GRU`
   - 输入改成连续累计位移序列。
   - 对累计位移分解为趋势项、周期项、残差项。
   - 输出仍回到未来 24h 位移增量，保证系统字段兼容。

3. `轻量图时序`
   - 节点: `ZD1 / ZD2 / ZD3`
   - 边: 点间位移相关性或同步变化强度
   - 特征: 位移、降雨、库水位、点间差分
   - 初期已验证普通 graph-feature tabular 候选未超过 v14；下一步应改为 graph residual ensemble 或等更多点位/更多滑坡体数据后做真正 GCN。

4. `区域专家迁移`
   - 白家堡 v14 作为三峡区域 forecast baseline。
   - 等黄土坡/更多三峡数据可用后，再做跨滑坡体区域专家模型，不在单一白家堡数据上硬造全国泛化结论。
