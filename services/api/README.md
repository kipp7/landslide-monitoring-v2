# api-service（HTTP API）

本服务提供对外 HTTP API（`/api/v1`），严格对齐契约：`docs/integrations/api/openapi.yaml`。

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

