# 仓库结构与命名规范（Monorepo，必须遵守）

目标：让仓库在长期迭代中保持清晰边界，避免“写着写着又变乱”。

## 1) 顶层目录（固定）

- `docs/`：文档中心（权威入口）
- `apps/`：可交付应用（Web/Flutter）
- `services/`：后端可运行服务
- `libs/`：共享库（不可单独对外提供服务）
- `infra/`：部署与运维（单机 Compose）

禁止随意新增同级目录。新增必须写入说明并更新根目录 `README.md`。

## 2) 推荐命名（你的问题：我给一个推荐）

### Apps

- `apps/web`：Web 管理端（Next.js）
- `apps/mobile`：移动端（Flutter）

原因：

- `mobile` 比 `app` 更明确（避免未来出现多个 app：admin-app/user-app）
- `web` 是通用行业命名，便于别人理解/复用

### Services（后端）

服务名使用 `kebab-case` 或单词小写（目录名），建议固定为以下（与 ADR 对齐）：

- `services/api`
- `services/ingest`（MQTT → Kafka）
- `services/telemetry-writer`（Kafka → ClickHouse）
- `services/rule-engine`
- `services/notify`（可选）

### Libraries（共享）

建议命名：

- `libs/validation`
- `libs/observability`
- `libs/shared-types`

## 3) 依赖边界（强制）

### 3.1 App 依赖规则

- `apps/*` 只能依赖：
  - `libs/*`
  - 生成的 API Client/DTO（来自 `docs/integrations/api/openapi.yaml`）
- `apps/*` 禁止依赖：
  - `services/*` 的实现代码
  - 任何数据库 SDK（Supabase/直接 PG/CH）

### 3.2 Service 依赖规则

- `services/*` 只能依赖：
  - `libs/*`
  - `docs/integrations/*` 的契约（通过代码生成/复制到 generated）
- `services/*` 之间禁止直接 import 源码（服务通过消息/API 交互）

### 3.3 Docs 是权威信息源

任何变更：

- 先改 `docs/integrations/*` 契约
- 再改实现
- 门禁必须通过（`python docs/tools/run-quality-gates.py`）

## 4) 版本化与兼容性

- API、MQTT、Kafka、Rules 的 schema 必须版本化（`v1/v2`）
- 新增字段必须考虑向后兼容（可选字段优先）

## 5) 禁止事项（红线）

- 禁止提交真实 `.env` 文件（仅允许 `.env.example` / `.env.template`）
- 禁止在前端/移动端硬编码传感器 key、阈值、站点坐标、设备映射
- 禁止绕开契约直接“先写代码再补文档”

