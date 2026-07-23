---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/services/api/readme
---

# api-service（HTTP API）

本服务提供对外 HTTP API（`/api/v1`），严格对齐契约：`docs/integrations/api/openapi.yaml`。

## Hermes 任务代理

- `POST /api/v1/edge-ai/chat`：创建或继续对话，拆分并顺序执行只读白名单任务。
- `GET /api/v1/edge-ai/conversations`：查询当前用户的会话历史。
- `GET /api/v1/edge-ai/conversations/{conversationId}/messages`：查询消息和任务轨迹。
- `GET /api/v1/edge-ai/tasks/{taskId}`：查询单项任务结果。

会话和任务复用现有 PostgreSQL，DDL 位于
`docs/integrations/storage/postgres/tables/23-hermes-agent.sql`。RK3568 仅接收
`recheck`、`collect_logs`、`generate_report` 三类任务；重启、改阈值、网络
切换、设备控制和告警控制不会被自动下发。

本 PR 阶段只实现“数据查询最小闭环”：
- `GET /api/v1/data/state/{deviceId}`：查询设备最新状态（从 ClickHouse 计算得到，后续可切换到 Postgres shadow）
- `GET /api/v1/data/series/{deviceId}`：查询设备曲线（ClickHouse）

## 环境变量

参考：`services/api/.env.example`

## 本地运行（开发）

1) 安装依赖（仓库根目录）：
- `npm install`

2) 构建：
- `npm run build`

3) 进入目录运行：
- `cd services/api`
- 复制 `.env.example` 为 `.env` 并填写（不要提交 `.env`）
- `node dist/index.js`
