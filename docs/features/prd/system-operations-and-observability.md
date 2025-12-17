# PRD：系统运维与可观测性（单机可恢复）

## 1. 背景

v2 采用多组件链路（MQTT/Kafka/PostgreSQL/ClickHouse/Redis），单机部署下更需要“可观测 + 可恢复 + 可控增长”，否则在高频上报与断电重连的最坏情况下会失控。

## 2. 目标

- 提供最小可用的系统状态接口（组件健康、版本、运行时指标摘要）。
- 提供容量治理能力（保留策略可配置、查询限额可配置）。
- 提供可执行 runbook（备份/恢复/故障处理）。

## 3. 功能需求

- 系统状态与配置接口：见 `docs/integrations/api/07-system.md`
- 单机 runbook：见 `docs/guides/runbooks/single-host-runbook.md`
- 风险清单：见 `docs/architecture/risk-register.md`

## 4. 验收标准

- 能通过 `/system/status` 一次性看到各组件状态（不要求 HA，但要求可定位问题）。
- 能通过系统配置限制单次查询范围与点数，避免 ClickHouse 被全表扫。
- 具备可执行的备份与恢复流程（至少能恢复 PostgreSQL + ClickHouse 的关键数据）。

## 5. 依赖

- API：`docs/integrations/api/07-system.md`
- Runbook：`docs/guides/runbooks/single-host-runbook.md`

