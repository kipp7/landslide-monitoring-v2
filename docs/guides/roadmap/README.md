# guides/roadmap/

本目录回答三个问题：

1) 下一步怎么做（可执行清单）  
2) 什么时候开始（开始条件/里程碑）  
3) App/单片机端如何跟随后端重构（适配策略）  

## 0. 我们已经完成了什么（阶段 0）

- 契约优先的文档结构与入口已建立（Docs Hub）
- API/MQTT/Kafka/Rules/Storage 契约已具备机器校验能力
- 校验脚本：`python docs/tools/validate-contracts.py`

## 1. 什么时候开始？

从现在开始即可进入“阶段 1：基础设施落地”，不需要更多前置确认。

开始条件（必须满足）：

- `python docs/tools/validate-contracts.py` 通过
- 明确单机部署形态（Docker Compose）与数据目录规划（可备份/可迁移）

建议先完成“启动前检查清单”，避免流程/环境缺失导致返工：

- `docs/guides/roadmap/kickoff-checklist.md`

## 2. 下一步怎么做（按优先级）

### 2.1 基础设施（先做，避免后面返工）

- 拉起：EMQX / Kafka(KRaft) / PostgreSQL / ClickHouse / Redis
- 初始化：
  - PostgreSQL 执行 DDL（按编号）
  - ClickHouse 建表与 TTL/聚合表
  - Kafka 创建 topic（含 DLQ）
- 输出：
  - `guides/deployment/` 增加“一键启动 + 数据目录 + 备份恢复”runbook

### 2.2 后端闭环（必须先跑通最小链路）

- ingest-service：MQTT → Kafka（校验 schema，失败进 DLQ）
- telemetry-writer：Kafka → ClickHouse（批量写入、错误隔离）
- API：/devices /stations /sensors /data/state /data/series
- rule-engine-worker：读取 Kafka/ClickHouse，写入 alert_events

### 2.3 Web/App（并行，但不能先于契约）

- Web/App 都以 OpenAPI DTO 为准（禁止自定义字段映射）
- 传感器显示名/单位/枚举都来自 `/sensors`
- 规则编辑（若有）以 DSL JSON 为唯一状态（避免丢字段）

### 2.4 单片机端（并行/稍后）

- 先对齐协议（schema + examples），再写业务采样
- 优先实现：身份存储 + 重连退避 + telemetry 上报 + command/ack
- 具体规范：`integrations/firmware/README.md`

## 3. 里程碑（建议验收点）

- M1（基础链路）：设备上报 → Kafka → ClickHouse 落库成功（含 DLQ）
- M2（可查询）：API 可查询最新值与 1h 曲线；前端不写死传感器
- M3（可告警）：规则 DSL 可发布版本，告警事件可回放，APP 可 ACK/RESOLVE
- M4（可运维）：备份恢复脚本可用；关键指标（积压/写入/错误率）可观测

## 4. 关键引用

- 路线图：`docs/features/roadmap.md`
- 质量门禁：`docs/guides/standards/quality-gates.md`
- App PRD：`docs/features/prd/mobile-app.md`
- 固件 PRD：`docs/features/prd/device-firmware.md`
