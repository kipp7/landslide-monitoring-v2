# 排查与证据收集（Troubleshooting & Evidence）

目标：当基础设施或链路出问题时，能在 10 分钟内收集到足够证据定位问题，并能写出可复盘的 incident。

## 1) 基础证据清单（必收集）

从仓库根目录执行：

- 容器状态：`docker ps`
- Compose 事件：`docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env ps`
- 关键日志（只截取相关部分，避免泄露密码）：
  - `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env logs --tail=200 postgres`
  - `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env logs --tail=200 kafka`
  - `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env logs --tail=200 clickhouse`
  - `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env logs --tail=200 emqx`

## 2) 常见问题提示

### 2.1 Kafka 起不来 / 健康检查失败

可能原因：

- 端口冲突（9094 被占用）
- KRaft 集群 ID 不一致（数据目录已有旧数据）

处理建议：

- 修改 `.env` 中 `KAFKA_KRAFT_CLUSTER_ID` 后清理 `data/kafka`（注意备份）
- 或更换外部端口映射

### 2.2 ClickHouse ping 不通

可能原因：

- 初始化时间较长（首次启动）
- 数据目录权限问题

处理建议：

- 查看 ClickHouse logs，确认是否在做修复/迁移
- 确认 `DATA_DIR` 指向的磁盘可写

### 2.3 EMQX Dashboard 无法登录

可能原因：

- `.env` 没生效
- 之前容器残留了旧配置

处理建议：

- `docker compose down` 后确认容器删除，再 `up -d`
- 检查 `.env` 的 `EMQX_DASHBOARD_PASSWORD`

## 3) 记录要求（闭环）

修复后必须补齐至少一个：

- `docs/incidents/INC-xxxx-*.md`（严重/系统性问题）
- 或 GitHub Issue（一般问题）

并在文档中链接相关 commit/PR，确保“故事可追溯”。

