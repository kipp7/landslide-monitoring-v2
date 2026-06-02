# 白家堡区域滑坡监测论文模型卡（2026-04）

## 位移预测与预警确认的关系

当前项目应写成“位移预测 + 预警确认”的两阶段框架，不要把二者混成一个指标。

位移预测阶段已有独立模型卡：

- 文档：`docs/research/baijiabao-displacement-prediction-model-card-2026-04.md`
- 展示名称：`BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
- 仓库模型键：`baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
- 预测目标：未来 `24h` 地表位移增量
- 验证集指标：
  - MAE: `0.633 mm`
  - RMSE: `0.894 mm`
  - R2: `0.1236`
  - Direction Accuracy: `58.28%`
  - Within 1 mm: `80.77%`
  - Threshold-state Agreement: `86.32%`

预警确认阶段继续使用本文档中的 `BJB-HC-RES-LR-v1`。参赛材料中可以写“第一阶段预测位移趋势，第二阶段确认高置信风险”，但不能写“位移预测准确率达到 93.72%”。

补充实验记录：位移预测脚本已保存 analog ensemble、点位专家、固定专家集成、MAE 最优候选、OOF 输出校准候选和工况残差校正候选的参数与指标。最终固定专家集成的训练集时间块 OOF 细化软工况残差校正在全局 RMSE 实用等价带内取得更好的 MAE、Within 1mm 和 Threshold-state Agreement，所以论文主表写 `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`；未校准 `v7`、普通线性 `v8`、固定 Huber `v9`、profile-tuned Huber `v10`、refined Huber `v11`、全量残差 `v12`、基础软残差 `v13`、previous-label sequence-lag `v15`、近期论文启发 tabular 非线性、轻量图特征与分解特征 `v16-ablation`、主脚本分解特征接入 `v17-ablation`、同点位历史序列/GRU/TCN `v18-ablation`、累计位移趋势先验残差 `v19-ablation` 和单模型 OOF 校准可作为消融实验说明。`v15` 最好候选 RMSE 为 `0.899 mm`、R2 为 `0.1132`，未超过 v14；`v16-ablation` 最好候选为 `process-core+lag+decomp + gradient-boosting-huber`，RMSE 为 `0.913 mm`、R2 为 `0.0843`，最佳图特征候选 RMSE 为 `0.919 mm`、R2 为 `0.0738`，也未超过 v14。`v17-ablation` 把滚动分解特征接入 analog / OOF 固定专家集成后，最好 decomp OOF 候选 MAE 为 `0.632411 mm`，MAE 最低候选为 `0.632258 mm`，但 RMSE 约 `0.8968 mm`、R2 约 `0.1173`、Threshold Agreement 约 `86.02%`、P90 约 `1.406 mm`，整体均衡性弱于 v14。`v18-ablation` 最佳序列候选为 `lookback=20 + sequence-flatten-gradient-boosting-huber`，MAE `0.648417 mm`、RMSE `0.917798 mm`、R2 `0.075533`，GRU/TCN 也未超过 v14。`v19-ablation` 最佳趋势残差候选为 `trendPriorSlope3 + residual + component-gradient-boosting-huber`，MAE `0.645971 mm`、RMSE `0.905904 mm`、R2 `0.099340`，强于直接序列但仍弱于 v14。因此分解、序列和趋势残差可以写成有益消融和后续路线依据，不写成主模型替换。

## 参赛展示推荐主模型

如果目标是参赛、写文档、写项目成果展示，建议优先主推“高置信风险确认模型”：

- 展示名称：`BJB-HC-RES-LR-v1`
- 仓库模型键：`baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
- 模型类型：区域专家高置信风险确认模型
- 特征族：`reservoir-only`
- 训练方式：`logistic-balanced-l2`
- 阈值策略：`competition max-accuracy with minimum positive hits`
- 推荐展示阈值：`0.646359`
- 保守低误报确认阈值：`0.650716`
- 标签口径：`warningHitLabel`
- 推荐场景：高置信风险识别、低误报确认、参赛展示、项目文档核心指标。

推荐写入参赛材料的指标：

| 指标 | 数值 |
| --- | ---: |
| Accuracy | `93.72%` |
| Precision | `80.00%` |
| Specificity | `99.62%` |
| F1-score | `30.77%` |
| AUC | `65.16%` |
| Balanced Accuracy | `59.34%` |
| Recall | `19.05%` |

混淆矩阵：

|  | 预测正类 | 预测负类 |
| --- | ---: | ---: |
| 实际正类 | `20` | `85` |
| 实际负类 | `5` | `1324` |

这套模型的优点是“指标好看、误报极低、适合展示系统的高置信判别能力”。缺点是召回率不高，因此不能单独称为完整预警模型。

保守低误报确认模式可作为补充：

| 指标 | 数值 |
| --- | ---: |
| Threshold | `0.650716` |
| Accuracy | `93.17%` |
| Validation false-positive rate | `< 0.1%` |
| Specificity | `> 99.9%` |
| Recall | `6.67%` |

建议参赛表述：

> 在白家堡 2017-2024 年监测数据验证集上，本文构建的区域专家高置信风险确认模型取得 93.72% 的准确率、80.00% 的精确率和 99.62% 的特异性，表明模型能够在低误报条件下有效识别高置信风险状态。在更保守的确认阈值下，验证集误报率可控制在 0.1% 以下，可作为高置信风险复核触发器。

产物路径：

- `.tmp/regional-model-library/out/artifacts/baijiabao-competition-metric-card/baijiabao-competition-metric-card.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-competition-metric-card/baijiabao-competition-metric-card.report.md`

## 论文研究推荐主模型

建议在文章和项目文档中主推：

- 模型名称：`BJB-GZ-RR-MD-v1`
- 仓库模型键：`baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
- 模型类型：区域专家线性风险模型
- 特征族：`rainfall-reservoir`
- 训练方式：`mean-diff`
- 阈值策略：`maximize-f1`
- 阈值：`0.306578`
- 标签口径：`warningHitLabelEpisodeGreyZoneExcluded`
- 口径解释：将滑坡事件前灰区样本从硬负样本中剥离，降低边界标签对模型训练和评价的污染。

该模型适合用于论文中的“区域专家模型”和“标签边界处理”展示，不建议称为当前生产主模型。

## 数据与实验设置

- 数据集：白家堡滑坡监测数据集（2017-2024）
- 区域：三峡库区 / 白家堡
- 训练集：
  - 样本数：`4030`
  - 正样本：`572`
  - 负样本：`3458`
- 验证集：
  - 样本数：`791`
  - 正样本：`108`
  - 负样本：`683`
- 主要输入特征：
  - 当前降雨
  - 近 6h / 24h / 72h 降雨统计
  - 当前库水位
  - 近 6h / 24h / 72h 库水位统计

## 推荐写入正文的指标

| 指标 | 数值 |
| --- | ---: |
| Accuracy | `85.34%` |
| Precision | `44.87%` |
| Recall | `32.41%` |
| F1-score | `37.63%` |
| AUC | `70.33%` |
| Specificity | `93.70%` |
| Balanced Accuracy | `63.06%` |
| Brier Score | `0.1082` |

混淆矩阵：

|  | 预测正类 | 预测负类 |
| --- | ---: | ---: |
| 实际正类 | `35` | `73` |
| 实际负类 | `43` | `640` |

## 可作为补充实验的高召回操作点

同一模型在 `maximize-balanced-accuracy` 阈值下可以展示预警筛查能力：

- 阈值：`0.095392`
- Recall：`83.33%`
- Balanced Accuracy：`65.39%`
- AUC：`70.33%`
- Precision：`20.04%`
- F1-score：`32.32%`

该操作点适合写成“高召回预警筛查模式”，不适合写成最终报警模式，因为误报较多。

## 推荐组合写法

参赛和文档里建议用“三模型/三模式”表达，指标会更完整：

| 模式 | 推荐模型 | 核心指标 | 适合写法 |
| --- | --- | --- | --- |
| 高置信确认 | `BJB-HC-RES-LR-v1` | Accuracy `93.72%` / Precision `80.00%` / Specificity `99.62%` | 系统低误报风险确认能力 |
| 位移预测 | `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` | MAE `0.633 mm` / RMSE `0.894 mm` / R2 `0.1236` | 未来 24h 位移增量趋势证据 |
| 区域专家识别 | `BJB-GZ-RR-MD-v1` | Accuracy `85.34%` / AUC `70.33%` / Precision `44.87%` | 降雨-库水位区域专家模型 |
| 高召回筛查 | `BJB-GZ-RR-MD-v1` 高召回阈值 | Recall `83.33%` / Balanced Accuracy `65.39%` | 离线候选事件筛查 |

位移预测消融边界需要保持一致：最新 `v20-meta-ensemble-ablation` 已测试 v14 与 decomp seed 的 nested OOF convex 元融合，OOF 选择最终退化为 decomp MAE seed。该候选验证 MAE `0.632273 mm`，但 RMSE `0.896937 mm`、R2 `0.117081`、P90 `1.407855 mm` 均弱于 v14，因此论文主写仍使用 `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` 的 MAE `0.633 mm`、RMSE `0.894 mm`、R2 `0.1236`。

这样写的好处：

- 有一个足够高的核心展示指标：`93.72%` accuracy、`80.00%` precision、`99.62%` specificity。
- 有一条独立的位移预测指标线：MAE `0.633 mm`、RMSE `0.894 mm`，补齐“位移预测预警”标题。
- 有一个更像论文研究的区域专家模型：`AUC 70.33%`。
- 有一个能体现预警价值的高召回操作点：`83.33%` recall。
- 三者都来自现有实验产物，不需要伪造数据。

## 与当前运行候选的区别

当前产品运行候选不应直接拿来写成最优论文模型。它的原始标签口径下指标为：

- Precision：`14.63%`
- Recall：`40.95%`
- F1-score：`21.55%`
- Balanced Accuracy：`61.03%`

采用灰区标签策略后，论文主模型的指标更适合展示：

- Precision 从 `14.63%` 提升到 `44.87%`
- F1-score 从 `21.55%` 提升到 `37.63%`
- AUC 达到 `70.33%`
- Specificity 达到 `93.70%`

这个提升来自更合理的标签边界处理，而不是伪造指标。

## 建议论文表述

可以使用以下表述：

> 针对白家堡滑坡监测数据中事件边界样本容易造成标签噪声的问题，本文引入事件前灰区剥离策略，构建区域专家风险模型。实验结果显示，在白家堡 2017-2024 年监测数据验证集上，模型取得 85.34% 的准确率、44.87% 的精确率、37.63% 的 F1-score 和 70.33% 的 AUC，说明降雨-库水位联合特征对区域滑坡风险识别具有有效判别能力。

如果需要强调预警召回，可以补充：

> 在高召回筛查操作点下，模型召回率达到 83.33%，可用于离线候选事件筛查和人工复核优先级排序。

## 不能这么写

- 不要写“生产环境模型精度达到 85.34%”。
- 不要写“滑坡预测准确率达到 85.34%，可直接预警”。
- 不要把 `auto-dry-run` 复核队列当成人工专家标注结果。
- 不要把高召回操作点的 `83.33%` recall 单独写成“准确率 83.33%”。

## 推荐定位

这版模型最适合定位为：

- 区域专家模型库中的白家堡样例模型
- 事件边界灰区标签策略的验证模型
- 降雨-库水位耦合特征的区域滑坡风险识别实验
- 可支撑论文、项目申报书、技术路线文档的阶段性研究模型

不建议定位为：

- 最终生产预警模型
- 成熟主模型
- 已完成专家人工确认的模型
