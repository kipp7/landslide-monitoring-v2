# 项目状态（Project Status，AI/人类交接入口）

目的：解决“对话窗口终止/换模型/换 AI 后不知道做到哪一步”的问题。任何 AI/人类接手本项目，**先读本页**，不需要全局搜索。

更新原则（强制）：

- 每次合并一个 PR 到 `main`，如果它改变了项目阶段/里程碑/下一步，必须更新本页。
- 本页只记录“当前状态与下一步”，历史细节放到 `docs/incidents/` 或 PR/commit 记录中。

最后更新时间：2025-12-26（WS-N.19：/analysis legacy hooks 数据对齐）
- 2025-12-26：WS-N.18（参考区 app/components 1:1 兼容导出补齐）：补齐 `apps/web/app/components/*` 的薄包装 re-export，覆盖图表/地图/侧边栏/管理组件。
- 2025-12-26：WS-N.19（/analysis 大屏）：实现 legacy `useRealtimeData`/`useDeviceShadow` 数据源（基于 v2 API），并对齐 analysis-legacy 文案/标题到参考区 1:1。
- 2025-12-25：WS-K.12（legacy `/api/gps-deformation/:deviceId`）：PR #233，补齐 `dataQuality`/`results`/`realTimeDisplacement` 等字段，并在 points 中提供数值型 `risk_level`（0~4）。
- 2025-12-25：WS-K.9（legacy 设备管理形变端点）：PR #230，补齐 `/api/device-management/deformation/:deviceId`、`/trend`、`/summary`（ClickHouse + gps_baselines；含 legacy deviceId → UUID 映射）。
- 2025-12-25：WS-K.10（legacy `/iot/api/*` 前缀兼容）：PR #232，将 legacy compat 路由额外挂载到 `/iot/api`（与 `/api/*` 保持一致），并补齐 `/iot/huawei` 禁用 stub（503）。
- 2025-12-25：WS-K.8（legacy `/api/baselines` CRUD）：PR #226，补齐 legacy baselines CRUD（列表/查询/创建/更新/删除），并支持 legacy deviceId → UUID 映射（devices.metadata.legacy_device_id / devices.metadata.externalIds.legacy）。
- 2025-12-25：WS-K.7（legacy `/api/gps-deformation/:deviceId`）：PR #227，增加兼容端点（legacy deviceId → UUID 映射；基于 ClickHouse + baseline 计算位移/速度序列；不包含参考区 CEEMD/AI 分析结果）。
- 2025-12-25：修复 e2e smoke（`-Stage4Regression`）：`infra/compose/scripts/e2e-smoke-test.ps1` 在写入 `services/api/.env` 后重新读取 `API_PORT`，避免 health check 端口与 API 实际监听端口不一致导致误报失败。
- 2025-12-25：WS-O.1（/baseline-management）：PR #213，恢复参考区页面 1:1 并对接 v2 GPS baselines API（含自动建立/质量评估）；保留 v2 重定向页 `/baseline-management-v2`
- 2025-12-25：WS-O.2（/optimized-demo）：PR #212，恢复参考区“数据库优化演示”页 1:1（OptimizedDeviceStatus/useDataAggregation）；保留 v2 重定向页 `/optimized-demo-v2`
- 2025-12-25：WS-O.3（/system-monitor）：PR #216，恢复参考区系统监控页 1:1（cache/realtime/worker 指标面板）；保留 v2 重定向页 `/system-monitor-v2`
- 2025-12-25：WS-O.4（/device-management）：PR #218，恢复参考区设备管理页 1:1（状态/监测站管理/基准点管理 tabs）；保留 v2 设备管理页到 `/device-management-v2`
- 2025-12-25：WS-O.5（/analysis2）：PR #219，恢复 legacy MonitoringPoints 面板（替代重定向到 `/analysis`）
- 2025-12-25：WS-G.3（/ops/debug-api）：PR #221，补齐参考区 debug-api “一键连通性测试”（/health + /huawei/*）；危险 POST 默认关闭并需二次确认
- 2025-12-22：PR #103（WS-C）：新增 Web 数据浏览器 `/data`（series/raw/export/statistics），用于单机联调与分析验证。
- 2025-12-22：GPS 形变（WS-D.2）：新增 `/api/v1/gps/deformations/{deviceId}/series`（基于基准点 + ClickHouse 遥测计算位移；支持 `latKey/lonKey/altKey` 覆盖默认 metric key），补齐 API 契约文档与 OpenAPI。
- 2025-12-22：WS-G 落地收口：合并 `/ops/system-monitor` + `/ops/debug-api` 与旧路径跳转，并将 Next.js Windows 构建输出目录切换为 `.next_v2` 规避 `.next_web/trace` 的 EPERM 卡点（见 PR #79）。
- 2025-12-22：运维工具（WS-G）：新增 Web 运维页 `/ops/system-monitor` 与 `/ops/debug-api`（仅 GET；RBAC 保护），并提供旧路径重定向，便于排查接口与基础设施状态。
- 2025-12-22：运维工具（WS-G.2）：新增 Web 运维页 `/ops/telemetry-dlq`（列表/详情），用于定位 `telemetry.dlq.v1` 的异常消息。
- 2025-12-22：Web 兼容入口（WS-J）：新增旧路由 `/baseline-management`、`/analysis2`、`/optimized-demo` 的兼容跳转，避免旧链接失效。
- 2025-12-23：Anomaly assessment 兼容（WS-K.4）：新增 `/anomaly-assessment`（v1 契约）与 legacy `/api/anomaly-assessment` 聚合接口（基于 v2 `alert_events` 映射国标四级预警）。
- 2025-12-23：GPS baselines 高级能力（WS-K.5）：补齐 `/gps/baselines/{deviceId}/auto-establish`、`/quality-check`、`/available-devices`，并提供 legacy `/api/baselines/*` 兼容路径。
- 2025-12-23：Realtime/SSE（WS-K.2）：新增 `/realtime/stream`（SSE）与 legacy `/api/realtime-stream`，支持 heartbeat + 单设备快照轮询（可选）+ 广播接口，并提供 Web 订阅调试页 `/data/realtime`。
- 2025-12-23：设备健康专家（WS-K.3）：新增 `/devices/{deviceId}/health/expert`（TTL 缓存 + 落库 + 审计）、`/history` 与 actions，并提供 legacy `/api/device-health-expert`；Web 增加调试页 `/data/health-expert`。
- 2025-12-23：AI predictions（WS-L.1）：新增 `/ai/predictions*` 查询端点（对接 `ai_predictions` 表）+ legacy `/api/ai-prediction` 兼容端点，并提供 Web 查看页 `/data/ai-predictions`。
- 2025-12-23：Legacy 设备管理 API 兼容（WS-M.1）：新增 legacy `/api/device-management/*`、`/api/iot/devices/*`、`/api/monitoring-stations*`、`/api/data-aggregation`，映射到 v2 Postgres/ClickHouse 数据源，旧前端无需改代码即可继续使用。
- 2025-12-24：运行大屏（WS-N.1）：PR #160，Web `/analysis` 补齐“大屏信息架构”与最小地图（站点坐标 -> 设备标记 + 点击选设备）+ Realtime(SSE) 状态卡，数据源统一走 v2 API（后续 WS-N.2 深化地图聚合/风险色/弹窗）。
- 2025-12-24：运行大屏地图增强（WS-N.2）：PR #164，Web `/analysis` 增加地图聚合（按站点/缩放网格）、弹窗列表与风险颜色（基于 active alerts severity 映射），补齐 legacy 地图体验。
- 2025-12-24：运行大屏 AI 组件恢复（WS-N.4）：Web `/analysis` 增加 AI Predictions 入口与懒加载小组件（预测列表 + 传感器图表预览），数据源对接 `/api/v1/ai/predictions*` 与 `/api/v1/data/series`。
- 2025-12-24：运行大屏 UI 1:1 骨架（WS-N.5）：PR #192，将 Web `/analysis` 切换为参考区风格大屏骨架（HoverSidebar/BaseCard/MapSwitchPanel/LazyComponents 布局）；原 v2 大屏页保留在 `/analysis-v2` 便于对照回归。
- 2025-12-24：运行大屏基础四图 1:1（WS-N.6）：PR #195，Web `/analysis` 补齐温度/湿度/加速度/陀螺仪四个图表组件（按参考区 ECharts option 与交互），数据源通过 v2 `/api/v1/data/series` 适配。
- 2025-12-24：运行大屏其余图表 1:1（WS-N.7）：PR #199，Web `/analysis` 补齐液位图（LiquidFill）、柱状图（BarChart）、设备错误图（DeviceErrorChart）、异常类型图（AnomalyTypeChart），并对接 v2 alerts/legacy API。
- 2025-12-24：运行大屏 3D/视频切换 1:1（WS-N.8）：PR #202，Web `/analysis` 补齐参考区 3D 地图容器（AMap 3D/terrain）与视频模式（ESP32-CAM `<img src=http://192.168.43.55/stream>`）。
- 2025-12-25：运行大屏 2D/卫星地图 1:1（WS-N.11）：PR #207，Web `/analysis` 移植参考区 OpenLayers `MapContainer`，对齐聚合点弹窗/轮播分页/设备标注，并补齐 `ol/ol.css` 样式引入。
- 2025-12-25：运行大屏设备命名/映射 1:1（WS-N.10）：PR #205，Web `/analysis` 从 v2 legacy `/api/iot/devices/mappings` 获取映射信息（simple_id/actual_device_id/device_name/location_name），并与位置命名逻辑对齐参考区。
- 2025-12-24：运行大屏性能监控 1:1（WS-N.9）：PR #197，Web `/analysis` 补齐参考区 `usePerformanceMonitor`（FPS/内存/加载耗时）与性能降级提示入口（`warnings`/`isPerformanceGood`，节流更新避免高频重渲染）。
- 2025-12-24：GPS 监测高级分析（WS-D.7）：PR #181，Web `/gps-monitoring` 增加分析分栏（CEEMD 轻量分解 / 预测分析 / 数据详情 / 风险与基准点）。
- 2025-12-24：运行大屏实时组件（WS-N.3）：PR #169，Web `/analysis` 补齐实时异常表（SSE `anomaly_alert` + `/anomaly-assessment` 聚合）与“实时传感器状态/最后上报时间”表（SSE `device_data`）。
- 2025-12-24：GPS 导出（WS-D.6）：Web `/gps-monitoring` 与 `/gps-deformation` 增加导出入口（CSV/JSON 报告），用于对齐参考区 GPS 监测页的导出闭环。
- 2025-12-24：GPS 导出对齐（WS-D.8）：PR #186，Web `/gps-monitoring` 补齐导出细节（XLSX/图表图片/报告 Markdown 等），进一步对齐参考区导出体验。
- 2025-12-24：基准点管理增强（WS-D.5）：Web `/device-management/baselines` 补齐自动建立 baseline（auto-establish）、质量检查（quality-check）、可用设备扫描（available-devices）入口，用于对齐参考区 BaselineManagementV2。
- 2025-12-23：Camera/ESP32-CAM（WS-K.1）：新增 `/api/v1/camera/devices*`（列出/添加/删除/状态探测），并提供 legacy `/api/camera` 兼容路径；Web `运行概览` 补齐视频监控卡片（直连 `http://{ip}/stream`）。
- 2025-12-23：华为/硬件 legacy 端点策略（WS-K.6）：补齐 `/iot/huawei`（适配器别名）与 `/huawei/*` 兼容层（影子/命令模板/快捷命令），并将 legacy 命令映射到 v2 `device_commands` + Kafka 管线。
- 2025-12-22：GPS 基线管理（WS-D.1）：补齐 v2 API 的 `/api/v1/gps/baselines`（list/get/upsert/delete）实现与 OpenAPI 契约文档，支持站点/设备的基线维护与回归留证。
- 2025-12-22：GPS 基准点管理（WS-D.3）：新增 Web 页面 `/device-management/baselines`（查看/编辑/删除），对接 `/api/v1/gps/baselines/*`。
- 2025-12-22：AI 预测/专家系统（WS-H）：新增 `ai-prediction-worker` 骨架（telemetry.raw.v1 -> ai.predictions.v1），补齐 Kafka schema/example 与 Postgres `ai_predictions` 落库表。
- 2025-12-22：告警规则管理（WS-E）：新增 Web 页面 `/alerts/rules`（规则列表/创建/启停/版本发布/回放入口）。
- 2025-12-22: Stations detail (WS-B): add Web page `/stations/{stationId}` (station metadata + devices list via `/api/v1/devices?stationId=`).
- 2025-12-22：WS-F（IoT 接入）：新增 `huawei-iot-adapter` 服务骨架（HTTP Push → Kafka `telemetry.raw.v1`），并补齐 `docs/integrations/iot/*` 契约文档。
- 2025-12-22：GPS 监测/形变页面（WS-D.4）：新增 Web 页面 `/gps-monitoring` 与 `/gps-deformation`，分别对接 `/api/v1/data/series` 与 `/api/v1/gps/deformations/*`。
- 2025-12-22：修复 Web 构建阻塞：补齐 `apps/web/lib/api/data.ts` 的 `getStatistics` 导出，与 `/data` 页面保持一致。
- 2025-12-22：本地开发体验：api-service 开启 Web 开发用 CORS（允许 `http://localhost:3000` 调用 `http://localhost:8080`），解除登录/接口调试的跨域阻塞。
- 2025-12-22：本地开发体验：新增 Web 本地登录联调脚本 `infra/compose/scripts/configure-web-dev-env.ps1` 与指南 `docs/guides/testing/web-local-dev.md`，用 `ADMIN_API_TOKEN` 引导首次创建用户后再走登录。
- 2025-12-21：非硬件模块收口推进（安全与访问控制 + 运维审计）：API 端点从 admin token 兜底升级为基于 `permission_code` 的 RBAC 校验；新增 `role_permissions` 默认种子；Web 增加 JWT 登录页与 token refresh，导航/页面按权限可见；关键操作写入 `operation_logs` 便于运维审计。
- 2025-12-21：单机启用 JWT/RBAC 的一键引导：新增 `infra/compose/scripts/enable-jwt-auth.ps1`（生成 JWT secrets + 可选 ADMIN_API_TOKEN 并写入 gitignored 的 `services/api/.env`），补充单机部署指引与 smoke 脚本，降低首次启用成本。
- 2025-12-21：回归基线流程收口：PR 模板与操作指南补齐本地门禁（`run-quality-gates + lint + build`）并明确 Web/API 变更需以 `-Stage4Regression` 留证，降低“接口/契约漂移”风险。
- 2025-12-21：Web 接口封装一致性收口（不改 UI）：统一走 `apps/web/lib/v2Api.ts`（新增无 body 的 `apiPut`，移除直连 `fetch`），并清理未使用的遗留 IoT API 配置代码，降低维护成本与误用风险。
- 2025-12-21：Web 代码架构细化（不改 UI）：引入 domain API 模块（`apps/web/lib/api/*`），将 stations/ops 等页面的请求拼装从 UI 层下沉到 API 层，降低重复与耦合。
- 2025-12-21：Web 架构继续收口（不改 UI）：补齐 alerts/admin/auth/dashboard/devices/sensors 的 domain API 模块，并将相应页面与 hooks 迁移到 API 层调用，减少重复类型与散落的请求拼装。
- 2025-12-21：Device Management 页面收口（不改 UI）：将 stations/devices/commands/events/notifications 等请求统一下沉到 `apps/web/lib/api/devices.ts` 与 `apps/web/lib/api/stations.ts`，移除页面内的路径拼装与散落调用。
- 2025-12-20：补齐 OpenAPI 契约缺口（api-service 实现 `/auth/*`、`/users`/`/roles`/`/permissions`、`/system/configs`、`/system/logs/*`、`/data/raw|statistics|export`），并为 `operation_logs`/`api_logs` 增加 DEFAULT 分区以避免单机环境插入失败；阶段 5 Next Actions 不变。
- 2025-12-20：阶段 5 落地：新增固件模拟器 `scripts/dev/firmware-sim.js`（schema 校验 + state 持久化 + 重连退避 + ping/set_config/reboot），并在 `infra/compose/scripts/e2e-smoke-test.ps1` 增加 `-Stage5Regression` 预置回归；新增 `docs/guides/roadmap/stage5-acceptance.md`。
- 2025-12-20：补齐 PresenceEvent 可选链路：ingest-service 订阅 `presence/+` 写入 `presence.events.v1`，新增 `presence-recorder` 落库 `device_presence`，并把 presence 断言纳入 `Stage1Regression/Stage2Regression/Stage5Regression` 回归基线。
- 2025-12-20：合并 PR #65：Stage4（Web/App 去硬编码）收口：Web 只依赖 v2 API + 字典渲染；新增告警详情（events 审计）、站点 CRUD、设备 sensors 声明/命令审计视图；e2e 新增 `-Stage4Regression` 回归基线；Stage4 验收清单更新为可执行并完成。
- 2025-12-20：新增 Web 管理/运维最小可用界面：用户管理（CRUD）、角色/权限查看、系统配置编辑、操作日志查看、API stats（单机运维排查）；硬件仍按计划最后联调。

## 1) 当前结论（TL;DR）

- 技术栈已冻结：后端 TypeScript（strict），MQTT→Kafka→ClickHouse + Postgres（单机 Compose）。
- 仓库治理已落地：Rulesets 强制 PR-only、必过 `docs-and-contracts`、禁强推/禁删除。
- GitHub 远端仓库：https://github.com/kipp7/landslide-monitoring-v2（remote: `origin`；PR-only 合并）
- 已完成 monorepo 迁移并合入 `main`（PR #65）。
- 阶段 0 已完成：单机基础设施 + 端到端冒烟（MQTT→Kafka→ClickHouse→API）可复现，踩坑已沉淀到 `docs/incidents/`。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 可一键跑通并自动留证日志（见 `docs/guides/testing/e2e-smoke-test.md`）。
- 阶段 1 已完成：单机 Compose 已具备设备鉴权 + commands 运维排查的“可落库/可查询”闭环（command events + notifications），并已把关键回归断言沉淀到 `e2e-smoke-test.ps1` 的证据包中。
  - 补充：`infra/compose/scripts/configure-emqx-http-auth.ps1` 可一键写入 EMQX 配置（免 Dashboard 手工操作）。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 支持 `-ConfigureEmqx -UseMqttAuth -CreateDevice` 一键跑通“带鉴权”的端到端冒烟。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 新增 `-Stage1Regression` 预置模式：一键跑完阶段 1 的闭环回归基线（鉴权 + commands acked/failed/timeout + Telemetry DLQ + revoke），并自动留证。
  - 补充：`infra/compose/scripts/e2e-smoke-test.ps1` 增加 `-TestCommandFailed` 回归用例（sent→failed），并断言事件/通知/统计/已读链路可用。
  - 补充：冒烟失败会自动调用 `infra/compose/scripts/collect-evidence.ps1` 生成证据包（带脱敏），避免手工收集日志。
  - 修复：冒烟脚本现在会展开 `infra/compose/.env` 中的 `${VAR}`（例如 `CH_HTTP_URL`/`MQTT_URL`），避免误判基础设施不可达。
  - 修复：EMQX 接线脚本写入 `services/api/.env` 时会展开 `CH_HTTP_URL`，避免 ClickHouse URL 形如 `http://${CH_HOST}:${CH_HTTP_PORT}` 导致 api-service 启动失败。
  - 修复：`-ForceWriteServiceEnv` 下重写 `services/api/.env` 时会保留 `EMQX_WEBHOOK_TOKEN` 与 `MQTT_INTERNAL_PASSWORD`，避免鉴权冒烟提前失败。
  - 修复：接线脚本生成 token 时不再追加重复键；e2e 脚本读取 `.env` 时使用“最后一个非空值”，避免因重复键的空值导致误报。
  - 修复：e2e 冒烟脚本访问 API 改用 `127.0.0.1`（避免 Windows 下 `localhost` 解析到 IPv6 ::1 导致 /health 超时）；EMQX HTTP authn/authz webhook 增加 `Content-Type: application/json`。
  - 修复：e2e 冒烟脚本增加启动稳定性：等待 ingest-service 确认订阅 MQTT，并在 EMQX webhook 刚恢复时对 `publish-telemetry.js` 做 retry，同时把输出写入 `publish-telemetry.log` 便于排查。
  - 修复：`@lsmv2/validation` 的 Ajv schema 编译结果按 `Validator{ validate, errors }` 形式包装，避免运行期出现 `validateRaw.validate is not a function`。
  - 修复：telemetry-writer 写入 ClickHouse 时，将 `*_ts` 按 ClickHouse `DateTime64(3, 'UTC')` 期望格式序列化（避免 ISO8601 `T/Z` 导致解析失败）。
  - 修复：API `/data/series` 查询对 ClickHouse 的 `DateTime64` 参数使用 UTC 解析（避免时区/格式导致范围查询无数据或 500）。
  - 修复：ClickHouse 默认使用 named volume（可用 `CH_DATA_DIR` 切回 bind-mount），并在 e2e 冒烟中自动检测/初始化 ClickHouse DDL（缺表时执行 `init-clickhouse.ps1`）。
  - 进展：补齐设备管理端接口的“命令下发”入口 `POST /devices/{deviceId}/commands`（写入 Postgres `device_commands`，返回 queued）。
  - 进展：补齐站点管理端接口：`/stations` CRUD（Postgres），用于设备绑定站点与运营维护。
  - 修复：设备更新接口支持清空 `stationId`（原先无法设置为 `null`）。
  - 进展：MQTT revoke 立即生效：EMQX ACL 回调会实时查询 Postgres `devices.status`，`revoked` 设备会被拒绝 publish/subscribe（即使已连接）。
  - 进展：writer 可靠性增强：ClickHouse 写入成功后才提交 Kafka offset；写入失败时退避重试，避免 ClickHouse 故障导致数据丢失/缓冲堆积。
  - 进展：Postgres shadow 落地：telemetry-writer 在写入 ClickHouse 成功后 upsert `device_state`；API `/data/state` 优先读 `device_state`，无记录时回退 ClickHouse。
  - 进展：命令下发进入 Kafka：API 创建命令时同步写入 `device.commands.v1`（为后续 MQTT 下发 worker / 回执链路打基础）。
  - 进展：新增 `command-dispatcher`：消费 `device.commands.v1` 并通过 MQTT 发布到 `cmd/{device_id}`，e2e 脚本可选验证设备接收命令。
  - 进展：e2e 冒烟补齐阶段 1 回归用例：支持 `-TestRevoke` 验证 revoke 立即生效（EMQX authn 拒绝已吊销设备）。
  - 进展：commands 回执闭环落地：设备 publish `cmd_ack/{device_id}` → Kafka `device.command_acks.v1` → Postgres `device_commands`（acked_at/result/status）。
  - 进展：e2e 冒烟补齐回执验证：支持 `-TestCommandAcks`（command queued→sent→acked）。
  - 进展：补齐 commands 运维接口：`GET /devices/{deviceId}/commands` 与 `GET /devices/{deviceId}/commands/{commandId}`（用于排查 queued/sent/acked/failed/timeout/canceled）。
  - 进展：补齐 ack 超时策略：新增 `command-timeout-worker` 定期扫描 `sent` 超时命令并标记为 `timeout`，同时发出 `device.command_events.v1` 事件；e2e 支持 `-TestCommandTimeout` 回归。
  - 进展：补齐 command events 的“落库与查询”：新增 `command-events-recorder` 落库 `device_command_events`；API 新增 `/devices/{deviceId}/command-events` 查询，用于通知/排查与 e2e 断言。
  - 进展：commands 运维收口：命令事件/通知列表支持 `startTime/endTime/eventType/unreadOnly` 过滤；统计接口支持 `bucket(1h/1d)` 按时间窗口聚合，并新增 `/devices/{deviceId}/command-events/stats`。
- 阶段 2 已完成（最小可告警闭环）：rule engine → `alert_events` → API 可查询/可处置，并已沉淀单机回归基线。
  - 进展：新增 `rule-engine-worker`（消费 `telemetry.raw.v1`，按规则 DSL v1（最小子集）评估并写入 `alert_events`）。
  - 进展：补齐告警 API（`/alerts`、`/alerts/{alertId}/events`、`/alerts/{alertId}/ack|resolve`、`/alert-rules*`），对齐 `docs/integrations/api/06-alerts.md`。
  - 进展：e2e 冒烟新增 `-Stage2Regression` 预置模式：阶段 1 回归基线 + alerts（创建规则 → 触发 → 查询事件流 → ACK → RESOLVE），并自动留证。
  - 2025-12-20：修复并稳定化 Stage2Regression（Ajv strict schema、commands/alerts 竞态与脚本幂等/可复现性），已本地复跑验证通过。
- 阶段 3 进行中：复杂规则与 AI 插件（聚合/趋势/缺失策略/回放回测/可解释字段），在阶段 2 的可告警闭环之上持续迭代。
  - 2025-12-20：rule-engine-worker 支持 `station` / `global` scope（station 规则按 `devices.station_id` 匹配；global 规则应用于全部设备）。
  - 2025-12-20：rule-engine-worker 支持 DSL v1 `metric`（last/min/max/avg/delta/slope），用于窗口内聚合与趋势判断（slope 单位约定为每分钟变化量）。

## 2) 当前阶段与里程碑

阶段：阶段 5（单片机端适配）

M1（阶段 0：最小闭环）目标：

- MQTT ingest：设备上报 → Kafka（含 schema 校验与 DLQ）
- writer：Kafka → ClickHouse（批量写入、错误隔离）
- API：查询最新值 + 简单曲线（最少 2~3 个端点）

当前完成情况：

- ✅ ingest-service：已实现 MQTT telemetry 订阅、JSON Schema 校验、写 `telemetry.raw.v1` 与 `telemetry.dlq.v1`
  - 补充：ingest-service 增加入站降载保护（payload 过大 / metrics 过多 → 直接写 DLQ），避免异常负载拖垮后续链路。
  - 修复：ingest-service 写入 DLQ 时对 `raw_payload` 做字节级截断（避免超大 payload 反向拖垮 DLQ topic）。
  - 进展：新增 `telemetry-dlq-recorder` 把 `telemetry.dlq.v1` 落库到 Postgres，并提供 API 查询接口，方便运维定位坏消息来源。
  - 进展：e2e 冒烟新增 DLQ 降载回归断言（invalid_json / payload_too_large / metrics_too_many + stats 聚合）。
- ✅ telemetry-writer：对疑似 ClickHouse 基础设施故障加入“失败冷却窗口”（避免长时间故障时反复崩溃/重试导致日志风暴），恢复后不提交 offset 的消息会自动重放。
- ✅ telemetry-writer：已实现消费 `telemetry.raw.v1` 并批量写入 ClickHouse（批量写入 + 退避重试 + writer 侧 DLQ + 基础运行观测/保护）
- ✅ API：已实现最小查询端点（`/data/state`、`/data/series`），数据源为 ClickHouse（后续可切换到 Postgres shadow）

M2（阶段 1：设备接入与鉴权）目标：

- 管理端：创建设备并生成“身份包”（`deviceId + deviceSecret`，secret 仅返回一次；服务端只存 hash）
- MQTT：设备按 `deviceId/secret` 鉴权，按 topic 做 ACL，禁越权发布；吊销设备后立即拒绝上报
- 运营：传感器字典与设备传感器声明可维护（前端不写死）

当前完成情况：

- ✅ 管理端：设备创建 + deviceSecret（仅返回一次），服务端保存 hash
- ✅ MQTT：鉴权 + ACL + revoke 立即生效（并已具备一键配置与回归基线）
- ✅ 运维：commands events/notifications 可落库可查询，支持筛选/统计（含未读与按时间桶聚合）

M3（阶段 2：可告警）目标：

- 规则：DSL 版本化（`alert_rules`/`alert_rule_versions`），支持最小阈值/窗口/防抖
- worker：`rule-engine-worker` 触发 `alert_events`（可回放/可查询）
- API：按契约提供 `/alert-rules`、`/alerts` 的最小可用查询与运维接口

## 3) 下一步（Next Actions，按优先级）

1) 巩固回归基线：将 `-Stage4Regression` 作为“Web/API 契约一致性 + 字典渲染”的常规回归；改动涉及接口/消息/存储时必须更新对应 docs 并留证
2) 缺口对照验收（非硬件）：按 `docs/guides/roadmap/gap-audit.md` 逐项对照参考区与 v2 的落地点，确保“功能不缺失”，并将缺口拆成最小 PR 推进
3) 真实固件联调（硬件最后）：按 `docs/integrations/mqtt/*` 与 `docs/integrations/firmware/README.md`，让真实设备跑通 telemetry + commands，并以 `-Stage5Regression` 作为回归基线
4) 固件细节沉淀：将真实固件的“身份包存储/重连退避/命令回执”实现细节沉淀到 `docs/integrations/firmware/`（含可复用代码片段与踩坑记录）
5) /analysis 大屏 UI 1:1：按参考区 `analysis/page.tsx` 逐项对齐懒加载组件、布局与交互（温湿度/加速度/陀螺仪/异常类型/液位/设备错误/异常统计/实时表/2D+3D 地图/HoverSidebar/性能监控等）
6) app 路径级兼容：补齐参考区 `app/hooks/*` 与 `app/utils/*` 的同名入口（以 re-export 为主），避免旧引用路径失效
7) legacy route handlers：评估并补齐需要的 `apps/web/app/api/*/route.ts` 兼容层（仅必要/安全端点；不恢复 inspect/db-admin/test）

## 4) 关键入口（新 AI 只读这些就能上手）

### 大局与决策（Why）

- `docs/architecture/overview.md`
- ADR：
  - `docs/architecture/adr/ADR-0001-mqtt-kafka-clickhouse-postgres.md`
  - `docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
  - `docs/architecture/adr/ADR-0003-sparse-telemetry-model.md`

### 契约（Interface，唯一权威）

- `docs/integrations/README.md`
- MQTT：`docs/integrations/mqtt/README.md`
- Kafka：`docs/integrations/kafka/README.md`
- Storage：`docs/integrations/storage/README.md`
- API：`docs/integrations/api/README.md`

### 规范（How-to + 约束）

- `docs/guides/standards/README.md`
- 合并信息包模板（每次合并必须给）：`docs/guides/standards/pull-request-howto.md`

### 当前计划（What to do）

- 路线图：`docs/features/roadmap.md`
- 启动清单：`docs/guides/roadmap/kickoff-checklist.md`

## 5) 运行与验证（任何 AI 必须会）

### 质量门禁（必过）

- `python docs/tools/run-quality-gates.py`
- 2025-12-26：WS-K.11（PR #244）：补齐 legacy `/api/device-management/{export,reports,diagnostics}` 端点（导出/报告/诊断），以兼容参考区 `frontend/app/api/device-management/*` 的依赖（数据源：ClickHouse 分钟桶 + Postgres 设备/基准点映射）。
- 2025-12-26：WS-K.14（PR #242）：legacy `inspect-*`/`db-admin`/`test-*` 调试/管理端点在 v2 中显式禁用（403），并补齐说明文档 `docs/integrations/api/015-legacy-disabled-endpoints.md`
- `npm run lint`
- `npm run build`

### 单机联调（可选：依赖 Docker 可用）

- Compose：`infra/compose/README.md`
- 冒烟测试：`docs/guides/testing/single-host-smoke-test.md`
- 端到端冒烟一键脚本：`powershell -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1`

## 6) 已知问题（不要重复踩坑）

- Rulesets / Required checks / 422：`docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`
- Git HTTPS 连接重置：`docs/incidents/INC-0006-git-https-connection-reset.md`
- DockerHub 拉镜像超时：`docs/incidents/INC-0004-dockerhub-pull-timeout.md`
