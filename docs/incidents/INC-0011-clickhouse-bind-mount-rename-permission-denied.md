# INC-0011 ClickHouse 在 Windows bind mount 上写入失败（rename Permission denied）

## 摘要

在 Windows/Docker Desktop 环境下，将 ClickHouse 数据目录通过 bind mount 映射到宿主机目录时，`telemetry-writer` 插入 ClickHouse 会失败，错误表现为 ClickHouse 在落盘阶段 `rename` 失败（Permission denied）。

该问题会导致写入链路中断，API 查询永远为空，阻塞端到端闭环。

## 影响范围

- 单机开发环境（尤其 Windows/Docker Desktop）使用 bind mount 作为 ClickHouse 数据目录
- 影响写入与聚合任务（所有 insert 都可能失败）

## 现象

`telemetry-writer` 日志：

- `std::exception ... filesystem error: in rename: Permission denied ... tmp_insert ...`

ClickHouse 表现为：

- 容器看起来 healthy
- 但实际 insert 失败，表中数据为 0

## 根因

ClickHouse 的存储引擎在写入时依赖底层文件系统的原子操作（例如目录/文件 rename）。在 Windows/Docker Desktop 的某些 bind mount 场景下，这类操作可能受到文件共享实现限制，导致 rename/权限错误。

## 修复方案（决策）

将 ClickHouse 数据目录从 bind mount 改为 Docker named volume（存储在 Docker VM 内），以降低 Windows 文件共享带来的不确定性：

- `infra/compose/docker-compose.yml`：`clickhouse_data:/var/lib/clickhouse`

并同步调整备份策略：

- `infra/compose/scripts/backup-offline.ps1`：额外打包 `clickhouse_data` volume 到 `backups/<timestamp>/volumes/clickhouse_data.tgz`
- 文档更新：`docs/guides/testing/*` 不再要求出现 `data/clickhouse/`

## 预防措施

- 数据库类组件（ClickHouse、Postgres、Kafka）在 Windows 上优先使用 named volume，除非明确验证过 bind mount 的可行性。
- 端到端冒烟测试必须包含“ClickHouse insert ok”验收点，避免只验证容器 health。

