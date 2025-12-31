# 生产部署（推荐：Docker Compose）

生产环境建议用 Docker Compose 一次性拉起：数据库 + 后端 + 前端。

如果你只是做“内网演示/临时验收”，也可以先把 `AUTH_REQUIRED=false`（不需要登录）；正式上线建议一定要开启登录并配置 JWT 密钥（见下文）。

## 1) 准备环境变量

```powershell
copy infra\\compose\\env.prod.example infra\\compose\\.env
notepad infra\\compose\\.env
```

最少需要改这些（不要用默认值）：
- 数据库密码：`PG_PASSWORD`、`CH_PASSWORD`
- 登录密钥（开启登录时必须）：`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`
- 允许前端访问的域名（有域名再填）：`CORS_ORIGINS`

可选（但很有用）：
- `ADMIN_API_TOKEN`：用于“第一次创建管理员账号”
- `DB_ADMIN_ENABLED`：是否打开数据库管理接口（不建议长期打开）

## 2) 构建并启动（DB + API + Web）

```powershell
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.app.yml --env-file infra/compose/.env build
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.app.yml --env-file infra/compose/.env up -d
```

访问：
- Web：`http://localhost:3000`
- API：`http://localhost:8080/health`

说明：
- Postgres/ClickHouse 的建表 SQL 会通过 `infra/compose/docker-compose.app.yml` 自动挂载到容器（首次初始化数据目录时自动执行）。

## 3) 初始化首个用户（推荐使用 ADMIN_API_TOKEN）

1) 在 `infra/compose/.env` 里设置强随机的 `ADMIN_API_TOKEN`，然后重启 API：

```powershell
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.app.yml --env-file infra/compose/.env up -d api
```

2) 用管理员 Token 创建用户（示例，按你们需要填 roleIds）：

```powershell
$token = "<ADMIN_API_TOKEN>"
$body = @{ username="admin"; password="change-me-please"; realName="管理员" } | ConvertTo-Json
Invoke-RestMethod "http://localhost:8080/api/v1/users" -Method POST -Headers @{ Authorization="Bearer $token" } -ContentType "application/json" -Body $body
```

3) 登录 Web 后再按需要创建/分配角色权限。确认无误后可移除 `ADMIN_API_TOKEN`（降低风险）。

## 4) 打包交付

- 数据库 DDL：`docs/integrations/storage/*`
- OpenAPI：`docs/integrations/api/openapi.yaml`
- Compose：`infra/compose/docker-compose.yml` + `infra/compose/docker-compose.app.yml`

可直接运行：`powershell -ExecutionPolicy Bypass -File scripts/release/package-prod.ps1`
