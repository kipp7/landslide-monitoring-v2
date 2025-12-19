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

阶段 1（启用 MQTT 鉴权/ACL）的一键冒烟（推荐全自动，不用点 Dashboard）：

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -ConfigureEmqx -UseMqttAuth -CreateDevice`

阶段 1（闭环回归基线，一键跑完鉴权 + commands + DLQ + revoke，推荐作为改动后的快速验收）：

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -Stage1Regression`

说明：
- `-Stage1Regression` 是“预置模式”，不能与其它开关组合使用（避免歧义/漂移，保证回归基线稳定）。
- 覆盖范围：commands（acked/failed/timeout 三种结果）、Telemetry DLQ、revoke 立即生效，并自动留证到 `backups/evidence/`。

阶段 1（鉴权 + 命令下发 + revoke 立即生效）的回归用例（推荐作为改动后的快速验收）：

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -ConfigureEmqx -UseMqttAuth -CreateDevice -TestCommands -TestCommandAcks -TestRevoke`

阶段 1（命令回执失败）验证用例（设备返回 failed，验证 `sent` → `failed`，并生成通知）：

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -ConfigureEmqx -UseMqttAuth -CreateDevice -TestCommands -TestCommandFailed`

阶段 1（命令回执超时）验证用例（不发送 ack，验证 `sent` → `timeout`）：

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -ConfigureEmqx -UseMqttAuth -CreateDevice -TestCommands -TestCommandTimeout`

说明：
- 该用例会同时断言：`COMMAND_TIMEOUT` 事件已落库可查询；对应的 command notification 已创建；并验证 notification stats（含未读计数）与“标记已读”接口。

阶段 1（Telemetry DLQ）验证用例（发送无效 JSON，验证 DLQ 落库 + API 可查询）：

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -ConfigureEmqx -UseMqttAuth -CreateDevice -TestTelemetryDlq`

说明：
- 该用例会覆盖 DLQ 的常见原因：`invalid_json`、`payload_too_large`、`metrics_too_many`，并通过 `/telemetry/dlq/stats` 断言聚合统计口径。

失败时留证（无需手工收集）：

- 脚本失败会自动在 `backups/evidence/e2e-smoke-<timestamp>/` 下输出：
  - `failure.txt`：失败原因
  - `*.stdout.log`/`*.stderr.log`：本机进程日志
  - `compose-logs-*.txt`：基础设施容器日志（tail）
  - `backups/evidence/e2e-smoke-<timestamp>/<timestamp>/`：证据包（`collect-evidence.ps1` 产物，已做敏感信息脱敏）

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
