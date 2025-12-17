# infra/

单机部署与运维（Docker Compose 优先）。

目标：

- 一键启动：EMQX / Kafka(KRaft) / PostgreSQL / ClickHouse / Redis
- 数据目录外置：便于备份/迁移/扩容
- 可恢复：备份与恢复流程明确（Runbook）

参考：

- `docs/guides/deployment/README.md`

