# 单机：启用 JWT/RBAC（Web 登录）Bootstrap

目标：在单机环境把 `api-service` 从“开发期免鉴权/手工 token”平滑切到“JWT 登录 + RBAC 权限控制”，并保证有可追溯的运维/审计入口。

适用范围：
- 本仓库 v2 单机部署（Docker Compose）+ 本机 Node 服务启动
- 不涉及真实硬件联调（硬件按计划最后做）

## 0) 前提

- 已跑通基础设施：`infra/compose/`（Postgres/ClickHouse/EMQX/Kafka 等）
- 已初始化 Postgres DDL：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1`

## 1) 一键写入 JWT 配置（不提交到 git）

在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/enable-jwt-auth.ps1 -WriteServiceEnv
```

说明：
- 会确保 `services/api/.env` 存在（从 `.env.example` 拷贝），并写入：
  - `AUTH_REQUIRED=true`
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`（自动生成）
  - `ADMIN_API_TOKEN`（自动生成，break-glass 管理 token，用于“创建第一个用户/角色绑定”）
- `services/api/.env` 已被 `.gitignore` 忽略，不会进入远端仓库。

## 2) 启动服务

按现有单机指南启动：
- infra（Compose）：`docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d`
- services（本机进程）：参考 `docs/guides/testing/e2e-smoke-test.md` 中的启动步骤（`api-service` / `ingest-service` / `telemetry-writer` 等）

## 3) 用 break-glass token 创建第一个用户

1) 打开 Web：`/settings`，在“手动 Bearer Token”里填入 `services/api/.env` 中的 `ADMIN_API_TOKEN` 值（仅用于初始化阶段）
2) 打开 Web：`/admin/users`，创建一个用户并分配角色：
   - 推荐给第一个用户分配 `super_admin` 或 `admin`

## 4) 用 JWT 登录并停用手动 token

1) 打开 Web：`/login`，用刚创建的账号密码登录
2) 登录成功后：
   - Web 会保存 access/refresh token，并在 401 时自动 refresh 一次
   - 导航栏会按权限显示 Admin/Ops
3) 回到 `/settings` 清空“手动 Bearer Token”（不再依赖 `ADMIN_API_TOKEN`）

## 5) 常见问题

### Q1：登录接口返回 503（JWT 未配置）

确认 `services/api/.env` 中存在：
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `AUTH_REQUIRED=true`

然后重启 `api-service` 进程。

### Q2：登录成功但访问接口 403

这通常表示用户未被分配角色，或角色未绑定权限。排查顺序：
1) 确认 Postgres 已应用 RBAC 表与种子（`docs/integrations/storage/postgres/tables/02-permissions.sql` + `02a-role-permissions-seed.sql`）
2) 在 `/admin/users` 确认用户已绑定角色

## 6) （可选）命令行冒烟验证

在 api-service 已启动、且已创建用户后：

```powershell
node scripts/dev/jwt-login-smoke.js --api http://localhost:8080 --username <username> --password <password>
```
