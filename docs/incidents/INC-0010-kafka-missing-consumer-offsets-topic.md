# INC-0010 Kafka 缺失 `__consumer_offsets` 导致 consumer group 不可用

## 摘要

在单机 Kafka（KRaft）配置中关闭了 topic 自动创建（`KAFKA_AUTO_CREATE_TOPICS_ENABLE=false`）。在该组合下，内部 topic `__consumer_offsets` 没有被自动创建，导致：

- Kafka consumer 无法正常加入 group / 提交 offset
- `telemetry-writer` 虽然进程在跑，但无法稳定消费或无插入日志

## 影响范围

- 所有需要 consumer group 的服务（`telemetry-writer`、未来的规则引擎/告警 worker 等）

## 现象

- `kafka-consumer-groups.sh --describe` / `--list` 报超时或 coordinator 断连
- Kafka 日志出现大量 `Sent auto-creation request for Set(__consumer_offsets)` 相关信息
- 写入端（producer）可能看起来正常，但消费端“没有任何动作”

## 根因

在关闭自动创建 topic 的情况下，`__consumer_offsets` 未自动创建；consumer group 所依赖的 offsets 存储不可用，导致消费链路不可用。

## 修复方案

在基础设施初始化脚本 `infra/compose/scripts/create-kafka-topics.ps1` 中显式创建 `__consumer_offsets`：

- partitions：50（保持与常见默认接近）
- replication-factor：1（单机）
- `cleanup.policy=compact`

并确保该脚本属于“首次必须执行”的初始化步骤。

## 预防措施

- 单机 Kafka 也必须把 `__consumer_offsets` 当成“系统必备依赖”，纳入初始化脚本，而不是依赖隐式行为。
- 在端到端冒烟测试中增加“消费端插入 ClickHouse 成功”的验收点（否则容易漏掉 consumer group 故障）。

