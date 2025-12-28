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
| WS-A.2 | codex | `fix/web-login-ui-parity` | https://github.com/kipp7/landslide-monitoring-v2/pull/270 | done | WS-A | Web：`/login` 登录页 UI 1:1 对齐参考区（背景图/磨砂 Card/Tabs/其他登录方式/注册入口），保留 v2 `useAuth().login` 实际鉴权。 |
| WS-B | codex | `feat/ws-b/station-detail-page` | https://github.com/kipp7/landslide-monitoring-v2/pull/96 | done |  | Web: station detail page (`/stations/{stationId}`) |
| WS-C | codex | `feat/ws-c/data-statistics-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/103 | done |  | Web: `/data` 增加统计聚合（对接 `/api/v1/data/statistics`） |
| WS-D.1 | codex | `feat/ws-d/baselines-contract` | https://github.com/kipp7/landslide-monitoring-v2/pull/77 | done |  | 基准点（Baseline）契约/数据模型/API 骨架 |
| WS-D.2 | codex | `feat/ws-d/deformation-trends2` | https://github.com/kipp7/landslide-monitoring-v2/pull/110 | done | WS-D.1 | 仅做“API + 查询”闭环：新增 `/api/v1/gps/deformations/{deviceId}/series`（baseline + ClickHouse 遥测计算位移）；会改动 `services/api/src/routes/*` 与 `docs/integrations/api/openapi.yaml` |
| WS-D.3 | codex | `feat/ws-d/baseline-management-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/105 | done | WS-D.1 | Web: 基准点管理页（`/device-management/baselines`）对接 `/api/v1/gps/baselines/*` |
| WS-D.4 | codex | `feat/ws-d/gps-monitoring-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/115 | done | WS-D.2, WS-D.3 | Web: 恢复 GPS 监测/形变页面（`/gps-monitoring` + `/gps-deformation`），对接 `/api/v1/data/series` 与 `/api/v1/gps/deformations/*` |
| WS-D.5 | codex | `feat/ws-d5/baselines-advanced-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/178 | done | WS-K.5, WS-D.3 | Web: 基准点管理页补齐参考区 `BaselineManagementV2` 的高级能力（自动建立/重建基准点、质量评估展示与建议、可用设备列表/映射兜底）；优先复用 v2 既有兼容端点（WS-K.5） |
| WS-D.6 | codex | `feat/ws-d6/gps-export` | https://github.com/kipp7/landslide-monitoring-v2/pull/175 | done | WS-D.4 | Web: GPS 监测页补齐“导出”闭环（CSV/XLSX/报告）：对齐参考区 `/gps-monitoring` 的导出菜单；数据源基于 v2 现有查询结果（`/api/v1/data/series`、`/api/v1/gps/deformations/{deviceId}/series`），不新增重型依赖 |
| WS-D.7 | codex | `feat/ws-d7/gps-advanced-analysis` | https://github.com/kipp7/landslide-monitoring-v2/pull/181 | done | WS-D.4, WS-D.6 | Web: GPS 监测页补齐参考区高级分析分栏（CEEMD/预测/数据详情/风险解释等）；若 v2 缺 API 则先拆“契约+最小 API 骨架”PR，再做页面渲染 PR |
| WS-D.8 | codex | `feat/ws-d8/gps-export-parity` | https://github.com/kipp7/landslide-monitoring-v2/pull/186 | done | WS-D.6, WS-D.7 | Web: GPS 监测页导出能力对齐参考区（XLSX/报告/图表图片等）；优先复用已依赖的 `xlsx`，避免引入新重型依赖；若需后端模板/报告生成，先拆“契约+最小 API 骨架”PR |
| WS-E | codex | `feat/ws-e/alert-rules-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/90 | done |  | Web: alert rules management UI (`/alerts/rules`) |
| WS-F | codex | `feat/ws-f/huawei-iot-adapter` | https://github.com/kipp7/landslide-monitoring-v2/pull/99 | done |  | IoT adapter: Huawei IoT HTTP push -> Kafka telemetry (no UI) |
| WS-G | codex | `feat/ws-g/ops-system-monitor` | https://github.com/kipp7/landslide-monitoring-v2/pull/79 | done |  | Web: `/ops/system-monitor` + `/ops/debug-api` + legacy redirects + Windows distDir workaround (`.next_v2`) |
| WS-G.2 | codex | `feat/ws-g/telemetry-dlq-ui` | https://github.com/kipp7/landslide-monitoring-v2/pull/109 | done |  | Ops: Telemetry DLQ 页面（`/ops/telemetry-dlq`）对接 `/api/v1/telemetry/dlq*` |
| WS-G.3 | codex | `feat/ws-g3/ops-debug-api-smoke-tests` | https://github.com/kipp7/landslide-monitoring-v2/pull/221 | done | WS-G, WS-K.6 | Ops：`/ops/debug-api` 补齐参考区 debug-api 的“一键连通性测试”（`/health`、`/huawei/config`、`/huawei/devices/:deviceId/shadow`）；危险的 `POST /huawei/devices/:deviceId/*` 默认关闭并需要二次确认 |
| WS-G.4 | codex | `fix/api-legacy-debug-tools` | https://github.com/kipp7/landslide-monitoring-v2/pull/269 | done | WS-G | API：补齐参考区调试端点 `/api/test-db`、`/api/inspect-*`、`/api/test-expert-health`（安全只读 + 权限控制），保留 `/api/db-admin` 禁用 |
| WS-G.5 | codex | `feat/api-db-admin-safe` | https://github.com/kipp7/landslide-monitoring-v2/pull/271 | done | WS-G.4 | API：实现安全版 `/api/db-admin`（默认关闭 + 强权限 + 只读 query/analyze/backup；写操作继续禁用） |
| WS-G.6 | codex | `feat/ops-debug-api-legacy-tools` | https://github.com/kipp7/landslide-monitoring-v2/pull/272 | done | WS-G.4, WS-G.5 | Ops：`/ops/debug-api` 增加 legacy 调试端点 smoke tests（`/api/test-db`、`/api/inspect-*`、`/api/test-expert-health`），并对 `POST /api/db-admin` 增加二次确认 |
| WS-H | codex | `feat/ws-h/ai-prediction-worker` | https://github.com/kipp7/landslide-monitoring-v2/pull/84 | done |  | AI predictions plugin/worker |
| WS-I | codex | `docs/ws-i/gap-audit-route-inventory` | https://github.com/kipp7/landslide-monitoring-v2/pull/121 | done |  | Docs: 扩充 `gap-audit.md`（v2 Web 路由盘点 + 参考区对照） |
| WS-J | codex | `feat/ws-j/legacy-routes-compat` | https://github.com/kipp7/landslide-monitoring-v2/pull/125 | done |  | Web: 恢复旧系统兼容入口（`/baseline-management`、`/analysis2`、`/optimized-demo`）：baseline-management/optimized-demo 保持兼容跳转，analysis2 后续在 WS-O.5 恢复实际页面 |
| WS-K.1 | codex | `feat/ws-k1/camera-esp32cam` | https://github.com/kipp7/landslide-monitoring-v2/pull/142 | done | WS-C, WS-G | Camera/ESP32-CAM：对齐参考区 `frontend/app/analysis` 的视频监控能力；决定 v2 是否提供 `/api/v1/camera/*`（或独立 service），并补齐 Web 落地点与文档；默认按“硬件最后”可延后，但需先明确方案与契约 |
| WS-K.2 | codex | `feat/ws-k2/realtime-sse` | https://github.com/kipp7/landslide-monitoring-v2/pull/136 | done | WS-C | Realtime/SSE：对齐参考区 `frontend/app/api/realtime-stream` 的实时推送能力；明确 v2 是否需要 realtime（SSE/WebSocket），如需要则定义契约、实现最小闭环、补齐 Web 订阅与权限控制 |
| WS-K.3 | codex | `feat/ws-k3/device-health-expert` | https://github.com/kipp7/landslide-monitoring-v2/pull/145 | done | WS-H, WS-A | 设备健康专家系统：对齐参考区 `frontend/app/api/device-health-expert` + `backend/services/expertDeviceHealthService.js`；在 v2 以 worker/plugin 方式落地（入库 + 可查询 + 可审计），并补齐 Web 展示入口（尽量不改 UI） |
| WS-K.4 | codex | `feat/ws-k4/anomaly-assessment-compat` | https://github.com/kipp7/landslide-monitoring-v2/pull/130 | done | WS-E | Anomaly assessment 兼容/映射：对齐参考区 `/api/anomaly-assessment`；在 v2 明确与 `/alerts`/rule-engine 的对应关系，必要时增加兼容端点或提供迁移层，避免前端/运营依赖缺失 |
| WS-K.5 | codex | `feat/ws-k5/gps-baselines-advanced` | https://github.com/kipp7/landslide-monitoring-v2/pull/133 | done | WS-D.1 | GPS baselines 高级能力：对齐参考区 `/api/baselines/:deviceId/auto-establish`、`/quality-check`、`/available-devices`；在 v2 补齐等价能力（契约+实现+回归留证），并确认 Web 基准点管理页的入口/字段一致性 |
| WS-K.6 | codex | `feat/ws-k6/huawei-legacy-compat` | https://github.com/kipp7/landslide-monitoring-v2/pull/139 | done | WS-F, WS-A | 华为/硬件 legacy 端点：对齐参考区 `/huawei/*`（shadow/command templates/led/motor/buzzer/reboot）与 `/iot/huawei`；明确在 v2 的保留/弃用策略（推荐以 v2 `/devices/{deviceId}/commands` 为主），必要时实现兼容层并补齐安全与审计 |
| WS-K.7 | codex | `feat/ws-k7/gps-deformation-legacy-compat` | https://github.com/kipp7/landslide-monitoring-v2/pull/227 | done | WS-D.2 | Legacy GPS 形变端点：对齐参考区 `/api/gps-deformation/:deviceId`，在 v2 增加兼容层（支持 legacy deviceId → UUID 映射；查询 ClickHouse + baseline 计算位移/速度序列；不实现参考区 CEEMD/AI 分析结果） |
| WS-K.21 | codex | `feat/ws-k21/gps-monitoring-legacy-parity` | https://github.com/kipp7/landslide-monitoring-v2/pull/263 | done | WS-K.7, WS-D.7 | Legacy GPS 监测/形变高级分析 1:1：恢复参考区 `/gps-monitoring` 页面（EnhancedPredictionCharts），并在 legacy `/api/gps-deformation/:deviceId` 补齐 CEEMD 分解 + 预测分析字段；同时让 legacy `/api/device-management` data_only 支持 timeRange/startTime/endTime。 |
| WS-K.22 | codex | `feat/ws-k22/web-api-route-proxies` | https://github.com/kipp7/landslide-monitoring-v2/pull/264 | done | WS-M.1 | Web：补齐参考区 `frontend/app/api/**/route.ts` 文件在 v2 的落点（以 Next route handlers 代理到 v2 api-service legacy compat `/api/*`）；同时保留参考区遗留的备份/测试页面文件，确保“文件不缺失”。 |
| WS-K.23 | codex | `feat/ws-k23/frontend-lib-parity` | https://github.com/kipp7/landslide-monitoring-v2/pull/266 | done | WS-K.22 | Web：补齐参考区 `frontend/lib/{config,supabaseClient,useIotDataStore}.ts` 在 v2 的同名入口；其中 `supabaseClient` 显式 stub（不直连 Supabase），`useIotDataStore` 基于 v2 legacy compat `/api/*` 拉取/刷新数据。 |
| WS-K.28 | codex | `fix/api-monitoring-stations-deviceid-mutations` | https://github.com/kipp7/landslide-monitoring-v2/pull/273 | done | WS-M.1 | API：补齐 legacy `/api/monitoring-stations/{deviceId}` 的 `PUT`/`DELETE`（参考区 `frontend/app/api/monitoring-stations/[deviceId]/route.ts`）。 |
| WS-K.30 | codex | `fix/ws-k30-iot-prefix-alias` | https://github.com/kipp7/landslide-monitoring-v2/pull/281 | done | WS-K.18 | API：为 iot-server-compat 增加 `/iot/*` 前缀别名（兼容参考区常见的 baseUrl=/iot 调用：`/iot/info`、`/iot/devices/*`、`/iot/debug/latest-data*`）。 |
| WS-K.31 | codex | `fix/api-monitoring-stations-chart-endpoints` | https://github.com/kipp7/landslide-monitoring-v2/pull/274 | done | WS-M.1 | API：补齐 legacy `monitoring-stations` 图表相关兼容入口（`/api/monitoring-stations/chart-config`、`/api/monitoring-stations/chart-legends`）。 |
| WS-K.32 | codex | `fix/api-monitoring-stations-metadata-parity` | https://github.com/kipp7/landslide-monitoring-v2/pull/278 | done | WS-M.1 | API：补齐 legacy `monitoring-stations` 列表/详情的“配置回读”（从 `devices.metadata` 回填 `station_name`/`location_name`/`risk_level`/`sensor_types`/`chart_legend_name`/`status` 等字段），避免前端保存后刷新丢失。 |
| WS-K.33 | codex | `fix/ws-k33-monitoring-stations-chart-config` | https://github.com/kipp7/landslide-monitoring-v2/pull/283 | in_review | WS-K.32 | API：完善 legacy `monitoring-stations` 的 `chartType` 图表配置返回（补齐 `title/unit/yAxisName/deviceLegends`）并增加 `/api/monitoring-stations/chart-config?type=...` 兼容端点，避免旧前端图表配置为空/缺字段。 |
| WS-K.8 | codex | `feat/ws-k8/baselines-legacy-crud` | https://github.com/kipp7/landslide-monitoring-v2/pull/226 | done | WS-D.1, WS-K.5, WS-M.1 | Legacy baselines CRUD：对齐参考区 `backend/iot-service/baseline-management-api.js` 的 `/api/baselines`（列表/查询/创建/更新/删除）；在 v2 api-service `/api/baselines*` 补齐缺失端点（支持 legacy deviceId → UUID 映射） |
| WS-K.9 | codex | `feat/ws-k9/device-management-deformation-compat` | https://github.com/kipp7/landslide-monitoring-v2/pull/230 | done | WS-M.1, WS-K.7 | Legacy 设备管理形变端点：对齐参考区 `backend/iot-service/device-management-deformation-api.js` 的 `/api/device-management/deformation/:deviceId`、`/trend`、`/summary`；在 v2 `/api` 兼容层补齐（使用 ClickHouse + gps_baselines，含 legacy deviceId → UUID 映射） |
| WS-K.10 | codex | `feat/ws-k10/iot-api-prefix-alias` | https://github.com/kipp7/landslide-monitoring-v2/pull/232 | done | WS-K.7, WS-K.8, WS-M.1 | Legacy `/iot/api` 前缀兼容：对齐参考区在生产环境以 `BACKEND_URL=http://.../iot` 调用后端时产生的 `/iot/api/*` 路径；在 v2 api-service 为 legacy compat 路由增加 `/iot/api` 额外挂载点（与 `/api/*` 保持一致），并补齐 `/iot/huawei` 禁用响应（503） |
| WS-K.11 | codex | `feat/ws-k11/device-management-export-reports` | https://github.com/kipp7/landslide-monitoring-v2/pull/244 | done | WS-M.1 | Legacy 设备管理导出/报告/诊断端点：对齐参考区 `frontend/app/api/device-management/{export,reports,diagnostics}`；在 v2 legacy compat 层补齐 `/api/device-management/export`、`/reports`、`/diagnostics`（ClickHouse 分钟桶 + Postgres 设备/基准点映射） |
| WS-K.15 | codex | `feat/ws-k15/legacy-compat-aliases` | https://github.com/kipp7/landslide-monitoring-v2/pull/247 | done | WS-M.1 | Legacy optimized/real 端点别名：对齐参考区 `frontend/app/api/{device-management-optimized,device-management-real,device-management-real-db,monitoring-stations-optimized}`；v2 不复刻 Supabase 直连实现，而是提供别名转发到 v2 已有 legacy compat 端点（包含 PR #253 的补充别名）。 |
| WS-K.14 | codex | `feat/ws-k14/legacy-disable-inspect-endpoints` | https://github.com/kipp7/landslide-monitoring-v2/pull/242 | done | WS-K.10 | Legacy inspect/db-admin/test-db 禁用：对齐参考区 `frontend/app/api/{db-admin,inspect-*,test-*}` 调试/管理类接口在 v2 中明确不提供；在 v2 legacy compat 层对这些路径返回显式禁用响应（403），并补齐文档说明 |
| WS-L.1 | codex | `feat/ws-l1/ai-predictions-api` | https://github.com/kipp7/landslide-monitoring-v2/pull/149 | done | WS-H | AI predictions：补齐 `ai_predictions` 的查询 API（/api/v1/ai/predictions*）+ Web 查看入口 + OpenAPI/文档（worker 已有，缺 API/UI/契约） |
| WS-M.1 | codex | `feat/ws-m1/legacy-device-management-api` | https://github.com/kipp7/landslide-monitoring-v2/pull/154 | done | WS-A | Legacy 设备管理 API 兼容：对齐 `legacy-frontend/app/api/device-management*`、`/monitoring-stations*`、`/iot/devices*`、`/data-aggregation` 的关键返回结构；v2 以 `/api` 兼容层落地，并尽量映射到既有 v1 设备/站点/数据/基准点/告警能力 |
| WS-N.1 | codex | `feat/ws-n1/analysis-core-layout` | https://github.com/kipp7/landslide-monitoring-v2/pull/160 | done | WS-K.2, WS-K.4, WS-K.3 | Web：恢复 legacy `/analysis` “运行大屏”核心信息架构（地图区 + 侧边栏 + 顶部状态），并将数据源切到 v2（SSE realtime + alerts + device state），确保旧展示能力不缺失（UI 可按 v2 风格重做，不要求像素级一致） |
| WS-N.2 | codex | `feat/ws-n2/analysis-map-enhancements` | https://github.com/kipp7/landslide-monitoring-v2/pull/164 | done | WS-N.1 | Web：恢复 legacy 地图能力（聚合点/弹窗/风险颜色/一键切换地图模式），优先基于 v2 已依赖的 `leaflet/react-leaflet` 落地，避免引入需 key 的第三方地图服务；会改动 `apps/web/app/analysis/*` 地图组件，请勿并发修改这些文件 |
| WS-N.3 | codex | `feat/ws-n3/analysis-realtime-widgets` | https://github.com/kipp7/landslide-monitoring-v2/pull/169 | done | WS-N.1, WS-K.4 | Web：恢复 legacy 实时异常表/实时传感器状态等组件（`RealtimeAnomalyTable`/`RealtimeSensorStatus*`），并对齐 v2 `/api/anomaly-assessment` + `/realtime/stream` 的数据结构 |
| WS-N.4 | codex | `feat/ws-n4/analysis-ai-widgets` | https://github.com/kipp7/landslide-monitoring-v2/pull/170 | done | WS-N.1, WS-L.1 | Web：恢复 legacy AI 预测卡片/图表组件（温湿度/加速度/陀螺仪等）在 `/analysis` 的入口与懒加载，数据源使用 v2 `/api/v1/data/series` 与 `/api/v1/ai/predictions*` |
| WS-N.5 | codex | `feat/ws-n5/analysis-legacy-shell` | https://github.com/kipp7/landslide-monitoring-v2/pull/192 | done | WS-N.1~WS-N.4 | Web：`/analysis` UI 1:1 还原（骨架）：移植参考区 `HoverSidebar`、`BaseCard`、`MapSwitchPanel`、`LazyComponents` 框架与布局结构（先确保 DOM/布局/交互入口一致，数据源适配后续拆分） |
| WS-N.6 | codex | `feat/ws-n6/analysis-charts-core` | https://github.com/kipp7/landslide-monitoring-v2/pull/195 | done | WS-N.5 | Web：`/analysis` 图表 1:1（基础四图）：移植温度/湿度/加速度/陀螺仪图表组件（参考区 `TemperatureChart`/`HumidityChart`/`AccelerationChart`/`GyroscopeChart`），并用 v2 `/api/v1/data/series` 适配数据（含无数据状态与单位显示） |
| WS-N.7 | codex | `feat/ws-n7/analysis-charts-rest` | https://github.com/kipp7/landslide-monitoring-v2/pull/199 | done | WS-N.5 | Web：`/analysis` 图表 1:1（其余图表）：移植液位图（LiquidFill）、柱状图（BarChart）、设备错误图（DeviceErrorChart）、异常类型图（AnomalyTypeChart）并适配 v2 数据/告警聚合 |
| WS-N.8 | codex | `feat/ws-n8/analysis-3d-map` | https://github.com/kipp7/landslide-monitoring-v2/pull/202 | done | WS-N.5 | Web：`/analysis` 3D 地图 1:1：移植 `Map3DContainer`（或等价 3D 引擎），补齐参考区 2D/3D/卫星/视频切换与交互；如 3D 依赖新引擎，先拆“技术选型+最小 demo”PR |
| WS-N.9 | codex | `feat/ws-n9/analysis-performance-monitor` | https://github.com/kipp7/landslide-monitoring-v2/pull/197 | done | WS-N.5 | Web：`/analysis` 性能监控 1:1：移植 `usePerformanceMonitor` 与性能告警 UI（warnings/isPerformanceGood），并补齐必要的缓存/节流策略（不改变 v2 API） |
| WS-N.10 | codex | `feat/ws-n10/analysis-device-naming` | https://github.com/kipp7/landslide-monitoring-v2/pull/205 | done | WS-N.5 | Web：`/analysis` 设备命名/映射 1:1：对齐参考区 `device_mapping`/位置命名逻辑（generateDeviceName/getRiskByLocation/getDetailedLocationInfo），在 v2 侧实现等价映射（不直连 Supabase） |
| WS-N.11 | kipp7 | `feat/ws-n11/analysis-2d-map` | https://github.com/kipp7/landslide-monitoring-v2/pull/207 | done | WS-N.5 | Web：`/analysis` 2D/卫星地图 1:1：移植参考区 OpenLayers `MapContainer`（聚合点弹窗/轮播分页/设备标注），并补齐切换后重绘与样式引入（`ol/ol.css`） |
| WS-O.1 | codex | `feat/ws-o1/baseline-management-legacy` | https://github.com/kipp7/landslide-monitoring-v2/pull/213 | done | WS-D, WS-M.1 | Web：`/baseline-management` 1:1：恢复参考区 `BaselineManagementV2`（含自动建立/质量评估/设备选择/导出等 UI），并对接 v2 GPS baselines（`/api/v1/gps/baselines*` + legacy `/baselines/*`）；当前 v2 `/baseline-management` 仅重定向，需保留 v2 版到 `/baseline-management-v2` |
| WS-O.2 | codex | `feat/ws-o2/optimized-demo-legacy` | https://github.com/kipp7/landslide-monitoring-v2/pull/212 | done | WS-C, WS-M.1 | Web：`/optimized-demo` 1:1：恢复参考区“数据库优化演示”页面与依赖组件（`OptimizedDeviceStatus`、`useDataAggregation` 等），数据源切到 v2 API/legacy compat；当前 v2 `/optimized-demo` 仅重定向，需保留 v2 版到 `/optimized-demo-v2` |
| WS-O.3 | codex | `feat/ws-o3/system-monitor-legacy` | https://github.com/kipp7/landslide-monitoring-v2/pull/216 | done | WS-G, WS-C, WS-M.1 | Web：`/system-monitor` 1:1：恢复参考区系统监控页（cache/realtime/worker 指标面板），将旧 hooks（`useOptimizedDeviceData`/`useDataAggregation`/`useRealtimeStream`/`useWebWorker`）迁移为 v2 版本；当前 v2 `/system-monitor` 仅重定向到 `/ops/system-monitor` |
| WS-O.4 | codex | `feat/ws-o4/device-management-legacy` | https://github.com/kipp7/landslide-monitoring-v2/pull/218 | done | WS-B, WS-D, WS-M.1 | Web：`/device-management` 1:1：恢复参考区设备管理页（状态/监测站管理/基准点管理 tabs），并将依赖组件（`MonitoringStationManagement`/`DeviceMappingTable` 等）迁移到 v2 数据源；保留现有 v2 设备管理页到 `/device-management-v2` |
| WS-O.5 | codex | `feat/ws-o5/analysis2-monitoring-points` | https://github.com/kipp7/landslide-monitoring-v2/pull/219 | done | WS-J | Web：`/analysis2` 1:1：恢复参考区 `MonitoringPoints`（监测点/传感器/异常/视图面板 demo UI），取消当前 `/analysis2` → `/analysis` 重定向 |
| WS-O.6 | codex | `fix/ws-o6/device-management-page-backup-file` | https://github.com/kipp7/landslide-monitoring-v2/pull/277 | done | WS-O.4 | Web：补齐参考区遗留文件 `frontend/app/device-management/page.tsx.backup` 在 v2 的对应落点（仅文件不缺失；不参与运行时路由）。 |

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
