# integrations/ai/

该目录描述 “AI 预测/专家系统” 的对接契约与可插拔实现约束。

目标：

- 预测/专家结论必须可落库、可回放、可追溯（不允许只停留在前端或内存计算）。
- 模型实现可以替换（先落地最小可用 heuristic，后续换成真实模型也不影响契约）。

## 1) Kafka：预测事件

- topic：`ai.predictions.v1`
- schema：`docs/integrations/kafka/schemas/ai-predictions.v1.schema.json`
- example：`docs/integrations/kafka/examples/ai-predictions.v1.json`

生产者：

- `services/ai-prediction-worker`（默认消费 `telemetry.raw.v1`，生成预测并写入 Postgres，再发布到 `ai.predictions.v1`）

## 2) Storage：预测结果落库

- 表：`ai_predictions`
- DDL：`docs/integrations/storage/postgres/tables/20-ai-predictions.sql`

## 3) Web/API（后续）

本模块先保证 “数据链路 + 落库 + 可回放” 的基础设施具备；对外查询 API 与前端展示页可在后续 WS-H 子任务中补齐。

