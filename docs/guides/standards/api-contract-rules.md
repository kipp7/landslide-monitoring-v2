# API 契约规则（必须遵守）

目标：让 API 成为“唯一真相”，前端/Flutter/运维工具都只依赖 API，而不是依赖数据库表或某个页面的实现细节。

## 1. 契约来源与变更纪律

- API 契约唯一来源：`docs/integrations/api/`（包含 `openapi.yaml`）。
- 修改任何接口字段/行为，必须同步修改：
  - `docs/integrations/api/openapi.yaml`
  - 对应模块文档（如 `03-devices.md`）

## 2. 统一约定

- Base URL：`/api/v1`
- ID：UUID 字符串（`deviceId`、`stationId`、`alertId`、`ruleId`、`commandId`…）
- 时间：RFC3339 UTC（`2025-12-15T10:00:00Z`）
- 统一响应：成功/分页/错误结构必须与 `api-design.md` 一致
- `traceId`：每个请求必须可追踪（日志/响应中都要有）

## 3. 错误与状态码

必须覆盖的错误码：

- `400` 参数错误（返回可定位字段）
- `401` 未认证
- `403` 无权限
- `404` 资源不存在
- `409` 冲突（例如重复创建、版本冲突）
- `429` 限流（保护单机）
- `500` 内部错误（不可泄露敏感信息）

## 4. 查询保护（单机必需）

- 所有曲线/导出类接口必须限制最大时间范围与最大点数（通过系统配置控制）。
- 导出必须支持异步任务（数据量大时避免阻塞与 OOM）。
- “管理员/调试能力”不得以 HTTP API 的形式暴露到生产环境（必须走受控运维手段 + 审计）。

## 5. 幂等与一致性

- 命令下发必须返回 `commandId`，并可查询状态（queued/sent/acked/failed/timeout）。
- 规则发布必须是版本化（ruleVersion 递增），不覆盖旧版本。
- 告警以事件为事实来源（trigger/update/resolve/ack），API 只读聚合状态。

