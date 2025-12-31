# 本地启动（Windows / PowerShell）

## 端口约定

- Web：`http://localhost:3000`
- API：`http://localhost:8080`

## 前置条件

- Node.js `>= 20`（仓库根 `package.json#engines`）
- Docker Desktop（可选；需要时用于 Postgres/ClickHouse）

## 方式 A：一键启动（推荐）

第一次运行先装依赖（只需一次）：

```powershell
cd "E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2"
npm install
```

然后从仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev/start-local.ps1 -ForceKillPorts
```

可选参数（常用）：

- 已经装过依赖了，不要自动 `npm install`：`-SkipInstall`
- 不启 Docker（你自己已起 DB）：`-SkipDocker`
- 不跑建表（数据库表结构初始化）：`-SkipInit`
- 不灌 demo 数据（给数据库塞一些演示数据）：`-SkipSeed`
- 不自动打开浏览器：`-NoBrowser`

启动完成后：

- Web：`http://localhost:3000/analysis`
- API 健康检查：`http://localhost:8080/health`

一键自检（可选，推荐跑一下确认接口通了）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev/check-local.ps1
```

## 方式 B：手动启动（可选）

### 1) 安装依赖（只需一次）

```powershell
cd "E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2"
npm install
```

### 2) 启动数据库（Docker Compose）

```powershell
cd "E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2"
copy infra\\compose\\env.example infra\\compose\\.env
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d postgres clickhouse

# 首次启动后执行一次：建表（初始化数据库表结构）
powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1
powershell -ExecutionPolicy Bypass -File infra/compose/scripts/init-clickhouse.ps1

# 可选：灌 demo 数据（设备/基准点/遥测）
powershell -ExecutionPolicy Bypass -File infra/compose/scripts/seed-demo.ps1
```

> 说明：如果你们本地还开了其他服务，占用 8080/3000 很常见；建议用一键启动脚本的 `-ForceKillPorts` 自动清掉占用。

### 3) 启动后端（API）

```powershell
cd "E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2"
npm -w services/api run build
npm -w services/api run start
```

### 4) 启动前端（Web）

另开一个 PowerShell：

```powershell
cd "E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2\apps\web"
$env:NODE_OPTIONS="--max-old-space-size=8192"
node "..\..\node_modules\next\dist\bin\next" dev --port 3000
```

## 鉴权（开发最省事方式）

很多接口需要“登录/认证”。为了本地开发省事，我们用一个固定的通行证 `dev` 先把流程跑通（脚本已自动写入 `apps/web/.env.local`）：

- Web：`NEXT_PUBLIC_API_BEARER_TOKEN=dev`
- API 调试示例：

```powershell
Invoke-WebRequest "http://localhost:8080/api/inspect-db" -UseBasicParsing -Headers @{ Authorization="Bearer dev" } | Select-Object -ExpandProperty Content
```

## 常见问题

- 端口占用（以 8080 为例）：

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | Format-Table -AutoSize
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8080 -State Listen).OwningProcess -Force
```

- Docker 报 `docker_engine` 找不到：先启动 Docker Desktop（或用 `-SkipDocker`）。
- 前端启动报 Turbopack 错误（例如 `Next.js package not found`）：用不带 Turbopack 的方式启动：

```powershell
cd "E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2\apps\web"
npm run dev:webpack
```

- 页面请求走错 API BaseUrl：清空浏览器运行时配置：

```js
localStorage.removeItem('LSMV2_API_BASE_URL')
localStorage.removeItem('LSMV2_API_BEARER_TOKEN')
location.reload()
```
