# 端到端冒烟测试（MQTT → Kafka → ClickHouse → API）

目标：在单机环境验证“设备上报 → 写入时序库 → API 可查询”的最小闭环，确保我们后续重构只是在这个闭环上迭代，而不是边写边猜。

适用范围：
- 基础设施：`infra/compose/`
- 服务：`services/ingest`、`services/telemetry-writer`、`services/api`

## 0) 前置条件

- 已通过基础设施冒烟测试：`docs/guides/testing/single-host-smoke-test.md`
- Node.js 满足 `package.json` 要求（建议 Node 20+）

可选：如果你希望“一键跑通并自动留证”，可以直接运行脚本（会启动本机进程形式的 services，并在 `backups/evidence/` 输出日志）：

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1`

## 1) 启动基础设施（Docker Compose）

从仓库根目录执行（只需要第一次初始化时跑 init 脚本）：

- `copy infra\\compose\\env.example infra\\compose\\.env`
- 编辑 `infra/compose/.env`：把所有 `change-me` 改成强密码
- `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d`
- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1`
- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-clickhouse.ps1`
- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/create-kafka-topics.ps1`

验收（必须）：
- `http://localhost:8123/ping` 返回 `Ok.`
- EMQX Dashboard 可打开：`http://localhost:18083`
- Kafka listener：`localhost:9094` 可用（供本机服务连接）

## 2) 启动后端服务（本机进程）

1) 安装依赖 + 构建（根目录）：

- `npm install`
- `npm run build`

2) 启动 `ingest-service`

- `copy services\\ingest\\.env.example services\\ingest\\.env`
- 编辑 `services/ingest/.env`（示例）：
  - `MQTT_URL=mqtt://localhost:1883`
  - `KAFKA_BROKERS=localhost:9094`
  - （可选）若 EMQX 启用了鉴权：同时设置 `MQTT_USERNAME` + `MQTT_PASSWORD`
- 运行：`node services/ingest/dist/index.js`
  - 说明：服务会自动读取同目录下的 `.env`（无需手动导出环境变量）

3) 启动 `telemetry-writer`

- `copy services\\telemetry-writer\\.env.example services\\telemetry-writer\\.env`
- 编辑 `services/telemetry-writer/.env`（示例）：
  - `KAFKA_BROKERS=localhost:9094`
  - `CLICKHOUSE_URL=http://localhost:8123`
- 运行：`node services/telemetry-writer/dist/index.js`
  - 说明：服务会自动读取同目录下的 `.env`（无需手动导出环境变量）

4) 启动 `api-service`

- `copy services\\api\\.env.example services\\api\\.env`
- 编辑 `services/api/.env`（示例）：
  - `CLICKHOUSE_URL=http://localhost:8123`
  - `AUTH_REQUIRED=false`（本地测试可先关；生产必须开）
- 运行：`node services/api/dist/index.js`
  - 说明：服务会自动读取同目录下的 `.env`（无需手动导出环境变量）

## 3) 发送一条测试遥测（MQTT）

准备一个固定的测试 deviceId（UUID 格式），例如：

- `2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c`

在仓库根目录执行：

- `node scripts/dev/publish-telemetry.js --mqtt mqtt://localhost:1883 --device 2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c`

如果你已启用 MQTT 鉴权（阶段 1），则需要带上 username/password（username 为 `device_id`）：

- `node scripts/dev/publish-telemetry.js --mqtt mqtt://localhost:1883 --device <device_id> --username <device_id> --password <device_secret>`

预期：
- `ingest-service` 日志出现写入 Kafka 成功的记录
- `telemetry-writer` 日志出现 ClickHouse insert ok

## 4) 验证 API 查询

1) 查询最新状态：

- `curl http://localhost:8080/api/v1/data/state/2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c`

预期：
- `success=true`
- `data.state.metrics` 至少包含 `displacement_mm`、`tilt_x_deg`、`battery_v`

2) 查询曲线：

- `curl \"http://localhost:8080/api/v1/data/series/2c1f2d8e-2bb7-4f58-bb6a-6c2a0f4a7a4c?startTime=2025-12-15T00:00:00Z&endTime=2030-01-01T00:00:00Z&sensorKeys=displacement_mm\"`

预期：
- `series[0].points` 至少返回 1 个点

## 5) 失败时如何留证（强制）

出现以下任意问题：Kafka 连不上、EMQX 连不上、ClickHouse 写入失败、API 查询为空，必须先收集证据再提 Issue/Incident：

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/collect-evidence.ps1`
- 保存服务端日志（复制粘贴关键片段即可；不要包含任何明文密码）

并记录到：
- 一般问题：GitHub Issue
- 严重阻塞：`docs/incidents/`
