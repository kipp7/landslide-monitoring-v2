# 单机部署（Docker Compose，v2）

本目录是单机部署的**权威物料**（实现阶段也会继续沿用），目标是：

- 一键启动基础设施（单机）
- 数据目录外置（便于备份/迁移/扩容）
- 运行步骤可复现（企业化要求：可交接、可回滚）

## 1) 目录说明

- `docker-compose.yml`：基础设施（EMQX/Kafka/ClickHouse/Postgres/Redis/Kafka UI）
- `env.example`：环境变量模板（复制为 `.env`）
- `scripts/`：初始化与运维脚本（建 topic / 初始化 DDL / 离线备份）

## 2) 快速开始（Windows/PowerShell）

从仓库根目录执行：

1. 创建 env 文件（不要提交到仓库）：

   - `copy infra\\compose\\env.example infra\\compose\\.env`

2. 修改密码与数据目录：

   - 编辑 `infra/compose/.env`，至少修改 `PG_PASSWORD`、`CH_PASSWORD`、`REDIS_PASSWORD`、`EMQX_DASHBOARD_PASSWORD`、`JWT_SECRET`
   - `DATA_DIR` 默认指向仓库根目录下 `data/`（推荐保留）

3. 启动基础设施：

   - `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d`

4. 初始化数据库（首次启动后执行一次）：

   - PostgreSQL：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1`
   - ClickHouse：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-clickhouse.ps1`

5. 创建 Kafka topics（首次启动后执行一次）：

   - `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/create-kafka-topics.ps1`

## 3) 运维入口

### 3.1 Kafka UI

默认开启在 profile `ops` 下：

- 启动（含 UI）：`docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env --profile ops up -d`
- 访问：`http://localhost:8080`

### 3.2 EMQX Dashboard

- `http://localhost:18083`
- 账号密码来自 `.env` 的 `EMQX_DASHBOARD_USER/EMQX_DASHBOARD_PASSWORD`

## 4) 备份与恢复（当前为离线备份）

> 单机优先保证“能恢复”。在未引入更高级的 CH online backup 工具前，先提供离线备份方案。

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/backup-offline.ps1`

说明：

- 该脚本会 `docker compose down` 后拷贝数据目录，再 `up -d`，会有短暂停机。
- 备份产物在仓库根目录的 `backups/<timestamp>/`（已在 `.gitignore` 忽略）。

## 5) 相关文档

- 契约与 DDL 来源：
  - PostgreSQL：`docs/integrations/storage/postgres/tables/`
  - ClickHouse：`docs/integrations/storage/clickhouse/`
- 运维 runbook：`docs/guides/runbooks/README.md`

