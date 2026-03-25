# 任务队列

## 说明

本文件是当前主线仓的人工任务队列。

当前默认执行模式：

- **单线程主推进**
- 默认由总协调器直接规划并执行
- 仅在用户明确要求时再启用并发任务

使用规则：

- 开始任务前先看本文件
- 开工时把状态改为 `in_progress`
- 完成后改为 `ready_for_integration`
- 合到 `integration` 后改为 `integrated`
- 若阻塞则改为 `blocked`，并写明原因

## 状态定义

- `ready`：可开始
- `in_progress`：正在执行
- `blocked`：被依赖或冲突阻塞
- `checkpointed`：已有阶段性落盘记录，但未达到完成
- `ready_for_integration`：本线完成，等待合入 `integration`
- `integrated`：已进入 `integration`
- `archived`：阶段性完成，无需继续推进

## 当前队列

| 优先级 | 任务ID | 状态 | 工作树 | 主题 | 依赖 | 输出物 |
|---|---|---|---|---|---|---|
| P0 | `platform-restore-check` | `integrated` | `platform-restore-check` | 平台恢复、服务与基础设施核查 | 无 | 恢复清单、可运行性结论、闭环断点 |
| P0 | `desk-api-align` | `integrated` | `desk-api-align` | Desk ↔ 平台 API 对齐 | `platform-restore-check` 部分结论 | API 对齐表、迁移建议 |
| P1 | `gnss-protocol` | `integrated` | `gnss-protocol` | GNSS、基线、设备协议资料收口 | 无 | 协议摘要、字段统一说明 |
| P1 | `algo-inventory` | `integrated` | `algo-inventory` | 算法全量清点与卡片底稿 | 无 | 算法清单、卡片底稿 |
| P1 | `integration-round-01` | `completed` | `integration` | 第一轮结果汇总与冲突收口 | `platform-restore-check`、`desk-api-align`、`gnss-protocol`、`algo-inventory` | 可合并文档、冲突清单、集成结论 |
| P2 | `runtime-validation` | `integrated` | `platform-restore-check` | 平台与 Desk 第二轮运行验证 | `integration-round-01` 结论 | 运行验证结论、真实阻塞清单 |
| P2 | `sensor-dictionary-sync` | `integrated` | `gnss-protocol` | 同步 GPS/GNSS sensorKey 与种子字典 | `integration-round-01` 结论 | sensorKey 清单、字典修订建议 |
| P2 | `algo-validation-plan` | `integrated` | `algo-inventory` | 补算法验证计划与样例来源 | `integration-round-01` 结论 | 验证计划、样例来源清单 |
| P2 | `desk-api-implementation` | `integrated` | `desk-api-align` | Desk API adapter 与首批迁移实现 | `integration-round-01` 结论 | adapter 方案、首批实现与回归结论 |
| P2 | `integration-round-02` | `completed` | `integration` | 第二轮结果汇总与冲突收口 | `runtime-validation`、`sensor-dictionary-sync`、`algo-validation-plan`、`desk-api-implementation` | 集成结论、冲突清单、后续实施建议 |
| P3 | `platform-compose-up` | `integrated` | `platform-restore-check` | 基础设施真实启动与前置修复 | `integration-round-02` 结论 | compose 启动结论、环境修复说明 |
| P3 | `desk-http-live-validation` | `integrated` | `desk-api-align` | Desk 对真实 API 的首轮联调 | `platform-compose-up` | 联调结论、接口问题清单 |
| P3 | `algo-replay-assertions` | `integrated` | `algo-inventory` | 为 replay 样例补断言与执行脚本 | `integration-round-02` 结论 | 回放断言、执行脚本、验证结果 |
| P3 | `integration-round-03` | `completed` | `integration` | 第三轮结果汇总与冲突收口 | `platform-compose-up`、`desk-http-live-validation`、`algo-replay-assertions` | 集成结论、冲突清单、后续实施建议 |
| P4 | `platform-runtime-stabilization` | `completed` | `platform-restore-check` | 让平台环境稳定常驻并可复验 | `integration-round-03` 结论 | 常驻启动方案、复验结论 |
| P4 | `desk-live-issues-fix` | `completed` | `desk-api-align` | 修复真实联调暴露的数据质量与契约问题 | `integration-round-03` 结论 | 修复清单、复验结果 |
| P4 | `gnss-demo-data-fix` | `blocked` | `gnss-protocol` | 修复 GNSS / 站点 demo 数据质量问题 | `integration-round-03` 结论 | seed 修复清单、数据修复结论 |
| P4 | `algo-worker-online-replay` | `completed` | `algo-inventory` | 将 replay 样例推进到 worker/链路级验证 | `integration-round-03` 结论 | 在线回放方案、验证结论 |
| P5 | `seed-demo-data-remediation` | `ready` | `mainline` | 统一修复 seed / demo 数据质量与映射问题 | `desk-live-issues-fix`、`gnss-demo-data-fix` 当前结论 | 数据修复、契约边界、复验结论 |
| P0 | `front-back-data-link-audit` | `completed` | `mainline` | 梳理前端依赖接口、后端实现与数据库/seed/查询链路缺口 | W1-W4 当前结论 | 接口映射、数据链路缺口、实现优先级 |
| P0 | `seed-demo-truth-unify` | `completed` | `mainline` | 统一 seed-demo.ps1 与 14-seed-data.sql 的 demo 真值 | `front-back-data-link-audit` | 真值统一、文档示例统一、主线结论 |
| P0 | `frontend-formal-entry-cleanup` | `completed` | `mainline` | 收口前端正式入口，避免默认进入 legacy/demo 组合链 | `front-back-data-link-audit`、`seed-demo-truth-unify` | 正式入口替换、导航修正、迁移优先级 |
| P1 | `system-resource-model-interface` | `archived` | `mainline` | 新增资源占用模型接口，与健康摘要模型分离 | `desk-backend-data-closure` 当前结论 | OpenSpec proposal、接口契约、后端实现 |

## 当前派发（2026-03-14，覆盖旧派发）

本节是当前唯一有效的领取入口。

从现在开始，其他 CLI 窗口领取任务时，优先读取本节；本节未提及的旧派发一律视为被覆盖，不再继续执行。

当前状态补充：

- 本轮 `desk-contract-backend-fill` / `desk-consumer-recheck` / `platform-dashboard-contract-smoke` 的最小目标已完成
- 当前四线已完成，等待下一条主线派发

## 当前派发（2026-03-15，覆盖旧派发）

本节从现在开始覆盖 `2026-03-14` 的当前派发。

当前唯一优先方向：

- **先把前端当前依赖的数据接口、对应后端接口、以及数据库 / seed / 查询链路里还没真正打通的部分梳理清楚**

当前状态补充：

- `front-back-data-link-audit` 已完成并落盘到 `docs/unified/reports/front-back-data-link-audit.md`
- `seed-demo-truth-unify` 已完成并落盘到 `docs/unified/reports/seed-demo-truth-unify.md`
- `frontend-formal-entry-cleanup` 已完成当前轮目标

## 当前派发（2026-03-15 / round-1，覆盖旧派发）

本节从现在开始覆盖本日较早的 `2026-03-15` 当前派发。

当前主推进：

- **`frontend-formal-entry-cleanup` 已完成**

目标：

1. 统一 `infra/compose/scripts/seed-demo.ps1` 与 `docs/integrations/storage/postgres/tables/14-seed-data.sql`
2. 明确运行态 demo 真值以 `seed-demo.ps1` 为准
3. 同步修正文档示例中直接引用 demo 坐标/样例的关键位置

本轮边界：

- 只处理 seed/demo 真值统一
- 不同时展开前端正式入口迁移

输出物：

- 统一后的 seed/demo 真值
- 对应 API / 存储文档示例修正
- 主线报告、看板、日记同步

下一步：

- 下一轮进入 legacy/demo 页面本体清理

## 当前派发（2026-03-16，覆盖所有旧派发）

本节从现在开始覆盖本文件里更早的所有 `当前派发`。

当前唯一优先方向：

- **桌面端前端冻结；优先打通桌面端依赖的数据库、后端接口、算法与数据链路**

当前结论：

- `apps/desk` 前端本身当前不再继续改 UI
- 之前的 Web 入口收口不再作为当前主推进
- 当前真正要推进的是：
  - Desk 依赖接口与数据库/seed/query 的真实闭环
  - 算法/回放/数据质量与 Desk 查询口径的闭环

### 总协调器 / 主线执行

- 工作位置：`mainline`
- 任务ID：`desk-backend-data-closure`
- 主题：桌面端后端与数据闭环收口
- 目标：
  - 保持 `apps/desk` 前端现状，不再继续改 UI
  - 优先梳理并打通 Desk 依赖的真实后端接口
  - 优先梳理并打通数据库 / seed / 查询 / 算法链路
- 主要落点：
  - `services/api/src/routes/*`
  - `infra/compose/scripts/*`
  - `docs/integrations/storage/*`
  - `docs/integrations/api/*`
  - 与算法/回放直接相关的后端与脚本
- 输出物：
  - Desk 数据闭环缺口清单
  - 后端/数据库修复
  - 最小可运行留证

当前进度：

- `desk-api-runtime-alignment` 已完成当前轮目标
- 当前运行口径：
  - Desk：`http://localhost:5174`
  - API：`http://localhost:8081`
- `desk-backend-data-closure` 已完成当前轮目标
- `2026-03-17` 最新复验真值：
  - `services/api/.env` / `.env.example` 已统一回 `API_PORT=8081`
  - `GET /api/dashboard/summary`：
    - `stationCount=1`
    - `deviceOnlineCount=3`
    - `alertCountToday=1`
    - `systemHealthPercent=87`
  - `check-desk-http-legacy.ps1`：
    - `weeklyTrend.alertSum=3`
    - `weeklyTrend.rainfallSum=79`
    - `gps.totalPoints=240`
    - `baselines.autoPersisted=false`
  - 当前验证脚本已收口为非污染模式，不再改写 demo baseline 真值
  - `/api/devices` 当前也已改为按 `last_seen_at` 的 `24h` 窗口计算 legacy 在线状态
  - `check-desk-http-legacy.ps1` 当前已可自动断言：
    - `baselines.upsertPersisted=false`
    - `baselines.autoPersisted=false`
    - `baselines.proofStable=true`
  - `/api/devices` 当前已补充：
    - `legacyDeviceId`
    - `sensorTypes`
  - `check-desk-http-legacy.ps1` 当前已补充跨接口一致性断言：
    - `devices.stationConsistency=true`
  - 当前已新增更贴近桌面端真实用法的 mixed proof：
    - `scripts/dev/check-desk-http-runtime.ps1`
    - `summary.legacyEqualsV1Core=true`
    - `weeklyTrend.legacyEqualsV1=true`
    - `baselines.legacyEqualsV1=true`
    - `baselines.deviceCoverage=true`
    - `gps.baselineConsistency=true`
    - `system.legacyEqualsV1=true`
    - `baselines.upsertPersisted=false`
    - `baselines.autoPersisted=false`
    - `baselines.proofStable=true`
  - 主线 `apps/desk` 当前已进一步收口到：
    - `dashboard` → v1
    - `weeklyTrend` → v1
    - `system status` → v1

分阶段执行：

1. `desk-api-runtime-alignment`
   - 对齐 Desk 实际运行端口、baseUrl、auth 要求
   - 先确保 Desk HTTP 模式能稳定连到当前 `api-service`
2. `desk-core-data-closure`
   - 打通 Desk 核心依赖：
     - stations
     - devices
     - dashboard summary / weekly trend
     - system status
3. `desk-gps-chain-closure`
   - 打通：
     - gps baselines
     - gps deformations
     - 相关 seed / query / baseline 口径
4. `desk-algo-query-closure`
   - 收口 weeklyTrend / replay / 风险记录 / 形变趋势之间的查询口径
5. `desk-http-live-proof`
   - 在不改 Desk UI 的前提下，补最小 HTTP 运行留证

统一执行要求：

- 仍以主线 `docs/unified/task-queue.md` 为领取入口
- 若需调整派发，先更新 `docs/journal/2026-03.md`、`docs/unified/coordination-board.md`、本文件
- 本轮先做梳理与真值收口，再决定实现切入点

### 总协调器 / 主线执行

- 工作位置：`mainline`
- 任务ID：`front-back-data-link-audit`
- 主题：前后端与数据库打通梳理
- 目标：
  - 梳理 `apps/desk` / `apps/web` 当前依赖的数据接口
  - 对齐对应后端接口与真实实现落点
  - 找出数据库 / seed / 查询链路还没真正打通的位置
- 主要落点：
  - `apps/desk/src/api/*`
  - `apps/web/lib/api/*`
  - `services/api/src/routes/*`
  - `docs/integrations/api/*`
  - `infra/compose/scripts/*`
  - `docs/integrations/storage/*`
- 输出物：
  - 前端接口依赖清单
  - 后端对齐清单
  - 数据链路缺口清单
  - 下一步实现优先级

统一执行要求：

- 开工前先读：`AGENTS.md`、`docs/journal/README.md`、当前 worktree 的 `docs/journal/2026-03.md`
- 先写当前 worktree 的当月日记
- 若有效进展尚未回流主线，再同步主线 `docs/journal/2026-03.md`
- 每次任务完成后，必须把最终输出原文写入 `CLI 最终输出原文`
- 本轮只做派发范围内的任务，不顺手扩展到其他代码改动

### 总协调器 / 主线执行

- 工作位置：`mainline`
- 任务ID：`desk-contract-backend-fill`
- 主题：补齐 W2 的后端正式契约
- 目标：
  - 处理 `weeklyTrend` 正式契约
  - 处理 `system status` 等价模型或页面口径
- 主要落点：
  - `services/api/src/routes/system.ts`
  - `docs/integrations/api/018-desk-ui.md`
  - 相关复验脚本与主线报告/日记
- 输出物：
  - 后端接口实现
  - 契约文档更新
  - Desk 复验结论

### 窗口 1：`desk-api-align`

- 任务ID：`desk-consumer-recheck`
- 主题：Desk 消费侧复验与最小适配准备
- 当前上游状态：
  - 主线已补 `weeklyTrend` 正式接口
  - 主线已补 `system status` 的 `source/note/items[]`
- 目标：
  - 只围绕 `weeklyTrend`、`system status` 做 Desk 侧最小适配准备
  - 记录当前 Desk 期待的正式返回形状
  - 标记哪些 fallback 可以删除、哪些地方仍需兼容
- 可改范围：
  - `apps/desk/src/api/*`
  - `apps/desk/src/views/DashboardPage.tsx`
  - `apps/desk/src/views/SystemPage.tsx`
  - 当前 worktree 日记与报告
- 禁止事项：
  - 不新增页面
  - 不扩大 fallback
  - 不做后端主实现
- 输出物：
  - Desk 侧复验记录
  - 最小适配建议
  - 当前 worktree 日记更新

### 窗口 2：`platform-restore-check`

- 任务ID：`platform-dashboard-contract-smoke`
- 主题：新接口带鉴权 smoke / e2e 验证准备
- 当前上游状态：
  - 主线已补 `/api/v1/dashboard/weekly-trend`
  - 当前不再等待接口创建，改为进入现有运行态留证
- 目标：
  - 围绕 `/api/v1/dashboard`
  - 围绕拟新增的 weekly trend 接口
  - 围绕 `/api/v1/system/status`
  - 检查现有脚本和 runbook 能否覆盖这些接口
- 可改范围：
  - `infra/compose/scripts/*`
  - `infra/compose/README.md`
  - 当前 worktree 日记与报告
- 禁止事项：
  - 不做 Desk 页面改动
  - 不扩展到无关基础设施重构
- 输出物：
  - 验证入口说明
  - 成功判据
  - blocker 清单
  - 当前 worktree 日记更新

### 窗口 3：`gnss-protocol`

- 任务ID：`dashboard-data-semantics-audit`
- 主题：dashboard 数据口径与 demo 数据一致性审计
- 目标：
  - 检查 dashboard / weekly trend / system status 可能依赖的站点、设备、GNSS demo 数据口径
  - 确认站点数、设备在线状态、demo 字段不会互相矛盾
- 可改范围：
  - `docs/unified/*`
  - `docs/integrations/*`
  - 当前 worktree 日记与报告
- 禁止事项：
  - 不做主接口实现
  - 不进入 Desk 页面或 Web 页面修改
- 输出物：
  - 事实清单
  - 风险点
  - 建议项
  - 当前 worktree 日记更新

### 窗口 4：`algo-inventory`

- 任务ID：`weekly-trend-semantics-audit`
- 主题：weeklyTrend 趋势语义审计
- 目标：
  - 核对 `weeklyTrend` 与现有 risk / replay / trend 口径是否冲突
  - 给出最小字段建议、样例建议、断言建议
- 可改范围：
  - `docs/algorithms/*`
  - `docs/unified/*`
  - `scripts/dev/*` 中与 replay 样例说明直接相关的文档或脚本
  - 当前 worktree 日记与报告
- 禁止事项：
  - 不做主 API 实现
  - 不扩展算法功能
- 输出物：
  - 趋势语义建议
  - 样例 / 断言建议
  - 当前 worktree 日记更新

## 启动顺序建议

### 第一波

- `platform-restore-check`
- `gnss-protocol`
- `algo-inventory`

### 第二波

- `runtime-validation`
- `sensor-dictionary-sync`
- `algo-validation-plan`
- `desk-api-implementation`

### 第三波

- `platform-compose-up`
- `desk-http-live-validation`
- `algo-replay-assertions`

### 第四波

- `platform-runtime-stabilization`
- `desk-live-issues-fix`
- `gnss-demo-data-fix`
- `algo-worker-online-replay`

说明：

- 第一轮四条专题任务已完成
- 第二轮集成已完成
- 第三轮集成已完成
- 当前可以进入第四轮专题任务
- 按 `board + report` 复核后：
  - `platform-runtime-stabilization` 仍为 `ready`
  - `algo-worker-online-replay` 提升为 `checkpointed`

## 当前协调观察（2026-03-12）

- `platform-restore-check`：已提交核查报告并修正 Kafka 示例配置，达到 `ready_for_integration`
- `gnss-protocol`：已提交 GNSS / 协议 / 基线统一稿，达到 `ready_for_integration`
- `algo-inventory`：已提交算法清单与卡片底稿，达到 `ready_for_integration`
- `desk-api-align`：已完成第一轮对齐文档与迁移优先级分析，达到 `ready_for_integration`
- `integration-round-01`：已完成第一轮收口
- 第三轮实际推进情况：
  - `platform-compose-up`：已完成基础设施启动与最小闭环实跑
  - `desk-http-live-validation`：已完成真实 API 联调与复验
  - `algo-replay-assertions`：已完成 replay 断言与脚本落地
- 最新巡检结论：
  - 第三轮 3 条任务均可收口

## 更新模板

新增任务时，按以下格式补充：

| 优先级 | 任务ID | 状态 | 工作树 | 主题 | 依赖 | 输出物 |
|---|---|---|---|---|---|---|
| PX | `task-id` | `ready` | `worktree-name` | 简述 | 上游任务 | 交付物 |

## 当前负责人建议

- `platform-restore-check`：优先由最熟悉平台结构的 CLI 负责
- `desk-api-align`：优先由最熟悉 Desk 页面与接口的 CLI 负责
- `gnss-protocol`：优先由最熟悉硬件、GNSS、基线的人或 CLI 负责
- `algo-inventory`：优先由最熟悉形变分析、规则和统计的人或 CLI 负责

## 队列维护原则

- 同一时间不要让两个 CLI 同做同一任务
- 每次任务状态变化都要更新本文件
- 若任务拆分，应显式创建新的任务ID，不要在原任务里悄悄膨胀范围
- 从 2026-03-13 起，若本轮没有 `report` 或 `journal checkpoint`，默认视为未完成

## 2026-03-17 最新 Desk 真值补充（二）

- 主线 `apps/desk` 当前又进一步收口到：
  - `stations` → v1
  - `devices` → v1
- 当前 mixed runtime proof 最新新增结果：
  - `stations.legacyEqualsV1=true`
  - `devices.legacyEqualsV1=true`

## 2026-03-17 最新 Desk 真值补充（三）

- 当前已新增 v1-only proof：
  - `scripts/dev/check-desk-http-v1-core.ps1`
- 当前 v1 core chain 关键结果：
  - `stations.deviceCoverage=true`
  - `devices.stationCoverage=true`
  - `baselines.deviceCoverage=true`
  - `baselines.proofStable=true`
  - `gps.baselineConsistency=true`

## 2026-03-17 最新 Desk 真值补充（四）

- 当前站点聚合语义也已对齐：
  - `stations.legacyEqualsV1=true`
  - `devices.legacyEqualsV1=true`
  - `devices.stationConsistency=true`

## 2026-03-17 最新 Desk 真值补充（五）

- 当前本地真实 JWT 登录已打通：
  - `seed-demo.ps1` 已补 `admin / 123456`
  - `/api/v1/auth/login` 已成功返回 `token + refreshToken + roles=["admin"]`
  - `check-desk-http-v1-core.ps1` 已改为携带真实 JWT 留证

## 2026-03-17 最新 Desk 真值补充（六）

- 当前认证链留证已补强到：
  - `auth/me`
  - `auth/refresh`
  - refresh 后继续访问 v1 core chain
- 当前关键结果：
  - `auth.hasRefreshToken=true`
  - `auth.refreshWorks=true`
  - `auth.permissions=16`

## 2026-03-17 最新 Desk 真值补充（七）

- 当前 RBAC 角色展示真值已修复：
  - `auth.roleDisplayName=Admin`
  - `roles` 表 display_name 已恢复正常

## 2026-03-17 最新 Desk 真值补充（八）

- 当前登录页“快速体验”已对齐本地真实账号：
  - `admin / 123456`

## 2026-03-17 最新 Desk 真值补充（九）

- 当前主线 Desk v1 数据层已补自动翻页：
  - `stations.list()`
  - `devices.list()`
  - `baselines.list()`

## 2026-03-17 最新 Desk 真值补充（十）

- 当前已新增主线 Desk HTTP client 本体 proof：
  - `scripts/dev/check-desk-http-client.ps1`
- 当前关键结果：
  - `auth.hasRefreshToken=true`
  - `auth.refreshRecovered=true`
  - `refreshedBaselines=3`

## 2026-03-17 最新 Desk 真值补充（十一）

- 当前主线 Desk client 本体 baseline proof 已补齐：
  - `baselineProof.upsertDeviceId=00000000-0000-0000-0000-000000000001`
  - `baselineProof.autoDeviceId=00000000-0000-0000-0000-000000000001`
  - `baselineProof.stable=true`

## 2026-03-17 最新 Desk 真值补充（十二）

- 当前已新增主路径 proof：
  - `scripts/dev/check-desk-user-journey.ps1`
- 当前关键结果：
  - `stationsPage.loadedDevices=3`
  - `devicesPage.filteredDevices=3`
  - `baselinesPage.proofStable=true`
  - `gpsPage.points=5`
  - `systemPage.items=3`

## 2026-03-17 最新 Desk 真值补充（十三）

- 当前已新增一键复验入口：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前关键结果：
  - `buildExecuted=true`
  - `auth.refreshRecovered=true`
  - `baselineProof.stable=true`
  - `baselinesPage.proofStable=true`

## 2026-03-17 最新 Desk 真值补充（十四）

- 当前一键复验入口已升级为结构化总报告：
  - `health.ok=true`
  - `v1Core.auth.roleDisplayName=Admin`
  - `client.auth.refreshRecovered=true`
  - `userJourney.baselinesPage.proofStable=true`

## 2026-03-17 最新 Desk 真值补充（十五）

- 当前一键复验入口的最终稳定结果：
  - `buildExecuted=true`
  - `health.ok=true`
  - `client.auth.refreshRecovered=true`
  - `client.baselineProof.stable=true`
  - `userJourney.baselinesPage.proofStable=true`

## 2026-03-17 最新 Desk 真值补充（十六）

- 当前 demo 真值已扩展为多状态样例：
  - `summary.stationCount=2`
  - `summary.deviceOnlineCount=3`
  - `summary.totalDevices=4`
  - `devices.missingBaselineCount=1`
  - `client.stations.first.status=offline`

## 2026-03-17 最新 Desk 真值补充（十七）

- 当前已新增只读用户边界真值：
  - `viewerBoundary.reads.stations=2`
  - `viewerBoundary.reads.devices=4`
  - `viewerBoundary.reads.baselines=3`
  - `viewerBoundary.denied.gps=禁止访问`
  - `viewerBoundary.denied.system=禁止访问`
  - `viewerBoundary.denied.baselineUpsert=禁止访问`

## 2026-03-17 最新 Desk 真值补充（十八）

- 当前多状态 demo 已进一步扩展到 warning 分支：
  - `summary.stationCount=2`
  - `summary.deviceOnlineCount=3`
  - `summary.totalDevices=5`
  - `devices.missingBaselineCount=2`
  - `client.stations.first.status=warning`
  - `client.devices.first.status=warning`

## 2026-03-17 最新 Desk 真值补充（十九）

- 当前 v1 自动翻页已完成大页数留证：
  - `stations.demo2DeviceCount=207`
  - `devices.total=210`
  - `devices.demo2Filtered=207`
  - `baselines.total=208`

## 2026-03-17 最新 Desk 真值补充（二十）

- 当前 GPS 主路径已补无 baseline GNSS 场景：
  - `summary.totalDevices=6`
  - `devices.missingBaselineCount=3`
  - `client.devices.first.status=warning`
  - `userJourney.gpsPage.deviceId=00000000-0000-0000-0000-000000000001`

## 2026-03-17 最新 Desk 真值补充（二十一）

- 当前认证边界已进一步收口：
  - `auth.mobileLoginRejected=当前 HTTP 模式未接入手机号登录，请使用账号密码登录。`

## 2026-03-17 最新 Desk 真值补充（二十二）

- 当前 seed/proof 稳定化结果：
  - `summary.totalDevices=6`
  - `devices.missingBaselineCount=3`
  - `client.devices.first.status=warning`
  - `userJourney.gpsPage.deviceId=00000000-0000-0000-0000-000000000001`

## 2026-03-17 最新 Desk 真值补充（二十三）

- 当前分页压力已可并入一键总 proof：
  - `paginationStress.stations.demo2DeviceCount=208`
  - `paginationStress.devices.total=211`
  - `paginationStress.devices.demo2Filtered=208`
  - `paginationStress.baselines.total=208`

## 2026-03-17 最新 Desk 真值补充（二十四）

- 当前基线页动作链已补主线留证：
  - `baselinesActions.baselinesPanel.gnssDevices=4`
  - `baselinesActions.baselinesPanel.baselineCountBefore=3`
  - `baselinesActions.baselinesPanel.create.baselineCountAfterCreate=4`
  - `baselinesActions.baselinesPanel.remove.restoredMissingState=true`
  - `baselinesActions.baselinesPanel.auto.proofStable=true`

## 2026-03-17 最新 Desk 真值补充（二十五）

- 当前设备管理页控制动作已补主线留证：
  - `deviceActions.deviceId=00000000-0000-0000-0000-000000000006`
  - `deviceActions.status=queued`
  - `deviceActions.commandsLoaded=3`
  - `deviceActions.foundIssuedCommand=true`

## 2026-03-17 最新 Desk 真值补充（二十六）

- 当前设备命令链边界已进一步收口：
  - `deviceActions.commandsLoaded=5`
  - `viewerBoundary.denied.deviceCommandIssue=禁止访问`
  - `viewerBoundary.denied.deviceCommandList=禁止访问`

## 2026-03-17 Desk Batch Tasks

以下批量任务从现在开始作为 Desk 主线连续执行清单，按优先级顺序自动推进；已完成项不重复扩写，未完成项继续顺次推进。

| 顺序 | 任务ID | 状态 | 主题 | 当前说明 |
|---|---|---|---|---|
| 1 | `desk-batch-01-read-core` | `completed` | 读链主线打通 | dashboard/stations/devices/system/gps/baselines 已切到主线真实链 |
| 2 | `desk-batch-02-auth-runtime` | `completed` | 本地 JWT 登录/refresh | login/me/refresh 与 Desk client refresh 已留证 |
| 3 | `desk-batch-03-proof-unify` | `completed` | 一键总 proof | 主线已具备 `check-desk-mainline-proof.ps1` |
| 4 | `desk-batch-04-demo-multistate` | `completed` | 多状态 demo 真值 | 第二站点、offline/warning、缺 baseline、viewer 已补齐 |
| 5 | `desk-batch-05-baseline-actions` | `completed` | 基线页动作链 | create/remove/auto-establish 已留证 |
| 6 | `desk-batch-06-device-actions` | `completed` | 设备控制动作链 | device command 下发与历史读取已接真链 |
| 7 | `desk-batch-07-viewer-boundary` | `completed` | 只读用户权限边界补强 | viewer 对设备控制链的拒绝行为已纳入留证 |
| 8 | `desk-batch-08-mainline-proof-coverage` | `completed` | 总 proof 覆盖补全 | viewer 设备控制边界与设备动作链已并入总报告 |
| 9 | `desk-batch-09-settings-actions` | `completed` | 设置页关键动作留证 | logout 等真实链路已补留证 |
| 10 | `desk-batch-10-device-page-actions` | `completed` | 设备页关键交互留证 | 筛选/刷新真实链路已补留证 |
| 11 | `desk-batch-11-stations-page-actions` | `completed` | 监测点页交互留证 | 抽屉与站点设备列表真实链路已留证 |
| 12 | `desk-batch-12-home-page-actions` | `completed` | 首页刷新/指标留证 | 首页刷新与关键指标链路已留证 |
| 13 | `desk-batch-13-gps-page-actions` | `completed` | GPS 页主交互留证 | 时间范围/设备切换真实链路已补留证 |
| 14 | `desk-batch-14-device-history-alignment` | `completed` | 设备命令历史继续收紧 | 页面动作与历史一致性已补强 |
| 15 | `desk-batch-15-viewer-page-boundary` | `completed` | 页面级只读边界补强 | viewer 主路径只读边界已补留证 |
| 16 | `desk-batch-16-proof-aggregation` | `completed` | 总 proof 聚合新增 action | GPS 页、viewer 主路径、设置页、设备页、监测点页、首页、基线页、设备动作页结果均已并入总报告 |
| 17 | `desk-batch-17-data-shape-hardening` | `completed` | 数据层弱类型压缩 | 列表自动翻页、命令历史真链路、baseline-aware 设备选择等弱假设已收口 |
| 18 | `desk-batch-18-report-stabilization` | `completed` | 主线真值固化 | 报告、任务文档、日记与总报告口径已同步 |
| 19 | `desk-batch-19-proof-artifact-persistence` | `completed` | 总 proof 结果落盘 | `desk-mainline-proof-latest.json` 已自动生成并更新 |
| 20 | `desk-batch-20-batch-snapshot` | `completed` | 批量任务阶段快照 | 当前 1-20 项 Desk 批量任务已形成阶段性快照 |
| 21 | `desk-batch-21-command-pagination` | `completed` | 设备命令分页留证 | `listCommands()` 在 55 条命令场景下已跨页取全 |
| 22 | `desk-batch-22-gps-monitoring-actions` | `completed` | GPS monitoring 页动作留证 | 时间范围/设备切换与 baseline-aware 选择已补留证 |
| 23 | `desk-batch-23-settings-proof-expand` | `completed` | 设置页动作补强 | logout、relogin 与认证边界已纳入留证 |
| 24 | `desk-batch-24-device-management-page-proof` | `completed` | 设备管理页页面级主路径留证 | 设备管理页汇总 proof 已补留证 |
| 25 | `desk-batch-25-proof-report-finish` | `completed` | 第二批总报告收口 | 21-24 项已并入总报告与主线真值 |
| 26 | `desk-batch-26-gps-chart-export` | `completed` | GPS monitoring 图表图片导出收口 | 图表导出已改为真实 SVG 导出并并入主线总 proof |
| 27 | `desk-batch-27-device-detail-copy` | `completed` | 设备详情复制动作收口 | 复制信息已改为真实设备详情文本复制并并入主线总 proof |
| 28 | `desk-batch-28-proof-summary-snapshot` | `completed` | 总 proof 摘要快照收口 | 总报告已新增 `summarySnapshot` 并自动生成 Markdown 摘要文件 |
| 29 | `desk-batch-29-proof-history-persistence` | `completed` | 总 proof 历史快照留档 | 每次运行总 proof 时已自动生成时间戳 JSON/Markdown 历史快照 |
| 30 | `desk-batch-30-proof-history-index` | `completed` | 总 proof 历史索引收口 | 已自动生成最近快照表和当前/上一轮差异摘要 |
| 31 | `desk-batch-31-proof-history-retention` | `completed` | 总 proof 历史保留策略收口 | 历史快照已支持自动按上限保留，避免目录无限膨胀 |
| 32 | `desk-batch-32-proof-diff-json` | `completed` | 总 proof 机器可读差异收口 | 已自动生成 current/previous/delta 的差异 JSON 供脚本直接消费 |
| 33 | `desk-batch-33-proof-manifest` | `completed` | 总 proof 统一清单收口 | 已自动生成 manifest，把 latest/history/diff/summarySnapshot 汇总为单一入口 |
| 34 | `desk-batch-34-proof-status-script` | `completed` | 主线 proof 状态读取脚本收口 | 已新增单命令状态脚本，其他窗口可直接读取 manifest 精简状态 |
| 35 | `desk-batch-35-station-management-realize` | `completed` | 站点管理页真实保存收口 | 站点管理页已切到真实后端保存并补入可恢复页面级 proof |
| 36 | `desk-batch-36-gps-threshold-config` | `completed` | GPS 阈值配置正式收口 | GPS 阈值已接 system configs，并补入可恢复 proof |
| 37 | `desk-batch-37-seed-mutex` | `completed` | demo seed 并发互斥收口 | seed-demo 已加全局互斥，避免多窗口并发 seed 污染真值 |
| 38 | `desk-batch-38-coordination-status-script` | `completed` | 主线协调状态脚本收口 | 已新增单命令协调状态脚本，直接汇总 batch/proof/history/diff |
| 39 | `desk-batch-39-history-last-matching-truth` | `completed` | 历史同真值比较收口 | 历史索引与协调状态已区分 immediate previous 和 last matching truth |
| 40 | `desk-batch-40-stable-snapshot-baseline` | `completed` | 稳定快照基线收口 | 已再留一轮稳定快照，last matching truth 现已真正可用 |
| 41 | `desk-batch-41-coordination-status-file` | `completed` | 主线协调状态共享文件收口 | 协调状态脚本现已自动写出最新 JSON 共享文件 |
| 42 | `desk-batch-42-cli-coordination-protocol` | `completed` | CLI 协作协议文档收口 | 已新增统一协作协议文档，明确读取入口、命令、回报字段和判读规则 |
| 43 | `desk-batch-43-gps-data-limit-config` | `completed` | GPS 数据点数配置正式收口 | GPS 数据点数限制已接 system configs，并补入可恢复 proof |
| 44 | `desk-batch-44-open-gaps-inventory` | `completed` | 主线未收口点清单收口 | 已新增 open gaps 清单，当前仅剩 GPS monitoring 的 3 个 UI Mock 展示点 |
| 45 | `desk-batch-45-gps-display-copy-cleanup` | `completed` | GPS 展示性残留文案收口 | GPS monitoring 剩余展示性 Mock 文案已清空，open gaps 当前为 0 |
| 46 | `desk-batch-46-gps-derived-analysis-backend` | `completed` | GPS 高阶展示块后端分析接入 | CEEMD/预测展示已优先消费后端分析结果，并补入页面 proof |
| 47 | `desk-batch-47-gps-analysis-export-backend` | `completed` | GPS 分析导出后端结果收口 | 分析导出/综合报告已带出后端分析结果，并补入 export proof |
| 48 | `desk-batch-48-gps-v1-analysis-contract` | `completed` | GPS v1 分析契约收口 | 已新增 `/api/v1/gps/deformations/{deviceId}/analysis` 并切主线 Desk client 到正式契约 |
| 49 | `desk-batch-49-gps-analysis-shared-implementation` | `completed` | GPS 高阶分析共享实现收口 | legacy 与 v1 当前已开始复用同一套核心分析实现，减少后续分叉风险 |
| 50 | `desk-batch-50-gps-v1-analysis-proof` | `completed` | GPS v1 分析独立留证收口 | `/api/v1/gps/deformations/{deviceId}/analysis` 已并入 v1 core proof 与主线总 proof |
| 51 | `desk-batch-51-gps-v1-analysis-special-proof` | `completed` | GPS v1 分析专项 proof 收口 | 已新增独立 `gps-v1-analysis-contract` proof，并并入主线总 proof |
| 52 | `desk-batch-52-local-tsx-runner` | `completed` | 本地 tsx runner 收口 | proof wrappers 已统一切到仓库本地 tsx，减少临时拉包带来的波动 |
| 53 | `desk-batch-53-local-api-restart-script` | `completed` | 本地 api-service 重启脚本收口 | 已新增一键重启脚本，统一处理 build/停旧进程/拉起/探活 |
| 54 | `desk-batch-54-local-desk-stack-restart` | `completed` | 本地 Desk 主线栈重启脚本收口 | 已新增一键重启脚本，统一处理 api-service + apps/desk dev server 拉起与探活 |
| 55 | `desk-batch-55-local-runtime-status` | `completed` | 本地 Desk 主线运行态状态脚本收口 | 已新增单命令运行态状态脚本，直接汇总 api/desk/desk-win 存活状态 |
| 56 | `desk-batch-56-local-runtime-shared-file` | `completed` | 本地 Desk 运行态共享文件收口 | 运行态状态脚本现已自动写出最新 JSON 共享文件，并补入协作协议 |
| 57 | `desk-batch-57-local-desk-win-launch` | `completed` | 本地 desk-win 启动入口收口 | 已新增启动脚本并确认运行态脚本可识别 desk-win=true |
| 58 | `desk-batch-58-local-api-restart-hardening` | `completed` | 本地 api-service 重启脚本补强 | 已改为更稳的端口释放与重试逻辑，运行态状态脚本确认 api 现可稳定读取 |
| 59 | `desk-batch-59-gps-prediction-confidence-interval-proof` | `completed` | GPS 预测置信区间留证收口 | v1/page/export/main proof 已统一断言 confidenceIntervals，seed-demo BOM 也已消除 |
| 60 | `desk-batch-60-gps-analysis-diagnostics-forecast` | `completed` | GPS 分析诊断与阈值预测收口 | v1/legacy/export/main proof 已补 trendDiagnostics 与 thresholdForecast，并同步到摘要真值 |
| 61 | `desk-batch-61-gps-regression-trend-eta` | `completed` | GPS 回归趋势与 ETA 收口 | trendDiagnostics 已改为真实时间轴回归趋势，thresholdForecast 已补 ETA/时间戳，并并入摘要真值 |
| 62 | `desk-batch-62-gps-long-window-demo-truth` | `completed` | GPS 长时窗 demo 真值收口 | seed-demo 已扩到 30 天小时级样本，legacy GPS proof 也已改为 baseline-backed 真实设备 |
| 63 | `desk-batch-63-gps-realistic-demo-waveform` | `completed` | GPS 真实感样本波形收口 | seed-demo GNSS 已改为长期漂移+周期扰动+事件脉冲，长时窗真值保持稳定 |
| 64 | `desk-batch-64-gps-sample-library-proof` | `completed` | GPS 样本库专项 proof 收口 | 已新增 3 设备长时窗样本多样性 proof，并把主线总 proof 硬化到 seed 后自动重启本地 API |
| 65 | `desk-batch-65-gps-event-profile-library` | `completed` | GPS 事件类型样本库收口 | 3 台 GNSS 当前已收口为 creep_rise / event_acceleration / cyclic_oscillation 三类样本并具备专项 proof |
| 66 | `desk-batch-66-gps-profile-evaluation-proof` | `completed` | GPS profile 算法评估 proof 收口 | 已新增按 profile 分组的趋势/幅度评估 proof，并并入主线总 proof |
| 67 | `desk-batch-67-gps-profile-backtest-proof` | `completed` | GPS profile 回测 proof 收口 | 已新增 24h horizon profile backtest proof，并并入主线总 proof |
| 68 | `desk-batch-68-gps-profile-error-decomposition-proof` | `completed` | GPS profile 误差分解 proof 收口 | 已新增 profile 级 mae/bias/阈值命中分解 proof，并并入主线总 proof |
| 69 | `desk-batch-69-gps-profile-alert-sensitivity-proof` | `completed` | GPS profile 告警灵敏度 proof 收口 | 已新增 profile 级 blue/red sensitivity 与 specificity proof，并并入主线总 proof |
| 70 | `desk-batch-70-gps-threshold-bucket-proof` | `completed` | GPS 阈值档位分层 proof 收口 | 已新增 profile 级 blue/red 阈值 sensitivity/specificity 分层 proof，并并入主线总 proof |
| 71 | `desk-batch-71-gps-threshold-precision-proof` | `completed` | GPS 阈值 precision 分层 proof 收口 | 已新增 profile 级 blue/yellow/red precision/false alarm/miss 分层 proof，并并入主线总 proof |
| 72 | `desk-batch-72-gps-threshold-error-rate-proof` | `completed` | GPS 阈值误报漏报分层 proof 收口 | 已新增 profile 级 blue/yellow/red false alarm/miss/recall 分层 proof，并并入主线总 proof |
| 73 | `desk-batch-73-gps-threshold-horizon-matrix-proof` | `completed` | GPS 阈值 horizon 矩阵 proof 收口 | 已新增 profile × 6h/24h/72h × blue/yellow/red 矩阵 proof，并并入主线总 proof |
| 74 | `desk-batch-74-gps-threshold-horizon-error-matrix-proof` | `completed` | GPS 阈值 horizon 误报漏报矩阵 proof 收口 | 已新增 profile × 6h/24h/72h × blue/yellow/red 误报漏报矩阵 proof，并并入主线总 proof |
| 75 | `desk-batch-75-gps-threshold-horizon-governance-proof` | `completed` | GPS 阈值 horizon 治理矩阵 proof 收口 | 已新增 profile × 6h/24h/72h × blue/yellow/red precision/specificity/falseAlarm/miss/recall 治理矩阵 proof，并并入主线总 proof |
| 76 | `desk-batch-76-gps-threshold-governance-full-matrix` | `completed` | GPS 阈值全量治理矩阵 proof 收口 | 已新增 profile × 6h/24h/72h × blue/yellow/red 全量治理矩阵 proof，并并入主线总 proof |
| 77 | `desk-batch-77-gps-threshold-governance-sync` | `completed` | GPS 阈值治理矩阵真值同步收口 | 已将 full governance matrix 同步到主线任务文档、协调看板、闭环报告与共享状态 |
| 78 | `desk-batch-78-gps-threshold-full-matrix-proof` | `completed` | GPS 阈值全量矩阵专项 proof 收口 | 已新增 profile × 6h/24h/72h × blue/yellow/red 全量矩阵专项 proof，并并入主线总 proof |
| 79 | `desk-batch-79-gps-threshold-scorecard-proof` | `completed` | GPS 阈值治理评分卡 proof 收口 | 已新增 full matrix scorecard proof，并将 completedChecks 推进到 38 |
| 80 | `desk-batch-80-gps-threshold-scorecard-sync` | `completed` | GPS 阈值评分卡真值同步收口 | 已将 full matrix + scorecard 同步到主线任务文档、协调看板、闭环报告与共享状态 |
| 81 | `desk-batch-81-gps-threshold-ranking-proof` | `completed` | GPS 阈值治理排序 proof 收口 | 已新增 threshold ranking proof，并将 completedChecks 推进到 39 |
| 82 | `desk-batch-82-gps-threshold-policy-board-proof` | `completed` | GPS 阈值策略看板 proof 收口 | 已新增 policy board proof，并将 completedChecks 推进到 40 |
| 83 | `desk-batch-83-gps-threshold-policy-board-sync` | `completed` | GPS 阈值策略看板真值同步收口 | 已将 policy board proof 同步到主线任务文档、协调看板、闭环报告与共享状态 |
| 84 | `desk-batch-84-gps-threshold-execution-matrix-proof` | `completed` | GPS 阈值执行矩阵 proof 收口 | 已新增 profile × 6h/24h/72h 执行级别/复核频率/动作矩阵 proof，并将 completedChecks 推进到 41 |
| 85 | `desk-batch-85-gps-threshold-runbook-proof` | `completed` | GPS 阈值 runbook proof 收口 | 已新增 profile × horizon 的 owner/escalation/packet runbook proof，并将 completedChecks 推进到 42 |
| 86 | `desk-batch-86-gps-threshold-sla-matrix-proof` | `completed` | GPS 阈值 SLA 矩阵 proof 收口 | 已新增 profile × horizon 的 ack/dispatch/closure SLA matrix proof，并将 completedChecks 推进到 43 |
| 87 | `desk-batch-87-gps-threshold-operating-model-proof` | `completed` | GPS 阈值响应作战模型 proof 收口 | 已新增 policy board + execution + runbook + SLA 的统一 operating model proof，并将 completedChecks 推进到 44 |
| 88 | `desk-batch-88-closeout-acceptance` | `completed` | 主线收尾验收通过 | 已新增 closeout acceptance 脚本并确认 `readyToFreeze=true`、`openGaps=0`、`completedChecks=44` |
| 89 | `desk-batch-89-closeout-freeze` | `completed` | 主线收尾冻结完成 | 已生成 closeout freeze 快照，冻结基线为 2026-03-20 / `completedChecks=44` / `openGaps=0` |
| 90 | `desk-batch-90-post-freeze-verification` | `completed` | 冻结后验证通过 | 已完成带构建主线验证与收尾复验，当前无新增必要缺陷，仅保留非阻塞体积告警 |
| 91 | `desk-batch-91-analysis-screen-ui-alignment` | `completed` | 数据分析大屏对齐 `LAMv2_Desk` | 已仅对齐 AnalysisPage/analysis.css/分析页壳层与地图组件，未改参考目录，Desk 构建通过 |
| 92 | `desk-batch-92-ui-alignment-pass-2` | `completed` | 其他页面可见层继续对齐 | 已继续对齐首页/待办/设置/基线/设备/GPS 等页面的可见文案与样式，保留主线真实链路，Desk 构建通过 |
| 93 | `desk-batch-93-gps-monitoring-copy-alignment` | `completed` | GPS 监测页文案继续对齐 | 已继续对齐 GpsMonitoringPage 的标题/说明文案，保留真实导出与分析链路，Desk 构建通过 |
| 94 | `desk-batch-94-station-management-copy-alignment` | `completed` | 监测站管理页说明文案继续对齐 | 已继续对齐 StationManagementPanel 的说明文案，保留真实后端保存链路，Desk 构建通过 |
| 95 | `desk-batch-95-gps-page-placeholder-alignment` | `completed` | GPS 页面占位文案继续对齐 | 已将 GpsPage 设备选择占位文案对齐到参考版，保留已建立基线筛选逻辑，Desk 构建通过 |
| 96 | `desk-batch-96-gps-modal-copy-alignment` | `completed` | GPS 弹窗说明文案继续对齐 | 已继续对齐 GpsMonitoringPage 两个设置弹窗的说明文案，保留真实后端配置保存逻辑，Desk 构建通过 |
| 97 | `desk-batch-97-gps-card-title-alignment` | `completed` | GPS 卡片标题继续对齐 | 已继续对齐 GpsMonitoringPage 两个卡片标题文案，保留真实分析与数据链路，Desk 构建通过 |
| 98 | `desk-batch-98-gps-note-copy-alignment` | `completed` | GPS 说明区文案继续对齐 | 已继续对齐 GpsMonitoringPage 的说明区/摘要区/指标区提示文案，保留真实分析链路，Desk 构建通过 |
| 99 | `desk-batch-99-gps-prediction-note-alignment` | `completed` | GPS 预测提示文案继续对齐 | 已继续对齐 GpsMonitoringPage 预测区两句提示文案到参考版原文，保留真实分析链路，Desk 构建通过 |
| 100 | `desk-batch-100-title-sync-alignment` | `completed` | 页面标题同步继续对齐 | 已补回 TitleSync 并接入 App.tsx，Desk 构建通过 |
| 101 | `desk-batch-101-basecard-hover-alignment` | `completed` | BaseCard 悬浮动效继续对齐 | 已将 BaseCard hover 动效对齐到参考版的 `translateY(-1px)`，Desk 构建通过 |
| 102 | `desk-batch-102-desk-win-package-script` | `completed` | desk-win 一键发布入口收口 | 已新增 `publish-desk-win.ps1` 并实际生成 `artifacts/desk-win/win-x64` 包与 package manifest |
| 103 | `desk-batch-103-docker-oneclick-deploy` | `completed` | Docker 一键部署入口收口 | 已新增 `deploy-docker-oneclick.ps1` 并跑通 `ValidateOnly`，能检查 `.env`、Compose、Docker 与占位密钥问题 |
| 104 | `desk-batch-104-desk-win-package-verify` | `completed` | desk-win 发布包验证收口 | 已新增 `verify-desk-win-package.ps1` 并确认发布包可启动且可自动关闭 |
| 105 | `desk-batch-105-desk-win-delivery-docs` | `completed` | desk-win 交付物料收口 | 已新增环境配置矩阵与交付检查清单，正常交付流程已有脚本 + 验包 + 清单三层物料 |
| 106 | `desk-batch-106-desk-win-prerequisites-check` | `completed` | desk-win 前置环境检查收口 | 已新增前置环境检查脚本并确认 dotnet/WebView2/发布包资源均可识别 |
| 107 | `desk-batch-107-desk-win-delivery-check` | `completed` | desk-win 交付总验收收口 | 已新增交付总验收脚本并确认 `ready=true`，正常交付流程已形成脚本化闭环 |
| 108 | `desk-batch-108-desk-win-delivery-bundle` | `completed` | desk-win 交付包归档收口 | 已新增交付包归档脚本并生成 delivery 目录与 zip，正常交付流程已形成可交接交付包 |
| 109 | `desk-batch-109-desk-win-delivery-pipeline` | `completed` | desk-win 一键交付流水线收口 | 已新增 `prepare-desk-win-delivery.ps1` 并实际跑通完整流水线，正常交付流程已形成单命令入口 |
| 110 | `desk-batch-110-desk-win-delivery-hash` | `completed` | desk-win 交付包哈希清单收口 | 已新增哈希清单脚本并生成 exe/web/bundle 的 SHA256，正常交付流程已具备完整性校验物料 |
| 111 | `desk-batch-111-desk-win-delivery-summary` | `completed` | desk-win 交付摘要收口 | 已新增交付摘要生成脚本并产出 summary markdown，正常交付流程已具备一页式交接摘要 |
| 112 | `desk-batch-112-desk-win-packaged-start` | `completed` | desk-win 发布包启动入口收口 | 已新增 `start-desk-win-packaged.ps1` 并确认能从最新发布目录直接拉起 exe |
| 113 | `desk-batch-113-desk-win-packaged-status` | `completed` | desk-win 发布包运行态收口 | 已新增发布包运行态状态脚本并确认可识别最新包是否在运行 |
| 114 | `desk-batch-114-desk-win-release-notes` | `completed` | desk-win 发布说明收口 | 已新增发布说明生成脚本并产出 release notes markdown，正常交付流程已具备对外说明物料 |
| 115 | `desk-batch-115-desk-win-delivery-pipeline-upgrade` | `completed` | desk-win 一键交付流水线升级收口 | 已将 hash/release-notes 正式并入流水线和交付包，当前单命令已覆盖发布、验包、检查、验收、哈希、摘要、说明与归档 |
| 116 | `desk-batch-116-desk-win-latest-artifact` | `completed` | desk-win 固定 latest 交付出口收口 | 已修正并确认 `artifacts/desk-win/latest/` 与 `latest.zip` 可稳定生成，交付物现已具备固定路径出口 |
| 117 | `desk-batch-117-desk-win-pipeline-latest-sync` | `completed` | desk-win 一键交付流水线 latest 同步收口 | 已将 latest 固定出口正式并入一键交付流水线，当前单命令已自动产出 latest 目录与 latest.zip |
| 118 | `desk-batch-118-desk-win-delivery-index` | `completed` | desk-win 交付索引收口 | 已新增交付索引生成脚本并产出 json/md，当前 latest 包、报告和哈希已有单一入口 |
| 119 | `desk-batch-119-desk-win-pipeline-index-sync` | `completed` | desk-win 一键交付流水线 index 同步收口 | 已将 delivery index 正式并入流水线和交付包，当前单命令已自动产出 latest/index/summary/release-notes/hash 全量物料 |
| 120 | `desk-batch-120-desk-win-pipeline-buildinfo-sync` | `completed` | desk-win 一键交付流水线 buildinfo 同步收口 | 已将 build-info 正式并入流水线和交付包，当前单命令已自动产出 latest/index/summary/release-notes/hash/build-info 全量物料 |
| 121 | `desk-batch-121-desk-win-delivery-retention` | `completed` | desk-win 交付包保留策略收口 | 已新增保留策略脚本并确认 delivery 目录只保留最近 3 份时间戳交付包 |
| 122 | `desk-batch-122-desk-win-latest-delivery-check` | `completed` | desk-win fixed latest 出口验收收口 | 已新增 latest 出口验收脚本并确认 latest 目录与 latest.zip 内部物料完整 |
| 123 | `desk-batch-123-desk-win-pipeline-latest-check-sync` | `completed` | desk-win 一键交付流水线 latest 验收同步收口 | 已将 latest 出口验收正式并入一键交付流水线，当前单命令已自动产出 latest 与 latest 验收结论 |
| 124 | `desk-batch-124-desk-win-latest-package-verify` | `completed` | desk-win fixed latest 包运行验证收口 | 已新增 latest 包运行验证脚本并确认 latest/package 下 exe 可启动且可自动关闭 |
| 125 | `desk-batch-125-desk-win-pipeline-latest-ops-sync` | `completed` | desk-win 一键交付流水线 latest 运维同步收口 | 已将 latest 包运行验证与交付包保留策略正式并入一键交付流水线，当前单命令已自动产出 latest 运维结论 |
| 125 | `desk-batch-125-desk-win-pipeline-latest-verify-sync` | `completed` | desk-win 一键交付流水线 latest 运行验证同步收口 | 已将 latest 包运行验证正式并入一键交付流水线，当前单命令已自动产出 latest 运行验证结论 |
| 126 | `desk-batch-126-desk-build-perf-and-prod-env` | `completed` | Desk 构建拆包与生产环境清单收口 | 已完成路由懒加载与 vendor 拆包，并产出 prod env checklist，剩余重点转为占位密钥替换与进一步 chunk 优化 |
| 126 | `desk-batch-126-desk-win-latest-ops-doc-sync` | `completed` | desk-win latest 运维链文档同步收口 | 已将 latest 出口验收、latest 包运行验证和保留策略同步到主线真值文档，形成一致的 latest 运维口径 |
| 127 | `desk-batch-127-desk-pipeline-and-env-sync` | `completed` | 构建拆包与生产环境清单真值同步收口 | 已将 Desk 构建拆包和生产环境实参清单同步进主线真值，当前剩余重点为占位密钥替换与进一步 vendor chunk 优化 |

## 2026-03-17 最新 Desk 真值补充（二十八）

- 当前新增页面级结果已并入主线总报告：
  - `analysisPageActions.analysisPage.anomalies=3`
  - `analysisPageActions.analysisPage.rainfallSum=79`
  - `systemPageActions.systemPage.items=3`
  - `deviceDiagnostics.diagnostics.analysisType=expert_comprehensive_health`
  - `paginationStress.devices.total=211`
  - `commandPaginationStress.commandPagination.loaded=55`
## 2026-03-17 最新 Desk 真值补充（三十）

- 当前 `AnalysisPage` 左侧遥测图已接入真实数据链：
  - `analysisPageActions.analysisPage.temperaturePoints=5`
  - `analysisPageActions.analysisPage.humidityPoints=5`
  - `analysisPageActions.analysisPage.accelerationPoints=5`
  - `analysisPageActions.analysisPage.gyroscopePoints=5`

## 2026-03-17 最新 Desk 真值补充（三十一）

- 当前设备管理页实时传感器表已接入真实遥测链：
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.temperature=0`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.humidity=0`
  - 当前选中 warning 设备无最近数据时会如实返回空/0 分支

## 2026-03-17 最新 Desk 真值补充（三十二）

- 当前设备管理页默认视角已对齐真实页面行为：
  - `deviceManagementPage.deviceManagementPage.selectedRegion=all`
  - `deviceManagementPage.deviceManagementPage.selectedDeviceId=00000000-0000-0000-0000-000000000001`
  - `deviceManagementPage.deviceManagementPage.baselineEstablished=true`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.temperature=5`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.humidity=5`
  - `deviceManagementPage.deviceManagementPage.expert.healthScore=0`

## 2026-03-17 最新 Desk 真值补充（三十三）

- 当前设备管理页导出动作已接真：
  - `devicesFilename=desk-devices.csv`
  - `devicesLines=7`
  - `baselinesFilename=desk-baselines.csv`
  - `baselinesLines=4`
  - `sensorFilename=desk-device-sensor.csv`
  - `sensorLines=6`

## 2026-03-17 最新 Desk 真值补充（三十四）

- 当前设备管理页诊断链已接真：
  - `deviceDiagnostics.diagnostics.analysisType=expert_comprehensive_health`
  - `deviceManagementPage.deviceManagementPage.expert.healthScore=0`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.temperature=5`
  - `deviceManagementPage.deviceManagementPage.telemetryPoints.humidity=5`

## 2026-03-17 最新 Desk 真值补充（三十五）

- 当前 `GpsMonitoringPage` 导出动作已接真：
  - `csvFilename=desk-gps-monitoring.csv`
  - `csvLines=6`
  - `analysisFilename=desk-gps-analysis.json`
  - `reportFilename=desk-gps-report.txt`

## 2026-03-17 最新 Desk 真值补充（三十六）

- 当前 `GpsMonitoringPage` 图表图片导出也已接真：
  - `chartFilename=desk-gps-chart.svg`
  - `chartMimeType=image/svg+xml;charset=utf-8`
  - `chartHasSvgRoot=true`
  - `chartPolylineCount=3`

## 2026-03-17 最新 Desk 真值补充（三十七）

- 当前设备管理页“复制信息”动作也已接真：
  - `detailLines=13`
  - `detailContainsDeviceName=true`
  - `detailContainsStationArea=true`
  - `detailContainsBaselineState=true`

## 2026-03-17 最新 Desk 真值补充（三十八）

- 当前主线总报告已新增快速摘要快照：
  - `summarySnapshot.completedChecks=21`
  - `summarySnapshot.demoTruth.stationCount=2`
  - `summarySnapshot.demoTruth.totalDevices=6`
  - `summarySnapshot.viewerBoundary.deniedCount=5`
  - `docs/unified/reports/desk-mainline-proof-summary-latest.md` 已自动落盘

## 2026-03-17 最新 Desk 真值补充（三十九）

- 当前主线总报告已新增历史快照留档：
  - `docs/unified/reports/history/desk-mainline-proof-20260317-202908.json`
  - `docs/unified/reports/history/desk-mainline-proof-summary-20260317-202908.md`
  - 后续每次运行 `check-desk-mainline-proof.ps1` 都会自动追加新的时间戳快照

## 2026-03-17 最新 Desk 真值补充（四十）

- 当前主线总报告已新增历史索引与最近对比：
  - `docs/unified/reports/desk-mainline-proof-history-latest.md` 已自动落盘
  - `TotalSnapshots=2`
  - `CurrentStamp=20260317-203324`
  - `PreviousStamp=20260317-202908`
  - 当前最近两轮关键口径 `DeltaChecks/DeltaStations/DeltaDevices/DeltaOnline/DeltaAlerts/DeltaRainfall/DeltaMissingBaselines/DeltaViewerDenied` 均为 `0`

## 2026-03-17 最新 Desk 真值补充（四十一）

- 当前主线总报告历史快照已新增自动保留策略：
  - `MaxHistorySnapshots=20`
  - 当前 `TotalSnapshots=3`
  - 最新快照已更新到：
    - `desk-mainline-proof-20260317-203727.json`
    - `desk-mainline-proof-summary-20260317-203727.md`
  - 超过上限后旧快照会自动清理，无需人工维护

## 2026-03-17 最新 Desk 真值补充（四十二）

- 当前主线总报告已新增机器可读差异文件：
  - `docs/unified/reports/desk-mainline-proof-diff-latest.json` 已自动落盘
  - `current.stamp=20260317-204008`
  - `previous.stamp=20260317-203727`
  - 当前 `delta.checks/stations/devices/online/alerts/rainfall/missingBaselines/viewerDenied` 全部为 `0`

## 2026-03-17 最新 Desk 真值补充（四十三）

- 当前主线总报告已新增统一 manifest：
  - `docs/unified/reports/desk-mainline-proof-manifest-latest.json` 已自动落盘
  - `history.totalSnapshots=5`
  - `history.currentStamp=20260317-210532`
  - `history.previousStamp=20260317-204008`
  - `latest.json/summary/historyIndex/diff` 路径均已汇总到该文件

## 2026-03-17 最新 Desk 真值补充（四十四）

- 当前已新增主线 proof 状态读取脚本：
  - `scripts/dev/show-desk-mainline-proof-status.ps1`
  - 当前输出：
    - `summary.completedChecks=21`
    - `summary.stations=2`
    - `summary.devices=6`
    - `summary.viewerDenied=5`
    - `diff.unchanged=true`

## 2026-03-17 最新 Desk 真值补充（四十五）

- 当前站点管理页已接入真实后端保存：
  - `stationManagementPanel.totalStations=2`
  - `stationManagementPanel.targetStationId=2586daa0-946a-4cf7-886d-6faee2725315`
  - `stationManagementPanel.targetStationName=示例监测点B-proof`
  - `stationManagementPanel.locationName=示例监测区B-proof`
  - `stationManagementPanel.chartLegendName=示例监测点B-legend-proof`
  - `summarySnapshot.pageProofs.stationManagementStations=2`

## 2026-03-17 最新 Desk 真值补充（四十六）

- 当前 GPS 阈值配置已接入正式 system configs：
  - `gpsThresholdConfig.blue=2.5`
  - `gpsThresholdConfig.yellow=5.5`
  - `gpsThresholdConfig.red=8.5`
  - `gpsThresholdConfig.restoredOriginal=true`
  - `summarySnapshot.pageProofs.gpsThresholdBlue=2.5`

## 2026-03-17 最新 Desk 真值补充（四十七）

- 当前 demo seed 已补并发互斥与阈值真值：
  - `infra/compose/scripts/seed-demo.ps1` 已新增全局 mutex
  - 已新增：
    - `gps.displacement_threshold_blue_mm=2`
    - `gps.displacement_threshold_yellow_mm=5`
    - `gps.displacement_threshold_red_mm=8`
  - 单次顺序复验当前已恢复：
    - `weeklyTrend.rainfallSum=79`

## 2026-03-17 最新 Desk 真值补充（四十八）

- 当前已新增主线协调状态脚本：
  - `scripts/dev/show-mainline-coordination-status.ps1`
  - 当前输出：
    - `latestBatch.taskId=desk-batch-37-seed-mutex`
    - `proof.completedChecks=23`
    - `proof.rainfall=79`
    - `history.totalSnapshots=9`
    - `diff.unchanged=false`

## 2026-03-17 最新 Desk 真值补充（四十九）

- 当前历史索引与协调状态已新增“最近同真值快照”比较：
  - `diff.hasLastMatching=false`
  - `diff.lastMatchingStamp=null`
  - `diff.unchangedVsLastMatching=null`
  - 当前这三个值为空不是坏事，表示这是第一轮同时满足：
    - `completedChecks=23`
    - `rainfallSum=79`
    的稳定快照，历史里还没有更早同真值快照可比

## 2026-03-17 最新 Desk 真值补充（五十）

- 当前已再留一轮稳定快照，历史同真值比较现已可用：
  - `history.totalSnapshots=10`
  - `history.currentStamp=20260317-220314`
  - `history.previousStamp=20260317-215230`
  - `diff.unchanged=true`
  - `diff.hasLastMatching=true`
  - `diff.lastMatchingStamp=20260317-215230`
  - `diff.unchangedVsLastMatching=true`

## 2026-03-17 最新 Desk 真值补充（五十一）

- 当前主线协调状态已新增共享 JSON 文件：
  - `docs/unified/reports/mainline-coordination-status-latest.json`
  - 当前关键值：
    - `latestBatch.taskId=desk-batch-40-stable-snapshot-baseline`
    - `proof.completedChecks=23`
    - `proof.rainfall=79`
    - `history.totalSnapshots=11`
    - `diff.unchanged=true`
    - `diff.unchangedVsLastMatching=true`

## 2026-03-17 最新 Desk 真值补充（五十二）

- 当前 GPS 数据点数配置已接入正式 system configs：
  - `gpsDataLimitConfig.limit=320`
  - `gpsDataLimitConfig.restoredOriginal=true`
  - `summarySnapshot.pageProofs.gpsDataLimit=320`
  - 当前总 proof 已推进到：
    - `summarySnapshot.completedChecks=24`

## 2026-03-17 最新 Desk 真值补充（五十三）

- 当前主线未收口点清单已落盘：
  - `docs/unified/reports/mainline-open-gaps-latest.json`
  - 当前仅剩：
    - `apps/desk/src/views/GpsMonitoringPage.tsx`
  - 当前仅统计到 3 个有效 UI Mock 残留点

## 2026-03-17 最新 Desk 真值补充（五十四）

- 当前 GPS monitoring 剩余展示性 Mock 文案已收口：
  - `apps/desk/src/views/GpsMonitoringPage.tsx` 相关标题/说明已改为“实时派生/派生分析/派生预测”口径
  - `show-mainline-open-gaps.ps1` 当前输出：
    - `totalFiles=0`
    - `totalItems=0`

## 2026-03-17 最新 Desk 真值补充（五十五）

- 当前 GPS monitoring 高阶展示块已开始优先消费后端分析结果：
  - `gpsMonitoringPage.ceemdImfCount=3`
  - `gpsMonitoringPage.ceemdQualityScore=1`
  - `gpsMonitoringPage.shortPredictionPoints=24`
  - `gpsMonitoringPage.longPredictionPoints=168`
  - 当前总 proof 已推进到：
    - `summarySnapshot.completedChecks=24`

## 2026-03-17 最新 Desk 真值补充（五十六）

- 当前 GPS 分析导出 / 综合报告已带出后端分析结果：
  - `gpsMonitoringExport.analysisContainsDerived=true`
  - `gpsMonitoringExport.reportIncludesCeemdQuality=true`
  - `gpsMonitoringExport.reportIncludesPredictionConfidence=true`
  - `gpsMonitoringExport.analysisLength=23596`

## 2026-03-17 最新 Desk 真值补充（五十七）

- 当前主线协调状态已刷新到最新 GPS 分析导出收口：
  - `latestBatch.taskId=desk-batch-47-gps-analysis-export-backend`
  - `proof.completedChecks=24`
  - `proof.rainfall=79`
  - `diff.unchanged=true`
  - `diff.unchangedVsLastMatching=true`

## 2026-03-17 最新 Desk 真值补充（五十八）

- 当前 GPS 高阶分析链已正式提到 v1 契约：
  - `/api/v1/gps/deformations/{deviceId}/analysis` 已可用
  - `docs/integrations/api/09-gps-deformations.md` 已补该接口说明
  - `docs/integrations/api/openapi.yaml` / `openapi.sha256` 已同步更新
  - 当前 Desk `getDerivedAnalysis()` 已优先走该 v1 接口

## 2026-03-18 最新 Desk 真值补充（五十九）

- 当前 GPS 高阶分析共享实现已开始收口：
  - `gps-deformation-legacy.ts` 与 `gps-deformations.ts` 当前已开始复用同一套核心分析计算
  - 当前顺带处理了本机磁盘不足问题：
    - `npm cache clean --force` 后当前 `E:` 可用空间约恢复到 `0.50 GB`
  - 当前主链复验继续通过：
    - `proof.completedChecks=24`
    - `proof.rainfall=79`

## 2026-03-18 最新 Desk 真值补充（六十）

- 当前 `v1 GPS analysis` 已具备独立留证：
  - `v1Core.gpsAnalysis.hasBaseline=true`
  - `v1Core.gpsAnalysis.qualityScore=0.775`
  - `v1Core.gpsAnalysis.imfCount=3`
  - `v1Core.gpsAnalysis.shortPredictionPoints=24`
  - `v1Core.gpsAnalysis.longPredictionPoints=168`

## 2026-03-18 最新 Desk 真值补充（六十一）

- 当前 `GPS v1 analysis` 已新增专项 proof：
  - `gpsV1AnalysisContract.deviceId=00000000-0000-0000-0000-000000000001`
  - `gpsV1AnalysisContract.hasBaseline=true`
  - `gpsV1AnalysisContract.qualityScore=0.775`
  - `gpsV1AnalysisContract.ceemdImfCount=3`
  - `gpsV1AnalysisContract.shortPredictionPoints=24`
  - `gpsV1AnalysisContract.longPredictionPoints=168`
  - 当前总 proof 已推进到：
    - `summarySnapshot.completedChecks=25`
    - `summarySnapshot.pageProofs.gpsV1AnalysisImfCount=3`

## 2026-03-18 最新 Desk 真值补充（六十二）

- 当前统一 `tsx` runner 已切到仓库本地依赖：
  - `scripts/dev/invoke-tsx.ps1` 已新增
  - 当前相关 `check-desk-*.ps1` wrappers 已改为优先走本地 `tsx`
  - 当前专项 proof 与总 proof继续通过：
    - `summarySnapshot.completedChecks=25`
    - `proof.rainfall=79`

## 2026-03-18 最新 Desk 真值补充（六十三）

- 当前已新增本地 `api-service` 一键重启脚本：
  - `scripts/dev/restart-local-api-service.ps1`
  - 当前验证结果：
    - `restarted=true`
    - `port=8081`
    - `health.ok=true`

## 2026-03-18 最新 Desk 真值补充（六十四）

- 当前已新增 Desk 主线本地栈一键重启脚本：
  - `scripts/dev/restart-local-desk-mainline.ps1`
  - 当前验证结果：
  - `restarted=true`
  - `apiPort=8081`
  - `deskPort=5174`
  - `deskUrl=http://[::1]:5174`
  - `Invoke-WebRequest http://[::1]:5174` 当前返回 `200`

## 2026-03-18 最新 Desk 真值补充（六十五）

- 当前已新增本地 Desk 主线运行态状态脚本：
  - `scripts/dev/show-local-desk-mainline-runtime.ps1`
  - 当前输出：
  - `api.process.pid=52664`
  - `api.health.ok=true`
  - `desk.process.pid=48116`
  - `desk.healthIpv6.ok=true`
  - `desk.healthLocalhost.ok=true`
  - `deskWin.running=false`

## 2026-03-18 最新 Desk 真值补充（六十六）

- 当前本地 Desk 主线运行态已新增共享 JSON 文件：
  - `docs/unified/reports/local-desk-mainline-runtime-latest.json`
  - 当前关键值：
  - `api.health.ok=true`
  - `desk.healthIpv6.ok=true`
  - `desk.healthLocalhost.ok=true`
  - `deskWin.running=false`

## 2026-03-18 最新 Desk 真值补充（六十七）

- 当前已新增本地 `desk-win` 启动入口：
  - `scripts/dev/start-local-desk-win.ps1`
  - 当前运行态状态脚本已能识别：
    - `deskWin.running=true`
    - `deskWin.pid=57144`

## 2026-03-18 最新 Desk 真值补充（六十八）

- 当前本地 `api-service` 重启脚本已补强：
  - `scripts/dev/restart-local-api-service.ps1` 当前返回：
    - `restarted=true`
    - `pid=10980`
    - `port=8081`
    - `health.ok=true`
  - 当前 `show-local-desk-mainline-runtime.ps1` 也已确认：
    - `api.health.ok=true`

## 2026-03-18 最新 Desk 真值补充（六十九）

- 当前 GPS 预测置信区间链已正式收口：
  - `scripts/dev/check-desk-gps-v1-analysis-contract.ps1`
  - `scripts/dev/check-desk-gps-monitoring-page.ps1`
  - `scripts/dev/check-desk-gps-monitoring-export.ps1`
  - `scripts/dev/check-desk-http-v1-core.ps1`
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前关键结果：
  - `gpsV1AnalysisContract.shortPredictionLowerPoints=24`
  - `gpsV1AnalysisContract.shortPredictionUpperPoints=24`
  - `gpsV1AnalysisContract.longPredictionLowerPoints=168`
  - `gpsV1AnalysisContract.longPredictionUpperPoints=168`
  - `gpsMonitoringExport.analysisIncludesConfidenceIntervals=true`
  - `summarySnapshot.pageProofs.gpsShortPredictionBandPoints=24`
  - `summarySnapshot.pageProofs.gpsLongPredictionBandPoints=168`
- 当前顺带修复：
  - `infra/compose/scripts/seed-demo.ps1` 已切到无 BOM UTF-8 管道输出，并在 PostgreSQL SQL 执行入口做 BOM 清洗

## 2026-03-18 最新 Desk 真值补充（七十）

- 当前 GPS 分析诊断与阈值预测链已正式收口：
  - `trendDiagnostics.direction`
  - `trendDiagnostics.slopeMmPerHour`
  - `prediction.thresholdForecast`
- 当前关键结果：
  - `gpsV1AnalysisContract.trendDirection=increasing`
  - `gpsV1AnalysisContract.trendSlopeMmPerHour=1138.2905`
  - `gpsV1AnalysisContract.thresholdBlueMm=2`
  - `gpsV1AnalysisContract.shortBlueBreached=true`
  - `gpsV1AnalysisContract.longRedBreached=true`
  - `gpsMonitoringExport.analysisIncludesTrendDiagnostics=true`
  - `gpsMonitoringExport.analysisIncludesThresholdForecast=true`
  - `gpsMonitoringExport.reportIncludesTrendDirection=true`
  - `gpsMonitoringExport.reportIncludesThresholdForecast=true`
  - `summarySnapshot.pageProofs.gpsTrendDirection=increasing`
  - `summarySnapshot.pageProofs.gpsTrendSlopeMmPerHour=1138.2905`
  - `summarySnapshot.pageProofs.gpsThresholdBlueForecastBreached=true`
  - `summarySnapshot.pageProofs.gpsThresholdRedForecastBreached=true`

## 2026-03-18 最新 Desk 真值补充（七十一）

- 当前 GPS 趋势诊断已进一步改为回归口径：
  - `trendDiagnostics.durationHours`
  - `trendDiagnostics.regressionFitR2`
- 当前阈值预测也已补 ETA：
  - `thresholdForecast.*.etaHours`
  - `thresholdForecast.*.etaDays`
  - `thresholdForecast.*.firstTimestamp`
- 当前关键结果：
  - `gpsV1AnalysisContract.trendDirection=decreasing`
  - `gpsV1AnalysisContract.trendSlopeMmPerHour=-197.6727`
  - `gpsV1AnalysisContract.trendDurationHours=4`
  - `gpsV1AnalysisContract.trendFitR2=0.1644`
  - `gpsV1AnalysisContract.shortBlueEtaHours=1`
  - `gpsV1AnalysisContract.longRedEtaHours=1`
  - `gpsMonitoringExport.trendFitR2=0.1644`
  - `gpsMonitoringExport.longRedEtaHours=1`
  - `summarySnapshot.pageProofs.gpsTrendDirection=decreasing`
  - `summarySnapshot.pageProofs.gpsTrendSlopeMmPerHour=-197.6727`
  - `summarySnapshot.pageProofs.gpsTrendFitR2=0.1644`
  - `summarySnapshot.pageProofs.gpsThresholdRedForecastEtaHours=1`

## 2026-03-18 最新 Desk 真值补充（七十二）

- 当前 GPS demo 时序真值已扩到长时窗：
  - `infra/compose/scripts/seed-demo.ps1` 当前已改为约 30 天、小时级 GNSS 遥测
  - legacy `/api/gps-deformation/:deviceId` 当前已支持 `days`
  - `check-desk-http-legacy.ps1` 当前已改为选 baseline-backed 真实设备做 GPS 留证
- 当前关键结果：
  - `gpsMonitoringPage.points7d=168`
  - `gpsMonitoringPage.points15d=16`
  - `gpsMonitoringPage.points30d=31`
  - `client.gps.points=168`
  - `gpsPage.points7d=168`
  - `gpsPage.points30d=31`
  - `gpsMonitoringExport.csvLines=169`
  - `legacy.gps.totalPoints=24`
  - `legacy.gps.validPoints=24`
  - `legacy.gps.hasLatestData=true`
  - `v1Core.gps.points=192`
  - `v1Core.gpsAnalysis.trendDurationHours=167`

## 2026-03-18 最新 Desk 真值补充（七十三）

- 当前 GPS demo 波形已进一步改成更真实的确定性样本：
  - 长期微小漂移
  - 周期性扰动
  - 局部事件脉冲
- 当前关键结果：
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
  - `legacy.gps.hasLatestData=true`
  - `summarySnapshot.pageProofs.gpsTrendDirection=increasing`
  - `summarySnapshot.pageProofs.gpsTrendSlopeMmPerHour=0.0218`
  - `summarySnapshot.pageProofs.gpsTrendFitR2=0.3463`

## 2026-03-19 最新 Desk 真值补充（一）

- 当前 GPS 样本库专项 proof 已正式收口：
  - `scripts/dev/check-desk-gps-sample-library.ps1`
  - 主线总 proof 当前也已补入：
    - `restart-local-api-service.ps1`
    - `check-desk-gps-sample-library.ps1`
- 当前关键结果：
  - `summarySnapshot.completedChecks=27`
  - `summarySnapshot.pageProofs.gpsSampleProfiles=3`
  - `gpsSampleLibrary.deviceCount=3`
  - `gpsSampleLibrary.slopeOrderingStable=true`
  - `gpsSampleLibrary.fitOrderingStable=true`
  - `gpsSampleLibrary.distinctRangeBuckets=3`
  - `gpsSampleLibrary.entries[0].rangeMm=18.53`
  - `gpsSampleLibrary.entries[1].rangeMm=11`
  - `gpsSampleLibrary.entries[2].rangeMm=10.07`

## 2026-03-19 最新 Desk 真值补充（二）

- 当前 GPS 事件类型样本库已正式收口：
  - `creep_rise`
  - `event_acceleration`
  - `cyclic_oscillation`
- 当前关键结果：
  - `gpsSampleLibrary.profileKinds=["creep_rise","event_acceleration","cyclic_oscillation"]`
  - `gpsSampleLibrary.profileKindsDistinct=true`
  - `gpsSampleLibrary.entries[0].profile=creep_rise`
  - `gpsSampleLibrary.entries[0].fitR2=0.5706`
  - `gpsSampleLibrary.entries[1].profile=event_acceleration`
  - `gpsSampleLibrary.entries[1].slopeMmPerHour30d=0.0265`
  - `gpsSampleLibrary.entries[1].rangeMm=21.78`
  - `gpsSampleLibrary.entries[2].profile=cyclic_oscillation`
  - `gpsSampleLibrary.entries[2].fitR2=0.023`

## 2026-03-19 最新 Desk 真值补充（三）

- 当前 GPS profile 算法评估 proof 已正式收口：
  - `scripts/dev/check-desk-gps-profile-evaluation.ps1`
  - 主线总 proof 当前也已补入该专项 proof
- 当前关键结果：
  - `summarySnapshot.completedChecks=28`
  - `summarySnapshot.pageProofs.gpsProfileEvaluationProfiles=3`
  - `gpsProfileEvaluation.profileCount=3`
  - `gpsProfileEvaluation.creepRiseStable=true`
  - `gpsProfileEvaluation.eventAccelerationStable=true`
  - `gpsProfileEvaluation.cyclicOscillationStable=true`
  - `gpsProfileEvaluation.slopeOrderingStable=true`
  - `gpsProfileEvaluation.entries[0].profile=creep_rise`
  - `gpsProfileEvaluation.entries[1].profile=event_acceleration`
  - `gpsProfileEvaluation.entries[2].profile=cyclic_oscillation`

## 2026-03-19 最新 Desk 真值补充（四）

- 当前 GPS profile 回测 proof 已正式收口：
  - `scripts/dev/check-desk-gps-profile-backtest.ps1`
  - 主线总 proof 当前也已补入该专项 proof
- 当前关键结果：
  - `summarySnapshot.completedChecks=29`
  - `summarySnapshot.pageProofs.gpsProfileBacktestProfiles=3`
  - `gpsProfileBacktest.profileCount=3`
  - `gpsProfileBacktest.directionHitStable=true`
  - `gpsProfileBacktest.redSignalOrderingStable=true`
  - `gpsProfileBacktest.entries[0].profile=creep_rise`
  - `gpsProfileBacktest.entries[0].mae24hMm=0.9658`
  - `gpsProfileBacktest.entries[1].profile=event_acceleration`
  - `gpsProfileBacktest.entries[1].mae24hMm=2.2572`
  - `gpsProfileBacktest.entries[2].profile=cyclic_oscillation`
  - `gpsProfileBacktest.entries[2].redSignalHitRate=0`

## 2026-03-19 最新 Desk 真值补充（五）

- 当前 GPS profile 误差分解 proof 已正式收口：
  - `scripts/dev/check-desk-gps-profile-error-decomposition.ps1`
  - 主线总 proof 当前也已补入该专项 proof
- 当前关键结果：
  - `summarySnapshot.completedChecks=30`
  - `summarySnapshot.pageProofs.gpsProfileErrorProfiles=3`
  - `gpsProfileErrorDecomposition.profileCount=3`
  - `gpsProfileErrorDecomposition.maeOrderingStable=true`
  - `gpsProfileErrorDecomposition.biasOrderingStable=true`
  - `gpsProfileErrorDecomposition.redFalseAlarmOrderingStable=true`
  - `gpsProfileErrorDecomposition.entries[0].profile=creep_rise`
  - `gpsProfileErrorDecomposition.entries[0].mae24hMm=0.5471`
  - `gpsProfileErrorDecomposition.entries[1].profile=event_acceleration`
  - `gpsProfileErrorDecomposition.entries[1].mae24hMm=6.6903`
  - `gpsProfileErrorDecomposition.entries[2].profile=cyclic_oscillation`
  - `gpsProfileErrorDecomposition.entries[2].mae24hMm=1.2575`

## 2026-03-19 最新 Desk 真值补充（六）

- 当前 GPS profile 告警灵敏度 proof 已正式收口：
  - `scripts/dev/check-desk-gps-profile-alert-sensitivity.ps1`
  - 主线总 proof 当前也已补入该专项 proof
- 当前关键结果：
  - `summarySnapshot.completedChecks=31`
  - `summarySnapshot.pageProofs.gpsProfileAlertProfiles=3`
  - `gpsProfileAlertSensitivity.profileCount=3`
  - `gpsProfileAlertSensitivity.blueSensitivityStable=true`
  - `gpsProfileAlertSensitivity.redSensitivityStable=true`
  - `gpsProfileAlertSensitivity.cyclicRedSpecificityStable=true`
  - `gpsProfileAlertSensitivity.entries[0].profile=creep_rise`
  - `gpsProfileAlertSensitivity.entries[0].red.sensitivity=1`
  - `gpsProfileAlertSensitivity.entries[1].profile=event_acceleration`
  - `gpsProfileAlertSensitivity.entries[1].red.sensitivity=1`
  - `gpsProfileAlertSensitivity.entries[2].profile=cyclic_oscillation`
  - `gpsProfileAlertSensitivity.entries[2].red.specificity=1`

## 2026-03-19 最新 Desk 真值补充（七）

- 当前 GPS 阈值 precision 分层 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-precision.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=32`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdPrecisionProfiles=3`
  - `gpsThresholdPrecision.profileCount=3`
  - `gpsThresholdPrecision.bluePrecisionStable=true`
  - `gpsThresholdPrecision.yellowPrecisionStable=true`
  - `gpsThresholdPrecision.redPrecisionStable=true`
  - `gpsThresholdPrecision.cyclicSpecificityStable=true`
  - `gpsThresholdPrecision.entries[0].blue.precision=1`
  - `gpsThresholdPrecision.entries[1].yellow.precision=1`
  - `gpsThresholdPrecision.entries[2].yellow.specificity=1`
  - `gpsThresholdPrecision.entries[2].red.specificity=1`

## 2026-03-19 最新 Desk 真值补充（八）

- 当前 GPS 阈值误报漏报分层 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-error-rates.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=33`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdErrorProfiles=3`
  - `gpsThresholdErrorRates.profileCount=3`
  - `gpsThresholdErrorRates.blueMissStable=true`
  - `gpsThresholdErrorRates.redMissStable=true`
  - `gpsThresholdErrorRates.cyclicFalseAlarmStable=true`
  - `gpsThresholdErrorRates.entries[0].blue.missRate=0`
  - `gpsThresholdErrorRates.entries[1].red.missRate=0`
  - `gpsThresholdErrorRates.entries[2].yellow.falseAlarmRate=0`
  - `gpsThresholdErrorRates.entries[2].red.falseAlarmRate=0`

## 2026-03-19 最新 Desk 真值补充（九）

- 当前 GPS 阈值 horizon 矩阵 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-horizon-matrix.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=34`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdMatrixProfiles=3`
  - `gpsThresholdHorizonMatrix.profileCount=3`
  - `gpsThresholdHorizonMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdHorizonMatrix.bluePrecisionStable=true`
  - `gpsThresholdHorizonMatrix.redPrecisionStable=true`
  - `gpsThresholdHorizonMatrix.cyclicSpecificityStable=true`
  - `gpsThresholdHorizonMatrix.entries[0].matrix["24h"].red.precision=1`
  - `gpsThresholdHorizonMatrix.entries[1].matrix["72h"].yellow.precision=1`
  - `gpsThresholdHorizonMatrix.entries[2].matrix["24h"].red.specificity=1`

## 2026-03-19 最新 Desk 真值补充（十）

- 当前 GPS 阈值 horizon 误报漏报矩阵 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-horizon-error-matrix.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=35`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdHorizonErrorProfiles=3`
  - `gpsThresholdHorizonErrorMatrix.profileCount=3`
  - `gpsThresholdHorizonErrorMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdHorizonErrorMatrix.blueMissStable=true`
  - `gpsThresholdHorizonErrorMatrix.redMissStable=true`
  - `gpsThresholdHorizonErrorMatrix.cyclicFalseAlarmStable=true`
  - `gpsThresholdHorizonErrorMatrix.entries[0].matrix["24h"].blue.missRate=0`
  - `gpsThresholdHorizonErrorMatrix.entries[1].matrix["24h"].red.missRate=0`
  - `gpsThresholdHorizonErrorMatrix.entries[2].matrix["72h"].yellow.falseAlarmRate=0`

## 2026-03-19 最新 Desk 真值补充（十一）

- 当前 GPS 阈值 horizon 治理矩阵 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-horizon-matrix.ps1`
  - `scripts/dev/check-desk-gps-threshold-horizon-error-matrix.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=35`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdMatrixProfiles=3`
  - `summarySnapshot.pageProofs.gpsThresholdHorizonErrorProfiles=3`
  - `gpsThresholdHorizonMatrix.profileCount=3`
  - `gpsThresholdHorizonErrorMatrix.profileCount=3`
  - `gpsThresholdHorizonMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdHorizonErrorMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdHorizonMatrix.entries[0].matrix["24h"].red.precision=1`
  - `gpsThresholdHorizonMatrix.entries[2].matrix["24h"].red.specificity=1`
  - `gpsThresholdHorizonErrorMatrix.entries[0].matrix["24h"].blue.missRate=0`
  - `gpsThresholdHorizonErrorMatrix.entries[2].matrix["72h"].yellow.falseAlarmRate=0`

## 2026-03-19 最新 Desk 真值补充（十二）

- 当前 GPS 阈值全量治理矩阵 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-governance-matrix.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=36`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdGovernanceProfiles=3`
  - `gpsThresholdGovernanceMatrix.profileCount=3`
  - `gpsThresholdGovernanceMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdGovernanceMatrix.blueGovernanceStable=true`
  - `gpsThresholdGovernanceMatrix.redGovernanceStable=true`
  - `gpsThresholdGovernanceMatrix.cyclicGovernanceStable=true`
  - `gpsThresholdGovernanceMatrix.entries[0].matrix["24h"].red.precision=1`
  - `gpsThresholdGovernanceMatrix.entries[1].matrix["72h"].yellow.recall=1`
  - `gpsThresholdGovernanceMatrix.entries[2].matrix["24h"].red.falseAlarmRate=0`

## 2026-03-19 最新 Desk 真值补充（十三）

- 当前 GPS 阈值全量治理矩阵真值已同步回主线入口：
  - `docs/unified/task-queue.md`
  - `docs/unified/coordination-board.md`
  - `docs/unified/reports/desk-backend-data-closure.md`
  - `docs/unified/reports/mainline-coordination-status-latest.json`
- 当前关键结果：
  - `latestBatch.taskId=desk-batch-77-gps-threshold-governance-sync`
  - `proof.completedChecks=36`
  - `proof.rainfall=79`
  - `diff.unchanged=false`

## 2026-03-20 最新 Desk 真值补充（一）

- 当前 GPS 阈值治理评分卡 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-full-matrix.ps1`
  - `scripts/dev/check-desk-gps-threshold-scorecard.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=38`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdFullMatrixProfiles=3`
  - `summarySnapshot.pageProofs.gpsThresholdScorecardProfiles=3`
  - `gpsThresholdFullMatrix.profileCount=3`
  - `gpsThresholdScorecard.profileCount=3`
  - `gpsThresholdScorecard.governanceScoreStable=true`
  - `gpsThresholdScorecard.burdenOrderingStable=true`
  - `gpsThresholdScorecard.rangeOrderingStable=true`
  - `gpsThresholdScorecard.entries[0].profile=creep_rise`
  - `gpsThresholdScorecard.entries[1].profile=event_acceleration`
  - `gpsThresholdScorecard.entries[2].profile=cyclic_oscillation`

## 2026-03-20 最新 Desk 真值补充（二）

- 当前 GPS 阈值评分卡真值已同步回主线入口：
  - `docs/unified/task-queue.md`
  - `docs/unified/coordination-board.md`
  - `docs/unified/reports/desk-backend-data-closure.md`
  - `docs/unified/reports/mainline-coordination-status-latest.json`
- 当前关键结果：
  - `latestBatch.taskId=desk-batch-80-gps-threshold-scorecard-sync`
  - `proof.completedChecks=38`
  - `proof.rainfall=79`
  - `diff.unchanged=false`

## 2026-03-20 最新 Desk 真值补充（三）

- 当前 GPS 阈值策略看板真值已同步回主线入口：
  - `docs/unified/task-queue.md`
  - `docs/unified/coordination-board.md`
  - `docs/unified/reports/desk-backend-data-closure.md`
  - `docs/unified/reports/mainline-coordination-status-latest.json`
- 当前关键结果：
  - `latestBatch.taskId=desk-batch-83-gps-threshold-policy-board-sync`
  - `proof.completedChecks=40`
  - `proof.rainfall=79`
  - `diff.unchanged=false`

## 2026-03-20 最新 Desk 真值补充（三）

- 当前 GPS 阈值策略看板 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-policy-board.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=40`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdPolicyProfiles=3`
  - `gpsThresholdPolicyBoard.profileCount=3`
  - `gpsThresholdPolicyBoard.rankingStable=true`
  - `gpsThresholdPolicyBoard.policyMappingStable=true`
  - `gpsThresholdPolicyBoard.ranking[0].action=immediate_intervention`
  - `gpsThresholdPolicyBoard.ranking[1].action=heightened_watch`
  - `gpsThresholdPolicyBoard.ranking[2].action=routine_observation`

## 2026-03-20 最新 Desk 真值补充（三）

- 当前 GPS 阈值治理排序 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-ranking.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=39`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdRankingProfiles=3`
  - `gpsThresholdRanking.profileCount=3`
  - `gpsThresholdRanking.rankingStable=true`
  - `gpsThresholdRanking.governanceScoreStable=true`
  - `gpsThresholdRanking.ranking[0].profile=event_acceleration`
  - `gpsThresholdRanking.ranking[1].profile=creep_rise`
  - `gpsThresholdRanking.ranking[2].profile=cyclic_oscillation`

## 2026-03-19 最新 Desk 真值补充（十四）

- 当前 GPS 阈值全量矩阵专项 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-full-matrix.ps1`
  - 主线总 proof 当前已补入：
    - `summarySnapshot.pageProofs.gpsThresholdFullMatrixProfiles=3`
- 当前关键结果：
  - `latestBatch.taskId=desk-batch-78-gps-threshold-full-matrix-proof`
  - `summarySnapshot.completedChecks=36`
  - `summarySnapshot.pageProofs.gpsThresholdFullMatrixProfiles=3`
  - `gpsThresholdFullMatrix.profileCount=3`
  - `gpsThresholdFullMatrix.horizons=["6h","24h","72h"]`
  - `gpsThresholdFullMatrix.thresholds=["blue","yellow","red"]`
  - `gpsThresholdFullMatrix.precisionStable=true`
  - `gpsThresholdFullMatrix.missStable=true`
  - `gpsThresholdFullMatrix.cyclicSpecificityStable=true`

## 2026-03-19 最新 Desk 真值补充（七）

- 当前 GPS 阈值档位分层 proof 已正式收口：
  - `scripts/dev/check-desk-gps-profile-alert-sensitivity.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=31`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsProfileAlertProfiles=3`
  - `gpsProfileAlertSensitivity.profileCount=3`
  - `gpsProfileAlertSensitivity.blueSensitivityStable=true`
  - `gpsProfileAlertSensitivity.redSensitivityStable=true`
  - `gpsProfileAlertSensitivity.cyclicRedSpecificityStable=true`
  - `gpsProfileAlertSensitivity.entries[0].blue.sensitivity=1`
  - `gpsProfileAlertSensitivity.entries[1].red.sensitivity=1`
  - `gpsProfileAlertSensitivity.entries[2].red.specificity=1`

## 2026-03-20 最新 Desk 真值补充（五）

- 当前 GPS 阈值 runbook proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-runbook.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=42`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdRunbookProfiles=3`
  - `gpsThresholdRunbook.profileCount=3`
  - `gpsThresholdRunbook.escalationMappingStable=true`
  - `gpsThresholdRunbook.ownershipStable=true`
  - `event_acceleration @ 6h -> ops_commander / incident_bridge / immediate-response-kit`
  - `creep_rise @ 6h -> site_engineer / geotech_lead / onsite-review-kit`
  - `cyclic_oscillation @ 72h -> archive_operator / none / archive-monitoring-kit`

## 2026-03-20 最新 Desk 真值补充（六）

- 当前 GPS 阈值 SLA 矩阵 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-sla-matrix.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=43`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdSlaProfiles=3`
  - `gpsThresholdSlaMatrix.profileCount=3`
  - `gpsThresholdSlaMatrix.ackOrderingStable=true`
  - `gpsThresholdSlaMatrix.closureOrderingStable=true`
  - `event_acceleration @ 6h -> ackMinutes=15 / dispatchMinutes=30 / closureHours=6`
  - `creep_rise @ 6h -> ackMinutes=30 / dispatchMinutes=120 / closureHours=12`
  - `cyclic_oscillation @ 72h -> ackMinutes=720 / dispatchMinutes=2880 / closureHours=96`

## 2026-03-20 最新 Desk 真值补充（七）

- 当前 GPS 阈值响应作战模型 proof 已正式收口：
  - `scripts/dev/check-desk-gps-threshold-operating-model.ps1`
  - 主线总 proof 当前已提升到：
    - `summarySnapshot.completedChecks=44`
- 当前关键结果：
  - `summarySnapshot.pageProofs.gpsThresholdOperatingProfiles=3`
  - `gpsThresholdOperatingModel.profileCount=3`
  - `gpsThresholdOperatingModel.boardExecutionAlignmentStable=true`
  - `gpsThresholdOperatingModel.responseOrderingStable=true`
  - `gpsThresholdOperatingModel.escalationCoverageStable=true`
  - `event_acceleration @ 6h -> immediate_intervention / critical / incident_bridge / ackMinutes=15`
  - `creep_rise @ 6h -> heightened_watch / high / geotech_lead / ackMinutes=30`
  - `cyclic_oscillation @ 72h -> routine_observation / background / none / ackMinutes=720`

## 2026-03-20 收尾阶段评估

- 当前主线状态：
  - `latestBatch.taskId=desk-batch-87-gps-threshold-operating-model-proof`
  - `proof.completedChecks=44`
  - `proof.rainfall=79`
  - `openGaps.totalItems=0`
- 当前判断：
  - Desk 主线前后端和 demo 真值链路已经处于可收尾状态
  - 当前不需要再继续横向扩 proof，也不需要动 Desk UI
- 当前建议只保留 3 类收尾任务：
  - operating model 最后一轮闭环验收
  - 总 proof / 任务文档 / 协调状态 / 日记冻结
  - 仅处理验收暴露出的必要缺陷

## 2026-03-20 收尾验收通过

- 当前已新增收尾验收入口：
  - `scripts/dev/check-desk-closeout-acceptance.ps1`
  - `docs/unified/reports/desk-closeout-acceptance-latest.json`
- 当前关键结果：
  - `closeout.readyToFreeze=true`
  - `closeout.completedChecks=44`
  - `closeout.rainfall=79`
  - `closeout.openGaps=0`
  - `closeout.operatingProfiles=3`
- 当前判断：
  - 主线已经通过收尾验收，可以进入冻结阶段

## 2026-03-20 收尾冻结完成

- 当前已新增冻结产物：
  - `scripts/dev/freeze-desk-closeout.ps1`
  - `docs/unified/reports/desk-closeout-freeze-latest.json`
  - `docs/unified/reports/desk-closeout-freeze-latest.md`
- 当前冻结基线：
  - `freezeDate=2026-03-20`
  - `latestBatch.taskId=desk-batch-88-closeout-acceptance`
  - `proof.completedChecks=44`
  - `proof.rainfall=79`
  - `openGaps.totalItems=0`
- 当前约束：
  - `uiChangesAllowed=false`
  - `nextActionPolicy=only_fix_required_defects`

## 2026-03-20 冻结后验证通过

- 当前已完成冻结后验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-closeout-acceptance.ps1`
- 当前关键结果：
  - `buildExecuted=true`
  - `proof.completedChecks=44`
  - `proof.rainfall=79`
  - `closeout.readyToFreeze=true`
  - `openGaps.totalItems=0`
- 当前判断：
  - 当前没有新增必要缺陷需要修
  - `vite` 存在 chunk size warning，但当前构建通过，先记为非阻塞残余项，不作为收尾阻塞条件

## 2026-03-20 数据分析大屏 UI 对齐

- 当前对齐范围仅限：
  - `apps/desk/src/views/AnalysisPage.tsx`
  - `apps/desk/src/views/analysis.css`
  - `apps/desk/src/components/RealMapView.tsx`
  - `apps/desk/src/shell/AppShell.tsx`
- 当前处理：
  - 以 `LAMv2_Desk` 为参考，把数据分析可视化大屏页面和组件对齐到同版式
  - 补齐 `leaflet/react-leaflet/@types/leaflet` 依赖以支持真实地图视图
  - 未改动 `LAMv2_Desk` 目录
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前主线的数据分析大屏已完成参考版对齐

## 2026-03-20 其他页面可见层继续对齐

- 当前继续对齐的页面：
  - `HomePage.tsx`
  - `home/HomeTodosCard.tsx`
  - `home/HomeKeySitesCard.tsx`
  - `home.css`
  - `SettingsPage.tsx`
  - `DashboardPage.tsx`
  - `BaselinesPage.tsx`
  - `BaselinesPanel.tsx`
  - `DevicesPage.tsx`
  - `DeviceManagementPage.tsx`
  - `GpsMonitoringPage.tsx`
  - `GpsPage.tsx`
  - `StationsPage.tsx`
  - `home/HomeAnnouncementsCard.tsx`
  - `home/homePersist.ts`
- 当前处理：
  - 清理主线中残留的 `Mock` 可见文案与参考版不一致的标题/提示
  - 保留主线已经接好的真实后端链路，不做整页回退
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前 Desk 其他页面的可见层已继续向 `LAMv2_Desk` 对齐

## 2026-03-20 GPS 监测页文案继续对齐

- 当前继续对齐：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前处理：
  - 移除参考版中不存在的“派生分析/派生预测”标题措辞
  - 将 CEEMD / 预测区块说明文案收回到参考版表述
  - 保留主线真实导出、真实分析和真实配置保存链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页的可见层已继续向参考版靠拢

## 2026-03-20 监测站管理页说明文案继续对齐

- 当前继续对齐：
  - `apps/desk/src/views/StationManagementPanel.tsx`
- 当前处理：
  - 收口监测站管理页尾部说明文案
  - 保留主线真实后端保存链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 监测站管理页的可见层已继续向参考版靠拢

## 2026-03-21 GPS 页面占位文案继续对齐

- 当前继续对齐：
  - `apps/desk/src/views/GpsPage.tsx`
- 当前处理：
  - 将设备选择占位文案收回到参考版表述
  - 保留主线“仅显示已建立基线设备”的真实筛选逻辑
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GpsPage 的可见层已继续向参考版靠拢

## 2026-03-21 GPS 弹窗说明文案继续对齐

- 当前继续对齐：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前处理：
  - 收口阈值设置弹窗和数据点数设置弹窗的说明文案
  - 保留主线真实后端配置保存逻辑
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页弹窗的可见层已继续向参考版靠拢

## 2026-03-21 GPS 卡片标题继续对齐

- 当前继续对齐：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前处理：
  - 收口 `基线 / 最新坐标` 和 `GPS 数据表` 两个卡片标题
  - 保留主线真实分析与数据链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页的卡片标题已继续向参考版靠拢

## 2026-03-21 GPS 说明区文案继续对齐

- 当前继续对齐：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前处理：
  - 收口 CEEMD 说明区、预测摘要区、预测指标区的提示文案
  - 保留主线真实分析链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页说明区的可见层已继续向参考版靠拢

## 2026-03-21 GPS 预测提示文案继续对齐

- 当前继续对齐：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前处理：
  - 收口预测摘要区和预测指标区两句提示文案到参考版原文
  - 保留主线真实分析链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - GPS 监测页预测提示文案已继续向参考版靠拢

## 2026-03-21 页面标题同步继续对齐

- 当前继续对齐：
  - `apps/desk/src/routes/TitleSync.tsx`
  - `apps/desk/src/App.tsx`
- 当前处理：
  - 补回参考版的页面标题同步能力
  - 不影响任何主线真实后端链路
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前 Desk 的页面标题同步已对齐到参考版

## 2026-03-21 BaseCard 悬浮动效继续对齐

- 当前继续对齐：
  - `apps/desk/src/components/baseCard.css`
- 当前处理：
  - 将 BaseCard hover 动效从 `scale(1.01)` 收回到参考版的 `translateY(-1px)`
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前 BaseCard 的悬浮视觉反馈已对齐到参考版

## 2026-03-21 desk-win 一键发布入口收口

- 当前新增：
  - `scripts/dev/publish-desk-win.ps1`
  - `docs/unified/reports/desk-win-package-latest.json`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-desk-win.ps1` 已通过
- 当前关键结果：
  - `outputDir=artifacts/desk-win/win-x64`
  - `exe.path=artifacts/desk-win/win-x64/LandslideDesk.Win.exe`
  - `web.indexPresent=true`
  - `web.fileCount=55`
  - `package.fileCount=68`
- 当前判断：
  - 当前 `desk-win` 已具备可重复的一键发布入口

## 2026-03-21 Docker 一键部署入口收口

- 当前新增：
  - `scripts/release/deploy-docker-oneclick.ps1`
  - `docs/unified/reports/docker-deploy-latest.json`
- 当前调整：
  - `infra/compose/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/deploy-docker-oneclick.ps1 -ValidateOnly` 已通过
- 当前关键结果：
  - `docker.commandFound=true`
  - `envFile=infra/compose/.env`
  - 当前能自动识别 `.env` 中尚未替换的占位密钥
  - 当前已给出下一步一键部署命令
- 当前判断：
  - 当前已具备环境配置检查 + Docker 一键部署入口
  - 当前剩余阻塞点已从“缺入口”变成“需要替换真实密码/密钥”

## 2026-03-21 desk-win 发布包验证收口

- 当前新增：
  - `scripts/dev/verify-desk-win-package.ps1`
  - `docs/unified/reports/desk-win-package-verify-latest.json`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/verify-desk-win-package.ps1` 已通过
- 当前关键结果：
  - `aliveAfterLaunch=true`
  - `stoppedAfterVerify=true`
  - 发布包内 `web/index.html` 存在且 exe 可拉起
- 当前判断：
  - 当前 `desk-win` 已不只是能打包，还已经具备发布包级别的启动验证

## 2026-03-21 desk-win 交付物料收口

- 当前新增：
  - `docs/unified/reports/desk-win-env-matrix.md`
  - `docs/unified/reports/desk-win-delivery-checklist.md`
- 当前关键结果：
  - 当前 `desk-win` 已具备：
    - 一键发布脚本
    - 发布包验证脚本
    - 环境配置矩阵
    - 交付检查清单
- 当前判断：
  - 正常交付流程现在已经不只是“能打包”，而是开始具备可交接的交付物料

## 2026-03-21 desk-win 前置环境检查收口

- 当前新增：
  - `scripts/dev/check-desk-win-prerequisites.ps1`
  - `docs/unified/reports/desk-win-prerequisites-latest.json`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-prerequisites.ps1` 已通过
- 当前关键结果：
  - `dotnetCommand.ok=true`
  - `windowsDesktopRuntime8.ok=true`
  - `webView2Runtime.ok=true`
  - `packagedExe.ok=true`
  - `packagedWebIndex.ok=true`
- 当前判断：
  - `desk-win` 现在已经具备脚本化的前置环境检查能力

## 2026-03-21 desk-win 交付总验收收口

- 当前新增：
  - `scripts/dev/check-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-latest.json`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-delivery.ps1` 已通过
- 当前关键结果：
  - `ready=true`
  - `failedKeys=[]`
  - 已汇总发布清单、验包结果和前置环境检查结果
- 当前判断：
  - 当前 `desk-win` 正常交付流程已形成脚本化总验收闭环

## 2026-03-21 desk-win 交付包归档收口

- 当前新增：
  - `scripts/dev/package-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-bundle-latest.json`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/package-desk-win-delivery.ps1` 已通过
- 当前关键结果：
  - `bundleDir=artifacts/desk-win/delivery/<timestamp>`
  - `bundleZip=artifacts/desk-win/delivery/<timestamp>.zip`
  - `fileCount=77`
- 当前判断：
  - 当前 `desk-win` 已具备可交接的交付包归档产物

## 2026-03-21 desk-win 一键交付流水线收口

- 当前新增：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-pipeline-latest.json`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前关键结果：
  - `ready=true`
  - 已顺序完成：发布 -> 验包 -> 前置检查 -> 总验收 -> 交付包归档
  - `bundleZip` 已生成
- 当前判断：
  - 当前 `desk-win` 正常交付流程已形成单命令一键交付入口

## 2026-03-21 desk-win 交付包哈希清单收口

- 当前新增：
  - `scripts/dev/hash-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-hash-latest.json`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/hash-desk-win-delivery.ps1` 已通过
- 当前关键结果：
  - 已生成 `LandslideDesk.Win.exe` 的 SHA256
  - 已生成 `web/index.html` 的 SHA256
  - 已生成最终 delivery zip 的 SHA256
- 当前判断：
  - 当前 `desk-win` 交付包已具备完整性校验清单

## 2026-03-22 desk-win 交付摘要收口

- 当前新增：
  - `scripts/dev/render-desk-win-delivery-summary.ps1`
  - `docs/unified/reports/desk-win-delivery-summary-latest.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-desk-win-delivery-summary.ps1` 已通过
- 当前关键结果：
  - `Ready=True`
  - 交付摘要已聚合：
    - 路径
    - 验证结果
    - SHA256
    - 推荐命令
- 当前判断：
  - 当前 `desk-win` 已具备一页式交接摘要

## 2026-03-22 desk-win 发布包启动入口收口

- 当前新增：
  - `scripts/dev/start-desk-win-packaged.ps1`
- 当前调整：
  - `apps/desk-win/README.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-desk-win-packaged.ps1` 已通过
- 当前关键结果：
  - `started=true`
  - `alreadyRunning=false`
  - `exePath=artifacts/desk-win/win-x64/LandslideDesk.Win.exe`
- 当前判断：
  - 当前 `desk-win` 已具备从最新发布包直接启动的稳定入口

## 2026-03-22 desk-win 发布包运行态收口

- 当前新增：
  - `scripts/dev/show-desk-win-packaged-status.ps1`
  - `scripts/dev/stop-desk-win-packaged.ps1`
  - `docs/unified/reports/desk-win-packaged-status-latest.json`
- 当前验证：
  - 已完成 stop -> start -> status -> stop 一轮运行态验证
- 当前关键结果：
  - `runtime.running=true`
  - `runtime.isLatestPackage=true`
  - `manifest.exeExists=true`
  - `manifest.webIndexExists=true`
- 当前判断：
  - 当前 `desk-win` 发布包生命周期已具备启动、状态查看和停止入口

## 2026-03-22 desk-win 发布说明收口

- 当前新增：
  - `scripts/dev/render-desk-win-release-notes.ps1`
  - `docs/unified/reports/desk-win-release-notes-latest.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-desk-win-release-notes.ps1` 已通过
- 当前关键结果：
  - 发布说明已包含：
    - package output
    - validation
    - hashes
    - known non-blocking items
    - recommended handoff files
- 当前判断：
  - 当前 `desk-win` 已具备可直接对外说明的发布说明物料

## 2026-03-22 desk-win 一键交付流水线升级收口

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
- 当前关键结果：
  - 流水线已并入：
    - `desk-win-delivery-hash-latest.json`
    - `desk-win-delivery-summary-latest.md`
    - `desk-win-release-notes-latest.md`
  - 最新 bundle 当前已包含：
    - `docs/desk-win-delivery-summary-latest.md`
    - `docs/desk-win-release-notes-latest.md`
    - `reports/desk-win-delivery-hash-latest.json`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 正常交付流程已形成更完整的一键交付流水线

## 2026-03-22 desk-win 固定 latest 交付出口收口

- 当前新增：
  - `scripts/dev/promote-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-promote-latest.json`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/promote-desk-win-delivery.ps1` 已通过
- 当前关键结果：
  - `promotedDir=artifacts/desk-win/latest`
  - `promotedZip=artifacts/desk-win/latest.zip`
  - 当前 `latest/` 目录和 `latest.zip` 已真实存在
- 当前判断：
  - 当前 `desk-win` 交付物已具备固定路径出口，不再只能依赖时间戳目录

## 2026-03-22 desk-win 一键交付流水线 latest 同步收口

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
- 当前关键结果：
  - 当前流水线已自动产出：
    - `artifacts/desk-win/latest/`
    - `artifacts/desk-win/latest.zip`
  - 当前 pipeline 报告已带上：
    - `latest.promotedDir`
    - `latest.promotedZip`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 一键交付流水线已正式覆盖 fixed latest 出口

## 2026-03-22 desk-win 交付索引收口

- 当前新增：
  - `scripts/dev/render-desk-win-delivery-index.ps1`
  - `docs/unified/reports/desk-win-delivery-index-latest.json`
  - `docs/unified/reports/desk-win-delivery-index-latest.md`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-desk-win-delivery-index.ps1` 已通过
- 当前关键结果：
  - 当前 latest 包、报告和哈希已有单一入口
  - `Ready=True`
- 当前判断：
  - 当前 `desk-win` 正常交付流程已具备 single source of truth 式交付索引

## 2026-03-22 desk-win 一键交付流水线 index 同步收口

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
- 当前关键结果：
  - 当前流水线已正式并入：
    - `desk-win-delivery-index-latest.json`
    - `desk-win-delivery-index-latest.md`
  - 最新交付包当前已正式带上：
    - `docs/desk-win-delivery-index-latest.json`
    - `reports/desk-win-delivery-index-latest.json`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 一键交付流水线已正式覆盖 delivery index 物料

## 2026-03-22 desk-win 一键交付流水线 buildinfo 同步收口

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
  - `scripts/dev/stamp-desk-win-delivery.ps1`
- 当前关键结果：
  - 当前流水线已正式并入：
    - `desk-win-build-info-latest.json`
    - `artifacts/desk-win/win-x64/desk-win-build-info.json`
  - 最新交付包当前已正式带上：
    - `reports/desk-win-build-info-latest.json`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 一键交付流水线已正式覆盖 build metadata 物料

## 2026-03-22 desk-win 交付包保留策略收口

- 当前新增：
  - `scripts/dev/prune-desk-win-deliveries.ps1`
  - `docs/unified/reports/desk-win-delivery-retention-latest.json`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prune-desk-win-deliveries.ps1` 已通过
- 当前关键结果：
  - 当前 delivery 目录已只保留最近 `3` 份时间戳交付包
  - latest 固定出口未受影响
- 当前判断：
  - 当前 `desk-win` 交付目录已具备保留策略，不再无限膨胀

## 2026-03-22 desk-win fixed latest 出口验收收口

- 当前新增：
  - `scripts/dev/check-desk-win-latest-delivery.ps1`
  - `docs/unified/reports/desk-win-latest-delivery-latest.json`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-latest-delivery.ps1` 已通过
- 当前关键结果：
  - `ready=true`
  - `counts.missingRequiredFiles=0`
  - `latest.indexReady=true`
- 当前判断：
  - 当前 `desk-win` fixed latest 出口已被脚本化验收通过

## 2026-03-22 desk-win 一键交付流水线 latest 验收同步收口

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
- 当前关键结果：
  - 当前流水线已正式并入：
    - `desk-win-latest-delivery-latest.json`
  - 最新 pipeline 报告当前已带上：
    - `latest.ready=true`
    - `latest.fileCount=84`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 一键交付流水线已正式覆盖 fixed latest 出口验收

## 2026-03-22 desk-win fixed latest 包运行验证收口

- 当前新增：
  - `scripts/dev/start-desk-win-latest.ps1`
  - `scripts/dev/verify-desk-win-latest-package.ps1`
  - `docs/unified/reports/desk-win-latest-package-verify-latest.json`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/verify-desk-win-latest-package.ps1` 已通过
- 当前关键结果：
  - `aliveAfterLaunch=true`
  - `stoppedAfterVerify=true`
  - `exePath=artifacts/desk-win/latest/package/LandslideDesk.Win.exe`
- 当前判断：
  - 当前 `desk-win` fixed latest 包已经通过直接运行验证

## 2026-03-22 desk-win 一键交付流水线 latest 运维同步收口

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
- 当前关键结果：
  - 当前流水线已正式并入：
    - latest 包运行验证
    - delivery 保留策略
  - 最新 pipeline 报告当前已带上：
    - `latest.verifyAliveAfterLaunch=true`
    - `latest.verifyStoppedAfterVerify=true`
    - `retention.keep=3`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 一键交付流水线已正式覆盖 latest 包运行验证与交付目录治理

## 2026-03-22 desk-win 一键交付流水线 latest 运行验证同步收口

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
- 当前关键结果：
  - 当前流水线已正式并入：
    - `desk-win-latest-package-verify-latest.json`
  - 最新 pipeline 报告当前已带上：
    - `latest.verifyAliveAfterLaunch=true`
    - `latest.verifyStoppedAfterVerify=true`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 一键交付流水线已正式覆盖 fixed latest 包运行验证

## 2026-03-22 desk-win 一键交付流水线 latest 运维收口（二）

- 当前调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
- 当前关键结果：
  - 当前流水线已同时覆盖：
    - latest 出口验收
    - latest 包运行验证
    - delivery 保留策略
  - 最新 pipeline 报告当前已带上：
    - `latest.ready=true`
    - `latest.verifyAliveAfterLaunch=true`
    - `latest.verifyStoppedAfterVerify=true`
    - `retention.keep=3`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过
- 当前判断：
  - 当前 `desk-win` 一键交付流水线已正式覆盖 latest 运维管理结果

## 2026-03-22 Desk 构建拆包与生产环境清单收口

- 当前新增：
  - `scripts/release/render-prod-env-checklist.ps1`
  - `docs/unified/reports/prod-env-checklist-latest.json`
  - `docs/unified/reports/prod-env-checklist-latest.md`
- 当前调整：
  - `apps/desk/src/routes/AppRoutes.tsx`
  - `apps/desk/vite.config.ts`
- 当前关键结果：
  - 已形成路由懒加载和 vendor 拆包
  - `prod env checklist` 当前结果为：
    - `Configured=12`
    - `Placeholder=6`
    - `Missing=0`
    - `EmptyOptional=2`
- 当前验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/render-prod-env-checklist.ps1` 已通过
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前生产环境实参已被清单化
  - 当前性能问题已从“单大包”推进到“少数 vendor chunk 仍偏大”

| 128 | `desk-batch-128-desk-vendor-chunk-split` | `completed` | Desk vendor chunk 继续细拆收口 | 已继续细拆 antd/echarts vendor chunk，主 chunk 明显下降，当前仅 `vendor-antd-core` 仍略高于 500k |

## 2026-03-22 Desk vendor chunk 继续细拆收口

- 当前调整：
  - `apps/desk/vite.config.ts`
- 当前关键结果：
  - 已新增：
    - `vendor-antd-overlay`
    - `vendor-antd-select`
    - `vendor-antd-nav`
    - `vendor-antd-form`
    - `vendor-antd-picker`
    - `vendor-antd-rc`
    - `vendor-echarts-core`
    - `vendor-echarts-components`
    - `vendor-echarts-charts`
    - `vendor-echarts-engine`
    - `vendor-echarts-zrender`
    - `vendor-three-core`
    - `vendor-three-extras`
  - 当前构建结果：
    - `vendor-echarts-core=219.58 kB`
    - `vendor-echarts-components=255.48 kB`
    - `vendor-echarts-charts=245.10 kB`
    - `vendor-three-core=495.53 kB`
    - `vendor-antd-core=519.80 kB`
- 当前验证：
  - `npm -w apps/desk run build` 已通过
- 当前判断：
  - 当前性能问题已从多个超大 vendor chunk 收敛到仅 `vendor-antd-core` 仍略高于 500k
