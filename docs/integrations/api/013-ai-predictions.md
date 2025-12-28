# 13) AI Predictions（风险预测）

权限：`data:view`

数据来源：
- AI predictions 由 `services/ai-prediction-worker` 生成并写入 PostgreSQL `ai_predictions`（见 `docs/integrations/storage/postgres/tables/20-ai-predictions.sql`）。

## 1) API（`/api/v1`）

### 1.1 列表查询

**GET** `/ai/predictions`

Query（均可选）：
- `page` / `pageSize`
- `deviceId`：UUID
- `stationId`：UUID
- `modelKey`
- `riskLevel`：`low | medium | high`
- `startTime` / `endTime`：RFC3339 UTC（按 `created_at` 过滤）

响应 `data`：
- `page` / `pageSize` / `total`
- `list[]`：预测记录

### 1.2 详情

**GET** `/ai/predictions/{predictionId}`

响应 `data`：单条预测记录。

## 2) Legacy 兼容（`/api`）

为对齐旧前端 `POST /api/ai-prediction`（Next route）调用，API service 提供兼容端点：

- `POST /api/ai-prediction`

说明：
- 参考区 Next API 在异常场景会直接返回 200 的 fallback 分析结果；v2 的 legacy compat 也保持该行为：当 PostgreSQL 未配置或 body 不合法时，接口返回 200 + 备用分析（用于保证旧页面/演示环境可用）。
  - body 兼容：`{ "sensorData": [ { "device_id": "uuid", "...": "..." } ] }`
  - 返回字段：`analysis` / `result` / `probability` / `timestamp` / `recommendation`

说明：
- 当前兼容端点基于简化启发式规则生成结果，并将可解析的 `device_id` 记录进 `ai_predictions`，便于统一查询与审计。
