# 单机运维 Runbook（可恢复优先）

单机无法做到真正高可用（机器宕机就全停）。本 Runbook 的目标是：可观测、可恢复、可控增长。

## 1. 单机服务清单（Compose）

- EMQX（MQTT）
- Kafka（KRaft 单节点）
- PostgreSQL
- ClickHouse
- Redis
- （后续）api/ingest/writer/rule-engine/notify 服务

## 2. 数据保留与容量控制（必须）

- Kafka：只作为“短期缓冲 + 回放”，设置保留策略（按时间/按大小）
  - 建议：保留 1~3 天或固定大小（视磁盘而定）
- ClickHouse：
  - 原始数据 `telemetry_raw` 设置 TTL（例如 30 天，可配置）
  - 规划聚合表（1m/1h）做长期保留（例如 1 年）
- PostgreSQL：
  - 规则/告警/审计保留更久（按需要）

## 3. 备份策略（必须写清楚）

- PostgreSQL：`pg_dump`（全量） +（可选）WAL 增量；至少保证“每天全量备份”
- ClickHouse：按分区备份（导出/备份工具），至少保证“每周全量/每天增量”的可执行方案
- 备份必须可恢复演练（至少月度一次）

### 3.1 离线备份/恢复（当前可执行基线）

> 单机 MS01 优先交付“能恢复”。当前采用离线方式：备份/恢复会短暂停机。

- 备份：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/backup-offline.ps1`
- 恢复：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/restore-offline.ps1 -BackupPath backups/<timestamp>`

恢复后建议立即验证：

- 运行基础设施健康检查：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/health-check.ps1`
- 运行端到端冒烟：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1`

## 4. 监控指标（最小集合）

- Kafka：topic lag、磁盘占用、生产/消费速率
- ClickHouse：写入延迟、查询耗时、磁盘占用、后台 merge 压力
- PostgreSQL：连接数、慢查询、磁盘占用
- EMQX：在线连接数、消息吞吐、鉴权失败率
- 服务：ingest 吞吐、规则耗时、告警产出率、错误率

## 5. 降级策略（不丢数据优先）

- 队列积压过大：
  - 降低实时推送频率（SSE/WS 采样）
  - 规则计算可延迟，但不能丢数据
- ClickHouse 压力大：
  - 写入优先；查询走聚合/缓存
  - 限制单次查询时间范围与点数（API 层做保护）

## 6. 故障处理（常见场景）

- 设备频繁断电重连：
  - broker 侧启用连接退避/限速策略
  - 后端以幂等键去重，避免重复写入
- 磁盘占用增长：
  - 检查 Kafka 保留策略是否生效
  - 检查 ClickHouse TTL 是否生效
  - 检查日志是否无限增长（日志必须轮转）
