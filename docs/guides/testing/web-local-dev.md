# Web 本地登录联调（JWT + ADMIN_API_TOKEN 引导）

目标：解决 Web（`http://localhost:3000`）与 api-service（`http://localhost:8080`）的本地联调配置问题，并说明“第一次登录密码从哪来”。

## 0) 前置

- 基础设施已启动并初始化（Postgres/Redis/ClickHouse/EMQX/Kafka）：`docs/guides/testing/single-host-smoke-test.md`
- Node.js / npm 已可用

## 1) 准备 api-service 的本地机密（gitignored）

从仓库根目录执行：

1. 启用 JWT（生成 `JWT_*_SECRET`）并生成 break-glass 的 `ADMIN_API_TOKEN`：

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/enable-jwt-auth.ps1 -WriteServiceEnv`

2. 构建并启动 api-service：

- `npm -w services/api run build`
- `npm -w services/api run start`

## 2) 写入 Web 的本地环境变量（gitignored）

把 Web 指向本机 api-service，并（可选）把 `ADMIN_API_TOKEN` 作为 Web 的默认 Bearer：

- `powershell -ExecutionPolicy Bypass -File infra/compose/scripts/configure-web-dev-env.ps1 -WriteBearerTokenFromAdmin`

然后启动 Web：

- `npm -w apps/web run dev`

## 3) “登录密码是什么？”——第一次需要先创建用户

v2 不提供固定默认账号/密码（避免把弱口令变成“长期事实标准”）。第一次联调建议流程：

1. 先用 `ADMIN_API_TOKEN` 进入管理页创建用户：`http://localhost:3000/admin/users`
2. 给新用户设置密码后，再走登录页：`http://localhost:3000/login`
3. 登录成功后，建议移除 Web 的 `NEXT_PUBLIC_API_BEARER_TOKEN`（避免长期使用 break-glass token）

