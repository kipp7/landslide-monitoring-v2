# 项目状态（Project Status，AI/人类交接入口）

目的：解决“对话窗口终止/换模型/换 AI 后不知道做到哪一步”的问题。任何 AI/人类接手本项目，**先读本页**，不需要全局搜索。

更新原则（强制）：

- 每次合并一个 PR 到 `main`，如果它改变了项目阶段/里程碑/下一步，必须更新本页。
- 本页只记录“当前状态与下一步”，历史细节放到 `docs/incidents/` 或 PR/commit 记录中。

最后更新时间：2025-12-18

## 1) 当前结论（TL;DR）

- 技术栈已冻结：后端 TypeScript（strict），MQTT→Kafka→ClickHouse + Postgres（单机 Compose）。
- 仓库治理已落地：Rulesets 强制 PR-only、必过 `docs-and-contracts`、禁强推/禁删除。
- 阶段 0 已完成：单机基础设施 + 端到端冒烟（MQTT→Kafka→ClickHouse→API）可复现，踩坑已沉淀到 `docs/incidents/`。

## 2) 当前阶段与里程碑

阶段：阶段 1（设备接入与鉴权）

M1（阶段 0：最小闭环）目标：

- MQTT ingest：设备上报 → Kafka（含 schema 校验与 DLQ）
- writer：Kafka → ClickHouse（批量写入、错误隔离）
- API：查询最新值 + 简单曲线（最少 2~3 个端点）

当前完成情况：

- ✅ ingest-service：已实现 MQTT telemetry 订阅、JSON Schema 校验、写 `telemetry.raw.v1` 与 `telemetry.dlq.v1`
- ✅ telemetry-writer：已实现消费 `telemetry.raw.v1` 并批量写入 ClickHouse（基础重试；writer 侧 DLQ 仍待决）
- ✅ API：已实现最小查询端点（`/data/state`、`/data/series`），数据源为 ClickHouse（后续可切换到 Postgres shadow）

M2（阶段 1：设备接入与鉴权）目标：

- 管理端：创建设备并生成“身份包”（`deviceId + deviceSecret`，secret 仅返回一次；服务端只存 hash）
- MQTT：设备按 `deviceId/secret` 鉴权，按 topic 做 ACL，禁越权发布；吊销设备后立即拒绝上报
- 运营：传感器字典与设备传感器声明可维护（前端不写死）

## 3) 下一步（Next Actions，按优先级）

1) 合并阶段 1 的设备管理 PR：实现 `/devices`、`/sensors` 等管理端接口（Postgres），作为 MQTT 鉴权/ACL 的数据源
2) MQTT 鉴权/ACL（阶段 1 关键）：把 EMQX authn/authz 接到后端（或单独 auth-service），并实现 revoke 立即生效
3) writer 可靠性增强：补充 writer 侧 DLQ/告警/退避策略（避免 ClickHouse 故障导致缓冲堆积）
4) Postgres shadow（后续）：为 `/data/state` 引入 `device_state`（避免每次都扫 ClickHouse），并保持与 ClickHouse 可回放一致

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

## 6) 已知问题（不要重复踩坑）

- Rulesets / Required checks / 422：`docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`
- Git HTTPS 连接重置：`docs/incidents/INC-0006-git-https-connection-reset.md`
- DockerHub 拉镜像超时：`docs/incidents/INC-0004-dockerhub-pull-timeout.md`
