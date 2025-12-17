# 单机基础设施冒烟测试（必须通过）

适用范围：`infra/compose/` 的 Docker Compose 基础设施。

目标：在开始写 `services/*` 之前，确认基础设施可启动、可初始化、可复位（可恢复）。

## 0) 前置条件

- 已安装 Docker Desktop（Windows）
- 已安装 Docker Compose v2（`docker compose` 可用）

## 1) 初始化步骤（首次）

从仓库根目录执行：

1. 创建 `.env`（不要提交）：

- `copy infra\\compose\\env.example infra\\compose\\.env`

2. 修改密码（强制）：

- 打开 `infra/compose/.env`，将所有 `change-me` 替换为强密码

3. 启动基础设施：

- `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d`

4. 初始化 DDL（首次必须）：

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1`
- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-clickhouse.ps1`

5. 创建 Kafka topics（首次必须）：

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/create-kafka-topics.ps1`

## 2) 检查点（验收标准）

### 2.1 容器健康

- `docker ps` 中 `lsmv2_postgres/redis/clickhouse/emqx/kafka` 处于 running
- `kafka-ui` 只有在 `--profile ops` 时启动

### 2.2 关键端口可访问

- PostgreSQL：`localhost:5432`
- Redis：`localhost:6379`
- ClickHouse HTTP：`http://localhost:8123/ping` 返回 `Ok.`
- EMQX Dashboard：`http://localhost:18083`
- Kafka 外部 listener：`localhost:9094`

### 2.3 数据目录外置生效

确认仓库根目录出现（或你在 `.env` 指定的目录出现）：

- `data/postgres/`
- `data/redis/`
- `data/clickhouse/`
- `data/kafka/`

### 2.4 可恢复性（最小）

执行一次离线备份，且服务能恢复：

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/backup-offline.ps1`
- 备份产物应出现在：`backups/<timestamp>/data/`

## 3) 失败处理（必须记录）

如果任一步失败，必须记录到：

- `docs/incidents/`（严重问题，影响推进）
- 或 `GitHub Issues`（一般问题）

并至少包含：

- 复现步骤
- `docker compose logs` 输出片段（注意不要包含密码）
- 系统环境信息（OS、Docker 版本）

