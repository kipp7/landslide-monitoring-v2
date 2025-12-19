# Telemetry 负载测试（单机）

目标：提供一个“可重复、可执行”的最小容量验证入口，用于评估单机链路在不同 payload/metrics 规模下的吞吐与稳定性（并为后续容量压测与降载策略验证打基础）。

注意：
- 本文档只做 **本地单机** 的开发验证，不等同于生产压测方案。
- 负载测试可能会产生大量遥测数据与 DLQ，建议在测试前确认你的数据目录/磁盘空间。

## 1) 前置条件

- 已完成基础设施启动：`docs/guides/testing/single-host-smoke-test.md`
- 需要发布 telemetry 的 device 已存在，并且（若启用 MQTT 鉴权）已拿到 `deviceSecret`
- 推荐先跑一次 e2e 冒烟，确保链路可用：`docs/guides/testing/e2e-smoke-test.md`

## 2) 快速开始（推荐）

示例 1：QoS=1 + 1 万条（轻量 metrics）

```powershell
node scripts/dev/telemetry-load-test.js `
  --mqtt mqtt://localhost:1883 `
  --device <deviceId> `
  --username <deviceId> `
  --password <deviceSecret> `
  --count 10000 `
  --qos 1 `
  --concurrency 50
```

示例 2：模拟更大的 payload（增加 meta.note 的字节数）

```powershell
node scripts/dev/telemetry-load-test.js `
  --mqtt mqtt://localhost:1883 `
  --device <deviceId> `
  --username <deviceId> `
  --password <deviceSecret> `
  --count 3000 `
  --qos 1 `
  --concurrency 30 `
  --noteBytes 2048
```

示例 3：增加 metrics key 数量（模拟“高维上报”）

```powershell
node scripts/dev/telemetry-load-test.js `
  --mqtt mqtt://localhost:1883 `
  --device <deviceId> `
  --username <deviceId> `
  --password <deviceSecret> `
  --count 2000 `
  --qos 1 `
  --concurrency 20 `
  --metricsCount 200
```

## 3) 预期结果与排查

- 正常情况下：脚本会输出 `rate_ack_s`（每秒 acked 数量），最终以 exit=0 结束。
- 若出现大量失败：优先查看 `backups/evidence/` 下的 e2e 证据包，或用 DLQ API 快速定位原因：
  - `GET /api/v1/telemetry/dlq/stats`
  - `GET /api/v1/telemetry/dlq`

常见原因（示例）：
- `payload_too_large`：单条 payload 超过 ingest 保护阈值（可调 `MESSAGE_MAX_BYTES`）
- `metrics_too_many`：metrics key 数量超过 ingest 保护阈值（可调 `METRICS_MAX_KEYS`）
- ClickHouse 不可用：writer 会进入冷却窗口（`CLICKHOUSE_UNAVAILABLE_COOLDOWN_MS`），恢复后自动重放

