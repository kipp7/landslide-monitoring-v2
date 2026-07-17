---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/services/readme
---

# services/

云端后端服务层（可运行的进程/容器）。

原则：

- 以 “MQTT → Kafka → ClickHouse + Postgres” 为主链路（见 ADR）
- 边界层必须做输入校验（HTTP/MQTT/Kafka）
- 所有服务必须可观测（traceId、结构化日志、关键指标）

核心链路：

- `services/api/`：Windows 桌面端使用的 HTTP API
- `services/ingest/`：MQTT → Kafka（schema 校验、DLQ）
- `services/telemetry-writer/`：Kafka → ClickHouse（批量写入）
- `services/rule-engine-worker/`：规则执行与事件化告警
- `services/command-*`：设备命令下发、ACK、事件记录、通知与超时处理
- `services/ai-prediction-worker/`：区域模型匹配与预测
- `services/alert-notify-worker/`：告警通知
- `services/presence-recorder/`、`services/telemetry-dlq-recorder/`：在线状态与死信记录

单机部署入口位于 `infra/compose/`。RK3568 板端程序位于 `edge/rk3568-gateway/`，不在本目录重复维护。
