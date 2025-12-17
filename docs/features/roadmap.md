# 重构技术栈与路线图（v2）

本项目决定不保留旧数据库/旧数据，后端从 0 重新设计，优先解决“硬编码、耦合、不可扩展、不可回放”的系统性问题。

## 1. 设计原则

1) 可扩展：按最坏情况设计链路能力（吞吐/乱序/重复/积压），实现不写死。  
2) 不频繁改表：新增传感器/指标不靠改表结构。  
3) 契约优先：API 文档先行，前端/Flutter 只依赖 API。  
4) 规则配置化：阈值/组合条件/窗口/防抖回差全部配置化并版本化。  
5) 单机可恢复：不做高可用，但必须可备份、可恢复、可运维。  

## 2. 技术栈（已确定）

### 后端与基础设施

- 语言：TypeScript（strict）
- API：Express + TypeScript（可在实现阶段评估 NestJS）
- MQTT Broker：EMQX（自建）
- 消息总线：Kafka（单机 KRaft）
- 存储：
  - PostgreSQL：元数据/规则/告警/权限/审计
  - ClickHouse：遥测时序（telemetry）
  - Redis：缓存/去重/限流计数
- 容器：Docker Compose（单机）

### Web/Flutter（计划保持不变）

- Web：Next.js + TypeScript
- App：Flutter + Bloc

## 3. 目标架构（概要）

写路径（设备上报）：

MQTT → ingest-service → Kafka → telemetry-writer → ClickHouse  
                         └→ rule-engine-worker → Postgres(alert_events) → notify-worker

读路径（管理端/看板）：

API → Postgres（设备/规则/告警/权限）  
API → ClickHouse（曲线/聚合）  
API → SSE/WS（实时告警/最新值）

## 4. 阶段路线图（建议）

### 阶段 0：规范冻结（已完成/持续维护）

- 冻结后端规范：身份鉴权、Topic/Envelope、Kafka topic、存储模型、规则引擎能力范围
- 输出（架构/契约/指南）：`docs/architecture/`、`docs/integrations/`、`docs/guides/`
- 门禁：`python docs/tools/validate-contracts.py`

### 阶段 1：基础设施落地（建议 1~2 周，开始实现）

- Compose 拉起 EMQX/Kafka/CH/PG/Redis
- 创建 topic、建库建表（v2）
- 输出：可跑通的本地环境与 runbook

开始条件（满足即可开工）：

- 契约校验脚本通过（持续保持）
- 单机资源允许先用“低配置模式”，但必须保留“未来增配即可扩容”的可迁移性（例如数据目录外置、可备份恢复）

### 阶段 2：后端骨架与闭环（2~4 周）

- ingest-service（MQTT → Kafka）
- telemetry-writer（Kafka → ClickHouse）
- API（devices/stations/sensors/telemetry 查询）
- rule-engine-worker（基础阈值/窗口/防抖）

关键里程碑（建议顺序）：

1) 设备能稳定接入并上报（MQTT→Kafka→ClickHouse 写入成功）
2) API 能查询设备最新值与曲线（/data/state、/data/series）
3) 规则引擎能基于 DSL 触发事件并被 API 查询（/alerts、/alert-rules）

### 阶段 3：复杂规则与 AI 插件（持续迭代）

- 组合规则、多传感器联动、缺失策略
- 预测模块（异步 worker + 置信度 + 可解释字段）

### 阶段 4：Web/App 去硬编码（与阶段 2 并行）

- 前端仅依赖 API/字典表渲染，不写死阈值/设备映射
- App 同样遵循“字典 + DTO”渲染（见 `features/prd/mobile-app.md`）

### 阶段 5：单片机端适配（与阶段 2 并行/稍后启动）

- 固件按 MQTT schema 对齐上报与回执（examples + schema 校验）
- 完成断电安全身份存储与重连退避（避免连接风暴）
- 支持最小命令集（set_config / ping / reboot）

参考：

- PRD：`docs/features/prd/device-firmware.md`
- 固件集成规范：`docs/integrations/firmware/README.md`

## 5. 主要风险与对策

- 单机资源不足：通过保留期、批量写入、限制查询范围、聚合表、降级策略控制增长。
- 断电/重复上报：依赖幂等键与 received_ts，DLQ 隔离坏数据。
- 规则误报：防抖/回差/窗口策略 + 回放回测机制。
