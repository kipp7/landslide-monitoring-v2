# AI 预测（Predictions）

本模块对应参考区的“AI 预测/专家系统”的查询与展示能力：读取 Postgres `ai_predictions` 的落库结果，用于“可回放/可追溯”的对外查询。

v2 约束：

- 预测/专家结论必须可落库、可回放、可追溯（不允许只停留在前端或内存计算）。
- Web 只能通过 v2 API 访问（不允许直连数据库）。

## 1) 数据模型（PostgreSQL）

表：`ai_predictions`

- `prediction_id`（PK，UUID）
- `device_id`（UUID）
- `station_id`（UUID，可选）
- `model_key`（TEXT）
- `model_version`（TEXT，可选）
- `horizon_seconds`（INTEGER）
- `predicted_ts`（TIMESTAMPTZ）
- `risk_score`（DOUBLE PRECISION，0~1）
- `risk_level`（`low|medium|high`，可选）
- `explain`（TEXT，可选）
- `payload`（JSONB）
- `created_at`（TIMESTAMPTZ）

DDL 来源：`docs/integrations/storage/postgres/tables/20-ai-predictions.sql`

## 2) API（/api/v1）

### 2.1 列出预测结果

**GET** `/ai/predictions`

权限：`data:analysis`

查询参数：

- `page`（默认 1）
- `pageSize`（默认 20，最大 200）
- `deviceId`（可选，UUID）
- `stationId`（可选，UUID）
- `modelKey`（可选）
- `startTime`（可选，RFC3339 UTC，按 `created_at` 过滤）
- `endTime`（可选，RFC3339 UTC，按 `created_at` 过滤）
- `order`（可选：`asc|desc`，默认 `desc`，按 `created_at` 排序）

返回：`list[]` + `pagination`

### 2.2 查询单条预测结果

**GET** `/ai/predictions/{predictionId}`

权限：`data:analysis`

