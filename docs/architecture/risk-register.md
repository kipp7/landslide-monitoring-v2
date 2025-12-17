# 风险清单与应对（单机按最坏情况设计）

本文件用于提前暴露“最坏情况下会出什么问题”，并给出工程化应对策略。目标不是一次把系统做成“完美”，而是把**不可控的坑**提前收敛为**可操作的策略**（参数、容量、降级、流程）。

## 1. 吞吐与容量（最容易低估）

典型估算公式：

- 设备数 `N`
- 上报频率 `F`（条/秒/设备）
- 单条 payload `S`（字节）
- 日数据量（近似）：`N * F * S * 86400`

应对：

- 写链路必须可削峰：MQTT → Kafka → 批量写入 ClickHouse
- Kafka/ClickHouse 必须配置保留策略（按时间/按大小），并写入 runbook（见 `docs/guides/runbooks/single-host-runbook.md`）
- API 查询必须限流与限范围（避免 ClickHouse 全表扫）

## 2. MQTT 连接风暴（断电/弱网常态）

风险：

- 断电重启导致大量设备同时重连，broker 与鉴权接口被打爆

应对：

- broker 侧启用连接限制与退避策略（实现阶段配置）
- 后端鉴权必须快：缓存设备状态/secret hash 校验结果（短 TTL），避免每次都打数据库
- 设备端实现随机退避（固件侧约束）

## 3. 乱序/重复/seq 重置（会长期存在）

风险：

- 设备 `event_ts` 漂移或乱序；断电后 `seq` 可能重置；重试导致重复上报

应对：

- 双时间戳：`event_ts`（展示）与 `received_ts`（窗口/在线）
- 幂等键优先 `device_id + seq`；若 seq 不可靠，必须有临时去重策略与升级计划（见 `docs/guides/standards/backend-rules.md`）
- DLQ 记录坏数据与原因，便于回放/修复

## 4. Kafka 单机（KRaft）硬限制

风险：

- 单机 Kafka 没有副本，磁盘满/坏盘会直接导致写链路停摆
- topic 保留策略不当会吃满磁盘

应对：

- 明确 Kafka 的定位：短期缓冲 + 回放日志（不是长期存储）
- 设定保留（time/size）并纳入 runbook
- 监控 lag 与磁盘占用，提前触发降级（延迟变大但不丢数据）

## 5. ClickHouse 写入与后台合并压力

风险：

- 小批量写入导致 part 太多、merge 压力大，影响写入与查询

应对：

- writer 必须批量写入（合并 batch）
- 合理分区与 TTL（见 `docs/integrations/storage/clickhouse/01-telemetry.sql`）
- 热查询走聚合表/缓存，避免直接扫 raw

## 6. 规则引擎与 AI（阻塞风险）

风险：

- 规则/算法处理慢会拖累写链路，甚至导致设备上报不可用

应对：

- 规则引擎异步消费 Kafka，输出事件（`alert_events`），不直接阻塞写入
- AI/预测必须可超时/可降级（失败不影响主链路）

## 7. 契约漂移（前后端各写一份）

风险：

- API/MQTT/Kafka/存储/DSL 多处同时维护，最后必然不一致

应对：

- `docs/integrations/` 作为唯一契约来源
- 变更按清单同步（`docs/guides/ai/checklists.md`）
- 关键决策必须写 ADR（`docs/architecture/adr/`）

