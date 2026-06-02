# Change: Add Regional Landslide Model Baseline

## Why

当前仓库虽然已经具备 `ai-prediction-worker`、`ai_predictions` 落库表、Kafka 事件和查询 API，但核心预测逻辑仍然是基于位移/倾角/振动的启发式打分，并不是真正可训练、可替换、可按区域演进的模型能力。

团队接下来的比赛与产品方向都明确要求两件事：

- 建立山体滑坡位移预测模型与预警模型
- 结合不同区域公开数据、现场监测数据和已有系统能力，形成“区域模型库 + 模型匹配 + 持续训练”的技术路线

因此需要先在当前仓库里落一个最小但真实可运行的模型基线，作为后续引入更复杂深度学习模型、视觉模型和区域数据库的稳定底座。

## What Changes

- 在现有 `services/ai-prediction-worker` 内引入“可训练基线模型”运行能力，替代单纯 heuristic 作为默认实现
- 增加离线训练入口，用于从结构化样本数据生成模型工件（model artifact）
- 增加“区域模型选择 + 缺省回退”机制，允许同一运行时按区域加载不同模型
- 保持现有 Kafka 事件、Postgres 表和 API 查询契约稳定，只扩展 `payload` 中的模型明细
- 保留 heuristic 作为模型缺失或异常时的安全回退

## Impact

- Affected specs:
  - `ai-predictions`（new）
- Affected code:
  - `services/ai-prediction-worker/*`
  - `docs/integrations/ai/*`
  - `docs/integrations/api/013-ai-predictions.md`
  - `openspec/changes/add-regional-landslide-model-baseline/*`
