# 协调看板

## 目标

本文件是当前项目的**唯一协调真值板**。  
只看这一个文件，就能知道当前状态、当前阻塞、当前派发。

## 真值来源

后续统一按以下优先级判断状态：

1. `docs/unified/reports/*.md`
2. `docs/journal/2026-03.md`
3. 本文件

补充规则：

- 模板内容不算有效落盘
- 只有写出本轮**实际检查 / 实际结果 / blocker / next step**，才算有效 checkpoint

## 执行模式

- 当前默认执行模式：**单线程主推进**
- 默认由总协调器直接规划和执行
- 仅在用户明确要求时，才重新启用并发

## 状态定义

- `ready`：任务已布置，但尚未形成本轮有效落盘
- `in_progress`：已有真实改动，但当前轮证据还不足以收口
- `blocked`：已形成有效 checkpoint，但主要问题卡在契约、数据、环境或外部依赖
- `checkpointed`：已有阶段性落盘，方向正确，但离完成还差最后关键一步
- `completed`：已具备完整落盘证据，可结束当前轮

## 当前阶段

- 阶段：第五轮
- 当前主策略：**先梳理前端依赖接口、后端实现与数据库/seed/查询链路的真实打通情况**

## 当前四线状态

### W1 `platform-runtime-stabilization`

- 工作树：`platform-restore-check`
- 状态：`completed`
- 依据：
  - 主线 `reports/platform-runtime-stabilization.md` 已同步为有效当前态验收稿
  - 已明确写出：
    - 常驻启动方式
    - 可重复复验步骤
    - 当前不稳定点

### W2 `desk-live-issues-fix`

- 工作树：`desk-api-align`
- 状态：`completed`
- 依据：
  - 主线 `reports/desk-live-issues-fix.md` 已同步为有效当前态 checkpoint
  - 主线已补：
    - `GET /api/v1/dashboard/weekly-trend`
    - `GET /api/dashboard/summary`
    - `GET /api/dashboard/weekly-trend`
    - `GET /api/system/status`
  - 主线 `GET /api/v1/system/status` 已补 `source/note/items[]`
  - `npm -w services/api run build` 已通过
  - 原先的两项数据质量问题：
    - 中文 seed 乱码
    - 孤立设备缺少 `stationId/stationName`
    已通过上游治理修复

### W3 `gnss-demo-data-fix`

- 工作树：`gnss-protocol`
- 状态：`completed`
- 依据：
  - 主线 `reports/gnss-demo-data-fix.md` 已同步为有效当前态验收稿
  - 已完成：
    - 中文 seed 编码修复
    - 孤立 `smoke-device` 清理
    - `DEMO001` 站点元数据补齐
    - baseline demo 质量字段补齐
    - `gps_altitude` 遥测补齐

### W4 `algo-worker-online-replay`

- 工作树：`algo-inventory`
- 状态：`completed`
- 依据：
  - 主线 `reports/algo-worker-online-replay.md` 已同步为有效当前态验收稿
  - 已明确写出：
    - 在线执行入口
    - 在线验证结果
    - blocker 已解除 / 本阶段无功能性 blocker
  - 真实结果包括：
    - `api-service` 健康检查 `200`
    - AI worker 查询侧已有 `low` / `high` 风险记录
    - legacy replay 查询侧返回 `hasBaseline=true`、`totalPoints=12`、`validPoints=12`、`trend=increasing`

## 当前总判断

- 已完成：
  - W1
  - W2
  - W3
  - W4

## 当前辅助输入

### 来自 `desk-consumer-recheck`

- Desk 当前正式期待形状已收口为：
  - `weeklyTrend`：`labels/rainfallMm/alertCount/source/note`
  - `system status`：`source/note/items[]`
- Desk 线内部的“诚实降级”已完成，后续不再继续扩大 fallback

### 来自 `platform-dashboard-contract-smoke`

- 现有平台 runbook 已覆盖：
  - `/api/v1/system/status`
  - `/api/v1/dashboard`
- 主线补齐 `weeklyTrend` 后，可继续纳入同级 smoke / e2e 留证

### 来自 `weekly-trend-semantics-audit`

- `weeklyTrend` 当前真实语义应视为：
  - `ops_weekly_summary`
  - 近 7 天按日聚合的雨量与告警事件摘要
- 不应与：
  - GNSS 形变趋势
  - 风险等级趋势
  - replay 位移趋势
  混用

## 当前主推进

- **`frontend-formal-entry-cleanup` 已完成当前轮目标**

当前依据：

1. `seed-demo-truth-unify` 已完成
2. 前端正式入口仍混有 legacy/demo 页面
3. 当前最适合继续按小步快跑方式收口

## 当前派发结论

### 当前主推进

- 下一轮应转入 legacy/demo 页面本体清理

### 当前不再作为主推进

- W1：已完成
- W2：已完成
- W3：已完成
- W4：已完成

## 纠偏说明

### W1

- 误判根因：worktree → mainline 未同步
- 当前已纠偏为：`completed`

### W2

- 误判根因：worktree → mainline 未同步
- 当前已纠偏为：`completed`

### W3

- 误判根因：
  - worktree → mainline 未同步
  - 有效证据承载点最初不在 `gnss-demo-data-fix.md`
- 当前已纠偏为：`completed`

### W4

- 误判根因：worktree → mainline 未同步
- 当前已纠偏为：`completed`

## 当前执行要求

- 后续不再默认并发扩散
- 当前先基于已完成的入口收口，继续清理仍挂在正式链路里的 legacy/demo 页面本体

## 2026-03-16 Direction Override

- 用户已明确：当前要做的是桌面端，不是 Web
- 当前主推进从现在开始切换为：`desk-backend-data-closure`
- 当前执行约束：
  - `apps/desk` 前端冻结，不再继续改 UI
  - 优先处理数据库、后端接口、算法与数据链路打通

### 当前执行顺序

1. `desk-api-runtime-alignment`
2. `desk-core-data-closure`
3. `desk-gps-chain-closure`
4. `desk-algo-query-closure`
5. `desk-http-live-proof`

### 当前进度

- `desk-api-runtime-alignment`：`completed`
  - 当前运行端口已确认：
    - Desk：`5174`
    - API：`8081`
  - 当前可直接进入下一步：`desk-core-data-closure`
- `desk-core-data-closure`：`completed`
  - 当前已补 Desk legacy 兼容接口：
    - `GET /api/devices`
  - 当前已完成真实返回留证：
    - `/api/devices`
    - `/api/devices?station_id=<stationUuid>`
  - 当前已补完整核心链接口留证：
    - `/api/dashboard/summary`
    - `/api/dashboard/weekly-trend`
    - `/api/system/status`
    - `/api/monitoring-stations`
    - `/api/devices`
  - 当前剩余差异：
    - `system status` 语义与主线 Desk 旧消费模型仍不一致
- `desk-gps-chain-closure`：`completed`
  - `GET /api/baselines` 已真实返回
  - `GET /api/gps-deformation/{deviceId}?days=7` 已真实返回
  - 当前根因已定位为：
    - demo GPS 数据最新时间早于 legacy 默认 `24h` 查询窗口
  - 已通过刷新 demo seed 修复：
    - `hasLatestData=true`
    - `totalPoints=240`
    - `validPoints=240`
- `desk-algo-query-closure`：`completed`
  - 当前已补运行态 demo 数据：
    - `rainfall_mm`
    - `alert_events`
  - 当前 `/api/dashboard/summary`、`/api/dashboard/weekly-trend` 已返回有意义的 demo 数据
  - `seed-demo.ps1` 已可脚本化复现上述 demo 数据
- `desk-http-live-proof`：`completed`
  - `scripts/dev/check-desk-http-legacy.ps1` 已通过
  - Desk 当前依赖的 legacy HTTP 接口已完成最小 live proof
  - 额外一致性修复已完成：
    - `/api/monitoring-stations` 与 `/api/devices` 在线状态口径已对齐
  - 额外兼容修复已完成：
    - `/api/baselines/device_1/auto-establish`
    - `/api/baselines/device_1/quality-check`
    已支持 legacy id

## 2026-03-17 Runtime Truth Revalidation

- 当前又完成一轮主线真值复验，结论如下：
  - `services/api` 当前本地默认端口应统一为 `8081`
  - `GET /health` 已在 `8081` 返回 `200`
  - `GET /api/dashboard/summary` 当前真值为：
    - `stationCount=1`
    - `deviceOnlineCount=3`
    - `alertCountToday=1`
    - `systemHealthPercent=87`
  - `check-desk-http-legacy.ps1` 当前真值为：
    - `weeklyTrend.alertSum=3`
    - `weeklyTrend.rainfallSum=79`
    - `gps.totalPoints=240`
    - `stations.online_status=online`
    - `devices.status=online`
- 当前判断：
  - 先前 `alertCountToday=3` 那组留证应视为旧运行态或端口漂移下的过期结果
  - 当前 Desk/backend/data 闭环继续保持 `completed`，但后续复验必须以 `8081` 为唯一口径

## 2026-03-17 Non-Mutating Live Proof

- 当前又完成一轮验证链收口，结论如下：
  - `check-desk-http-legacy.ps1` 现在改为非持久化验证 baseline
  - `PUT /api/baselines/:deviceId` 与 `POST /api/baselines/:deviceId/auto-establish` 已支持 `persist=false`
  - 重新执行 `seed-demo.ps1` 后，脚本执行前后的 `GET /api/baselines/device_1` 保持一致
- 当前判断：
  - 之前 live proof 会污染 baseline demo 真值，这个问题已解除
  - 当前可继续在不动 Desk UI 的前提下，推进更细的后端/seed/查询链收口

## 2026-03-17 Online Status Semantics Alignment

- 当前又完成一轮 legacy 状态口径收口：
  - `/api/devices` 已不再仅按 `devices.status` 直接映射 `online/offline`
  - 当前改为按 `last_seen_at` 的 `24h` 窗口判断
  - 与 `/api/monitoring-stations` 的在线语义正式对齐
- 当前结果：
  - demo 运行态下两者仍保持 `online`
  - 但这次是一致性逻辑真正对齐，而不是 seed 恰好未触发分叉

## 2026-03-17 Proof Assertion Hardening

- 当前又完成一轮验证脚本补强：
  - baseline upsert 返回现在带 `persisted`
  - `check-desk-http-legacy.ps1` 现在会直接断言：
    - `upsertPersisted=false`
    - `autoPersisted=false`
    - `proofStable=true`
- 当前判断：
  - live proof 已具备“非污染 + 可自动断言”的双重属性
  - 这条验证链当前可以作为后续复验基准继续沿用

## 2026-03-17 Device Metadata Truth Carryover

- 当前又完成一轮 legacy 设备元信息收口：
  - `/api/devices` 现已补出 `legacyDeviceId`
  - `/api/devices` 现已补出 `sensorTypes`
- 当前结果：
  - 设备接口现在能和 `monitoring-stations` / seed 真值互相对照
  - 现有 Desk 关键结果未受影响，live proof 仍通过

## 2026-03-17 Cross-Endpoint Consistency Proof

- 当前又完成一轮验证脚本补强：
  - `check-desk-http-legacy.ps1` 现已跨接口校验：
    - `legacyDeviceId`
    - `actual device id`
    - `stationName`
    - `sensorTypes`
  - 当前结果新增：
    - `devices.stationConsistency=true`
- 当前判断：
  - 桌面端当前最关键的 legacy 数据链不仅“各自能返回”，而且已经能被自动证明互相一致

## 2026-03-17 Actual Desk Runtime Proof

- 当前又完成一轮更贴近 `apps/desk` 实际运行方式的验证：
  - 新增 `scripts/dev/check-desk-http-runtime.ps1`
  - 该脚本同时验证 legacy + v1 混合链
- 当前结果：
  - `weeklyTrend.legacyEqualsV1=true`
  - `devices.stationConsistency=true`
  - `baselines.deviceCoverage=true`
  - `gps.baselineConsistency=true`
  - `system.legacyEqualsV1=true`
- 当前判断：
  - 后续若要证明桌面端真实联调状态，应优先引用这条 mixed runtime proof

## 2026-03-17 V1 Baseline Write Proof

- 当前又完成一轮 mixed runtime chain 补强：
  - `PUT /api/v1/gps/baselines/:deviceId` 已支持 `persist=false`
  - mixed runtime proof 现已覆盖 v1 baseline upsert + auto-establish
- 当前结果：
  - `baselines.upsertPersisted=false`
  - `baselines.autoPersisted=false`
  - `baselines.proofStable=true`
- 当前判断：
  - 当前桌面端真实使用的 baseline 写链也已经具备“可验证且不污染 demo 真值”的留证

## 2026-03-17 Legacy-V1 Cross Truth Proof

- 当前又完成一轮 mixed runtime proof 补强：
  - `legacy dashboard summary` ↔ `v1 dashboard`
  - `legacy baselines` ↔ `v1 baselines`
  已纳入自动断言
- 当前结果：
  - `summary.legacyEqualsV1Core=true`
  - `baselines.legacyEqualsV1=true`
  - `weeklyTrend.legacyEqualsV1=true`
  - `system.legacyEqualsV1=true`
- 当前判断：
  - 现在不只是 mixed chain 可跑，而是 legacy / v1 两套真值也已经被自动证明对齐

## 2026-03-17 Desk Data-Layer V1 Shift

- 当前又完成一轮桌面端数据层收口：
  - `dashboard.getSummary()` 已切到 `/api/v1/dashboard`
  - `dashboard.getWeeklyTrend()` 已切到 `/api/v1/dashboard/weekly-trend`
  - `system.getStatus()` 已切到 `/api/v1/system/status`
- 当前结果：
  - `apps/desk` 构建继续通过
  - mixed runtime proof 继续通过
- 当前判断：
  - 桌面端数据层已进一步向正式 v1 契约收敛
  - 且没有触碰 UI、导航或页面结构

## 2026-03-17 Desk Data-Layer Full V1 Core

- 当前又完成一轮桌面端数据层收口：
  - `stations.list()` 已切到 v1
  - `devices.list()` 已切到 v1
- 当前结果：
  - `apps/desk` 当前核心读取链已基本全面切到 v1
  - mixed runtime proof 继续通过
  - 新增关键信号：
    - `devices.legacyEqualsV1=true`
    - `stations.legacyEqualsV1=true`
- 当前判断：
  - 当前 legacy `/api/*` 对 Desk 的角色已进一步收缩为兼容和真值对照

## 2026-03-17 Desk V1 Core Runtime Proof

- 当前又完成一轮更贴近 Desk 当前主消费链的验证：
  - 新增 `scripts/dev/check-desk-http-v1-core.ps1`
  - 该脚本只验证 v1 core chain
- 当前结果：
  - `stations.deviceCoverage=true`
  - `devices.stationCoverage=true`
  - `baselines.deviceCoverage=true`
  - `baselines.proofStable=true`
  - `gps.baselineConsistency=true`
- 当前判断：
  - 当前桌面端核心读取链已经具备单独的 v1-only runtime proof

## 2026-03-17 Station Status Semantics V1 Alignment

- 当前又完成一轮桌面端切向 v1 后的语义收口：
  - `mapStationsFromV1()` 已按设备近 `24h` 状态推导站点状态
  - mixed runtime proof 已将聚合后的 legacy 站点与 v1 站点做逐项比对
- 当前结果：
  - `stations.legacyEqualsV1=true`
  - `devices.legacyEqualsV1=true`
  - `devices.stationConsistency=true`
- 当前判断：
  - 站点层语义已经不只是“数量对齐”，而是聚合状态也已对齐

## 2026-03-17 Desk Auth Real-First Dev-Fallback

- 当前又完成一轮桌面端数据层收口：
  - `auth.login()` 已改为真实 `/api/v1/auth/login` 优先
  - 本地 `localhost/127.0.0.1` 环境下保留 `dev` fallback
- 当前结果：
  - `apps/desk` 构建继续通过
  - 当前真实 `/api/v1/auth/login` 对 `admin/123456` 仍返回 `401`
- 当前判断：
  - 本地联调仍需要 dev fallback
  - 但桌面端 auth 已不再是纯 stub

## 2026-03-17 Local JWT Login Runtime Closure

- 当前又完成一轮桌面端本地认证收口：
  - `seed-demo.ps1` 已并入本地 admin 用户与 admin 角色绑定
  - `AUTH_REQUIRED=false` 时，API 也会继续解析已提供的 JWT
  - `check-desk-http-v1-core.ps1` 已改为先做真实登录再跑 v1 core chain
- 当前结果：
  - `/api/v1/auth/login` 现已成功
  - v1-only runtime proof 现已携带真实 JWT 通过
- 当前判断：
  - 本地桌面端当前已经具备真实 JWT 登录与真实数据层联调能力

## 2026-03-17 Auth Flow Proof Hardening

- 当前又完成一轮本地认证留证补强：
  - `check-desk-http-v1-core.ps1` 现已覆盖：
    - login
    - auth/me
    - auth/refresh
    - refresh 后再访问 v1 core chain
- 当前结果：
  - `auth.hasRefreshToken=true`
  - `auth.refreshWorks=true`
  - `auth.permissions=16`
- 当前判断：
  - 本地 Desk 真实 JWT 认证链已经具备完整最小留证

## 2026-03-17 RBAC Demo Truth Remediation

- 当前又完成一轮本地 RBAC 真值修复：
  - `seed-demo.ps1` 已独立修正 `roles.display_name/description`
  - `auth/me` 与 v1-only proof 现已验证角色展示值正常
- 当前结果：
  - `auth.roleDisplayName=Admin`
  - `auth.permissions=16`
- 当前判断：
  - 当前本地 Desk 认证与权限展示链的 demo 真值已恢复正常

## 2026-03-17 Desk Login Quick-Fill Alignment

- 当前又完成一轮桌面端小收口：
  - 登录页“快速体验”已改为填充 `admin / 123456`
- 当前结果：
  - 与本地真实 JWT 演示账号保持一致
  - `apps/desk` 构建继续通过

## 2026-03-17 V1 Pagination Hardening

- 当前又完成一轮主线 Desk 数据层加固：
  - `stations/devices/baselines` 的 v1 读取已补自动翻页
- 当前结果：
  - `apps/desk` 构建继续通过
  - v1-only runtime proof 继续通过
- 当前判断：
  - 当前 Desk v1 数据层已不再依赖“单页 200 条以内”的隐性前提

## 2026-03-17 Desk HTTP Client Runtime Proof

- 当前又完成一轮更贴近主线 Desk 数据层本体的验证：
  - 新增 `scripts/dev/check-desk-http-client.ps1`
  - 直接调用主线 `apps/desk` 的 `createHttpClient()`
- 当前结果：
  - `auth.hasRefreshToken=true`
  - `auth.refreshRecovered=true`
  - `refreshedBaselines=3`
- 当前判断：
  - 当前已不仅是 API 契约可用
  - 主线 Desk 的真实 HTTP client 行为也已完成最小留证

## 2026-03-17 Desk Client Baseline Write Proof

- 当前又完成一轮 Desk client 本体 proof 补强：
  - client 层 `baselines.upsert/autoEstablish` 已支持 `persist=false`
  - proof 已校验客户端层 baseline 写链不污染 demo 真值
- 当前结果：
  - `baselineProof.stable=true`
  - `auth.refreshRecovered=true`
- 当前判断：
  - 当前主线 Desk 的真实 client 已具备“读链、refresh、baseline 写链”三层留证

## 2026-03-17 Desk User Journey Proof

- 当前又完成一轮更贴近真实用户路径的验证：
  - 新增 `scripts/dev/check-desk-user-journey.ps1`
  - 串联首页、监测点、设备、基线、GPS、系统页数据路径
- 当前结果：
  - `stationsPage.loadedDevices=3`
  - `devicesPage.filteredDevices=3`
  - `baselinesPage.proofStable=true`
  - `gpsPage.points=5`
- 当前判断：
  - 当前桌面端真实主路径已经具备完整客户端级留证

## 2026-03-17 Desk Mainline One-Shot Proof

- 当前又完成一轮主线验证收口：
  - 新增 `scripts/dev/check-desk-mainline-proof.ps1`
  - 将 seed、build、v1 core、client、user journey 串成单命令复验
- 当前结果：
  - `buildExecuted=true`
  - `auth.refreshRecovered=true`
  - `baselineProof.stable=true`
  - `baselinesPage.proofStable=true`
- 当前判断：
  - 当前 Desk 主线已经具备“一键复验”的统一入口

## 2026-03-17 Structured Mainline Reporting

- 当前又完成一轮 Desk 主线复验收口：
  - `check-desk-mainline-proof.ps1` 现已输出结构化总报告
- 当前结果：
  - `health.ok=true`
  - `v1Core.auth.roleDisplayName=Admin`
  - `client.auth.refreshRecovered=true`
  - `userJourney.baselinesPage.proofStable=true`
- 当前判断：
  - 当前 Desk 主线已经具备可直接归档的总报告入口

## 2026-03-17 One-Shot Proof Result Stabilization

- 当前又完成一轮主线总 proof 稳定化：
  - `client.auth.refreshRecovered` 判定已修正
  - 一键复验已拿到稳定最终结果
- 当前结果：
  - `buildExecuted=true`
  - `health.ok=true`
  - `client.auth.refreshRecovered=true`
  - `client.baselineProof.stable=true`
  - `userJourney.baselinesPage.proofStable=true`

## 2026-03-17 Demo Scenario Expansion

- 当前又完成一轮 demo 真值扩展：
  - 第二站点 `DEMO002`
  - 离线雨量设备 `device_4`
  - 缺 baseline 分支
  - 只读用户 `viewer`
- 当前结果：
  - `summary.stationCount=2`
  - `summary.deviceOnlineCount=3`
  - `summary.totalDevices=4`
  - `devices.missingBaselineCount=1`
  - `client.stations.first.status=offline`
- 当前判断：
  - 当前 Desk 主线 proof 已开始覆盖更接近真实使用的多状态样例

## 2026-03-17 Viewer Boundary Proof

- 当前又完成一轮权限边界收口：
  - 新增 `check-desk-viewer-boundary.ps1`
  - 已并入一键主线总 proof
- 当前结果：
  - `viewerBoundary.reads.stations=2`
  - `viewerBoundary.reads.devices=4`
  - `viewerBoundary.reads.baselines=3`
  - `viewerBoundary.denied.gps=禁止访问`
  - `viewerBoundary.denied.system=禁止访问`
  - `viewerBoundary.denied.baselineUpsert=禁止访问`
- 当前判断：
  - 当前 Desk 主线已经开始覆盖“只读用户可读哪些、哪些必须被拒绝”的真实边界

## 2026-03-17 Warning State And Summary Alignment

- 当前又完成一轮多状态 demo 收口：
  - 新增 `device_5` 覆盖 `warning` 设备分支
  - `dashboard.onlineDevices` 已改为按近 `24h` 在线语义统计
- 当前结果：
  - `summary.stationCount=2`
  - `summary.deviceOnlineCount=3`
  - `summary.totalDevices=5`
  - `devices.missingBaselineCount=2`
  - `client.stations.first.status=warning`
  - `client.devices.first.status=warning`
- 当前判断：
  - 当前 Desk 主线已开始覆盖 `warning` 分支，且 summary 指标已与真实设备状态对齐

## 2026-03-17 Pagination Load Proof

- 当前又完成一轮高负载样例验证：
  - 新增 `check-desk-pagination-proof.ps1`
  - 以临时 `205` 条 smoke 设备/基线验证 Desk v1 自动翻页
- 当前结果：
  - `stations.demo2DeviceCount=207`
  - `devices.total=210`
  - `devices.demo2Filtered=207`
  - `baselines.total=208`
- 当前判断：
  - 当前 Desk v1 自动翻页已经有真实大页数留证

## 2026-03-17 GPS Baseline-Aware Selection

- 当前又完成一轮 GPS 主路径加固：
  - 新增无 baseline 的 GNSS 设备 `device_6`
  - GPS 页面已改为优先选择有 baseline 的 GNSS 设备
- 当前结果：
  - `summary.totalDevices=6`
  - `devices.missingBaselineCount=3`
  - `client.devices.first.status=warning`
  - `userJourney.gpsPage.deviceId=00000000-0000-0000-0000-000000000001`
- 当前判断：
  - 当前 GPS 主路径已不再依赖“所有 GNSS 设备都有 baseline”的隐性前提

## 2026-03-17 Mobile Login Boundary Closure

- 当前又完成一轮认证边界收口：
  - HTTP 模式下手机号登录已改为明确拒绝
- 当前结果：
  - `auth.mobileLoginRejected=当前 HTTP 模式未接入手机号登录，请使用账号密码登录。`
  - `auth.refreshRecovered=true`
- 当前判断：
  - 当前 Desk 主线已不再保留手机号伪登录绕过路径

## 2026-03-17 Seed Exec Stabilization And GNSS Gap Coverage

- 当前又完成一轮 seed/proof 稳定化：
  - `seed-demo.ps1` 改为 stdin → psql 执行
  - 新增无 baseline GNSS 设备 `device_6`
  - 主路径 proof 已按 baseline-backed GNSS 重新选目标
- 当前结果：
  - `summary.totalDevices=6`
  - `devices.missingBaselineCount=3`
  - `client.devices.first.status=warning`
  - `userJourney.gpsPage.deviceId=00000000-0000-0000-0000-000000000001`
- 当前判断：
  - 当前 seed 执行链和 GPS 主路径在多状态样例下都已恢复稳定

## 2026-03-17 Pagination Stress Integration

- 当前又完成一轮主线总 proof 加固：
  - `-IncludePaginationStress` 已并入一键总 proof
- 当前结果：
  - `paginationStress.stations.demo2DeviceCount=208`
  - `paginationStress.devices.total=211`
  - `paginationStress.devices.demo2Filtered=208`
  - `paginationStress.baselines.total=208`
- 当前判断：
  - 当前 Desk 主线总报告已经可按需同时覆盖主链与大页数压力场景

## 2026-03-17 Baselines Panel Action Proof

- 当前又完成一轮页面级动作收口：
  - 新增 `check-desk-baselines-actions.ps1`
  - 已并入主线总 proof
- 当前结果：
  - `gnssDevices=4`
  - `baselineCountBefore=3`
  - `baselineCountAfterCreate=4`
  - `restoredMissingState=true`
  - `auto.proofStable=true`
- 当前判断：
  - 当前基线页真实动作链已被纳入主线留证

## 2026-03-17 Device Management Command Proof

- 当前又完成一轮页面级动作收口：
  - 设备管理页控制动作已接入真实 device command 链
  - 新增 `check-desk-device-actions.ps1`
  - 已并入主线总 proof
- 当前结果：
  - `deviceActions.status=queued`
  - `deviceActions.commandsLoaded=3`
  - `deviceActions.foundIssuedCommand=true`
- 当前判断：
  - 当前设备管理页关键控制动作已从 mock 提升为真实链路

## 2026-03-17 Second Batch Page Proof Closure

- 当前又完成一轮批量页面级收口：
  - 设置页、设备页、监测点页、首页、GPS monitoring 页、viewer 主路径、设备管理页、命令分页压力均已补 proof
- 当前结果：
  - `settingsActions.auth.logoutRejectedProtectedAccess=未认证`
  - `devicesPageActions.devicesPage.filteredDevices=3`
  - `stationsPageActions.stationsPage.drawerLoadedDevices=3`
  - `homeActions.homePage.refreshStable=true`
  - `gpsMonitoringPage.gpsMonitoringPage.candidateCount=3`
  - `viewerJourney.viewerJourney.deniedGps=禁止访问`
  - `deviceManagementPage.deviceManagementPage.foundIssuedCommand=true`
  - `commandPaginationStress.commandPagination.loaded=55`
- 当前判断：
  - 第 21-25 项批量推进已形成完整阶段结果

## 2026-03-17 Viewer Command Boundary And History Proof

- 当前又完成一轮设备命令链收口：
  - viewer 对 `issueCommand/listCommands` 的拒绝行为已补留证
  - 设备控制历史已接真实命令列表
- 当前结果：
  - `viewerBoundary.denied.deviceCommandIssue=禁止访问`
  - `viewerBoundary.denied.deviceCommandList=禁止访问`
  - `deviceActions.commandsLoaded=5`
- 当前判断：
  - 当前设备管理页动作链与权限边界都已对齐到真实命令链

## 2026-03-17 Extended Page Proof Snapshot

- 当前又新增并收口：
  - `analysisPageActions.analysisPage.anomalies=3`
  - `analysisPageActions.analysisPage.rainfallSum=79`
  - `systemPageActions.systemPage.items=3`
  - `deviceDiagnostics.diagnostics.analysisType=expert_comprehensive_health`
  - `paginationStress.devices.total=211`
  - `commandPaginationStress.commandPagination.loaded=55`
## 2026-03-17 Analysis Telemetry Charts Connected

- 当前又完成一轮 Analysis 页数据收口：
  - 温度图已接真实遥测
  - 湿度图已接真实遥测
  - 加速度图已接真实遥测
  - 陀螺仪图已接真实遥测
- 当前结果：
  - `analysisPageActions.analysisPage.temperaturePoints=5`
  - `analysisPageActions.analysisPage.humidityPoints=5`
  - `analysisPageActions.analysisPage.accelerationPoints=5`
  - `analysisPageActions.analysisPage.gyroscopePoints=5`

## 2026-03-17 Device Management Default View Realigned

- 当前又完成一轮设备管理页数据收口：
  - proof 已改为按页面默认区域 `all` 验证
  - 顶部概览与实时传感器表已接真实链路
- 当前结果：
  - `selectedDeviceId=00000000-0000-0000-0000-000000000001`
  - `baselineEstablished=true`
  - `telemetryPoints.temperature=5`
  - `telemetryPoints.humidity=5`
  - `expert.healthScore=0`

## 2026-03-17 Device Management Export Connected

- 当前又完成一轮设备管理页动作收口：
  - 导出菜单已改为导出真实设备/基线/传感器数据
- 当前结果：
  - `devicesFilename=desk-devices.csv`
  - `devicesLines=7`
  - `baselinesFilename=desk-baselines.csv`
  - `baselinesLines=4`
  - `sensorFilename=desk-device-sensor.csv`
  - `sensorLines=6`

## 2026-03-17 Device Diagnostics Connected

- 当前又完成一轮设备管理页数据收口：
  - 设备诊断已接入真实 `device health expert` 链
  - 顶部概览与实时传感器表也已走真实数据
- 当前结果：
  - `deviceDiagnostics.diagnostics.analysisType=expert_comprehensive_health`
  - `deviceManagementPage.deviceManagementPage.expert.healthScore=0`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.temperature=5`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.humidity=5`

## 2026-03-17 GPS Monitoring Export Connected

- 当前又完成一轮 GPS monitoring 页动作收口：
  - 导出菜单已改为导出真实当前设备数据/分析/报告
- 当前结果：
  - `csvFilename=desk-gps-monitoring.csv`
  - `csvLines=6`
  - `analysisFilename=desk-gps-analysis.json`
  - `reportFilename=desk-gps-report.txt`

## 2026-03-17 GPS Monitoring Chart Export Connected

- 当前又完成一轮 GPS monitoring 页动作收口：
  - 图表图片导出已改为基于当前真实数据生成 SVG
  - 结果已并入主线总 proof
- 当前结果：
  - `chartFilename=desk-gps-chart.svg`
  - `chartMimeType=image/svg+xml;charset=utf-8`
  - `chartHasSvgRoot=true`
  - `chartPolylineCount=3`
- 当前判断：
  - 当前 `GpsMonitoringPage` 的导出菜单已不再只覆盖数据文件，也能导出真实图表产物

## 2026-03-17 Device Management Telemetry Connected

- 当前又完成一轮设备管理页数据收口：
  - 实时传感器表已改为读取真实遥测链
- 当前结果：
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.temperature=0`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.humidity=0`
- 当前判断：
  - warning 设备无最近数据时，这里现在会如实显示空/0 分支，而不是伪造示意数据

## 2026-03-17 Device Detail Copy Connected

- 当前又完成一轮设备管理页动作收口：
  - 详情弹窗里的“复制信息”已改为复制真实设备/站点/运行指标文本
  - 结果已并入现有设备管理导出 proof 和主线总 proof
- 当前结果：
  - `detailLines=13`
  - `detailContainsDeviceName=true`
  - `detailContainsStationArea=true`
  - `detailContainsBaselineState=true`
- 当前判断：
  - 当前设备管理页已不再只支持看详情，也能复制真实详情原文用于外部留档

## 2026-03-17 Mainline Proof Summary Snapshot Added

- 当前又完成一轮主线报告收口：
  - `check-desk-mainline-proof.ps1` 已新增 `summarySnapshot`
  - 同时自动生成精简版摘要：
    - `docs/unified/reports/desk-mainline-proof-summary-latest.md`
- 当前结果：
  - `summarySnapshot.completedChecks=21`
  - `summarySnapshot.demoTruth.stationCount=2`
  - `summarySnapshot.demoTruth.totalDevices=6`
  - `summarySnapshot.viewerBoundary.deniedCount=5`
- 当前判断：
  - 后续读主线真值时，已经不需要先翻完整 JSON，先看摘要快照即可

## 2026-03-17 Mainline Proof History Persistence Added

- 当前又完成一轮主线报告收口：
  - 总 proof 结果除了 latest 文件外，已开始自动写入 `history/` 时间戳快照
- 当前结果：
  - `desk-mainline-proof-20260317-202908.json`
  - `desk-mainline-proof-summary-20260317-202908.md`
- 当前判断：
  - 后续做多轮真值对比时，已经不需要手工备份 latest 文件，直接对比 `history/` 即可

## 2026-03-17 Mainline Proof History Index Added

- 当前又完成一轮主线报告收口：
  - 已新增历史索引文件：
    - `docs/unified/reports/desk-mainline-proof-history-latest.md`
  - 索引会自动列出最近快照，并给出当前轮与上一轮的关键口径差异
- 当前结果：
  - `TotalSnapshots=2`
  - `CurrentStamp=20260317-203324`
  - `PreviousStamp=20260317-202908`
  - 当前最近两轮关键 Delta 全为 `0`
- 当前判断：
  - 后续判断某轮复验是不是改坏了，不用手工比两个 JSON，先看历史索引即可

## 2026-03-17 Mainline Proof History Retention Added

- 当前又完成一轮主线报告收口：
  - `check-desk-mainline-proof.ps1` 已新增历史快照自动保留策略
  - 默认只保留最近 `20` 轮 JSON / Markdown 历史快照
- 当前结果：
  - `MaxHistorySnapshots=20`
  - `TotalSnapshots=3`
  - 最新快照：
    - `desk-mainline-proof-20260317-203727.json`
    - `desk-mainline-proof-summary-20260317-203727.md`
- 当前判断：
  - 后续总 proof 可以持续跑，不需要再担心 `history/` 目录无限增长

## 2026-03-17 Mainline Proof Diff JSON Added

- 当前又完成一轮主线报告收口：
  - 已新增机器可读差异文件：
    - `docs/unified/reports/desk-mainline-proof-diff-latest.json`
  - 文件内直接提供：
    - `current`
    - `previous`
    - `delta`
- 当前结果：
  - `current.stamp=20260317-204008`
  - `previous.stamp=20260317-203727`
  - 当前关键 Delta 全为 `0`
- 当前判断：
  - 后续如果其他 CLI 窗口或脚本要自动判断“这一轮有没有漂移”，已经可以直接消费 diff JSON，不需要解析 Markdown

## 2026-03-17 Mainline Proof Manifest Added

- 当前又完成一轮主线报告收口：
  - 已新增统一清单文件：
    - `docs/unified/reports/desk-mainline-proof-manifest-latest.json`
  - 该文件当前统一汇总：
    - latest 路径
    - history 状态
    - `summarySnapshot`
    - `diff`
- 当前结果：
  - `history.totalSnapshots=5`
  - `history.currentStamp=20260317-210532`
  - `history.previousStamp=20260317-204008`
- 当前判断：
  - 后续其他 CLI 窗口如果只想拿一份主线真值入口文件，现在直接读 manifest 即可

## 2026-03-17 Mainline Proof Status Script Added

- 当前又完成一轮协作入口收口：
  - 已新增状态读取脚本：
    - `scripts/dev/show-desk-mainline-proof-status.ps1`
  - 脚本会直接读取 manifest，并输出：
    - latest
    - history
    - summary
    - diff
- 当前结果：
  - `summary.completedChecks=21`
  - `summary.viewerDenied=5`
  - `diff.unchanged=true`
- 当前判断：
  - 后续其他 CLI 窗口不需要自己解析 manifest，只要跑这条脚本就能拿到当前主线状态

## 2026-03-17 Station Management Panel Connected

- 当前又完成一轮 Desk 业务页收口：
  - `StationManagementPanel` 已从本地缓存保存切到真实后端站点配置
  - 新增可恢复页面级 proof：
    - `scripts/dev/check-desk-station-management-panel.ps1`
  - 已并入主线总 proof
- 当前结果：
  - `stationManagementPanel.totalStations=2`
  - `stationManagementPanel.targetStationName=示例监测点B-proof`
  - `stationManagementPanel.locationName=示例监测区B-proof`
  - `stationManagementPanel.chartLegendName=示例监测点B-legend-proof`
- 当前判断：
  - 当前站点管理页已经不再只是本地 Mock 管理页，而是具备真实保存、读回校验和恢复留证的业务页

## 2026-03-17 GPS Threshold Config Connected

- 当前又完成一轮 GPS monitoring 页动作收口：
  - 监测阈值设置已改为保存到真实 `system configs`
  - 新增可恢复 proof：
    - `scripts/dev/check-desk-gps-threshold-config.ps1`
  - 已并入主线总 proof
- 当前结果：
  - `gpsThresholdConfig.blue=2.5`
  - `gpsThresholdConfig.yellow=5.5`
  - `gpsThresholdConfig.red=8.5`
  - `gpsThresholdConfig.restoredOriginal=true`
- 当前判断：
  - 当前 GPS monitoring 页阈值设置已不再只是本地 UI 状态，而是正式进入后端配置链

## 2026-03-17 Seed Demo Mutex Added

- 当前又完成一轮主线真值稳定化：
  - `seed-demo.ps1` 已新增全局互斥锁
  - 目的：避免多窗口并发 seed 时互相污染 demo 真值
- 当前结果：
  - 当前单次顺序复验已恢复 `weeklyTrend.rainfallSum=79`
  - GPS 阈值 key 也已纳入 seed 真值
- 当前判断：
  - 后续多窗口并发运行 proof 时，demo truth 的稳定性会明显高于之前

## 2026-03-17 Mainline Coordination Status Script Added

- 当前又完成一轮多窗口协作入口收口：
  - 已新增：
    - `scripts/dev/show-mainline-coordination-status.ps1`
  - 脚本当前直接汇总：
    - latest batch
    - proof 摘要
    - history 摘要
    - diff 摘要
- 当前结果：
  - `latestBatch.taskId=desk-batch-37-seed-mutex`
  - `proof.completedChecks=23`
  - `proof.rainfall=79`
  - `history.totalSnapshots=9`
  - `diff.unchanged=false`
- 当前判断：
  - 后续其他 CLI 窗口如果要把“主线当前协调状态”回报给总协调器，直接跑这条脚本比单读 proof status 更完整

## 2026-03-17 Last Matching Truth Comparison Added

- 当前又完成一轮主线历史读取收口：
  - 历史索引与协调状态当前已区分：
    - immediate previous
    - last matching truth
- 当前结果：
  - `diff.hasLastMatching=false`
  - `diff.lastMatchingStamp=null`
  - `diff.unchangedVsLastMatching=null`
- 当前判断：
  - 这不是坏状态，而是说明当前这轮是第一轮同时满足 `completedChecks=23` 且 `rainfallSum=79` 的稳定快照，后续再跑一轮后，这组字段就会开始变得有意义

## 2026-03-17 Stable Snapshot Baseline Established

- 当前又完成一轮主线稳定性收口：
  - 已顺序追加一轮稳定快照
  - `last matching truth` 现在已经从“占位能力”变成“可用能力”
- 当前结果：
  - `history.totalSnapshots=10`
  - `history.currentStamp=20260317-220314`
  - `history.previousStamp=20260317-215230`
  - `diff.unchanged=true`
  - `diff.hasLastMatching=true`
  - `diff.lastMatchingStamp=20260317-215230`
  - `diff.unchangedVsLastMatching=true`
- 当前判断：
  - 后续其他 CLI 窗口再看协调状态时，已经可以明确区分：
    - 当前是否稳定
    - 当前是否回到了最近稳定真值

## 2026-03-17 Coordination Status Shared File Added

- 当前又完成一轮多窗口协作入口收口：
  - `show-mainline-coordination-status.ps1` 现在除了标准输出，还会自动写出：
    - `docs/unified/reports/mainline-coordination-status-latest.json`
- 当前结果：
  - `latestBatch.taskId=desk-batch-40-stable-snapshot-baseline`
  - `proof.completedChecks=23`
  - `proof.rainfall=79`
  - `history.totalSnapshots=11`
  - `diff.unchanged=true`
  - `diff.unchangedVsLastMatching=true`
- 当前判断：
  - 后续其他 CLI 窗口如果不想运行脚本，也可以直接读取这份共享 JSON 文件来回报当前主线协调状态

## 2026-03-17 CLI Coordination Protocol Added

- 当前又完成一轮多窗口协作入口收口：
  - 已新增统一协议文档：
    - `docs/unified/cli-coordination-protocol.md`
  - 当前文档明确：
    - 单一读取入口
    - 推荐命令
    - 回报字段
    - 判读规则
    - 输出规则
- 当前结果：
  - 当前共享状态脚本已刷新到：
    - `latestBatch.taskId=desk-batch-42-cli-coordination-protocol`
  - 当前共享状态仍保持：
    - `proof.completedChecks=23`
    - `proof.rainfall=79`
    - `diff.unchanged=true`
    - `diff.unchangedVsLastMatching=true`
- 当前判断：
  - 后续其他 CLI 窗口已经不只知道“读哪个文件”，也知道“按什么协议回报”

## 2026-03-17 GPS Data Limit Config Connected

- 当前又完成一轮 GPS monitoring 页配置收口：
  - “数据点数设置”已改为保存到真实 `system configs`
  - 新增可恢复 proof：
    - `scripts/dev/check-desk-gps-data-limit-config.ps1`
  - 已并入主线总 proof
- 当前结果：
  - `gpsDataLimitConfig.limit=320`
  - `gpsDataLimitConfig.restoredOriginal=true`
  - `summarySnapshot.pageProofs.gpsDataLimit=320`
  - `summarySnapshot.completedChecks=24`
- 当前判断：
  - 当前 GPS monitoring 页两个真正会影响使用的配置项：
    - 阈值
    - 数据点数
  都已经进入正式后端配置链

## 2026-03-17 Open Gaps Inventory Added

- 当前又完成一轮主线收尾盘点：
  - 已新增：
    - `scripts/dev/show-mainline-open-gaps.ps1`
    - `docs/unified/reports/mainline-open-gaps-latest.json`
- 当前结果：
  - `totalFiles=1`
  - `totalItems=3`
  - 当前剩余有效 Mock 残留只在：
    - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前判断：
  - 当前 Desk 主线已经不再是“大量页面都半真半假”的状态
  - 真正还没收掉的，已经缩到 GPS monitoring 里的 3 个算法/地图展示性 Mock 点

## 2026-03-17 GPS Display Copy Cleanup

- 当前又完成一轮 Desk 展示性收尾：
  - `GpsMonitoringPage` 剩余展示性 Mock 文案已改成：
    - 实时派生
    - 派生分析
    - 派生预测
- 当前结果：
  - `show-mainline-open-gaps.ps1` 当前输出：
    - `totalFiles=0`
    - `totalItems=0`
- 当前判断：
  - 当前 Desk 主线剩余未收口点清单已经清零

## 2026-03-17 GPS Derived Analysis Backend Connected

- 当前又完成一轮 GPS monitoring 专业化收口：
  - `GpsMonitoringPage` 的 CEEMD / 预测展示块已优先消费后端 `gps-deformation` 分析结果
  - 前端派生逻辑当前仅作为 fallback 保留
- 当前结果：
  - `gpsMonitoringPage.ceemdImfCount=3`
  - `gpsMonitoringPage.ceemdQualityScore=1`
  - `gpsMonitoringPage.shortPredictionPoints=24`
  - `gpsMonitoringPage.longPredictionPoints=168`
- 当前判断：
  - 当前 GPS monitoring 已不再只是“前端自己拼出一套高阶分析展示”
  - 这页已经开始进入真实后端分析消费链

## 2026-03-17 GPS Analysis Export Backend Connected

- 当前又完成一轮 GPS monitoring 专业化收口：
  - 分析导出和综合报告导出已带出后端分析结果
  - 不再只是导出原始点位样本
- 当前结果：
  - `gpsMonitoringExport.analysisContainsDerived=true`
  - `gpsMonitoringExport.reportIncludesCeemdQuality=true`
  - `gpsMonitoringExport.reportIncludesPredictionConfidence=true`
  - `gpsMonitoringExport.analysisLength=23596`
- 当前判断：
  - 当前 GPS monitoring 不只是页面在消费后端分析结果，连导出产物也已经和后端分析链保持一致

## 2026-03-17 GPS V1 Analysis Contract Added

- 当前又完成一轮契约收口：
  - 已新增正式接口：
    - `/api/v1/gps/deformations/{deviceId}/analysis`
  - 当前主线 Desk client 的 `getDerivedAnalysis()` 已切到该 v1 契约
  - `09-gps-deformations.md`、`018-desk-ui.md`、`openapi.yaml` 已同步
- 当前结果：
  - GPS monitoring 页面 proof 继续通过
  - GPS monitoring 导出 proof 继续通过
- 当前判断：
  - 当前 GPS 高阶分析消费链已经不再依赖 legacy 路径作为主路径

## 2026-03-18 GPS Analysis Shared Implementation Started

- 当前又完成一轮实现收口：
  - `gps-deformation-legacy.ts` 与 `gps-deformations.ts` 当前已开始复用同一套核心分析实现
  - 目标是避免后续算法口径在 legacy / v1 两边继续分叉
- 当前结果：
  - `services/api` 已重新编译通过
  - GPS monitoring 页 proof 已继续通过
  - 主线总 proof 已继续通过
- 当前判断：
  - 当前 GPS 高阶分析链已经从“接口对齐”继续推进到“实现收敛”

## 2026-03-18 GPS V1 Analysis Proof Added

- 当前又完成一轮契约留证收口：
  - `/api/v1/gps/deformations/{deviceId}/analysis` 已并入 `check-desk-http-v1-core.ps1`
  - 主线总 proof 也已间接纳入该结果
- 当前结果：
  - `v1Core.gpsAnalysis.hasBaseline=true`
  - `v1Core.gpsAnalysis.qualityScore=0.775`
  - `v1Core.gpsAnalysis.imfCount=3`
  - `v1Core.gpsAnalysis.shortPredictionPoints=24`
  - `v1Core.gpsAnalysis.longPredictionPoints=168`
- 当前判断：
  - 当前 GPS v1 分析契约已经不只靠页面 proof 间接证明，也有了独立接口级留证

## 2026-03-18 GPS V1 Analysis Special Proof Added

- 当前又完成一轮 GPS 契约留证收口：
  - 已新增专项 proof：
    - `scripts/dev/check-desk-gps-v1-analysis-contract.ps1`
  - 并已并入主线总 proof
- 当前结果：
  - `gpsV1AnalysisContract.qualityScore=0.775`
  - `gpsV1AnalysisContract.ceemdImfCount=3`
  - `gpsV1AnalysisContract.shortPredictionPoints=24`
  - `gpsV1AnalysisContract.longPredictionPoints=168`
- 当前判断：
  - 当前 GPS v1 分析契约已经具备：
    - 页面级留证
    - v1 core 留证
    - 专项 proof 留证

## 2026-03-18 Local Tsx Runner Added

- 当前又完成一轮工程化收口：
  - 已新增：
    - `scripts/dev/invoke-tsx.ps1`
  - 当前 `check-desk-*.ps1` wrappers 已统一切到本地 `tsx`
- 当前结果：
  - 不再依赖 `npx --yes tsx` 临时拉包
  - 当前专项 proof 与总 proof继续通过
- 当前判断：
  - 后续 proof 运行稳定性会高于之前的临时拉包模式，尤其是在磁盘空间紧张时

## 2026-03-18 Local Api-Service Restart Script Added

- 当前又完成一轮运行流程收口：
  - 已新增：
    - `scripts/dev/restart-local-api-service.ps1`
  - 当前脚本统一处理：
    - build
    - 停旧进程
    - 拉起新进程
    - `/health` 探活
- 当前结果：
  - `restarted=true`
  - `port=8081`
  - `health.ok=true`
- 当前判断：
  - 后续本地切换到最新 `services/api/dist` 时，不需要再手工找 PID 和逐步验证

## 2026-03-18 Local Desk Mainline Stack Restart Script Added

- 当前又完成一轮运行流程收口：
  - 已新增：
    - `scripts/dev/restart-local-desk-mainline.ps1`
  - 当前脚本统一处理：
    - `api-service` 探活
    - `apps/desk` dev server 拉起
    - Desk URL 探活
- 当前结果：
  - `restarted=true`
  - `apiPort=8081`
  - `deskPort=5174`
  - `deskUrl=http://[::1]:5174`
- 当前判断：
  - 后续本地主线 Desk 运行态已经不需要再手工分别拉 API 和前端

## 2026-03-18 Local Desk Runtime Status Script Added

- 当前又完成一轮运行态收口：
  - 已新增：
    - `scripts/dev/show-local-desk-mainline-runtime.ps1`
  - 当前脚本直接汇总：
    - `api-service` 监听进程
    - `apps/desk` dev server 监听进程
    - `desk-win` 是否运行
    - 对应健康检查
- 当前结果：
  - `api.health.ok=true`
  - `desk.healthIpv6.ok=true`
  - `desk.healthLocalhost.ok=true`
  - `deskWin.running=false`
- 当前判断：
  - 后续不只是能一键重启主线运行态，也能一键读取当前运行态是否真正常驻

## 2026-03-18 Local Desk Runtime Shared File Added

- 当前又完成一轮运行态协作入口收口：
  - `show-local-desk-mainline-runtime.ps1` 现在除了标准输出，还会自动写出：
    - `docs/unified/reports/local-desk-mainline-runtime-latest.json`
- 当前结果：
  - `api.health.ok=true`
  - `desk.healthIpv6.ok=true`
  - `desk.healthLocalhost.ok=true`
  - `deskWin.running=false`
- 当前判断：
  - 后续其他 CLI 窗口如果不想直接运行状态脚本，也可以只读取这份本地运行态共享 JSON 文件

## 2026-03-18 Local Desk-Win Launch Added

- 当前又完成一轮本地运行态收口：
  - 已新增：
    - `scripts/dev/start-local-desk-win.ps1`
  - 当前状态脚本已可识别：
    - `deskWin.running=true`
- 当前结果：
  - `deskWin.pid=57144`
  - `deskWin.name=dotnet.exe`
- 当前判断：
  - 当前主线本地运行态已经同时具备：
    - api-service
    - apps/desk dev server
    - desk-win 壳
  三者的启动/状态入口

## 2026-03-17 Coordination Status Refreshed To Latest GPS Analysis Export

- 当前又完成一轮主线真值同步：
  - 协调状态共享文件已刷新到：
    - `desk-batch-47-gps-analysis-export-backend`
- 当前结果：
  - `proof.completedChecks=24`
  - `proof.rainfall=79`
  - `diff.unchanged=true`
  - `diff.unchangedVsLastMatching=true`
- 当前判断：
  - 当前主线 GPS 高阶分析链、导出链和共享状态口径已经重新对齐到同一轮真值

## 2026-03-18 GPS Prediction Confidence Intervals Closed

- 当前又完成一轮 GPS 高阶分析链的留证补强：
  - `v1 core`
  - `GpsMonitoringPage`
  - `GPS monitoring export`
  - `专项 proof`
  - `主线总 proof`
  已统一断言 `prediction.confidenceIntervals`
- 当前结果：
  - `gpsV1AnalysisContract.shortPredictionLowerPoints=24`
  - `gpsV1AnalysisContract.shortPredictionUpperPoints=24`
  - `gpsV1AnalysisContract.longPredictionLowerPoints=168`
  - `gpsV1AnalysisContract.longPredictionUpperPoints=168`
  - `gpsMonitoringExport.analysisIncludesConfidenceIntervals=true`
  - `summarySnapshot.pageProofs.gpsShortPredictionBandPoints=24`
  - `summarySnapshot.pageProofs.gpsLongPredictionBandPoints=168`
- 当前顺带修复：
  - `seed-demo.ps1` 已改为无 BOM UTF-8 管道输出
  - PostgreSQL SQL 执行入口已补 BOM 清洗，主线总 proof 再次 seed 时不再被编码问题卡住
- 当前判断：
  - 当前 GPS 高阶分析链已经不只是“能返回置信区间”，而是这些区间结果已经进入正式回归真值

## 2026-03-18 GPS Diagnostics And Threshold Forecast Closed

- 当前又完成一轮 GPS 高阶分析链的专业化收口：
  - `v1` 分析结果已补 `trendDiagnostics`
  - `v1/legacy` 分析结果已补 `thresholdForecast`
  - 导出与主线摘要已同步带出这些字段
- 当前结果：
  - `gpsV1AnalysisContract.trendDirection=increasing`
  - `gpsV1AnalysisContract.trendSlopeMmPerHour=1138.2905`
  - `gpsV1AnalysisContract.shortBlueBreached=true`
  - `gpsV1AnalysisContract.longRedBreached=true`
  - `gpsMonitoringExport.analysisIncludesTrendDiagnostics=true`
  - `gpsMonitoringExport.analysisIncludesThresholdForecast=true`
  - `summarySnapshot.pageProofs.gpsTrendDirection=increasing`
  - `summarySnapshot.pageProofs.gpsThresholdRedForecastBreached=true`
- 当前判断：
  - 当前 GPS 高阶分析链已经不仅能给出“分解 + 区间”，还开始给出更可解释的趋势诊断和阈值越界预测

## 2026-03-18 GPS Regression Trend And ETA Closed

- 当前又完成一轮 GPS 高阶分析链的口径细化：
  - `trendDiagnostics.slopeMmPerHour` 已改为真实时间轴回归趋势
  - `trendDiagnostics` 已补 `durationHours`、`regressionFitR2`
  - `thresholdForecast` 已补 `etaHours`、`etaDays`、`firstTimestamp`
- 当前结果：
  - `gpsV1AnalysisContract.trendDirection=decreasing`
  - `gpsV1AnalysisContract.trendSlopeMmPerHour=-197.6727`
  - `gpsV1AnalysisContract.trendDurationHours=4`
  - `gpsV1AnalysisContract.trendFitR2=0.1644`
  - `gpsV1AnalysisContract.shortBlueEtaHours=1`
  - `gpsV1AnalysisContract.longRedEtaHours=1`
  - `gpsMonitoringExport.trendFitR2=0.1644`
  - `summarySnapshot.pageProofs.gpsTrendFitR2=0.1644`
  - `summarySnapshot.pageProofs.gpsThresholdRedForecastEtaHours=1`
- 当前判断：
  - 当前 GPS 高阶分析链已经不只是“预测会不会越界”，还开始给出基于回归趋势的可解释 ETA

## 2026-03-18 GPS Long-Window Demo Truth Closed

- 当前又完成一轮 GPS demo 真值收口：
  - `seed-demo.ps1` 已把 GNSS 遥测扩到约 30 天小时级样本
  - legacy `gps-deformation` 已支持 `days`
  - legacy GPS proof 已改为 baseline-backed 真实设备，不再拿无 baseline 设备做无意义留证
- 当前结果：
  - `gpsMonitoringPage.points7d=168`
  - `gpsMonitoringPage.points15d=16`
  - `gpsMonitoringPage.points30d=31`
  - `gpsMonitoringExport.csvLines=169`
  - `legacy.gps.totalPoints=24`
  - `legacy.gps.validPoints=24`
  - `legacy.gps.hasLatestData=true`
  - `v1Core.gps.points=192`
  - `v1Core.gpsAnalysis.trendDurationHours=167`
- 当前判断：
  - 现在 GPS 趋势回归和 ETA 已经不再建立在 4 小时短样本上，后续继续做算法质量会更有意义

## 2026-03-18 GPS Realistic Demo Waveform Closed

- 当前又完成一轮 GPS demo 样本真实性收口：
  - `seed-demo.ps1` 的 GNSS 序列已改成确定性的长期漂移 + 周期扰动 + 事件脉冲
  - 不再依赖随机抖动作为主要形变来源
- 当前结果：
  - `gpsMonitoringPage.points7d=168`
  - `gpsMonitoringPage.points15d=16`
  - `gpsMonitoringPage.points30d=31`
  - `gpsV1AnalysisContract.trendDirection=increasing`
  - `gpsV1AnalysisContract.trendSlopeMmPerHour=0.0218`
  - `gpsV1AnalysisContract.trendFitR2=0.3463`
  - `gpsMonitoringExport.trendDirection=increasing`
  - `gpsMonitoringExport.trendFitR2=0.3463`
  - `legacy.gps.totalPoints=168`
  - `legacy.gps.validPoints=168`
- 当前判断：
  - 当前 GPS 长时窗样本不仅更长，而且波形本身也更像真实监测数据，后续再做时序模型才更有意义

## 2026-03-19 GPS Sample Library Proof Closed

- 当前又完成一轮 GPS 样本基础收口：
  - 已新增 `check-desk-gps-sample-library.ps1`
  - 主线总 proof 当前也已补入：
    - `restart-local-api-service.ps1`
    - `gps sample library proof`
- 当前结果：
  - `summarySnapshot.completedChecks=27`
  - `summarySnapshot.pageProofs.gpsSampleProfiles=3`
  - `gpsSampleLibrary.deviceCount=3`
  - `gpsSampleLibrary.slopeOrderingStable=true`
  - `gpsSampleLibrary.fitOrderingStable=true`
  - `gpsSampleLibrary.distinctRangeBuckets=3`
- 当前判断：
  - 当前主线已经不只是“有一条更真实的 GPS 样本”，而是有一组可回归、可比较的多样性样本库入口

## 2026-03-19 GPS Event Profile Library Closed

- 当前又完成一轮 GPS 样本语义收口：
  - 3 台 baseline-backed GNSS 当前已被收口为 3 类事件类型样本
  - 并已通过专项 proof 直接断言 profile kinds
- 当前结果：
  - `gpsSampleLibrary.profileKinds=["creep_rise","event_acceleration","cyclic_oscillation"]`
  - `gpsSampleLibrary.profileKindsDistinct=true`
  - `device_1 -> creep_rise`
  - `device_2 -> event_acceleration`
  - `device_3 -> cyclic_oscillation`
- 当前判断：
  - 当前 GPS 样本库已经不只是“数值不同”，而是有了明确的事件类型语义，可继续服务后续算法评估与回放断言

## 2026-03-19 GPS Profile Evaluation Proof Closed

- 当前又完成一轮 GPS 算法评估收口：
  - 已新增 `check-desk-gps-profile-evaluation.ps1`
  - 当前按 profile 分组验证：
    - 趋势稳定性
    - 30d/7d slope
    - fit
    - 样本幅度
- 当前结果：
  - `summarySnapshot.completedChecks=28`
  - `summarySnapshot.pageProofs.gpsProfileEvaluationProfiles=3`
  - `gpsProfileEvaluation.profileCount=3`
  - `gpsProfileEvaluation.creepRiseStable=true`
  - `gpsProfileEvaluation.eventAccelerationStable=true`
  - `gpsProfileEvaluation.cyclicOscillationStable=true`
  - `gpsProfileEvaluation.slopeOrderingStable=true`
- 当前判断：
  - 当前 GPS 样本库已经不只是“有 profile 标签”，而是这些 profile 的算法评估口径也已进入正式回归真值

## 2026-03-19 GPS Profile Backtest Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-profile-backtest.ps1`
  - 当前按 24h horizon 做 profile backtest：
    - `mae24hMm`
    - `bias24hMm`
    - `directionHitRate`
    - `redSignalHitRate`
- 当前结果：
  - `summarySnapshot.completedChecks=29`
  - `summarySnapshot.pageProofs.gpsProfileBacktestProfiles=3`
  - `gpsProfileBacktest.profileCount=3`
  - `gpsProfileBacktest.directionHitStable=true`
  - `gpsProfileBacktest.redSignalOrderingStable=true`
  - `creep_rise.mae24hMm=0.9658`
  - `event_acceleration.mae24hMm=2.2572`
  - `cyclic_oscillation.redSignalHitRate=0`
- 当前判断：
  - 当前 GPS profile 已经不只是“可评估”，而是开始具备回测口径，可继续往误差分解和告警灵敏度方向推进

## 2026-03-19 GPS Profile Error Decomposition Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-profile-error-decomposition.ps1`
  - 当前按 profile 分组验证：
    - `mae6hMm`
    - `mae24hMm`
    - `bias6hMm`
    - `bias24hMm`
    - `blue/red hit`
    - `blue/red false alarm`
- 当前结果：
  - `summarySnapshot.completedChecks=30`
  - `summarySnapshot.pageProofs.gpsProfileErrorProfiles=3`
  - `gpsProfileErrorDecomposition.profileCount=3`
  - `gpsProfileErrorDecomposition.maeOrderingStable=true`
  - `gpsProfileErrorDecomposition.biasOrderingStable=true`
  - `gpsProfileErrorDecomposition.redFalseAlarmOrderingStable=true`
- 当前判断：
  - 当前 GPS profile 已经不只是“可回测”，而是开始具备误差分解口径，可继续往真正的算法误差治理推进

## 2026-03-19 GPS Profile Alert Sensitivity Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-profile-alert-sensitivity.ps1`
  - 当前按 profile 分组验证：
    - `blue sensitivity`
    - `red sensitivity`
    - `cyclic red specificity`
- 当前结果：
  - `summarySnapshot.completedChecks=31`
  - `summarySnapshot.pageProofs.gpsProfileAlertProfiles=3`
  - `gpsProfileAlertSensitivity.profileCount=3`
  - `gpsProfileAlertSensitivity.blueSensitivityStable=true`
  - `gpsProfileAlertSensitivity.redSensitivityStable=true`
  - `gpsProfileAlertSensitivity.cyclicRedSpecificityStable=true`
- 当前判断：
  - 当前 GPS profile 已经不只是“有误差和回测”，也开始具备 profile 级别的告警灵敏度口径

## 2026-03-19 GPS Threshold Bucket Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 当前已将 blue/red 阈值档位分层验证正式纳入专项 proof
- 当前结果：
  - `summarySnapshot.completedChecks=31`
  - `summarySnapshot.pageProofs.gpsProfileAlertProfiles=3`
  - `gpsProfileAlertSensitivity.profileCount=3`
  - `gpsProfileAlertSensitivity.blueSensitivityStable=true`
  - `gpsProfileAlertSensitivity.redSensitivityStable=true`
  - `gpsProfileAlertSensitivity.cyclicRedSpecificityStable=true`
- 当前判断：
  - 当前 GPS profile 已经开始具备阈值档位分层的告警验证能力，可继续往 precision / false alarm / miss rate 分层推进

## 2026-03-19 GPS Threshold Precision Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-threshold-precision.ps1`
  - 当前按 profile 分组验证：
    - `blue precision`
    - `yellow precision`
    - `red precision`
    - `cyclic yellow/red specificity`
- 当前结果：
  - `summarySnapshot.completedChecks=32`
  - `summarySnapshot.pageProofs.gpsThresholdPrecisionProfiles=3`
  - `gpsThresholdPrecision.profileCount=3`
  - `gpsThresholdPrecision.bluePrecisionStable=true`
  - `gpsThresholdPrecision.yellowPrecisionStable=true`
  - `gpsThresholdPrecision.redPrecisionStable=true`
  - `gpsThresholdPrecision.cyclicSpecificityStable=true`
- 当前判断：
  - 当前 GPS profile 已经开始具备阈值档位的 precision / specificity 分层验证能力，可继续往 false alarm / miss rate 分层推进

## 2026-03-19 GPS Threshold Error Rate Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-threshold-error-rates.ps1`
  - 当前按 profile 分组验证：
    - `blue miss rate`
    - `red miss rate`
    - `cyclic yellow/red false alarm rate`
- 当前结果：
  - `summarySnapshot.completedChecks=33`
  - `summarySnapshot.pageProofs.gpsThresholdErrorProfiles=3`
  - `gpsThresholdErrorRates.profileCount=3`
  - `gpsThresholdErrorRates.blueMissStable=true`
  - `gpsThresholdErrorRates.redMissStable=true`
  - `gpsThresholdErrorRates.cyclicFalseAlarmStable=true`
- 当前判断：
  - 当前 GPS profile 已经开始具备阈值档位的误报/漏报分层验证能力，可继续往 profile × horizon × 阈值档位的更细误差治理推进

## 2026-03-19 GPS Threshold Horizon Matrix Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-threshold-horizon-matrix.ps1`
  - 当前按 profile × horizon × threshold 验证：
    - `6h`
    - `24h`
    - `72h`
    - `blue/yellow/red`
- 当前结果：
  - `summarySnapshot.completedChecks=34`
  - `summarySnapshot.pageProofs.gpsThresholdMatrixProfiles=3`
  - `gpsThresholdHorizonMatrix.profileCount=3`
  - `gpsThresholdHorizonMatrix.bluePrecisionStable=true`
  - `gpsThresholdHorizonMatrix.redPrecisionStable=true`
  - `gpsThresholdHorizonMatrix.cyclicSpecificityStable=true`
- 当前判断：
  - 当前 GPS 阈值验证已经不只是分 profile、分档位，也开始具备按 horizon 展开的矩阵化验证能力

## 2026-03-19 GPS Threshold Horizon Error Matrix Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-threshold-horizon-error-matrix.ps1`
  - 当前按 profile × horizon × threshold 验证：
    - `falseAlarmRate`
    - `missRate`
    - `recall`
- 当前结果：
  - `summarySnapshot.completedChecks=35`
  - `summarySnapshot.pageProofs.gpsThresholdHorizonErrorProfiles=3`
  - `gpsThresholdHorizonErrorMatrix.profileCount=3`
  - `gpsThresholdHorizonErrorMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdHorizonErrorMatrix.blueMissStable=true`
  - `gpsThresholdHorizonErrorMatrix.redMissStable=true`
  - `gpsThresholdHorizonErrorMatrix.cyclicFalseAlarmStable=true`
- 当前判断：
  - 当前 GPS 阈值验证已经开始具备按 horizon 展开的误报/漏报矩阵化能力，可继续往更细的告警治理推进

## 2026-03-19 GPS Threshold Horizon Governance Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 当前 `precision/specificity`
  - 当前 `falseAlarm/miss/recall`
  已同时具备 `profile × horizon × threshold` 两条矩阵 proof
- 当前结果：
  - `summarySnapshot.completedChecks=35`
  - `summarySnapshot.pageProofs.gpsThresholdMatrixProfiles=3`
  - `summarySnapshot.pageProofs.gpsThresholdHorizonErrorProfiles=3`
  - `gpsThresholdHorizonMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdHorizonErrorMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdHorizonMatrix.entries[0].matrix["24h"].red.precision=1`
  - `gpsThresholdHorizonErrorMatrix.entries[2].matrix["72h"].yellow.falseAlarmRate=0`
- 当前判断：
  - 当前 GPS 阈值验证已经具备真正的 horizon 治理矩阵入口，后续可以直接继续加更细的告警治理指标，而不需要再补框架

## 2026-03-19 GPS Threshold Full Governance Matrix Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-threshold-governance-matrix.ps1`
  - 当前已把以下能力统一到同一条矩阵 proof：
    - `precision`
    - `specificity`
    - `falseAlarmRate`
    - `missRate`
    - `recall`
- 当前结果：
  - `summarySnapshot.completedChecks=36`
  - `summarySnapshot.pageProofs.gpsThresholdGovernanceProfiles=3`
  - `gpsThresholdGovernanceMatrix.profileCount=3`
  - `gpsThresholdGovernanceMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdGovernanceMatrix.blueGovernanceStable=true`
  - `gpsThresholdGovernanceMatrix.redGovernanceStable=true`
  - `gpsThresholdGovernanceMatrix.cyclicGovernanceStable=true`
- 当前判断：
  - 当前 GPS 告警验证已经具备完整的 horizon × threshold 治理矩阵入口

## 2026-03-19 GPS Threshold Governance Truth Synced

- 当前又完成一轮主线真值同步：
  - `task-queue`
  - `coordination-board`
  - `desk-backend-data-closure report`
  - `mainline coordination status`
  已全部对齐到 full governance matrix 这一轮
- 当前结果：
  - `latestBatch.taskId=desk-batch-77-gps-threshold-governance-sync`
  - `proof.completedChecks=36`
  - `proof.rainfall=79`
- 当前判断：
  - 当前 GPS 阈值治理矩阵不只是代码和 proof 存在，连主线入口和共享状态也已对齐

## 2026-03-20 GPS Threshold Scorecard Proof Closed

- 当前又完成一轮 GPS 算法治理收口：
  - 已新增 `check-desk-gps-threshold-full-matrix.ps1`
  - 已新增 `check-desk-gps-threshold-scorecard.ps1`
  - 当前将 full matrix 与 scorecard 一起并入主线总 proof
- 当前结果：
  - `summarySnapshot.completedChecks=38`
  - `summarySnapshot.pageProofs.gpsThresholdFullMatrixProfiles=3`
  - `summarySnapshot.pageProofs.gpsThresholdScorecardProfiles=3`
  - `gpsThresholdScorecard.governanceScoreStable=true`
  - `gpsThresholdScorecard.burdenOrderingStable=true`
  - `gpsThresholdScorecard.rangeOrderingStable=true`
- 当前判断：
  - 当前 GPS 阈值治理已经不只是矩阵验证，还开始具备 profile 级评分卡入口

## 2026-03-20 GPS Threshold Scorecard Truth Synced

- 当前又完成一轮主线真值同步：
  - `task-queue`
  - `coordination-board`
  - `desk-backend-data-closure report`
  - `mainline coordination status`
  已全部对齐到 full matrix + scorecard 这一轮
- 当前结果：
  - `latestBatch.taskId=desk-batch-80-gps-threshold-scorecard-sync`
  - `proof.completedChecks=38`
  - `proof.rainfall=79`
- 当前判断：
  - 当前 GPS 阈值 scorecard 不只是代码和 proof 已经落下来了，连主线真值入口也已经完全对齐

## 2026-03-20 GPS Threshold Policy Board Truth Synced

- 当前又完成一轮主线真值同步：
  - `task-queue`
  - `coordination-board`
  - `desk-backend-data-closure report`
  - `mainline coordination status`
  已全部对齐到 policy board 这一轮
- 当前结果：
  - `latestBatch.taskId=desk-batch-83-gps-threshold-policy-board-sync`
  - `proof.completedChecks=40`
  - `proof.rainfall=79`
- 当前判断：
  - 当前 GPS 阈值 policy board 不只是代码和 proof 存在，连主线真值入口也已经完全对齐

## 2026-03-20 GPS Threshold Execution Matrix Proof Closed

- 当前又完成一轮 GPS 算法治理收口：
  - 已新增 `check-desk-gps-threshold-execution-matrix.ps1`
  - 当前按 `profile × 6h/24h/72h` 验证：
    - `level`
    - `reviewHours`
    - `action`
- 当前结果：
  - `summarySnapshot.completedChecks=41`
  - `summarySnapshot.pageProofs.gpsThresholdExecutionProfiles=3`
  - `gpsThresholdExecutionMatrix.profileCount=3`
  - `gpsThresholdExecutionMatrix.reviewCadenceStable=true`
  - `gpsThresholdExecutionMatrix.levelMappingStable=true`
  - `event_acceleration @ 6h -> critical / 1h / immediate_intervention`
  - `creep_rise @ 6h -> high / 4h / onsite_review`
  - `cyclic_oscillation @ 72h -> background / 72h / archive_monitoring`
- 当前判断：
  - 当前 GPS 阈值治理已经不只是有 policy board，也开始具备可执行的处置矩阵入口

## 2026-03-20 GPS Threshold Policy Board Proof Closed

- 当前又完成一轮 GPS 算法治理收口：
  - 已新增 `check-desk-gps-threshold-policy-board.ps1`
  - 当前将 threshold ranking 继续收成可消费的 policy board
- 当前结果：
  - `summarySnapshot.completedChecks=40`
  - `summarySnapshot.pageProofs.gpsThresholdPolicyProfiles=3`
  - `gpsThresholdPolicyBoard.profileCount=3`
  - `gpsThresholdPolicyBoard.rankingStable=true`
  - `gpsThresholdPolicyBoard.policyMappingStable=true`
  - `rank1=event_acceleration -> immediate_intervention`
  - `rank2=creep_rise -> heightened_watch`
  - `rank3=cyclic_oscillation -> routine_observation`
- 当前判断：
  - 当前 GPS 阈值治理已经不只是有 scorecard 和排序，还开始具备可直接消费的策略看板入口

## 2026-03-20 GPS Threshold Ranking Proof Closed

- 当前又完成一轮 GPS 算法治理收口：
  - 已新增 `check-desk-gps-threshold-ranking.ps1`
  - 当前按 profile 留证：
    - `governanceScore`
    - `burdenScore`
    - `rangeMm`
    - `ranking`
- 当前结果：
  - `summarySnapshot.completedChecks=39`
  - `summarySnapshot.pageProofs.gpsThresholdRankingProfiles=3`
  - `gpsThresholdRanking.profileCount=3`
  - `gpsThresholdRanking.rankingStable=true`
  - `gpsThresholdRanking.governanceScoreStable=true`
  - `event_acceleration -> rank 1`
  - `creep_rise -> rank 2`
  - `cyclic_oscillation -> rank 3`
- 当前判断：
  - 当前 GPS 阈值治理已经开始具备稳定的 profile 排序入口，可继续往治理评分和策略优先级推进

## 2026-03-19 GPS Threshold Full Matrix Proof Closed

- 当前又完成一轮 GPS 算法验证收口：
  - 已新增 `check-desk-gps-threshold-full-matrix.ps1`
  - 当前将以下能力统一到一条专项 proof：
    - `precision`
    - `specificity`
    - `falseAlarmRate`
    - `missRate`
    - `recall`
    覆盖 `profile × 6h/24h/72h × blue/yellow/red`
- 当前结果：
  - `summarySnapshot.pageProofs.gpsThresholdFullMatrixProfiles=3`
  - `gpsThresholdFullMatrix.profileCount=3`
  - `gpsThresholdFullMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdFullMatrix.thresholds=["blue","yellow","red"]`
  - `gpsThresholdFullMatrix.precisionStable=true`
  - `gpsThresholdFullMatrix.missStable=true`
  - `gpsThresholdFullMatrix.cyclicSpecificityStable=true`
- 当前判断：
  - 当前 GPS 告警验证已经有了单一的 full-matrix 专项入口，后续继续扩指标时不需要再到处拆 proof

## 2026-03-20 GPS Threshold Runbook Proof Closed

- 当前又完成一轮 GPS 算法治理收口：
  - 已新增 `check-desk-gps-threshold-runbook.ps1`
  - 当前按 `profile × horizon` 验证：
    - `owner`
    - `escalation`
    - `packet`
- 当前结果：
  - `summarySnapshot.completedChecks=42`
  - `summarySnapshot.pageProofs.gpsThresholdRunbookProfiles=3`
  - `gpsThresholdRunbook.profileCount=3`
  - `gpsThresholdRunbook.escalationMappingStable=true`
  - `gpsThresholdRunbook.ownershipStable=true`
  - `event_acceleration @ 6h -> ops_commander / incident_bridge`
  - `creep_rise @ 6h -> site_engineer / geotech_lead`
  - `cyclic_oscillation @ 72h -> archive_operator / none`
- 当前判断：
  - 当前 GPS 阈值治理已经不只是有执行矩阵，也开始具备专项 runbook 入口

## 2026-03-20 GPS Threshold SLA Matrix Proof Closed

- 当前又完成一轮 GPS 算法治理收口：
  - 已新增 `check-desk-gps-threshold-sla-matrix.ps1`
  - 当前按 `profile × horizon` 验证：
    - `ackMinutes`
    - `dispatchMinutes`
    - `closureHours`
- 当前结果：
  - `summarySnapshot.completedChecks=43`
  - `summarySnapshot.pageProofs.gpsThresholdSlaProfiles=3`
  - `gpsThresholdSlaMatrix.profileCount=3`
  - `gpsThresholdSlaMatrix.ackOrderingStable=true`
  - `gpsThresholdSlaMatrix.closureOrderingStable=true`
  - `event_acceleration @ 6h -> ackMinutes=15 / dispatchMinutes=30 / closureHours=6`
  - `creep_rise @ 6h -> ackMinutes=30 / dispatchMinutes=120 / closureHours=12`
  - `cyclic_oscillation @ 72h -> ackMinutes=720 / dispatchMinutes=2880 / closureHours=96`
- 当前判断：
  - 当前 GPS 阈值治理已经不只是有 runbook，也开始具备可量化的响应时效矩阵入口

## 2026-03-20 GPS Threshold Operating Model Proof Closed

- 当前又完成一轮 GPS 算法治理收口：
  - 已新增 `check-desk-gps-threshold-operating-model.ps1`
  - 当前将以下治理入口统一到一条组合 proof：
    - `policy board`
    - `execution matrix`
    - `runbook`
    - `SLA matrix`
- 当前结果：
  - `summarySnapshot.completedChecks=44`
  - `summarySnapshot.pageProofs.gpsThresholdOperatingProfiles=3`
  - `gpsThresholdOperatingModel.profileCount=3`
  - `gpsThresholdOperatingModel.boardExecutionAlignmentStable=true`
  - `gpsThresholdOperatingModel.responseOrderingStable=true`
  - `gpsThresholdOperatingModel.escalationCoverageStable=true`
  - `event_acceleration @ 6h -> immediate_intervention / critical / incident_bridge / ackMinutes=15`
  - `creep_rise @ 6h -> heightened_watch / high / geotech_lead / ackMinutes=30`
  - `cyclic_oscillation @ 72h -> routine_observation / background / none / ackMinutes=720`
- 当前判断：
  - 当前 GPS 阈值治理已经不只是分散的单条 proof，而是开始具备统一的响应作战模型入口

## 2026-03-20 Closeout Assessment

- 当前主线共享状态：
  - `latestBatch.taskId=desk-batch-87-gps-threshold-operating-model-proof`
  - `proof.completedChecks=44`
  - `proof.rainfall=79`
  - `openGaps.totalItems=0`
- 当前判断：
  - 当前主线已经进入收尾阶段，不再建议继续横向扩 proof
  - 当前更合理的节奏是先做闭环验收，再做真值冻结，最后只收必要缺陷

## 2026-03-20 Closeout Acceptance Passed

- 当前已完成最终收尾验收：
  - `check-desk-closeout-acceptance.ps1`
  - `desk-closeout-acceptance-latest.json`
- 当前结果：
  - `closeout.readyToFreeze=true`
  - `closeout.completedChecks=44`
  - `closeout.rainfall=79`
  - `closeout.openGaps=0`
  - `closeout.operatingProfiles=3`
- 当前判断：
  - 当前主线可以进入冻结阶段
  - 后续仅保留冻结动作和必要缺陷修正

## 2026-03-20 Closeout Freeze Completed

- 当前已完成冻结动作：
  - `freeze-desk-closeout.ps1`
  - `desk-closeout-freeze-latest.json`
  - `desk-closeout-freeze-latest.md`
- 当前冻结结果：
  - `freezeDate=2026-03-20`
  - `completedChecks=44`
  - `rainfall=79`
  - `openGaps=0`
  - `uiChangesAllowed=false`
  - `nextActionPolicy=only_fix_required_defects`
- 当前判断：
  - 当前主线已完成收尾冻结
  - 后续只修必要缺陷，不再继续扩范围

## 2026-03-20 Post-freeze Verification Passed

- 当前已完成冻结后复验：
  - `check-desk-mainline-proof.ps1`
  - `check-desk-closeout-acceptance.ps1`
- 当前结果：
  - `buildExecuted=true`
  - `completedChecks=44`
  - `rainfall=79`
  - `readyToFreeze=true`
  - `openGaps=0`
- 当前判断：
  - 当前没有新增必要缺陷
  - 当前只剩一个非阻塞残余项：`vite` chunk size warning

## 2026-03-20 Analysis Screen UI Aligned

- 当前已完成新阶段的局部 UI 对齐：
  - `AnalysisPage.tsx`
  - `analysis.css`
  - `RealMapView.tsx`
  - 分析页壳层隐藏侧边栏
- 当前处理方式：
  - 以 `LAMv2_Desk` 的数据分析大屏为唯一参考
  - 只对齐数据分析可视化大屏页面与组件
  - 未改动参考目录本身
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前主线的数据分析大屏已对齐到参考版风格和结构

## 2026-03-20 UI Alignment Pass 2

- 当前已继续对齐其他页面的可见层：
  - 首页
  - 待办
  - 设置
  - 基线
  - 设备
  - GPS
  - 站点
  - 公告默认文案
- 当前处理方式：
  - 优先清理参考版中不存在的 `Mock` 可见文案
  - 保留主线真实接口与导出等后端打通能力
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前 Desk 已不只是分析大屏，其他页面的可见层也继续向参考版收口

## 2026-03-20 GPS Monitoring Copy Aligned

- 当前已继续收口：
  - `GpsMonitoringPage.tsx`
- 当前处理方式：
  - 只对齐标题和说明文案
  - 不回退主线真实导出、真实分析、真实配置链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页已继续向参考版对齐，同时保留主线增强能力

## 2026-03-20 Station Management Copy Aligned

- 当前已继续收口：
  - `StationManagementPanel.tsx`
- 当前处理方式：
  - 只对齐说明文案
  - 不回退主线真实后端保存链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 监测站管理页已继续向参考版对齐，同时保留主线增强能力

## 2026-03-21 GPS Page Placeholder Aligned

- 当前已继续收口：
  - `GpsPage.tsx`
- 当前处理方式：
  - 只对齐设备选择占位文案
  - 不回退主线基线筛选逻辑
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GpsPage 已继续向参考版对齐，同时保留主线增强能力

## 2026-03-21 GPS Modal Copy Aligned

- 当前已继续收口：
  - `GpsMonitoringPage.tsx`
- 当前处理方式：
  - 只对齐两个设置弹窗的说明文案
  - 不回退主线真实后端配置保存逻辑
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页弹窗已继续向参考版对齐，同时保留主线增强能力

## 2026-03-21 GPS Card Titles Aligned

- 当前已继续收口：
  - `GpsMonitoringPage.tsx`
- 当前处理方式：
  - 只对齐两个卡片标题文案
  - 不回退主线真实分析与数据链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页卡片标题已继续向参考版对齐，同时保留主线增强能力

## 2026-03-21 GPS Notes Aligned

- 当前已继续收口：
  - `GpsMonitoringPage.tsx`
- 当前处理方式：
  - 只对齐说明区、摘要区、指标区的提示文案
  - 不回退主线真实分析链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页说明区文案已继续向参考版对齐，同时保留主线增强能力

## 2026-03-21 GPS Prediction Notes Aligned

- 当前已继续收口：
  - `GpsMonitoringPage.tsx`
- 当前处理方式：
  - 只对齐预测摘要区和预测指标区两句提示文案
  - 不回退主线真实分析链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页预测提示文案已继续向参考版对齐，同时保留主线增强能力

## 2026-03-21 Title Sync Aligned

- 当前已继续收口：
  - `TitleSync.tsx`
  - `App.tsx`
- 当前处理方式：
  - 补回页面标题同步
  - 不影响主线真实后端链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - Desk 页面标题同步已对齐到参考版

## 2026-03-21 BaseCard Hover Aligned

- 当前已继续收口：
  - `baseCard.css`
- 当前处理方式：
  - 只对齐 hover 动效
  - 不影响任何业务逻辑
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - BaseCard 悬浮动效已对齐到参考版

## 2026-03-21 Desk-win Packaging Aligned

- 当前已完成交付层第一步：
  - `publish-desk-win.ps1`
  - `desk-win-package-latest.json`
- 当前验证：
  - 一键发布脚本已实际跑通
  - `artifacts/desk-win/win-x64` 已生成
- 当前结果：
  - `LandslideDesk.Win.exe` 已生成
  - `web/index.html` 已带入发布包
  - 发布清单已落盘
- 当前判断：
  - `desk-win` 已从“可手工发布”推进到“可重复发布”

## 2026-03-21 Docker One-click Deploy Ready

- 当前已完成：
  - `deploy-docker-oneclick.ps1`
  - `docker-deploy-latest.json`
- 当前验证：
  - `ValidateOnly` 已跑通
  - 当前能识别 `.env` 中的占位密钥问题
- 当前结果：
  - Docker/Compose/Env 检查入口已经具备
  - 一键部署命令已经明确
- 当前判断：
  - 环境配置与 Docker 一键部署已进入可执行阶段

## 2026-03-21 Desk-win Package Verified

- 当前已完成：
  - `verify-desk-win-package.ps1`
  - `desk-win-package-verify-latest.json`
- 当前验证：
  - 发布包 exe 已实际拉起
  - 验证后进程已自动关闭
- 当前结果：
  - `aliveAfterLaunch=true`
  - `stoppedAfterVerify=true`
- 当前判断：
  - `desk-win` 已进入“打包 + 验包”闭环阶段

## 2026-03-21 Desk-win Delivery Docs Ready

- 当前已新增：
  - `desk-win-env-matrix.md`
  - `desk-win-delivery-checklist.md`
- 当前结果：
  - `desk-win` 交付层现已覆盖：
    - 打包
    - 验包
    - 环境矩阵
    - 交付检查清单
- 当前判断：
  - 正常交付流程已具备更完整的交接基础

## 2026-03-21 Desk-win Prerequisites Checked

- 当前已完成：
  - `check-desk-win-prerequisites.ps1`
  - `desk-win-prerequisites-latest.json`
- 当前验证：
  - `dotnet`
  - `Microsoft.WindowsDesktop.App 8.x`
  - `WebView2 Runtime`
  - 发布包 exe / `web/index.html`
  已全部识别通过
- 当前判断：
  - `desk-win` 交付前置条件现在已经可脚本化检查

## 2026-03-21 Desk-win Delivery Ready

- 当前已完成：
  - `check-desk-win-delivery.ps1`
  - `desk-win-delivery-latest.json`
- 当前结果：
  - `ready=true`
  - `failedKeys=[]`
  - 打包 / 验包 / 前置环境检查已被统一汇总
- 当前判断：
  - 正常交付流程已具备单命令总验收入口

## 2026-03-21 Desk-win Delivery Bundle Ready

- 当前已完成：
  - `package-desk-win-delivery.ps1`
  - `desk-win-delivery-bundle-latest.json`
- 当前结果：
  - 交付目录已生成
  - zip 归档已生成
  - 发布包 / 文档 / 报告 已统一打入交付包
- 当前判断：
  - 正常交付流程已形成可交接的交付包

## 2026-03-21 Desk-win Delivery Pipeline Ready

- 当前已完成：
  - `prepare-desk-win-delivery.ps1`
  - `desk-win-delivery-pipeline-latest.json`
- 当前结果：
  - 单命令已跑通完整交付流水线
  - `ready=true`
  - delivery bundle 已自动生成
- 当前判断：
  - 正常交付流程已具备单命令一键交付入口

## 2026-03-21 Desk-win Delivery Hash Ready

- 当前已完成：
  - `hash-desk-win-delivery.ps1`
  - `desk-win-delivery-hash-latest.json`
- 当前结果：
  - exe / web / bundle 三项 SHA256 已生成
- 当前判断：
  - 正常交付流程已具备完整性校验清单

## 2026-03-22 Desk-win Delivery Summary Ready

- 当前已完成：
  - `render-desk-win-delivery-summary.ps1`
  - `desk-win-delivery-summary-latest.md`
- 当前结果：
  - 一页式交付摘要已生成
  - 已聚合路径、验证、哈希和推荐命令
- 当前判断：
  - 正常交付流程已具备直接交接用摘要

## 2026-03-22 Desk-win Packaged Runtime Ready

- 当前已完成：
  - `start-desk-win-packaged.ps1`
  - `show-desk-win-packaged-status.ps1`
  - `stop-desk-win-packaged.ps1`
- 当前结果：
  - 已验证 stop -> start -> status -> stop 生命周期
  - 运行态可识别 `isLatestPackage=true`
- 当前判断：
  - 发布包已具备完整运行态管理入口

## 2026-03-22 Desk-win Release Notes Ready

- 当前已完成：
  - `render-desk-win-release-notes.ps1`
  - `desk-win-release-notes-latest.md`
- 当前结果：
  - 发布说明已自动生成
  - 已聚合验证、哈希、非阻塞项和交接文件
- 当前判断：
  - 正常交付流程已具备对外说明用发布说明

## 2026-03-22 Desk-win Delivery Pipeline Upgraded

- 当前已完成：
  - 交付流水线升级
  - 交付包内容升级
- 当前结果：
  - 单命令流水线当前已覆盖：
    - 发布
    - 验包
    - 前置检查
    - 总验收
    - 哈希清单
    - 交付摘要
    - 发布说明
    - 交付包归档
- 当前判断：
  - 正常交付流程已具备更完整的一键交付能力

## 2026-03-22 Desk-win Latest Artifact Ready

- 当前已完成：
  - `promote-desk-win-delivery.ps1`
  - `desk-win-delivery-promote-latest.json`
- 当前结果：
  - `artifacts/desk-win/latest/` 已生成
  - `artifacts/desk-win/latest.zip` 已生成
- 当前判断：
  - 正常交付流程已具备固定 latest 交付出口

## 2026-03-22 Desk-win Pipeline Latest Ready

- 当前已完成：
  - latest 固定出口并入一键交付流水线
- 当前结果：
  - 单命令完成后会自动更新：
    - `artifacts/desk-win/latest/`
    - `artifacts/desk-win/latest.zip`
- 当前判断：
  - 正常交付流程已具备更稳定的 fixed latest 出口

## 2026-03-22 Desk-win Delivery Index Ready

- 当前已完成：
  - `render-desk-win-delivery-index.ps1`
  - `desk-win-delivery-index-latest.json`
  - `desk-win-delivery-index-latest.md`
- 当前结果：
  - latest 包
  - 报告
  - 哈希
  已具备单一入口
- 当前判断：
  - 正常交付流程已具备 single source of truth 式交付索引

## 2026-03-22 Desk-win Pipeline Index Ready

- 当前已完成：
  - delivery index 并入一键交付流水线
  - delivery index 并入交付包
- 当前结果：
  - 单命令完成后会自动更新 index
  - 交付包内也已直接携带 index
- 当前判断：
  - 正常交付流程已具备更完整的 single source of truth 交付入口

## 2026-03-22 Desk-win Pipeline BuildInfo Ready

- 当前已完成：
  - build-info 并入一键交付流水线
  - build-info 并入交付包
- 当前结果：
  - 发布包内已带 `desk-win-build-info.json`
  - 交付包内已带 `desk-win-build-info-latest.json`
- 当前判断：
  - 正常交付流程已具备构建元数据留档能力

## 2026-03-22 Desk-win Delivery Retention Ready

- 当前已完成：
  - `prune-desk-win-deliveries.ps1`
  - `desk-win-delivery-retention-latest.json`
- 当前结果：
  - delivery 目录当前仅保留最近 3 份时间戳交付包
- 当前判断：
  - 正常交付流程已具备交付包保留策略

## 2026-03-22 Desk-win Latest Delivery Ready

- 当前已完成：
  - `check-desk-win-latest-delivery.ps1`
  - `desk-win-latest-delivery-latest.json`
- 当前结果：
  - `latest/` 与 `latest.zip` 当前已通过脚本化验收
  - `missingRequiredFiles=0`
- 当前判断：
  - fixed latest 出口当前已具备可验证的交付就绪状态

## 2026-03-22 Desk-win Pipeline Latest Check Ready

- 当前已完成：
  - latest 出口验收并入一键交付流水线
- 当前结果：
  - 单命令完成后会自动更新 latest 验收结论
  - pipeline 报告已带上 latest.ready/latest.fileCount
- 当前判断：
  - 正常交付流程已具备 latest 出口的自动验收能力

## 2026-03-22 Desk-win Latest Package Verified

- 当前已完成：
  - `start-desk-win-latest.ps1`
  - `verify-desk-win-latest-package.ps1`
  - `desk-win-latest-package-verify-latest.json`
- 当前结果：
  - latest 包已实际拉起
  - latest 包验证后已自动关闭
- 当前判断：
  - fixed latest 包当前已具备直接运行验证能力

## 2026-03-22 Desk-win Pipeline Latest Ops Ready

- 当前已完成：
  - latest 包运行验证并入一键交付流水线
  - 交付包保留策略并入一键交付流水线
- 当前结果：
  - pipeline 报告已带 latest 运行验证结果
  - pipeline 报告已带 retention 结果
- 当前判断：
  - 正常交付流程已具备更完整的 latest 运维管理能力

## 2026-03-22 Desk-win Pipeline Latest Verify Ready

- 当前已完成：
  - latest 包运行验证并入一键交付流水线
- 当前结果：
  - 单命令完成后会自动更新 latest 运行验证结论
  - pipeline 报告已带上 `latest.verifyAliveAfterLaunch/latest.verifyStoppedAfterVerify`
- 当前判断：
  - 正常交付流程已具备 latest 包的自动运行验证能力

## 2026-03-22 Desk-win Pipeline Latest Ops Ready（二）

- 当前已完成：
  - latest 出口验收并入一键交付流水线
  - latest 包运行验证并入一键交付流水线
  - 交付包保留策略并入一键交付流水线
- 当前结果：
  - pipeline 报告当前已带：
    - `latest.ready=true`
    - `latest.verifyAliveAfterLaunch=true`
    - `latest.verifyStoppedAfterVerify=true`
    - `retention.keep=3`
- 当前判断：
  - 正常交付流程已具备更完整的 latest 运维管理能力

## 2026-03-22 Desk-win Packaged Start Ready

- 当前已完成：
  - `start-desk-win-packaged.ps1`
- 当前结果：
  - 已能从最新发布目录直接拉起 `LandslideDesk.Win.exe`
  - 启动时会清除 `DESK_DEV_SERVER_URL`
- 当前判断：
  - 正常交付流程已具备“直接启动发布包”的稳定入口

## 2026-03-22 Desk Build Perf And Prod Env Ready

- 当前已完成：
  - `render-prod-env-checklist.ps1`
  - Desk 路由懒加载与 vendor 拆包
- 当前结果：
  - 生产环境参数已清单化
  - 前端构建已从单大包切到页面级 chunk + vendor chunk
- 当前判断：
  - 当前交付层剩余重点已收敛为占位密钥替换和进一步 vendor chunk 优化

## 2026-03-22 Desk Vendor Chunks Split Further

- 当前已完成：
  - `vite.config.ts` vendor chunk 继续细拆
- 当前结果：
  - `echarts` 当前已拆成 `core / charts / components / engine / zrender`
  - `three` 当前已拆成 `core / extras`
  - `antd` 当前已拆成 `core / icons / table / form / picker / nav / overlay / select / rc`
- 当前判断：
  - 当前性能问题已收敛到 `vendor-antd-core` 单块仍略高于 500k
