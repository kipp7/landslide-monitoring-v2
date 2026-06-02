---
title: platform-runtime-stabilization
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/platform-runtime-stabilization
---

# platform-runtime-stabilization

## Status

- task: `platform-runtime-stabilization`
- state: `completed`
- updated_at: `2026-03-14`

## 1. 当前常驻启动方式

前置条件：

- 当前工作目录为仓库根目录
- `infra/compose/.env` 已存在
- Docker Desktop Linux engine 可用

命令顺序：

```powershell
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/init-clickhouse.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/create-kafka-topics.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/health-check.ps1
```

成功判据：

- `docker compose ... ps` 显示：
  - `postgres` healthy
  - `redis` healthy
  - `clickhouse` healthy
  - `kafka` healthy
  - `emqx` running
- `health-check.ps1` 返回通过
- Kafka 内部 topic `__consumer_offsets` 可见且 `describe` 正常

## 2. 可重复复验步骤

依赖：

- Docker Desktop Linux engine 可用
- `infra/compose/.env` 保持存在
- 当前仓库依赖已安装，相关 `libs/*` 与平台主链路服务已可构建

最小复验入口与顺序：

```powershell
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env ps
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/health-check.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/init-clickhouse.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/create-kafka-topics.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -ConfigureEmqx -UseMqttAuth -CreateDevice -ForceWriteServiceEnv -SkipBuild
```

成功判据：

- 基础设施 `ps + health-check` 通过
- 三个初始化脚本可重复执行且不报错
- `e2e-smoke-test.ps1` 输出 `E2E smoke test passed.`
- 证据目录正常落到 `backups/evidence/e2e-smoke-<timestamp>/`

## 3. 当前不稳定点

1. `command-events-recorder` 启动 marker 仍不稳定

- 影响：e2e 不能把它作为严格的启动完成信号
- 规避方式：当前脚本以 warning 放行，不把它作为最小闭环阻塞条件

2. Docker Desktop Linux engine 偶发短暂不可用

- 影响：脚本连续复跑时可能在 `dockerDesktopLinuxEngine` 管道阶段失败
- 规避方式：执行前先用 `docker info` 确认 engine 可用；若短暂失联，先恢复 Docker Desktop 再继续复验

3. 当前 shell 环境变量污染仍需警惕

- 影响：若直接继承当前 shell，可能出现端口或连接配置被覆盖
- 规避方式：继续使用当前版本的 `e2e-smoke-test.ps1`，让服务启动按各自 `.env` 覆盖继承环境；避免手工导出冲突环境变量