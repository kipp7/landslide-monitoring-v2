# 项目状态（Project Status，AI/人类交接入口）

目的：解决“对话窗口终止/换模型/换 AI 后不知道做到哪一步”的问题。任何 AI/人类接手本项目，**先读本页**，不需要全局搜索。

更新原则（强制）：

- 每次合并一个 PR 到 `main`，如果它改变了项目阶段/里程碑/下一步，必须更新本页。
- 本页只记录“当前状态与下一步”，历史细节放到 `docs/incidents/` 或 PR/commit 记录中。

最后更新时间：2025-12-19（阶段 3 kickoff：复杂规则 + 回放/回测）

## 1) 当前结论（TL;DR）

- 技术栈已冻结：后端 TypeScript（strict），MQTT→Kafka→ClickHouse + Postgres（单机 Compose）。
- 仓库治理已落地：Rulesets 强制 PR-only、必过 `docs-and-contracts`、禁强推/禁删除。
- 阶段 0 已完成：单机基础设施 + 端到端冒烟（MQTT→Kafka→ClickHouse→API）可复现，踩坑已沉淀到 `docs/incidents/`。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 可一键跑通并自动留证日志（见 `docs/guides/testing/e2e-smoke-test.md`）。
- 阶段 1 已完成：单机 Compose 已具备设备鉴权 + commands 运维排查的“可落库/可查询”闭环（command events + notifications），并已把关键回归断言沉淀到 `e2e-smoke-test.ps1` 的证据包中。
  - 补充：`infra/compose/scripts/configure-emqx-http-auth.ps1` 可一键写入 EMQX 配置（免 Dashboard 手工操作）。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 支持 `-ConfigureEmqx -UseMqttAuth -CreateDevice` 一键跑通“带鉴权”的端到端冒烟。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 新增 `-Stage1Regression` 预置模式：一键跑完阶段 1 的闭环回归基线（鉴权 + commands acked/failed/timeout + Telemetry DLQ + revoke），并自动留证。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 增加 `-TestCommandFailed` 回归用例（sent→failed），并断言事件/通知/统计/已读链路可用。
  - 补充：冒烟失败会自动调用 `infra/compose/scripts/collect-evidence.ps1` 生成证据包（带脱敏），避免手工收集日志。
  - 修复：冒烟脚本现在会展开 `infra/compose/.env` 中的 `${VAR}`（例如 `CH_HTTP_URL`/`MQTT_URL`），避免误判基础设施不可达。
  - 修复：EMQX 接线脚本写入 `services/api/.env` 时会展开 `CH_HTTP_URL`，避免 ClickHouse URL 形如 `http://${CH_HOST}:${CH_HTTP_PORT}` 导致 api-service 启动失败。
  - 修复：`-ForceWriteServiceEnv` 下重写 `services/api/.env` 时会保留 `EMQX_WEBHOOK_TOKEN` 与 `MQTT_INTERNAL_PASSWORD`，避免鉴权冒烟提前失败。
  - 修复：接线脚本生成 token 时不再追加重复键；e2e 脚本读取 `.env` 时使用“最后一个非空值”，避免因重复键的空值导致误报。
  - 修复：e2e 冒烟脚本访问 API 改用 `127.0.0.1`（避免 Windows 下 `localhost` 解析到 IPv6 ::1 导致 /health 超时）；EMQX HTTP authn/authz webhook 增加 `Content-Type: application/json`。
  - 修复：e2e 冒烟脚本增加启动稳定性：等待 ingest-service 确认订阅 MQTT，并在 EMQX webhook 刚恢复时对 `publish-telemetry.js` 做 retry，同时把输出写入 `publish-telemetry.log` 便于排查。
  - 修复：`@lsmv2/validation` 的 Ajv schema 编译结果按 `Validator{ validate, errors }` 形式包装，避免运行期出现 `validateRaw.validate is not a function`。
  - 修复：telemetry-writer 写入 ClickHouse 时，将 `*_ts` 按 ClickHouse `DateTime64(3, 'UTC')` 期望格式序列化（避免 ISO8601 `T/Z` 导致解析失败）。
  - 修复：API `/data/series` 查询对 ClickHouse 的 `DateTime64` 参数使用 UTC 解析（避免时区/格式导致范围查询无数据或 500）。
  - 修复：ClickHouse 默认使用 named volume（可用 `CH_DATA_DIR` 切回 bind-mount），并在 e2e 冒烟中自动检测/初始化 ClickHouse DDL（缺表时执行 `init-clickhouse.ps1`）。
  - 进展：补齐设备管理端接口的“命令下发”入口 `POST /devices/{deviceId}/commands`（写入 Postgres `device_commands`，返回 queued）。
  - 进展：补齐站点管理端接口：`/stations` CRUD（Postgres），用于设备绑定站点与运营维护。
  - 修复：设备更新接口支持清空 `stationId`（原先无法设置为 `null`）。
  - 进展：MQTT revoke 立即生效：EMQX ACL 回调会实时查询 Postgres `devices.status`，`revoked` 设备会被拒绝 publish/subscribe（即使已连接）。
  - 进展：writer 可靠性增强：ClickHouse 写入成功后才提交 Kafka offset；写入失败时退避重试，避免 ClickHouse 故障导致数据丢失/缓冲堆积。
  - 进展：Postgres shadow 落地：telemetry-writer 在写入 ClickHouse 成功后 upsert `device_state`；API `/data/state` 优先读 `device_state`，无记录时回退 ClickHouse。
  - 进展：命令下发进入 Kafka：API 创建命令时同步写入 `device.commands.v1`（为后续 MQTT 下发 worker / 回执链路打基础）。
  - 进展：新增 `command-dispatcher`：消费 `device.commands.v1` 并通过 MQTT 发布到 `cmd/{device_id}`，e2e 脚本可选验证设备接收命令。
  - 进展：e2e 冒烟补齐阶段 1 回归用例：支持 `-TestRevoke` 验证 revoke 立即生效（EMQX authn 拒绝已吊销设备）。
  - 进展：commands 回执闭环落地：设备 publish `cmd_ack/{device_id}` → Kafka `device.command_acks.v1` → Postgres `device_commands`（acked_at/result/status）。
  - 进展：e2e 冒烟补齐回执验证：支持 `-TestCommandAcks`（command queued→sent→acked）。
  - 进展：补齐 commands 运维接口：`GET /devices/{deviceId}/commands` 与 `GET /devices/{deviceId}/commands/{commandId}`（用于排查 queued/sent/acked/failed/timeout/canceled）。
  - 进展：补齐 ack 超时策略：新增 `command-timeout-worker` 定期扫描 `sent` 超时命令并标记为 `timeout`，同时发出 `device.command_events.v1` 事件；e2e 支持 `-TestCommandTimeout` 回归。
  - 进展：补齐 command events 的“落库与查询”：新增 `command-events-recorder` 落库 `device_command_events`；API 新增 `/devices/{deviceId}/command-events` 查询，用于通知/排查与 e2e 断言。
  - 进展：commands 运维收口：命令事件/通知列表支持 `startTime/endTime/eventType/unreadOnly` 过滤；统计接口支持 `bucket(1h/1d)` 按时间窗口聚合，并新增 `/devices/{deviceId}/command-events/stats`。
- 阶段 2 已完成（最小可告警闭环）：rule engine → `alert_events` → API 可查询/可处置，并已沉淀单机回归基线。
  - 进展：新增 `rule-engine-worker`（消费 `telemetry.raw.v1`，按规则 DSL v1（最小子集）评估并写入 `alert_events`）。
  - 进展：补齐告警 API（`/alerts`、`/alerts/{alertId}/events`、`/alerts/{alertId}/ack|resolve`、`/alert-rules*`），对齐 `docs/integrations/api/06-alerts.md`。
  - 进展：e2e 冒烟新增 `-Stage2Regression` 预置模式：阶段 1 回归基线 + alerts（创建规则 → 触发 → 查询事件流 → ACK → RESOLVE），并自动留证。
- 阶段 3 进行中：复杂规则与 AI 插件（聚合/趋势/缺失策略/回放回测/可解释字段），在阶段 2 的可告警闭环之上持续迭代。

## 2) 当前阶段与里程碑

阶段：阶段 3（复杂规则与 AI 插件）

M1（阶段 0：最小闭环）目标：

- MQTT ingest：设备上报 → Kafka（含 schema 校验与 DLQ）
- writer：Kafka → ClickHouse（批量写入、错误隔离）
- API：查询最新值 + 简单曲线（最少 2~3 个端点）

当前完成情况：

- ✅ ingest-service：已实现 MQTT telemetry 订阅、JSON Schema 校验、写 `telemetry.raw.v1` 与 `telemetry.dlq.v1`
  - 补充：ingest-service 增加入站降载保护（payload 过大 / metrics 过多 → 直接写 DLQ），避免异常负载拖垮后续链路。
  - 修复：ingest-service 写入 DLQ 时对 `raw_payload` 做字节级截断（避免超大 payload 反向拖垮 DLQ topic）。
  - 进展：新增 `telemetry-dlq-recorder` 把 `telemetry.dlq.v1` 落库到 Postgres，并提供 API 查询接口，方便运维定位坏消息来源。
  - 进展：e2e 冒烟新增 DLQ 降载回归断言（invalid_json / payload_too_large / metrics_too_many + stats 聚合）。
- ✅ telemetry-writer：对疑似 ClickHouse 基础设施故障加入“失败冷却窗口”（避免长时间故障时反复崩溃/重试导致日志风暴），恢复后不提交 offset 的消息会自动重放。
- ✅ telemetry-writer：已实现消费 `telemetry.raw.v1` 并批量写入 ClickHouse（批量写入 + 退避重试 + writer 侧 DLQ + 基础运行观测/保护）
- ✅ API：已实现最小查询端点（`/data/state`、`/data/series`），数据源为 ClickHouse（后续可切换到 Postgres shadow）

M2（阶段 1：设备接入与鉴权）目标：

- 管理端：创建设备并生成“身份包”（`deviceId + deviceSecret`，secret 仅返回一次；服务端只存 hash）
- MQTT：设备按 `deviceId/secret` 鉴权，按 topic 做 ACL，禁越权发布；吊销设备后立即拒绝上报
- 运营：传感器字典与设备传感器声明可维护（前端不写死）

当前完成情况：

- ✅ 管理端：设备创建 + deviceSecret（仅返回一次），服务端保存 hash
- ✅ MQTT：鉴权 + ACL + revoke 立即生效（并已具备一键配置与回归基线）
- ✅ 运维：commands events/notifications 可落库可查询，支持筛选/统计（含未读与按时间桶聚合）

M3（阶段 2：可告警）目标：

- 规则：DSL 版本化（`alert_rules`/`alert_rule_versions`），支持最小阈值/窗口/防抖
- worker：`rule-engine-worker` 触发 `alert_events`（可回放/可查询）
- API：按契约提供 `/alert-rules`、`/alerts` 的最小可用查询与运维接口

## 3) 下一步（Next Actions，按优先级）

1) 复杂规则能力：在 DSL v1 规范下补齐 `metric`（min/max/avg/delta/slope）与 station/global scope（以不改表为原则演进）
2) 回放/回测：支持按 `ruleId + ruleVersion + timeRange` 对 ClickHouse 数据进行 dry-run 回放，并输出 explain/evidence（便于复盘与容量评估）
3) 通知与处置：把告警事件与通知策略打通（App/SMS/Email/WeChat 的最小策略），并沉淀到单机联调脚本/证据包
4) 并行硬化（非阻塞）：writer 可靠性增强（告警/限流/降载策略 + 容量压测），以不影响主链路为原则逐步补齐

## 4) 关键入口（新 AI 只读这些就能上手）

### 大局与决策（Why）

- `docs/architecture/overview.md`
- ADR：
  - `docs/architecture/adr/ADR-0001-mqtt-kafka-clickhouse-postgres.md`
  - `docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
  - `docs/architecture/adr/ADR-0003-sparse-telemetry-model.md`

### 契约（Interface，唯一权威）

- `docs/integrations/README.md`
- MQTT：`docs/integrations/mqtt/README.md`
- Kafka：`docs/integrations/kafka/README.md`
- Storage：`docs/integrations/storage/README.md`
- API：`docs/integrations/api/README.md`

### 规范（How-to + 约束）

- `docs/guides/standards/README.md`
- 合并信息包模板（每次合并必须给）：`docs/guides/standards/pull-request-howto.md`

### 当前计划（What to do）

- 路线图：`docs/features/roadmap.md`
- 启动清单：`docs/guides/roadmap/kickoff-checklist.md`

## 5) 运行与验证（任何 AI 必须会）

### 质量门禁（必过）

- `python docs/tools/run-quality-gates.py`
- `npm run lint`
- `npm run build`

### 单机联调（可选：依赖 Docker 可用）

- Compose：`infra/compose/README.md`
- 冒烟测试：`docs/guides/testing/single-host-smoke-test.md`
- 端到端冒烟一键脚本：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1`

## 6) 已知问题（不要重复踩坑）

- Rulesets / Required checks / 422：`docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`
- Git HTTPS 连接重置：`docs/incidents/INC-0006-git-https-connection-reset.md`
- DockerHub 拉镜像超时：`docs/incidents/INC-0004-dockerhub-pull-timeout.md`
