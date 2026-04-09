---
title: single-host-runbook
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/runbooks/single-host-runbook
---

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

## 7. 中心主链标准运行线

当前单机中心主链的标准 compose 运行边界应固定为：

- `emqx`
- `kafka`
- `postgres`
- `clickhouse`
- `api`
- `web`
- `ingest-service`
- `telemetry-writer`

不再把 `ingest-service` 或 `telemetry-writer` 视为默认 host-run 特例。

## 8. 标准验收入口

每次中心部署变更后，优先用同一条脚本复核：

- 常规复核：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets`
- 完整重部署并复核：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets`

该脚本会统一执行：

- `deploy-docker-oneclick.ps1` 的 `validate` 或 `apply`
- `check-field-full-path-readiness.ps1`
- `run-field-hardware-uplink-full-proof.ps1`

标准报告输出：

- `docs/unified/reports/docker-deploy-latest.json`
- `docs/unified/reports/field-full-path-readiness-latest.json`
- `docs/unified/reports/field-hardware-uplink-full-proof-latest.json`
- `docs/unified/reports/field-center-compose-acceptance-latest.json`

## 8.1 中心运行线冻结入口

当当前阶段已经切到“中心部署与软件适配”，不要再靠人工翻 compose/env/runbook 判断中心侧是否进入可交接边界，直接用：

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-runtime-freeze.ps1 -AllowUnsafeSecrets`

这条入口会统一核对：

- `infra/compose/env.prod.example`
- `infra/compose/.env`
- `infra/compose/docker-compose.yml`
- `infra/compose/docker-compose.app.yml`
- `deploy-docker-oneclick.ps1 -ValidateOnly`
- `field-center-compose-acceptance-latest.json`
- `field-center-deployment-software-adaptation-readiness-latest.json`

标准报告输出：

- `docs/unified/reports/prod-env-checklist-latest.json`
- `docs/unified/reports/docker-deploy-latest.json`
- `docs/unified/reports/field-center-runtime-freeze-latest.json`

当前工程口径：

- `accepted = true` 表示：
  - 中心 compose 边界已经固定
  - 生产 env 检查没有缺失/占位符
  - 一键部署 validate 没有错误
  - 当前阶段 readiness 仍保持 green

## 9. 恢复顺序

中心主链异常时，优先按下面顺序恢复：

1. 基础设施容器：
- `emqx`
- `kafka`
- `postgres`
- `clickhouse`

2. 下游处理链：
- `ingest-service`
- `telemetry-writer`

3. 产品读路径：
- `api`
- `web`

4. 恢复后必须立即执行：
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets`

## 10. RK3568 现场恢复复核入口

当中心 compose 主链已经正常，但需要确认：

- RK3568 网关当前是否还在线
- board observation 是否重新回到 clean window
- `RK3568 -> center -> API/Web` cross-boundary closure 是否重新回绿

不要再手工拼接多条命令，直接用统一入口：

- 常规复核：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets`
- 受控重启后复核：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-rk3568-center-operational-recovery.ps1 -RestartGatewayService -BoardPassword <password> -AllowUnsafeSecrets`
- 严格 zero-noise 复核：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets -RequireZeroSchemaRejectedDelta`

这条入口会统一收口：

- `check-rk3568-field-gateway-runtime.ps1`
- `check-field-rk3568-center-live-closure.ps1`

标准报告输出：

- `docs/unified/reports/field-rk3568-gateway-runtime-latest.json`
- `docs/unified/reports/field-rk3568-center-live-closure-latest.json`
- `docs/unified/reports/field-rk3568-center-operational-recovery-latest.json`

如果当前不只是做一次恢复复核，而是要持续积累更长窗口证据，直接用 soak 入口：

- 单轮 soak 验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rk3568-center-soak.ps1 -Rounds 1 -IntervalSeconds 0 -BoardPassword <password> -AllowUnsafeSecrets`
- 两轮 soak：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rk3568-center-soak.ps1 -Rounds 2 -IntervalSeconds 30 -BoardPassword <password> -AllowUnsafeSecrets`
- 重启后 soak：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rk3568-center-soak.ps1 -Rounds 2 -IntervalSeconds 30 -RestartBeforeFirstRound -BoardPassword <password> -AllowUnsafeSecrets`

对应阶段性总结报告：

- `docs/unified/reports/field-rk3568-center-soak-latest.json`

当前工程口径：

- `accepted = true` 表示：
  - 中心 compose 主链仍是 `full-path-ready`
  - board observation 已重新回到 clean `60s` window
  - stable command 仍能 `acked`
  - API/Web 的 field metrics contract 仍保持 `14` 个 canonical keys
- 即时 runtime snapshot 中的：
  - `configured`
  - `degraded`
  - 历史累计 `schemaRejected`
  只作为恢复现场观测，不再单独压翻当前这条已闭合的 recovery 主线
