# INC-0007：Docker Compose 中 Kafka 镜像 tag 不存在（manifest unknown）

状态：已修复（通过 PR 替换镜像并增强脚本兼容性）

## 1) 影响

- `infra/compose/docker-compose.yml` 无法启动 Kafka
- 端到端链路（MQTT→Kafka→ClickHouse→API）被阻塞，所有后续联调无法进行

## 2) 现象

执行：

- `docker compose -f infra/compose/docker-compose.yml --env-file <env> up -d`

报错：

- `manifest for bitnami/kafka:3.7 not found: manifest unknown`

## 3) 根因

- Compose 中使用了 `bitnami/kafka:3.7`，但该 tag 在当前环境下不可用（Docker 返回 manifest unknown）。
- 与网络/镜像加速不同：这是“tag 本身不存在/不可解析”的确定性错误，即使网络正常也会失败。

## 4) 解决方案

- 将 Kafka 镜像改为 `apache/kafka:3.7.0`（可拉取、官方镜像）
- 同步更新：
  - `infra/compose/env.example`：KRaft `CLUSTER_ID` 变量
  - `infra/compose/scripts/health-check.ps1`：镜像检查列表
  - `infra/compose/scripts/create-kafka-topics.ps1`：使用容器内 `/opt/kafka/bin/kafka-topics.sh`（避免 PATH 不一致）
  - `docs/guides/testing/troubleshooting-and-evidence.md`：变量名对齐

## 5) 预防措施

- 基础设施镜像必须固定到“确实存在”的版本 tag（建议按次要版本/补丁版本固定，例如 `3.7.0`）。
- 每次修改 `infra/compose/docker-compose.yml` 后，必须至少验证一次：
  - `docker compose up -d`
  - `infra/compose/scripts/health-check.ps1`
  - `infra/compose/scripts/init-postgres.ps1`
  - `infra/compose/scripts/init-clickhouse.ps1`
  - `infra/compose/scripts/create-kafka-topics.ps1`
