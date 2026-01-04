# API/鉴权/数据格式快速测试（给联调用）

这份文档的目标很简单：让你能**快速确认接口能不能通**、**有没有带上 token**、**数据格式对不对**。

你可以选任意一种方式：

- 用 Web 自带的可视化调试页（最省事）
- 用 Postman（可视化、更适合反复点点点）
- 用 PowerShell（最直接）

---

## 0) 先确认：后端是否真的启动了

打开一个 PowerShell，执行：

```powershell
Invoke-WebRequest "http://localhost:8080/health" -UseBasicParsing
```

看到 `StatusCode : 200` 就说明后端在跑。

---

## 1) token 是什么？我为什么总是 401？

你可以把 token 理解成“通行证”。  
多数接口如果**没带通行证**，就会返回 `401 未认证`。

本地联调（默认配置）通常可以直接用一个固定值：

- `Authorization: Bearer dev`

---

## 2) 用 Web 自带的“可视化调试页”（推荐）

1. 启动 Web：`npm -w apps/web run dev`
2. 打开：`http://localhost:3000/ops/debug-api`
3. 点页面里的“一键连通性测试”

如果页面提示你“需要登录/需要 token”：

- 打开 `apps/web/.env.local`
- 确保有两行（没有就加上）：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_API_BEARER_TOKEN=dev
```

然后重启 Web。

---

## 3) 用 Postman（可视化测试套件）

仓库里已经准备好可直接导入的文件：

- Collection：`docs/tools/postman/lsmv2.postman_collection.json`
- Environment：`docs/tools/postman/lsmv2.local.postman_environment.json`

使用步骤：

1. 打开 Postman → Import → 选择上面两个文件导入
2. 右上角选择环境 `lsmv2-local`
3. 直接点请求运行（默认 token = `dev`）

---

## 4) 用 PowerShell 手动测（最直接）

### 4.1 测数据库连通（后端会返回 Postgres/ClickHouse 状态）

```powershell
Invoke-WebRequest "http://localhost:8080/api/inspect-db" -UseBasicParsing -Headers @{ Authorization="Bearer dev" } |
  Select-Object -ExpandProperty Content
```

### 4.2 测一个常见页面会用到的接口

```powershell
Invoke-WebRequest "http://localhost:8080/api/v1/anomaly-assessment?timeWindow=24" -UseBasicParsing -Headers @{ Authorization="Bearer dev" } |
  Select-Object -ExpandProperty Content
```

---

## 5) 最常见报错对照表

- `502/503`：后端没启动，或 `NEXT_PUBLIC_API_BASE_URL` 配错了
- `401`：没带 token（或 token 为空）
- 页面一直 Loading：通常是某个接口一直失败（打开浏览器控制台看是哪个 URL）
- `Module not found ... next/dist/pages/_app.js`：多半是 `apps/web/node_modules/next` 目录“残了”，删掉它后在仓库根目录执行 `npm install` 再试
