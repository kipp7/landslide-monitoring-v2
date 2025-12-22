# v2 模块化并行推进（Workstreams）

目的：把“旧项目（参考区 `E:\学校\06 工作区\2\openharmony\landslide-monitor`）里已有的前端/后端能力”按模块拆分，在 v2 仓库 `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2` 中**并发推进**，最终做到**功能不缺失**，且符合 v2 的契约/架构/门禁/合并规范。

## 0) 总约束（必须遵守）

- **只改 v2 工作区**：所有变更只允许发生在 `landslide-monitoring-v2`；`openharmony/landslide-monitor` 仅用于对照与提取需求，不在其上做任何修改。
- **PR-only**：禁止直接 push `main`；每个模块独立分支 + PR；合并走 Rulesets（Squash merge）。
- **质量门禁必过**（每个 PR 都必须在本地跑通再推送）：
  - `python docs/tools/run-quality-gates.py`
  - `npm run lint`
  - `npm run build`
- **契约优先**：对外接口（API/MQTT/Kafka/Storage）唯一权威在 `docs/integrations/`；改契约必须同步更新文档与 stamp（如 OpenAPI）。
- **不改 UI（除非必要）**：优先“恢复功能/对接数据/消除硬编码”，UI 尽量保持现有 v2 风格与布局一致。

## 1) 并发协作方式（给并发 AI/开发者）

### 1.1 分支命名

- `feat/<module>/<short-desc>` 或 `fix/<module>/<short-desc>` 或 `docs/<module>/<short-desc>`

### 1.2 PR 内容要求（必须包含）

- **What**：做了哪些功能点（对应本文件的 WS/子项）
- **How**：关键实现路径（API/DB/worker/web 的边界）
- **Verification**：列出三大门禁命令 + 必要的本地验证步骤（如涉及 smoke/e2e，必须给 evidence 路径）
- **Docs**：若动契约/运维/关键决策，指出已更新的文档路径

### 1.3 并行冲突处理（强制）

- 同一资源（同一张表/同一 API 路由/同一页面）避免多 PR 并行改动。
- 若必须并行：先合并一个“抽象/骨架 PR”（路由/表/DTO/门禁），其余 PR 基于它继续拆分。

## 2) 模块总览（Workstreams）

说明：下面每个模块都要求给出「参考区对照点」与「v2 落地目标」。并发 AI 可以各自领取模块，独立 PR 推进。

### WS-A：认证与权限（Web 登录/鉴权/RBAC）

- 参考区：`frontend/app/login`（注意：参考区登录逻辑主要是“跳转”，不是安全鉴权）
- v2 目标：Web 登录/刷新 token/登出/过期处理、Admin/Ops 按权限可见、API 端 JWT/RBAC 与契约一致

### WS-B：设备与站点体系（Regions/Networks/Stations/Devices）

- 参考区：`frontend/app/api/hierarchy/*`、`frontend/app/api/monitoring-stations*`
- v2 目标：站点/设备 CRUD + 绑定关系 + 字典渲染替代硬编码（名称/类型/状态/传感器列表）

### WS-C：遥测数据（实时/历史/聚合/导出）

- 参考区：`frontend/app/analysis`、`frontend/app/api/data-aggregation`、各类图表组件
- v2 目标：ClickHouse 权威、`/data/state`、`/data/series`、统计/聚合/导出接口与查询范围限制，前端分析页可用

### WS-D：GPS 监测 / 形变分析 / 基准点（Baseline）

- 参考区：`frontend/app/gps-monitoring`、`frontend/app/gps-deformation`、`frontend/app/baseline-management`、`frontend/app/api/baselines/*`、`backend/iot-service/baseline-management-api.js`
- v2 目标：基准点 CRUD、质量评估、形变计算与趋势；禁止 Supabase 直连，数据进入 v2 存储后由 v2 API 提供

### WS-E：告警与规则引擎（Rules/Alerts/通知）

- 参考区：`frontend/app/api/anomaly-assessment`、`ai-prediction` 等“异常/风险”概念与页面
- v2 目标：`alert_rules` 版本化 DSL、回放/回测、`alert_events` 可查询；关键操作可审计（`operation_logs`/`api_logs`）

### WS-F：IoT 接入（设备上报/命令下发/实时通道）

- 参考区后端：`backend/iot-service/iot-server.js`（Express + Socket.IO + `/iot/huawei`）
- v2 目标：主链路以 MQTT → Kafka → ClickHouse/Postgres 为准；若需兼容华为云 IoT HTTP 推送，以适配器方式接入；命令/回执闭环（含审计）

### WS-G：系统监控与运维工具（Ops）

- 参考区：`frontend/app/system-monitor`、`frontend/app/debug-api`、`db-admin/inspect-*`
- v2 目标：统一在 v2 `/ops/*`；调试工具保留但必须权限 + 审计；禁止硬编码密钥/直连数据库

### WS-H：AI 预测与专家系统（可插拔）

- 参考区：`frontend/app/api/ai-prediction`、`device-health-expert`，以及 `backend/services/expertDeviceHealthService.js`
- v2 目标：作为异步 worker/插件；预测结果入库 + 可回放（不可只在前端/内存计算）

## 3) 模块交付清单模板（每个 WS 的 PR 都按此写）

1) **接口与契约**
   - [ ] OpenAPI/接口路径/DTO 已补齐（如涉及）
   - [ ] 变更已同步到 `docs/integrations/*`（如涉及）
2) **数据与迁移**
   - [ ] Postgres/ClickHouse 表与迁移脚本齐全（如涉及）
   - [ ] 种子数据/默认权限/字典表处理到位（如涉及）
3) **安全与权限**
   - [ ] 鉴权要求明确（匿名/登录/管理员 token）
   - [ ] 关键操作写入 `operation_logs`（如涉及）
4) **前端功能**
   - [ ] 页面可用、无硬编码阈值/映射（应从 API/字典读取）
   - [ ] 出错提示/空态/加载态齐全（不破坏 UI）
5) **验证**
   - [ ] `python docs/tools/run-quality-gates.py`
   - [ ] `npm run lint`
   - [ ] `npm run build`
   - [ ] 如涉及单机联调：补充 smoke/e2e 的步骤与 evidence 路径

## 4) 并发领取与登记（唯一入口）

所有并发 AI/开发者必须先在这里登记，再开分支/提 PR，避免重复建设与互相覆盖。

### 4.1 状态枚举（统一）

- `backlog`：尚未开始
- `claimed`：已领取，未开 PR
- `in_progress`：开发中（可反复推送）
- `in_review`：已开 PR，等待 review/CI
- `blocked`：被依赖/环境/契约阻塞（必须写明阻塞点）
- `done`：已合并到 `main`

### 4.2 领取规则（强制）

- 一个 PR 尽量只做一个 WS（或 WS 的一个子项）；不要把多个不相关模块捆绑到同一 PR。
- 涉及“契约/数据模型”的改动必须先落地（WS-Contract/WS-DB 类 PR 可以先行），页面 PR 以其为依赖。
- 若要改动与别人正在改动的同一文件/同一路由/同一张表，必须先在登记表里标注依赖/冲突并沟通拆分。

### 4.3 领取与登记表（请在此维护）

说明：每个领取项建议拆到“可在 1~3 天完成”的粒度；如果某个 WS 太大，可以在 “Scope” 中追加子编号（如 `WS-D.1`、`WS-D.2`）。

| Scope | Owner | Branch | PR | Status | Dependencies | Notes |
|---|---|---|---|---|---|---|
| WS-A | codex | `feat/ws-a/local-dev-web-env` | https://github.com/kipp7/landslide-monitoring-v2/pull/94 | done |  | Local dev: CORS + Web 登录联调（尽量不改 UI） |
| WS-B | codex | `feat/ws-b/station-detail-page` | https://github.com/kipp7/landslide-monitoring-v2/pull/96 | done |  | Web: station detail page (`/stations/{stationId}`) |
| WS-C | codex | `feat/ws-c/data-statistics-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/103 | done |  | Web: `/data` 增加统计聚合（对接 `/api/v1/data/statistics`） |
| WS-D.1 | codex | `feat/ws-d/baselines-contract` | https://github.com/kipp7/landslide-monitoring-v2/pull/77 | done |  | 基准点（Baseline）契约/数据模型/API 骨架 |
| WS-D.2 | codex | `feat/ws-d/deformation-trends2` | https://github.com/kipp7/landslide-monitoring-v2/pull/110 | done | WS-D.1 | 仅做“API + 查询”闭环：新增 `/api/v1/gps/deformations/{deviceId}/series`（baseline + ClickHouse 遥测计算位移）；会改动 `services/api/src/routes/*` 与 `docs/integrations/api/openapi.yaml` |
| WS-D.3 | codex | `feat/ws-d/baseline-management-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/105 | done | WS-D.1 | Web: 基准点管理页（`/device-management/baselines`）对接 `/api/v1/gps/baselines/*` |
| WS-D.4 | codex | `feat/ws-d/gps-monitoring-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/115 | done | WS-D.2, WS-D.3 | Web: 恢复 GPS 监测/形变页面（`/gps-monitoring` + `/gps-deformation`），对接 `/api/v1/data/series` 与 `/api/v1/gps/deformations/*` |
| WS-E | codex | `feat/ws-e/alert-rules-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/90 | done |  | Web: alert rules management UI (`/alerts/rules`) |
| WS-F | codex | `feat/ws-f/huawei-iot-adapter` | https://github.com/kipp7/landslide-monitoring-v2/pull/99 | done |  | IoT adapter: Huawei IoT HTTP push -> Kafka telemetry (no UI) |
| WS-G | codex | `feat/ws-g/ops-system-monitor` | https://github.com/kipp7/landslide-monitoring-v2/pull/79 | done |  | Web: `/ops/system-monitor` + `/ops/debug-api` + legacy redirects + Windows distDir workaround (`.next_v2`) |
| WS-G.2 | codex | `feat/ws-g/telemetry-dlq-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/109 | done |  | Ops: Telemetry DLQ 页面（`/ops/telemetry-dlq`）对接 `/api/v1/telemetry/dlq*` |
| WS-H | codex | `feat/ws-h/ai-prediction-worker` | https://github.com/kipp7/landslide-monitoring-v2/pull/84 | done |  | AI predictions plugin/worker |
| WS-I | codex | `docs/ws-i/gap-audit-route-inventory` | https://github.com/kipp7/landslide-monitoring-v2/pull/121 | done |  | Docs: 扩充 `gap-audit.md`（v2 Web 路由盘点 + 参考区对照） |

### 4.4 对齐与验收（总集成人做）

当所有 WS 都到 `done`，总集成人需要做一次“缺口对照验收”：

1) 按参考区页面/功能点拉清单（包含：GPS 监测、形变、基准点、数据聚合、异常/告警、IoT 接入、系统监控等）。
2) 逐项标注其在 v2 的落地点（API 路由/表/worker/web 页面），并补齐缺项。
3) 汇总一个收尾 PR：只做“对接/连通/缺口补齐/文档更新”，不做大重构。

---

参考规范：

- `docs/guides/roadmap/project-status.md`
- `docs/guides/standards/pull-request-howto.md`
- `docs/guides/standards/definition-of-done.md`
- `docs/guides/standards/api-contract-rules.md`
- `docs/guides/standards/api-contract-rules.md`
- `docs/guides/standards/backend-rules.md`
