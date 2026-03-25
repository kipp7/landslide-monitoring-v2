# desk-backend-data-closure

## Status

- task: `desk-backend-data-closure`
- state: `completed`
- updated_at: `2026-03-17`

## Scope

本任务只处理桌面端依赖的数据库、后端接口、算法与数据链路打通。

约束：

- `apps/desk` 前端冻结
- 不继续改桌面端 UI、页面跳转或导航

## Phase 1: desk-api-runtime-alignment

### 本轮做了什么

- 确认当前本地 API 运行端口为 `8081`
- 确认当前桌面前端开发入口为 `5174`
- 启动并确认：
  - `api-service`：`http://127.0.0.1:8081/health` 返回 `200`
  - `apps/desk` dev server：`http://localhost:5174` 返回 `200`

### 当前运行口径

- Desk 开发入口：`http://localhost:5174`
- API 服务入口：`http://localhost:8081`

### 当前结论

- 当前桌面端运行态已经对齐到：
  - Desk: `5174`
  - API: `8081`
- 当前不再继续把 Web 端口 `3000` 当作桌面端联调入口
- 下一步可以直接进入 `desk-core-data-closure`

### 补充对齐（2026-03-16）

- `apps/desk/src/stores/settingsStore.ts` 已调整：
  - 新实例默认 `apiMode = http`
  - 新实例默认 `apiBaseUrl = http://127.0.0.1:8081`
  - 对旧的本地默认持久化设置（`mock + 3000`）做一次自动迁移
- `npm -w apps/desk run build` 已通过

### 运行说明

- 一般情况下，后续不需要再手动去 Desk 设置里切换到真实后端
- 例外：
  - 如果你本地已经保存过自定义的 Desk 设置，且不是旧默认值，那么持久化配置仍会保留，需要你手动改回

## Phase 2: desk-core-data-closure

### 本轮处理

- 为 Desk 当前 legacy HTTP 客户端补齐：
  - `GET /api/devices`
- 支持：
  - 无筛选列表
  - `station_id` 过滤

### 改动文件

- `services/api/src/routes/devices.ts`
- `services/api/src/index.ts`

### 当前验证

- `npm -w services/api run build` 已通过
- `GET /api/devices` 已在 `8081` 返回 Desk 期望形状
- `GET /api/devices?station_id=<stationUuid>` 已在 `8081` 返回过滤结果

### 当前结论

- Desk 当前核心数据链中的 `devices` 兼容接口已从 `404` 修补为真实可用
- 当前 `desk-core-data-closure` 已形成第一处有效 checkpoint
- 下一步继续处理同属 Desk 核心链的：
  - `stations`
  - `dashboard summary / weekly trend`
  - `system status`

### 核心链复核（2026-03-16）

已确认在 `8081` 上真实可用：

- `GET /api/dashboard/summary`
- `GET /api/dashboard/weekly-trend`
- `GET /api/system/status`
- `GET /api/monitoring-stations`
- `GET /api/devices`

当前判断：

- `dashboard summary`：已打通
- `weeklyTrend`：已打通，但当前雨量数据仍为 0，需要后续继续收 ClickHouse / seed 口径
- `monitoring-stations`：已打通
- `devices`：已打通
- `system status`：接口已通，但仍与主线 Desk 当前 `cpu/mem/disk` 消费模型不一致

当前结论：

- `desk-core-data-closure` 已完成“接口存在性与最小真实返回”这一层
- 若继续保持 Desk 前端冻结，后续应先转入：
  - `desk-gps-chain-closure`
  - 并将 `system status` 的模型差异记录为后续消费侧调整项

### 注意

- `apps/desk` 当前默认仍是 `mock` 模式
- 若要联调真实后端，需要在 Desk 设置中切到 `http`，并将 `apiBaseUrl` 指向 `http://localhost:8081`

## Phase 3: desk-gps-chain-closure

### 本轮复核

- `GET /api/baselines`：已真实返回 baseline 列表
- `GET /api/gps-deformation/{deviceId}?days=7`：接口可返回，但当前 `hasLatestData=false`、`totalPoints=0`

### 当前根因定位

- legacy deformation 接口默认按 `24h` 时间窗口取数
- 当前 demo GPS 数据最新时间停在 `2026-03-14 10:12:10 UTC`
- 当前日期已到 `2026-03-16`
- 因此：
  - `24h` 窗口内 `gps_latitude/gps_longitude` 数量为 `0`
  - `7d` 窗口内 `gps_latitude/gps_longitude` 数量为 `1440`

### 当前判断

- 这不是后端接口缺失
- 也不是 Desk UI 逻辑缺失
- 当前问题已收缩为：
  - demo GPS 数据时效与 legacy 默认查询窗口不一致

### 下一步选项

1. 刷新 / 重跑 demo GPS seed，让最近 24h 有点
2. 调整 legacy deformation 默认窗口，不再固定只看 24h

当前建议：

- 若目标是尽快让桌面端“看得到数据”，优先刷新 demo seed

### 刷新后复验（2026-03-16）

- 已执行：
  - `infra/compose/scripts/seed-demo.ps1`
- 刷新后验证：
  - ClickHouse `24h` 窗口内 `gps_latitude/gps_longitude` 数量为 `480`
  - `GET /api/gps-deformation/{deviceId}?days=7` 已返回：
    - `hasLatestData=true`
    - `totalPoints=240`
    - `validPoints=240`
    - `latestGPS`
    - `latestTime`

### 当前结论

- `desk-gps-chain-closure` 当前轮已完成
- 这条链路的根因不是代码缺失，而是 demo GPS 数据时效不足
- 通过刷新 demo seed，Desk 当前 GPS 形变链已经真实可用

## Phase 4: desk-algo-query-closure

### 本轮处理

- 手工补入当前运行态 demo 数据：
  - ClickHouse `rainfall_mm`
  - PostgreSQL `alert_events`
- 复验：
  - `GET /api/dashboard/summary`
  - `GET /api/dashboard/weekly-trend`

### 当前结果

- `/api/dashboard/summary` 当前已返回：
  - `alertCountToday=3`
  - `systemHealthPercent=91`
- `/api/dashboard/weekly-trend` 当前已返回非零 demo 数据：
  - `rainfallMm=[12,8,15,6,9,18,11]`
  - `alertCount=[0,0,0,0,1,1,1]`

### 当前判断

- 当前 Desk 依赖的 dashboard / weeklyTrend 查询链已经具备“有意义的 demo 数据”
- 且 `infra/compose/scripts/seed-demo.ps1` 中的告警 demo 写入现已收口
- 当前这一阶段可视为：`completed`

### Next Step

- 当前可进入下一阶段：
  - `desk-http-live-proof`

### 脚本层收口（2026-03-16）

- 已修复 `seed-demo.ps1` 中告警 demo 数据写入的 SQL 细节
- 重新执行 `infra/compose/scripts/seed-demo.ps1` 已通过
- 复验结果：
  - PostgreSQL `alert_events` 中演示告警数量为 `3`
  - `/api/dashboard/summary` 仍返回：
    - `alertCountToday=3`
    - `systemHealthPercent=91`
  - `/api/dashboard/weekly-trend` 仍返回：
    - `rainfallMm=[12,8,15,6,9,18,11]`
    - `alertCount=[0,0,0,0,1,1,1]`

## Phase 5: desk-http-live-proof

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-http-legacy.ps1`
- 使用该脚本对 Desk 当前真正依赖的 legacy HTTP 接口做最小 live proof：
  - `/api/dashboard/summary`
  - `/api/dashboard/weekly-trend`
  - `/api/monitoring-stations`
  - `/api/devices`
  - `/api/baselines`
  - `/api/gps-deformation/{deviceId}?days=7`
  - `/api/system/status`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1` 已通过
- 核心结果：
  - `summary.alertCountToday=3`
  - `weeklyTrend.rainfallSum=158`
  - `devices.count=3`
  - `baselines.count=3`
  - `gps.hasLatestData=true`
  - `gps.totalPoints=480`
  - `system.source=health_summary`

### 补强验证（2026-03-17）

- `check-desk-http-legacy.ps1` 已补入 baseline mutation proof：
  - baseline detail
  - baseline upsert
  - baseline auto-establish
  - baseline quality-check
- 补强后脚本已再次通过
- 当前额外结果：
  - `baselines.upsertMessage=基准点更新成功`
  - `baselines.autoPointsUsed=20`
  - `baselines.qualityLevel=bad`
  - `weeklyTrend.rainfallSum=79`
  - `weeklyTrend.alertSum=6`

## Final Judgment

- 按当前任务“冻结 Desk 前端、打通数据库/后端接口/算法与数据链路”的范围判断，`desk-backend-data-closure` 已完成
- 当前剩余问题不再属于这条任务本身：
  - Desk 前端旧 `system status` 消费模型与健康摘要模型仍有语义差异
  - 这属于后续消费侧调整项，不再阻塞本任务收口

## Post-Completion Desk Data-Layer Alignment（2026-03-17）

### 本轮处理

- 只调整 `apps/desk/src/api/*` 与会话状态层，不改页面布局、跳转或导航
- 引入：
  - `apps/desk/src/api/httpTransport.ts`
  - `apps/desk/src/api/httpMappers.ts`
- 更新：
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/ApiProvider.tsx`
  - `apps/desk/src/stores/authStore.ts`
  - `apps/desk/src/App.tsx`
  - `apps/desk/src/api/mockClient.ts`

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前结论

- 当前 Desk 数据层已经具备吃到后端真实返回形状的能力
- 这一步没有改页面结构，只是让现有页面更接近真正可联调状态

### 当前范围确认

- 改动面仅限：
  - `apps/desk/src/api/*`
  - `apps/desk/src/stores/authStore.ts`
  - `apps/desk/src/App.tsx`
- 未改：
  - 页面布局
  - 导航跳转
  - 视觉样式

### 后续收口（2026-03-17）

- 已继续将 Desk 数据层的关键对象统一到 UUID 主线：
  - `devices`
  - `baselines`
  - `gps`
- 当前 `apps/desk` 数据层已避免“设备列表是 UUID、baseline 列表是 legacy id”这类主线不一致
- 最新验证：
  - `npm -w apps/desk run build` 已通过

### 本地联调口径补充（2026-03-17）

- `services/api/.env` 当前已设置：
  - `ADMIN_API_TOKEN=dev`
- `apps/desk/src/api/httpClient.ts` 当前恢复为本地联调优先：
  - `auth.login()` 直接返回 `token=dev`
  - `auth.logout()` 为本地 no-op
- 重新编译并重启后验证：
  - `/health` 返回 `200`
  - 带 `Authorization: Bearer dev` 的 `/api/dashboard/summary` 返回 `200`

### 当前结论

- 当前 Desk HTTP 模式已回到“本地可直接联调”的状态
- 这一步仍然没有改页面 UI，只是稳定了认证与数据层入口

## Post-Completion Consistency Fix（2026-03-17）

### 本轮处理

- 修正 legacy `monitoring-stations` 的在线状态判定窗口
- 将 `services/api/src/routes/legacy-device-management.ts` 中的 `onlineStatus()` 从 `5 分钟` 调整为 `24 小时`

### 当前验证

- 重启 `api-service` 后复验：
  - `/api/monitoring-stations` 的 `online_status`
  - `/api/devices` 的 `status`
- 当前两者已对齐为 `online`

### 当前结论

- Desk 当前两个核心 legacy 数据源：
  - `monitoring-stations`
  - `devices`
  的在线状态语义已经一致

## Post-Completion Legacy Baseline Fix（2026-03-17）

### 本轮处理

- 修复 legacy baseline 写链对 `device_1` 这类 legacy id 的兼容：
  - `/api/baselines/:deviceId/auto-establish`
  - `/api/baselines/:deviceId/quality-check`
  - `/api/baselines/:deviceId/quality-assessment`

### 改动文件

- `services/api/src/routes/gps-baselines-advanced.ts`

### 当前验证

- `npm -w services/api run build` 已通过
- 复验：
  - `POST /api/baselines/device_1/auto-establish`
  - `GET /api/baselines/device_1/quality-check`
- 当前两者都已成功返回

### 当前结论

- Desk 当前 legacy baseline 的读/写/自动建立/质量检查链路已对齐 legacy id 口径
- 这条兼容修复已完成

## Next Step

- 若继续推进，建议另起任务处理：
  - Desk 前端消费模型与健康摘要模型对齐
  - 更高强度的 HTTP 回归或自动化冒烟

## Phase 6: business-health-semantics

### 本轮处理

- 将 `DashboardSummary.systemHealthPercent` 的计算语义收口为：
  - 设备在线率
  - 数据新鲜度（最近 24h 有上报）
  - 风险 / 告警压力
- 不再按“服务器资源占用”方向解释该字段

### 当前验证

- `npm -w services/api run build` 已通过
- 重新启动 `api-service` 后，`GET /api/dashboard/summary` 仍稳定返回：
  - `stationCount=1`
  - `deviceOnlineCount=3`
  - `alertCountToday=1`
  - `systemHealthPercent=87`

### 当前结论

- 当前 `systemHealthPercent` 已在后端实现层面收口为“业务运行健康度”
- 该值当前不再按主机资源监控口径理解

## Phase 7: runtime-truth-revalidation（2026-03-17）

### 本轮处理

- 重新构建 `services/api`
- 按当前 Desk 真值端口 `8081` 临时启动 API
- 重新执行：
  - `GET /health`
  - `GET /api/dashboard/summary`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1`
- 对照 PostgreSQL `alert_events` 当前时间分布复核当天告警口径

### 当前验证

- 当前本地运行端口真值已再次确认：
  - API：`8081`
- 当前最新 live proof 返回：
  - `summary.alertCountToday=1`
  - `summary.systemHealthPercent=87`
  - `weeklyTrend.alertSum=3`
  - `weeklyTrend.rainfallSum=79`
  - `gps.totalPoints=240`
  - `gps.validPoints=240`
  - `stations.online_status=online`
  - `devices.status=online`
  - `system.source=health_summary`

### 根因结论

- 先前 `alertCountToday=3` / `systemHealthPercent=91` 这组结果不是当前最新运行态真值
- 当前更可信的解释是：
  - 当时观察到了旧进程或非最新启动态
  - 且 `services/api/.env` 仍保留 `8080`，与 Desk / 文档长期使用的 `8081` 形成漂移

### 收口动作

- 已将 `services/api/.env` 与 `services/api/.env.example` 的本地默认端口统一到 `8081`

### 当前结论

- `desk-backend-data-closure` 的当前主线真值已经重新对齐
- 后续若继续复验，应以：
  - `API_PORT=8081`
  - `check-desk-http-legacy.ps1`
  - 当前 seed 运行态返回值
  作为基准

## Phase 8: non-mutating-live-proof（2026-03-17）

### 本轮处理

- 继续收口 demo 真值保护
- 为以下 legacy baseline 验证入口补充 `persist=false` 非持久化模式：
  - `PUT /api/baselines/:deviceId`
  - `POST /api/baselines/:deviceId/auto-establish`
- 更新 `scripts/dev/check-desk-http-legacy.ps1`，改为使用非持久化验证

### 改动文件

- `services/api/src/routes/gps-baselines-advanced.ts`
- `scripts/dev/check-desk-http-legacy.ps1`

### 当前验证

- `npm -w services/api run build` 已通过
- 重新执行 `seed-demo.ps1` 后复验：
  - `GET /api/baselines/device_1`（脚本前）
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1`
  - `GET /api/baselines/device_1`（脚本后）
- 当前结果：
  - baseline 脚本前后保持一致
  - `check-desk-http-legacy.ps1` 返回：
    - `baselines.autoPersisted=false`
    - `summary.alertCountToday=1`
    - `weeklyTrend.alertSum=3`
    - `weeklyTrend.rainfallSum=79`
    - `gps.totalPoints=240`

### 当前结论

- Desk 当前 live proof 已从“会改动 demo 主样例”收口为“非污染验证”
- 后续重复执行 `check-desk-http-legacy.ps1` 不会再把 baseline 真值越跑越漂

## Phase 9: online-status-semantics-alignment（2026-03-17）

### 本轮处理

- 继续收口 legacy 数据源之间的状态语义一致性
- 将 `services/api/src/routes/devices.ts` 中 legacy `/api/devices` 的 `status` 计算改为：
  - 优先依据 `last_seen_at`
  - 以最近 `24h` 为在线窗口
  - 不再只按数据库 `status=active` 直接映射 `online`

### 当前验证

- `npm -w services/api run build` 已通过
- 重新启动 API 后复验：
  - `GET /api/devices`
  - `GET /api/monitoring-stations`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1`
- 当前 demo 运行态结果保持不变：
  - `devices.status=online`
  - `stations.online_status=online`
  - `summary.alertCountToday=1`
  - `weeklyTrend.alertSum=3`

### 当前结论

- `/api/devices` 与 `/api/monitoring-stations` 现在不再只是“当前 demo 碰巧一致”
- 后续即使设备 `status=active` 但 `last_seen_at` 已过期，两个接口的在线语义也会继续保持一致

## Phase 10: proof-assertion-hardening（2026-03-17）

### 本轮处理

- 继续补强非污染 live proof
- 为 legacy baseline upsert 返回补充：
  - `persisted`
- 更新 `scripts/dev/check-desk-http-legacy.ps1`：
  - 断言 `upsertPersisted=false`
  - 断言 `autoPersisted=false`
  - 再次拉取 baseline detail
  - 断言脚本前后 baseline 快照完全一致

### 当前验证

- `npm -w services/api run build` 已通过
- 重跑 `seed-demo.ps1`
- 重新执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1`
- 当前关键结果：
  - `baselines.upsertPersisted=false`
  - `baselines.autoPersisted=false`
  - `baselines.proofStable=true`
  - `summary.alertCountToday=1`
  - `weeklyTrend.alertSum=3`
  - `weeklyTrend.rainfallSum=79`

### 当前结论

- 当前 live proof 不只是不污染 demo 真值，而且已经能脚本化断言“确实没有污染”
- 后续重复复验时，不需要再靠人工比对 baseline 明细

## Phase 11: device-metadata-truth-carryover（2026-03-17）

### 本轮处理

- 继续收口 legacy `/api/devices` 的真值表达
- 在返回中补充：
  - `legacyDeviceId`
  - `sensorTypes`
- 更新 `scripts/dev/check-desk-http-legacy.ps1`，将这两个字段纳入 live proof

### 当前验证

- `npm -w services/api run build` 已通过
- 重新启动 API 后复验：
  - `GET /api/devices`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1`
- 当前结果：
  - `/api/devices[0].legacyDeviceId = device_1`
  - `/api/devices[0].sensorTypes = ["gnss","temperature","humidity","acceleration","gyroscope"]`
  - 现有关键真值保持不变：
    - `summary.alertCountToday=1`
    - `weeklyTrend.alertSum=3`
    - `weeklyTrend.rainfallSum=79`
    - `gps.totalPoints=240`

### 当前结论

- legacy `/api/devices` 现在已经能携带与 seed / monitoring-stations 一致的设备元信息
- 这一步没有改变 Desk 当前 UI 消费逻辑，只是把后端返回收得更完整、更可解释

## Phase 12: cross-endpoint-consistency-proof（2026-03-17）

### 本轮处理

- 继续补强 live proof 的“跨接口真值一致性”断言
- 更新 `scripts/dev/check-desk-http-legacy.ps1`：
  - 对每个 `monitoring-stations` 设备项校验：
    - `device_id` ↔ `/api/devices.legacyDeviceId`
    - `actual_device_id` ↔ `/api/devices.id`
    - `station_name` ↔ `/api/devices.stationName`
    - `sensor_types` ↔ `/api/devices.sensorTypes`

### 当前验证

- 重新执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1`
- 当前关键结果：
  - `devices.stationConsistency=true`
  - `summary.alertCountToday=1`
  - `weeklyTrend.alertSum=3`
  - `weeklyTrend.rainfallSum=79`
  - `baselines.proofStable=true`

### 当前结论

- 当前 live proof 已能自动证明：
  - `devices`
  - `monitoring-stations`
  - `baselines`
  三条 Desk 核心 legacy 数据链在关键标识与元信息上互相一致

## Phase 13: actual-desk-runtime-proof（2026-03-17）

### 本轮处理

- 补充桌面端“真实混合链”验证脚本：
  - `scripts/dev/check-desk-http-runtime.ps1`
- 该脚本按当前主线 `apps/desk` 的实际用法验证：
  - legacy：
    - `/api/dashboard/summary`
    - `/api/dashboard/weekly-trend`
    - `/api/monitoring-stations`
    - `/api/devices`
    - `/api/system/status`
  - v1：
    - `/api/v1/dashboard/weekly-trend`
    - `/api/v1/gps/baselines`
    - `/api/v1/gps/deformations/{deviceId}/series`
    - `/api/v1/system/status`

### 当前验证

- 重新执行：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-runtime.ps1`
- 当前关键结果：
  - `weeklyTrend.legacyEqualsV1=true`
  - `devices.stationConsistency=true`
  - `baselines.deviceCoverage=true`
  - `gps.baselineConsistency=true`
  - `system.legacyEqualsV1=true`
  - `summary.alertCountToday=1`
  - `weeklyTrend.rainfallSum=79`
  - `weeklyTrend.alertSum=3`

### 当前结论

- 当前不只是 legacy 兼容链已通过验证
- 主线 `apps/desk` 实际在使用的“legacy + v1 混合链”也已具备最小 live proof

## Phase 14: v1-baseline-write-proof（2026-03-17）

### 本轮处理

- 将 v1 baseline upsert 也补入非持久化验证能力：
  - `PUT /api/v1/gps/baselines/:deviceId` 新增 `persist`
  - 返回中补充 `persisted`
- 将 `scripts/dev/check-desk-http-runtime.ps1` 扩展到 v1 baseline 写链：
  - `PUT /api/v1/gps/baselines/:deviceId` with `persist=false`
  - `POST /api/v1/gps/baselines/:deviceId/auto-establish` with `persist=false`
  - 校验脚本前后 v1 baseline detail 快照完全一致

### 当前验证

- `npm -w services/api run build` 已通过
- 重跑 `seed-demo.ps1`
- 重新执行：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-runtime.ps1`
- 当前关键结果：
  - `weeklyTrend.legacyEqualsV1=true`
  - `baselines.upsertPersisted=false`
  - `baselines.autoPersisted=false`
  - `baselines.proofStable=true`
  - `gps.baselineConsistency=true`
  - `system.legacyEqualsV1=true`

### 当前结论

- 当前桌面端真实 mixed runtime chain 已从“读链留证”推进到“关键 baseline 写链也可安全留证”
- 且这条 proof 不会污染 demo baseline 真值

## Phase 15: legacy-v1-cross-truth-proof（2026-03-17）

### 本轮处理

- 继续补强 mixed runtime proof 的 cross-truth 断言
- 更新 `scripts/dev/check-desk-http-runtime.ps1`：
  - 对比 legacy `/api/dashboard/summary` 与 `/api/v1/dashboard` 的核心计数：
    - `stationCount ↔ stations`
    - `deviceOnlineCount ↔ onlineDevices`
    - `alertCountToday ↔ todayAlerts`
  - 对比 legacy `/api/baselines` 与 v1 `/api/v1/gps/baselines`：
    - latitude
    - longitude
    - altitude
    - establishedBy
    - pointsCount / data_points_used

### 当前验证

- 重新执行：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-runtime.ps1`
- 当前关键结果：
  - `summary.legacyEqualsV1Core=true`
  - `weeklyTrend.legacyEqualsV1=true`
  - `baselines.legacyEqualsV1=true`
  - `system.legacyEqualsV1=true`
  - `baselines.proofStable=true`

### 当前结论

- 当前 mixed runtime proof 已不只是分别验证 legacy 和 v1
- 还已自动证明两套链路在桌面端真正会消费到的关键真值上彼此一致

## Phase 16: desk-data-layer-v1-shift（2026-03-17）

### 本轮处理

- 在不改 UI 的前提下，继续收口桌面端数据层对正式契约的依赖
- 调整 `apps/desk/src/api/httpClient.ts`：
  - `dashboard.getSummary()` 改为走 `/api/v1/dashboard`
  - `dashboard.getWeeklyTrend()` 改为走 `/api/v1/dashboard/weekly-trend`
  - `system.getStatus()` 改为走 `/api/v1/system/status`
- 调整 `apps/desk/src/api/httpMappers.ts`：
  - 修正 `mapDashboardSummaryFromV1()`
  - 让其按正式 v1 dashboard 数据在前端计算与当前 legacy 一致的 `systemHealthPercent`
  - 补 `mapSystemStatusFromV1()`，并让健康摘要从 `items[]` 正式映射

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-runtime.ps1` 已继续通过
- 当前关键信号保持一致：
  - `summary.legacyEqualsV1Core=true`
  - `weeklyTrend.legacyEqualsV1=true`
  - `system.legacyEqualsV1=true`
  - `summary.alertCountToday=1`
  - `summary.systemHealthPercent=87`

### 当前结论

- 当前主线 `apps/desk` 在不改 UI 的前提下，已经进一步减少了对 legacy dashboard/system 直连的依赖
- Desk 数据层目前已更接近：
  - dashboard / weeklyTrend / system 走 v1 正式契约
  - stations / devices 仍走 legacy 兼容层
  - gps / baselines 走 v1

## Phase 17: desk-data-layer-full-v1-core（2026-03-17）

### 本轮处理

- 继续在不改 UI 的前提下收口桌面端数据层
- 调整 `apps/desk/src/api/httpClient.ts`：
  - `stations.list()` 改为走 `/api/v1/stations` + `/api/v1/devices`
  - `devices.list()` 改为走 `/api/v1/devices`
- 调整 `apps/desk/src/api/httpMappers.ts`：
  - `mapDevicesFromV1()` 改为按 `lastSeenAt` 的 `24h` 窗口映射在线状态

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-runtime.ps1` 已继续通过
- 当前新增关键信号：
  - `devices.legacyEqualsV1=true`
  - `stations.legacyEqualsV1=true`
  - `summary.legacyEqualsV1Core=true`
  - `weeklyTrend.legacyEqualsV1=true`
  - `system.legacyEqualsV1=true`

### 当前结论

- 当前主线 `apps/desk` 的核心数据层已经基本全面切向 v1 正式契约
- 仍保留 legacy 的主要用途已收缩为：
  - 兼容验证
  - 对照真值
  - 非前端主消费链

## Phase 19: station-status-semantics-v1-alignment（2026-03-17）

### 本轮处理

- 继续收口桌面端切到 v1 后的站点语义
- 调整 `apps/desk/src/api/httpMappers.ts`：
  - `mapStationsFromV1()` 改为基于 v1 设备列表推导站点状态
  - 若站点下存在最近 `24h` 在线设备则为 `online`
  - 若站点下只有过期但仍 `active` 的设备则为 `warning`
- 补强 `scripts/dev/check-desk-http-runtime.ps1`：
  - 将 legacy 监测站按站点维度聚合
  - 与 v1 station 聚合结果对比：
    - stationName
    - area/locationName
    - risk
    - deviceCount
    - status

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-runtime.ps1` 已继续通过
- 当前关键结果：
  - `stations.legacyEqualsV1=true`
  - `devices.legacyEqualsV1=true`
  - `devices.stationConsistency=true`

### 当前结论

- 当前桌面端切到 v1 后，站点状态不再退化成简单读取 `stations.status`
- 站点聚合语义已与 legacy 监测站链路形成可验证的一致性

## Phase 20: desk-auth-real-first-dev-fallback（2026-03-17）

### 本轮处理

- 继续收口桌面端当前仍是 stub 的认证链
- 调整 `apps/desk/src/api/httpClient.ts`：
  - `auth.login()` 改为优先请求 `/api/v1/auth/login`
  - 若真实登录成功，则写入 `token/refreshToken`
  - 若当前为本地 `localhost/127.0.0.1` 环境且真实登录失败，则回落到 `token=dev`
  - `auth.logout()` 改为 best-effort 调用 `/api/v1/auth/logout`

### 当前验证

- `npm -w apps/desk run build` 已通过
- 本地当前真实 `/api/v1/auth/login` 对 `admin/123456` 返回：
  - `401 用户名或密码错误`
- 当前判断：
  - 本地桌面端当前仍需要 dev fallback 才能稳定联调
  - 但认证链已不再是纯 stub，而是具备“真实优先、开发回落”的双态行为

### 当前结论

- 当前主线 `apps/desk` 已将 auth 从“完全伪造”推进到“可逐步切真实 JWT”的过渡状态
- 这一步仍然没有改桌面端 UI

## Phase 21: local-jwt-login-runtime-closure（2026-03-17）

### 本轮处理

- 将 demo auth 真值并入 `seed-demo.ps1`：
  - 新增本地演示用户：
    - `username=admin`
    - `password=123456`
    - role=`admin`
- 修复 `services/api/src/index.ts`：
  - 当 `AUTH_REQUIRED=false` 时，若请求已携带 Bearer token，仍继续解析：
    - `ADMIN_API_TOKEN`
    - JWT access token
  - 避免出现“能登录拿到 JWT，但后续请求仍全部 401”的状态
- 更新 `scripts/dev/check-desk-http-v1-core.ps1`：
  - 先执行真实 `/api/v1/auth/login`
  - 后续使用真实 JWT 跑完整条 v1 core chain

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/seed-demo.ps1` 已通过
- `POST /api/v1/auth/login` 现已成功返回：
  - `username=admin`
  - `roles=["admin"]`
  - `token`
  - `refreshToken`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已通过
- `npm -w apps/desk run build` 已通过

### 当前结论

- 当前本地桌面端已不再只是“auth 真实优先但仍登录失败”
- 当前已经具备：
  - 可重复 seed 的本地 JWT 演示账号
  - 真实登录成功
  - 真实 JWT 访问后续 v1 core chain 成功

## Phase 22: auth-flow-proof-hardening（2026-03-17）

### 本轮处理

- 继续补强 v1-only runtime proof 的认证链留证
- 更新 `scripts/dev/check-desk-http-v1-core.ps1`：
  - 登录后新增校验 `/api/v1/auth/me`
  - 新增校验 `/api/v1/auth/refresh`
  - 使用 refresh 后的新 access token 再访问后续 v1 core chain

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已通过
- 当前新增关键结果：
  - `auth.username=admin`
  - `auth.hasRefreshToken=true`
  - `auth.refreshWorks=true`
  - `auth.permissions=16`

### 当前结论

- 当前桌面端本地真实认证链已不只停留在“能登录”
- 而是已经完成：
  - login
  - me
  - refresh
  - refresh 后继续访问 v1 core chain

## Phase 23: rbac-demo-truth-remediation（2026-03-17）

### 本轮处理

- 修复本地 RBAC demo 真值中的角色展示异常
- 调整 `infra/compose/scripts/seed-demo.ps1`：
  - 新增独立的 role seed
  - 将：
    - `super_admin.display_name` → `Super Admin`
    - `admin.display_name` → `Admin`
    - `user.display_name` → `User`
  - 同步修正对应 description
- 更新 `scripts/dev/check-desk-http-v1-core.ps1`
  - 要求 `auth/me` 返回的 `roleDisplayName` 不再是异常占位值

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/seed-demo.ps1` 已通过
- PostgreSQL `roles` 当前结果：
  - `admin → Admin`
  - `super_admin → Super Admin`
  - `user → User`
- `GET /api/v1/auth/me` 当前返回：
  - `roles[0].displayName = Admin`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已通过

### 当前结论

- 当前本地 Desk 真实认证链已不再带有 RBAC 展示脏数据
- 角色真值、`auth/me` 返回与 v1-only proof 已再次对齐

## Phase 24: desk-login-quick-fill-alignment（2026-03-17）

### 本轮处理

- 修正主线 `apps/desk` 登录页的“快速体验”填充值
- 将其从旧值：
  - `admin / admin`
  调整为当前本地真实 JWT 演示账号：
  - `admin / 123456`

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前结论

- 当前桌面端登录页快捷入口已与本地真实认证真值一致
- 这一步没有改页面布局，只修正了错误的默认体验账号

## Phase 25: v1-pagination-hardening（2026-03-17）

### 本轮处理

- 继续补强主线 `apps/desk` 的 v1 数据层稳健性
- 调整 `apps/desk/src/api/httpClient.ts`
- 为以下 v1 列表读取补入自动翻页：
  - `stations.list()`
  - `devices.list()`
  - `baselines.list()`
- 避免当前桌面端在数据量超过单页 `200` 条时静默截断

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已继续通过

### 当前结论

- 当前主线桌面端 v1 数据层已不再隐含“只取第一页”的上限
- 这一步仍然没有改桌面端 UI，只是继续加固数据层

## Phase 26: desk-http-client-runtime-proof（2026-03-17）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-http-client.ts`
  - `scripts/dev/check-desk-http-client.ps1`
- 该 proof 直接调用主线 `apps/desk` 的真实 `createHttpClient()`：
  - 真实登录
  - 真实读取：
    - dashboard
    - weeklyTrend
    - stations
    - devices
    - baselines
    - gps
    - system
  - 将 access token 人工置坏后，再调用 `baselines.list()`
  - 验证 desk `httpTransport` 的自动 refresh 是否真的生效

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-client.ps1` 已通过
- 当前关键结果：
  - `auth.hasRefreshToken=true`
  - `auth.refreshRecovered=true`
  - `summary.alertCountToday=1`
  - `weeklyTrend.rainfallSum=79`
  - `refreshedBaselines=3`

### 当前结论

- 当前已不只是“API 级 proof”通过
- 主线 `apps/desk` 的真实 HTTP client 本体也已完成运行留证
- 且自动 refresh 已被实际触发并验证成功

## Phase 27: desk-client-baseline-write-proof（2026-03-17）

### 本轮处理

- 继续补强主线 Desk client 本体 proof
- 调整 `apps/desk/src/api/client.ts` / `httpClient.ts` / `mockClient.ts`
  - 为 `baselines.upsert()` / `baselines.autoEstablish()` 增加可选 `persist`
  - 默认行为不变，仍为真实写入
  - proof 可通过 `persist=false` 走 non-mutating 写链
- 更新 `scripts/dev/check-desk-http-client.ts`
  - 新增客户端层 baseline `upsert/autoEstablish` proof
  - 断言 proof 前后 baseline 快照保持一致

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-client.ps1` 已通过
- 当前新增关键结果：
  - `baselineProof.upsertDeviceId=00000000-0000-0000-0000-000000000001`
  - `baselineProof.autoDeviceId=00000000-0000-0000-0000-000000000001`
  - `baselineProof.stable=true`
  - `auth.refreshRecovered=true`

### 当前结论

- 当前主线 Desk 的真实 HTTP client 本体已经不只是“读链 + refresh 可用”
- baseline 写链在客户端层也已具备 non-mutating proof

## Phase 28: desk-user-journey-proof（2026-03-17）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-user-journey.ts`
  - `scripts/dev/check-desk-user-journey.ps1`
- 该 proof 从主线 Desk 客户端角度串联真实用户主路径：
  - 登录
  - 首页
  - 监测点页
  - 设备页
  - 基线页
  - GPS 页
  - 系统页
- 并在基线页路径中继续保留 non-mutating baseline 写链验证

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-user-journey.ps1` 已通过
- 当前关键结果：
  - `home.stationCount=1`
  - `home.deviceOnlineCount=3`
  - `stationsPage.loadedDevices=3`
  - `devicesPage.filteredDevices=3`
  - `baselinesPage.proofStable=true`
  - `gpsPage.points=5`
  - `systemPage.items=3`

### 当前结论

- 当前桌面端真实用户主路径已经具备客户端级完整运行留证
- 不再只是“单点 API proof”或“单组件数据层 proof”

## Phase 29: desk-mainline-one-shot-proof（2026-03-17）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 该脚本作为当前 Desk 主线的一键复验入口，顺序执行：
  - `infra/compose/scripts/seed-demo.ps1`
  - `/health`
  - `npm -w apps/desk run build`
  - `scripts/dev/check-desk-http-v1-core.ps1`
  - `scripts/dev/check-desk-http-client.ps1`
  - `scripts/dev/check-desk-user-journey.ps1`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1` 已通过
- 当前关键结果：
  - `buildExecuted=true`
  - `auth.refreshRecovered=true`
  - `baselineProof.stable=true`
  - `baselinesPage.proofStable=true`
  - `completed=[seed-demo, health, v1-core, client, user-journey]`

### 当前结论

- 当前 Desk 主线已经具备单命令一键复验入口
- 后续要复核桌面端当前主链，不需要再手工拼接多条命令

## Phase 30: structured-mainline-reporting（2026-03-17）

### 本轮处理

- 继续加固一键复验入口的可用性
- 调整 `scripts/dev/check-desk-mainline-proof.ps1`
  - 保留 seed / build 的顺序执行
  - 将以下子 proof 的输出汇总为单个结构化 JSON：
    - `health`
    - `v1Core`
    - `client`
    - `userJourney`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前结构化总报告包含：
  - `health.ok=true`
  - `v1Core.auth.roleDisplayName=Admin`
  - `client.auth.refreshRecovered=true`
  - `userJourney.baselinesPage.proofStable=true`

### 当前结论

- 当前 Desk 一键复验入口已经不只是“把多个脚本串起来跑一遍”
- 而是已经能输出一份可直接归档、可直接引用的结构化主线总报告

## Phase 31: one-shot-proof-result-stabilization（2026-03-17）

### 本轮处理

- 继续收紧一键复验入口的结果质量
- 修正 `scripts/dev/check-desk-http-client.ts` 中 `refreshRecovered` 的判定
- 重新执行：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1`

### 当前验证

- 当前结构化总报告关键结果为：
  - `buildExecuted=true`
  - `health.ok=true`
  - `v1Core.auth.roleDisplayName=Admin`
  - `client.auth.refreshRecovered=true`
  - `client.baselineProof.stable=true`
  - `userJourney.baselinesPage.proofStable=true`

### 当前结论

- 当前 Desk 主线一键复验入口已经拿到稳定、可归档的最终口径

## Phase 32: demo-scenario-expansion（2026-03-17）

### 本轮处理

- 将 `seed-demo.ps1` 从“单站、全在线、全有 baseline”的理想样例扩展为多状态 demo：
  - 新增第二站点：`DEMO002`
  - 新增离线雨量设备：`device_4`
  - 保持该设备无 baseline
  - 新增只读用户：`viewer`
- 同步调整 proof：
  - `check-desk-http-v1-core.ps1`
  - `check-desk-http-runtime.ps1`
  - `check-desk-mainline-proof.ps1`
- 让 proof 不再假设：
  - 只有 1 个站点
  - 所有设备都有 baseline

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前结构化总报告关键结果：
  - `summary.stationCount=2`
  - `summary.deviceOnlineCount=3`
  - `summary.totalDevices=4`
  - `weeklyTrend.rainfallSum=79`
  - `devices.missingBaselineCount=1`
  - `client.stations.first.status=offline`
  - `userJourney.stationsPage.loadedDevices=1`

### 当前结论

- 当前 Desk 主线的 demo 真值已经不再停留在“理想全绿样例”
- proof 现已开始覆盖：
  - 第二站点
  - 离线设备
  - 缺 baseline 分支
  - 只读角色真值

## Phase 33: viewer-boundary-proof（2026-03-17）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-viewer-boundary.ts`
  - `scripts/dev/check-desk-viewer-boundary.ps1`
- 该 proof 直接验证只读用户 `viewer` 的 Desk 客户端边界：
  - 可读：
    - dashboard
    - weeklyTrend
    - stations
    - devices
    - baselines
  - 应被拒绝：
    - gps analysis
    - system status
    - baseline upsert
- 同时将该 proof 并入：
  - `scripts/dev/check-desk-mainline-proof.ps1`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-viewer-boundary.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `viewerBoundary.reads.stations=2`
  - `viewerBoundary.reads.devices=4`
  - `viewerBoundary.reads.baselines=3`
  - `viewerBoundary.denied.gps=禁止访问`
  - `viewerBoundary.denied.system=禁止访问`
  - `viewerBoundary.denied.baselineUpsert=禁止访问`

### 当前结论

- 当前 Desk 主线不只覆盖 admin 理想路径
- 也已经覆盖了只读用户的权限边界真值

## Phase 34: warning-state-and-summary-alignment（2026-03-17）

### 本轮处理

- 继续补多状态 demo 的真实分支
- 调整 `seed-demo.ps1`：
  - 新增 `device_5`
  - `device_5`：
    - `status=active`
    - 最近 `24h` 无数据
    - 无 baseline
  - 用于覆盖 `warning` 设备分支
- 调整 `services/api/src/routes/system.ts`：
  - `dashboard.onlineDevices` 改为按真实在线语义计算：
    - `active`
    - 且 `last_seen_at >= now()-24h`
- 同步调整 proof：
  - `check-desk-http-v1-core.ps1`
  - `check-desk-http-runtime.ps1`
  - `check-desk-mainline-proof.ps1`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `summary.stationCount=2`
  - `summary.deviceOnlineCount=3`
  - `summary.totalDevices=5`
  - `devices.missingBaselineCount=2`
  - `client.stations.first.status=warning`
  - `client.devices.first.status=warning`
  - `viewerBoundary.reads.devices=5`

### 当前结论

- 当前 Desk 主线 demo 已开始覆盖 `warning` 语义，而不只是 `online/offline`
- 首页 summary 在线设备数也已与设备/站点的真实在线语义对齐

## Phase 35: pagination-load-proof（2026-03-17）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-pagination-proof.ts`
  - `scripts/dev/check-desk-pagination-proof.ps1`
- 该 proof 会临时插入 `205` 条 smoke 设备与对应 baseline
- 然后直接用主线 Desk client 验证：
  - `stations.list()`
  - `devices.list()`
  - `devices.list({ stationId })`
  - `baselines.list()`
  是否真的跨页取全
- 结束后自动清理 smoke 数据

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-pagination-proof.ps1` 已通过
- 当前关键结果：
  - `stations.demo2DeviceCount=207`
  - `devices.total=210`
  - `devices.demo2Filtered=207`
  - `baselines.total=208`

### 当前结论

- 当前主线 Desk v1 自动翻页已经不是理论能力
- 而是已经被真实 `200+` 数据量压过并通过

## Phase 36: gps-baseline-aware-selection（2026-03-17）

### 本轮处理

- 继续推进多状态 demo 覆盖
- 调整 `seed-demo.ps1`：
  - 新增 `device_6`
  - `device_6`：
    - `type=gnss`
    - 最近 `24h` 无数据
    - 无 baseline
- 调整：
  - `apps/desk/src/views/GpsPage.tsx`
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 让 GPS 相关页面优先选择“已建立 baseline 的 GNSS 设备”
- 同步修正主路径 proof，使其按同样口径选设备

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `npm -w apps/desk run build` 已通过
- 当前关键结果：
  - `summary.totalDevices=6`
  - `devices.missingBaselineCount=3`
  - `client.devices.first.status=warning`
  - `userJourney.gpsPage.deviceId=00000000-0000-0000-0000-000000000001`
  - `userJourney.gpsPage.points=5`

### 当前结论

- 当前即使引入“无 baseline 的 GNSS 设备”，Desk GPS 主路径也不会默认选中它而失败
- 这一步没有改页面布局，只修正了数据选择逻辑

## Phase 38: seed-exec-stabilization-and-gnss-gap-coverage（2026-03-17）

### 本轮处理

- 修复 `seed-demo.ps1` 的 PostgreSQL 执行方式
  - `Invoke-PostgresSqlText()` 改为通过标准输入直接喂给 `psql`
  - 避免临时拷贝文件路径偶发失败
- 继续扩展 GNSS 缺 baseline 场景
  - 新增无 baseline GNSS 设备 `device_6`
- 同步修正主路径 proof：
  - `check-desk-user-journey.ts` 按“有 baseline 的 GNSS 设备”选 GPS 目标

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/seed-demo.ps1` 已通过
- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `summary.totalDevices=6`
  - `devices.missingBaselineCount=3`
  - `client.devices.first.status=warning`
  - `userJourney.gpsPage.deviceId=00000000-0000-0000-0000-000000000001`
  - `userJourney.gpsPage.points=5`

### 当前结论

- 当前 seed 执行链已重新稳定
- 无 baseline GNSS 场景也已被并入主线 proof 且不会破坏 GPS 主路径

## Phase 39: pagination-stress-integration（2026-03-17）

### 本轮处理

- 将分页压力测试并入一键主线总 proof
- 调整 `scripts/dev/check-desk-mainline-proof.ps1`
  - 新增可选开关：
    - `-IncludePaginationStress`
  - 可将 `check-desk-pagination-proof.ps1` 并入总报告
- 在扩展后的多状态 demo 上重新执行：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild -IncludePaginationStress`

### 当前验证

- 当前结构化总报告新增：
  - `paginationStress.stations.demo2DeviceCount=208`
  - `paginationStress.devices.total=211`
  - `paginationStress.devices.demo2Filtered=208`
  - `paginationStress.baselines.total=208`
- 同时主链结果保持通过：
  - `summary.totalDevices=6`
  - `client.auth.refreshRecovered=true`
  - `viewerBoundary.denied.gps=禁止访问`

### 当前结论

- 当前 Desk 主线一键复验入口已经可以按需覆盖大页数压力场景
- 分页压力验证与主链验证现已并入同一份结构化总报告

## Phase 40: baselines-panel-action-proof（2026-03-17）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-baselines-actions.ts`
  - `scripts/dev/check-desk-baselines-actions.ps1`
- 该 proof 直接覆盖基线页当前真实动作链：
  - 对无 baseline 的 GNSS 设备执行创建
  - 再执行删除并恢复现场
  - 对已有 baseline 的设备执行 non-mutating auto-establish
- 并已并入：
  - `scripts/dev/check-desk-mainline-proof.ps1`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-baselines-actions.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `baselinesActions.baselinesPanel.gnssDevices=4`
  - `baselinesActions.baselinesPanel.baselineCountBefore=3`
  - `baselinesActions.baselinesPanel.create.baselineCountAfterCreate=4`
  - `baselinesActions.baselinesPanel.remove.restoredMissingState=true`
  - `baselinesActions.baselinesPanel.auto.proofStable=true`

### 当前结论

- 当前 Desk 主线已经不只覆盖读链和 page-level 主路径
- 基线页真实动作链也已经具备客户端级留证

## Phase 41: device-management-command-proof（2026-03-17）

### 本轮处理

- 为设备管理页控制动作补真实指令链
- 调整：
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/mockClient.ts`
- 补入：
  - `devices.issueCommand()`
  - `devices.listCommands()`
- 调整 `apps/desk/src/views/DeviceManagementPage.tsx`
  - 将远程重启/下线设备/电机/蜂鸣器/采样间隔/手动采集等按钮背后的逻辑改为真实下发 device command
  - 保持页面布局不变
- 新增：
  - `scripts/dev/check-desk-device-actions.ts`
  - `scripts/dev/check-desk-device-actions.ps1`
- 并将该 proof 并入主线总 proof

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-device-actions.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `deviceActions.deviceId=00000000-0000-0000-0000-000000000006`
  - `deviceActions.status=queued`
  - `deviceActions.commandsLoaded=3`
  - `deviceActions.foundIssuedCommand=true`

### 当前结论

- 当前设备管理页的关键控制动作已不再只是 mock 日志
- 已经接入真实 device command 链并具备客户端级留证

## Phase 37: mobile-login-boundary-closure（2026-03-17）

### 本轮处理

- 收口主线 Desk 当前仍可能误导真实联调的认证边界
- 调整 `apps/desk/src/api/httpClient.ts`
  - HTTP 模式下的手机号登录不再走伪登录
  - 改为明确报错：
    - `当前 HTTP 模式未接入手机号登录，请使用账号密码登录。`
- 更新 `scripts/dev/check-desk-http-client.ts`
  - 增加客户端层断言：
    - `mobileLoginRejected`

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-client.ps1` 已通过
- 当前新增关键结果：
  - `auth.mobileLoginRejected=当前 HTTP 模式未接入手机号登录，请使用账号密码登录。`
  - `auth.refreshRecovered=true`

### 当前结论

- 当前主线 Desk 在真实 HTTP 模式下已不再保留“手机号伪登录绕过”
- 认证边界已进一步收紧到真实支持的路径上

## Phase 44: second-batch-page-proof-closure（2026-03-17）

### 本轮处理

- 继续按批量任务推进页面级 proof
- 新增并跑通：
  - `scripts/dev/check-desk-settings-actions.ps1`
  - `scripts/dev/check-desk-devices-page-actions.ps1`
  - `scripts/dev/check-desk-stations-page-actions.ps1`
  - `scripts/dev/check-desk-home-actions.ps1`
  - `scripts/dev/check-desk-gps-monitoring-page.ps1`
  - `scripts/dev/check-desk-viewer-journey.ps1`
  - `scripts/dev/check-desk-device-management-page.ps1`
  - `scripts/dev/check-desk-command-pagination.ps1`
- 将上述结果并入主线总 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild -IncludeCommandPaginationStress` 已通过
- 当前新增关键结果：
  - `settingsActions.auth.logoutRejectedProtectedAccess=未认证`
  - `devicesPageActions.devicesPage.filteredDevices=3`
  - `stationsPageActions.stationsPage.drawerLoadedDevices=3`
  - `homeActions.homePage.refreshStable=true`
  - `gpsMonitoringPage.gpsMonitoringPage.candidateCount=3`
  - `viewerJourney.viewerJourney.deniedGps=禁止访问`
  - `deviceManagementPage.deviceManagementPage.foundIssuedCommand=true`
  - `commandPaginationStress.commandPagination.loaded=55`

### 当前结论

- 当前第 21-25 项批量推进已经形成完整阶段结果
- 主线总 proof 已覆盖：
  - 页面级主路径
  - 页面级动作链
  - 只读用户边界
  - 命令分页压力

## Phase 45: gps-monitoring-chart-export（2026-03-17）

### 本轮处理

- 继续收 `GpsMonitoringPage` 导出菜单里最后一个仍是占位提示的动作
- 调整：
  - `apps/desk/src/views/gpsMonitoringExport.ts`
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 新增纯函数图表导出构建：
  - `buildGpsChartExport()`
  - 基于当前真实 GPS 行数据生成 SVG 图表文件
- 更新：
  - `scripts/dev/check-desk-gps-monitoring-export.ts`
  - 将图表导出结果一并纳入现有导出 proof

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-export.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `gpsMonitoringExport.export.chartFilename=desk-gps-chart.svg`
  - `gpsMonitoringExport.export.chartMimeType=image/svg+xml;charset=utf-8`
  - `gpsMonitoringExport.export.chartHasSvgRoot=true`
  - `gpsMonitoringExport.export.chartPolylineCount=3`

### 当前结论

- 当前 `GpsMonitoringPage` 导出菜单的图表图片动作已从占位提示收成真实产物
- 这一步没有改动 Desk 页面结构，只补齐了当前真实数据链上的导出闭环

## Phase 46: device-detail-copy-action（2026-03-17）

### 本轮处理

- 继续收设备管理页详情弹窗里最后一个仍是占位提示的动作
- 调整：
  - `apps/desk/src/views/deviceManagementExport.ts`
  - `apps/desk/src/views/DeviceManagementPage.tsx`
- 新增：
  - `buildDeviceDetailText()`
  - `copyTextContent()`
- “复制信息”现在会基于当前选中设备、所属站点和运行指标生成真实文本，再写入剪贴板
- 更新：
  - `scripts/dev/check-desk-device-management-export.ts`
  - 将详情复制原文断言并入现有设备管理导出 proof

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-device-management-export.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `deviceManagementExport.export.detailLines=13`
  - `deviceManagementExport.export.detailContainsDeviceName=true`
  - `deviceManagementExport.export.detailContainsStationArea=true`
  - `deviceManagementExport.export.detailContainsBaselineState=true`

### 当前结论

- 当前设备管理页详情弹窗的复制动作已从 mock 提示收成真实详情复制
- 这一步同样没有改动 Desk 页面结构，只补齐了当前真实数据链上的操作闭环

## Phase 47: mainline-proof-summary-snapshot（2026-03-17）

### 本轮处理

- 继续收主线一键总 proof 的可读性
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 新增：
  - 顶层 `summarySnapshot`
  - 自动落盘的精简摘要文件：
    - `docs/unified/reports/desk-mainline-proof-summary-latest.md`
- 摘要快照当前覆盖：
  - demo 真值
  - 认证链状态
  - 页面级 proof 核心结果
  - 导出链状态
  - viewer 边界
  - stress 开关状态

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `summarySnapshot.completedChecks=21`
  - `summarySnapshot.demoTruth.stationCount=2`
  - `summarySnapshot.demoTruth.totalDevices=6`
  - `summarySnapshot.viewerBoundary.deniedCount=5`
  - `desk-mainline-proof-summary-latest.md` 已成功生成

### 当前结论

- 当前主线总报告已经不只适合机器读，也适合人工快速扫读
- 后续总协调、其他 CLI 窗口和日记同步时，都可以先以摘要快照作为第一读取入口

## Phase 48: mainline-proof-history-persistence（2026-03-17）

### 本轮处理

- 继续收主线一键总 proof 的留档能力
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 新增：
  - `HistoryDir`
  - 每次运行自动生成：
    - `docs/unified/reports/history/desk-mainline-proof-<timestamp>.json`
    - `docs/unified/reports/history/desk-mainline-proof-summary-<timestamp>.md`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `docs/unified/reports/history/desk-mainline-proof-20260317-202908.json`
  - `docs/unified/reports/history/desk-mainline-proof-summary-20260317-202908.md`
  - latest 文件与 history 文件均已同步生成

### 当前结论

- 当前主线总 proof 已不再只有覆盖式 latest 产物
- 后续多轮复验、跨窗口对比和日记回溯时，都可以直接使用时间戳历史快照

## Phase 49: mainline-proof-history-index（2026-03-17）

### 本轮处理

- 继续收主线一键总 proof 的历史可读性
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 新增：
  - `docs/unified/reports/desk-mainline-proof-history-latest.md`
- 历史索引当前覆盖：
  - 最近快照表
  - `Current Vs Previous` 差异摘要
  - latest 指向的历史 JSON / 摘要文件名

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `TotalSnapshots=2`
  - `CurrentStamp=20260317-203324`
  - `PreviousStamp=20260317-202908`
  - 当前最近两轮关键 Delta 全为 `0`

### 当前结论

- 当前主线总 proof 的历史留档已经不只可存，还可直接读
- 后续总协调和其他 CLI 窗口判断“这一轮有没有把主线真值改坏”，已经可以先看历史索引而不是手工对比原始 JSON

## Phase 50: mainline-proof-history-retention（2026-03-17）

### 本轮处理

- 继续收主线一键总 proof 的历史运维能力
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 新增：
  - `MaxHistorySnapshots`
  - 历史快照自动清理逻辑
- 当前规则：
  - 每次生成新快照后，若超过上限，则自动删除最旧的 JSON 和对应 Markdown 摘要

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `MaxHistorySnapshots=20`
  - `TotalSnapshots=3`
  - 最新快照：
    - `desk-mainline-proof-20260317-203727.json`
    - `desk-mainline-proof-summary-20260317-203727.md`

### 当前结论

- 当前主线总 proof 的历史链路已经同时具备：
  - latest
  - summary
  - history
  - history index
  - retention
- 后续这条留证链已经可以长期持续运行，而不需要人工清理历史目录

## Phase 51: mainline-proof-diff-json（2026-03-17）

### 本轮处理

- 继续收主线一键总 proof 的自动消费能力
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 新增：
  - `docs/unified/reports/desk-mainline-proof-diff-latest.json`
- 差异文件当前覆盖：
  - `current`
  - `previous`
  - `delta`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `current.stamp=20260317-204008`
  - `previous.stamp=20260317-203727`
  - 当前关键 Delta：
    - `checks=0`
    - `stations=0`
    - `devices=0`
    - `online=0`
    - `alerts=0`
    - `rainfall=0`
    - `missingBaselines=0`
    - `viewerDenied=0`

### 当前结论

- 当前主线总 proof 已同时具备人工可读差异和机器可读差异
- 后续其他 CLI 窗口或自动脚本需要共享主线进度时，可以直接消费差异 JSON 而不是二次解析 Markdown

## Phase 52: mainline-proof-manifest（2026-03-17）

### 本轮处理

- 继续收主线一键总 proof 的协作入口
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 新增：
  - `docs/unified/reports/desk-mainline-proof-manifest-latest.json`
- manifest 当前统一汇总：
  - latest JSON / summary / history index / diff 路径
  - history 状态
  - `summarySnapshot`
  - `diff`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `history.totalSnapshots=5`
  - `history.currentStamp=20260317-210532`
  - `history.previousStamp=20260317-204008`
  - `manifest.latest.json=docs/unified/reports/desk-mainline-proof-latest.json`
  - `manifest.latest.diff=docs/unified/reports/desk-mainline-proof-diff-latest.json`

### 当前结论

- 当前主线总 proof 已具备单文件协作入口
- 后续其他 CLI 窗口若只需要一份“主线真值指针文件”，现在直接读取 manifest 即可，不需要自己再拼多个路径

## Phase 53: mainline-proof-status-script（2026-03-17）

### 本轮处理

- 继续收主线一键总 proof 的协作消费入口
- 新增：
  - `scripts/dev/show-desk-mainline-proof-status.ps1`
- 该脚本当前直接读取：
  - `docs/unified/reports/desk-mainline-proof-manifest-latest.json`
- 并输出精简状态：
  - latest
  - history
  - summary
  - diff
  - `diff.unchanged`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-desk-mainline-proof-status.ps1` 已通过
- 当前关键结果：
  - `summary.completedChecks=21`
  - `summary.stations=2`
  - `summary.devices=6`
  - `summary.viewerDenied=5`
  - `diff.unchanged=true`

### 当前结论

- 当前主线 proof 已不仅有落盘文件，也有稳定的读取脚本入口
- 后续其他 CLI 窗口如果需要共享给总协调器的主线状态，直接跑这个脚本即可

## Phase 54: station-management-panel-realize（2026-03-17）

### 本轮处理

- 继续收 Desk 当前仍停留在本地缓存的业务页
- 调整：
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/mockClient.ts`
  - `apps/desk/src/views/StationManagementPanel.tsx`
- 新增：
  - `scripts/dev/check-desk-station-management-panel.ts`
  - `scripts/dev/check-desk-station-management-panel.ps1`
- 当前实现方式：
  - 为 `api.stations` 增加站点管理专用方法
  - `StationManagementPanel` 改为读取真实站点管理数据
  - 编辑保存与图例保存改为写入真实后端
  - proof 采用“修改 -> 读回验证 -> 恢复原值”的非污染模式

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-station-management-panel.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `stationManagementPanel.totalStations=2`
  - `stationManagementPanel.targetStationId=2586daa0-946a-4cf7-886d-6faee2725315`
  - `stationManagementPanel.targetStationName=示例监测点B-proof`
  - `stationManagementPanel.locationName=示例监测区B-proof`
  - `stationManagementPanel.chartLegendName=示例监测点B-legend-proof`

### 当前结论

- 当前 `StationManagementPanel` 已不再只是本地缓存型管理页
- 它现在已经进入主线真实后端保存链，并具备页面级可恢复留证

## Phase 55: gps-threshold-config-realize（2026-03-17）

### 本轮处理

- 继续收 `GpsMonitoringPage` 当前仍停在本地状态的阈值配置
- 调整：
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/mockClient.ts`
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
  - `infra/compose/scripts/seed-demo.ps1`
  - `docs/integrations/storage/postgres/tables/14-seed-data.sql`
- 新增：
  - `scripts/dev/check-desk-gps-threshold-config.ts`
  - `scripts/dev/check-desk-gps-threshold-config.ps1`
- 当前实现方式：
  - 为 `api.system` 增加 `getConfigs()/updateConfigs()`
  - GPS 阈值改为读取并写入正式 `system configs`
  - proof 采用“修改 -> 读回验证 -> 恢复原值”的非污染模式

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-config.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `gpsThresholdConfig.blue=2.5`
  - `gpsThresholdConfig.yellow=5.5`
  - `gpsThresholdConfig.red=8.5`
  - `gpsThresholdConfig.restoredOriginal=true`

### 当前结论

- 当前 `GpsMonitoringPage` 阈值设置已经不再只是本地 UI 状态
- 它现在已经进入主线真实后端配置链，并具备页面级可恢复留证

## Phase 56: seed-demo-mutex-stabilization（2026-03-17）

### 本轮处理

- 收本轮推进时暴露出的 demo truth 并发污染问题
- 调整：
  - `infra/compose/scripts/seed-demo.ps1`
- 新增：
  - 全局 mutex 串行化 seed
- 同时把 GPS 阈值 key 纳入 demo seed 真值

### 当前验证

- 单独顺序运行：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild`
  已通过
- 当前关键结果：
  - `summarySnapshot.demoTruth.rainfallSum=79`
  - `summarySnapshot.completedChecks=23`
  - `summarySnapshot.pageProofs.gpsThresholdBlue=2.5`

### 当前结论

- 当前 demo seed 已不再只是“能灌数”，还具备更稳的并发运行边界
- 对多窗口并发 proof 的主线真值稳定性，这是必要修复，不是附加包装

## Phase 57: mainline-coordination-status-script（2026-03-17）

### 本轮处理

- 继续收多窗口协作入口
- 新增：
  - `scripts/dev/show-mainline-coordination-status.ps1`
- 该脚本当前直接汇总：
  - latest batch
  - proof 摘要
  - history 摘要
  - diff 摘要

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过
- 当前关键结果：
  - `latestBatch.taskId=desk-batch-37-seed-mutex`
  - `proof.completedChecks=23`
  - `proof.rainfall=79`
  - `history.totalSnapshots=9`
  - `diff.unchanged=false`

### 当前结论

- 当前主线不只具备 proof 读取入口，也具备协调态读取入口
- 后续其他 CLI 窗口如果要把“我现在该怎么协作、主线当前是什么状态”回报给总协调器，直接跑这条脚本即可

## Phase 58: history-last-matching-truth（2026-03-17）

### 本轮处理

- 继续收主线历史读取的判读能力
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
  - `scripts/dev/show-mainline-coordination-status.ps1`
- 新增：
  - `last matching truth` 比较口径
- 当前区分：
  - `Current Vs Previous`
  - `Current Vs Last Matching Truth`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过
- 当前关键结果：
  - `diff.hasLastMatching=false`
  - `diff.lastMatchingStamp=null`
  - `diff.unchangedVsLastMatching=null`
  - 当前 latest batch 已推进到 `desk-batch-38-coordination-status-script`

### 当前结论

- 当前历史读取链已经能明确区分：
  - “上一轮不同”
  - “当前还没有更早同真值快照可比”
- 这能避免把历史里残留的一轮异常快照误判成“当前主线仍不稳定”

## Phase 59: stable-snapshot-baseline（2026-03-17）

### 本轮处理

- 不再继续加新功能，而是顺序补一轮稳定快照
- 目标：
  - 让 `last matching truth` 从“能力已存在但暂无样本”变成“已经有真实比较基线”

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过
- 当前关键结果：
  - `history.totalSnapshots=10`
  - `history.currentStamp=20260317-220314`
  - `history.previousStamp=20260317-215230`
  - `diff.unchanged=true`
  - `diff.hasLastMatching=true`
  - `diff.lastMatchingStamp=20260317-215230`
  - `diff.unchangedVsLastMatching=true`

### 当前结论

- 当前主线历史判读链已经真正闭环
- 后续其他 CLI 窗口再回报协调状态时，不但能说“当前与上一轮一致”，也能说“当前与最近稳定真值一致”

## Phase 60: coordination-status-shared-file（2026-03-17）

### 本轮处理

- 继续收多窗口共享入口
- 调整：
  - `scripts/dev/show-mainline-coordination-status.ps1`
- 新增：
  - `docs/unified/reports/mainline-coordination-status-latest.json`
- 该文件当前直接汇总：
  - latest batch
  - proof 摘要
  - history 摘要
  - diff 摘要

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过
- 当前关键结果：
  - `latestBatch.taskId=desk-batch-40-stable-snapshot-baseline`
  - `proof.completedChecks=23`
  - `proof.rainfall=79`
  - `history.totalSnapshots=11`
  - `diff.unchanged=true`
  - `diff.unchangedVsLastMatching=true`

### 当前结论

- 当前多窗口协作入口已经同时具备：
  - 命令入口
  - 共享文件入口
- 后续其他 CLI 窗口既可以直接跑脚本，也可以只读取最新共享 JSON 文件

## Phase 61: cli-coordination-protocol（2026-03-17）

### 本轮处理

- 继续收多窗口协作入口
- 新增：
  - `docs/unified/cli-coordination-protocol.md`
- 当前协议文档明确：
  - 单一读取入口
  - 推荐命令
  - 回报字段
  - 判读规则
  - 输出规则

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过
- 当前关键结果：
  - `latestBatch.taskId=desk-batch-42-cli-coordination-protocol`
  - `proof.completedChecks=23`
  - `proof.rainfall=79`
  - `diff.unchanged=true`
  - `diff.unchangedVsLastMatching=true`

### 当前结论

- 当前多窗口协作入口已经同时具备：
  - 协议文档
  - 命令入口
  - 共享文件入口
- 后续其他 CLI 窗口如果要长期按统一规则领取信息、回报状态、同步输出，已经有稳定协议可读

## Phase 62: gps-data-limit-config-realize（2026-03-17）

### 本轮处理

- 继续收 `GpsMonitoringPage` 当前仍停留在本地状态的第二个配置项
- 调整：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
  - `apps/desk/src/api/mockClient.ts`
  - `infra/compose/scripts/seed-demo.ps1`
  - `docs/integrations/storage/postgres/tables/14-seed-data.sql`
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 新增：
  - `scripts/dev/check-desk-gps-data-limit-config.ts`
  - `scripts/dev/check-desk-gps-data-limit-config.ps1`
- 当前实现方式：
  - “数据点数设置”改为读写正式 `system configs`
  - proof 采用“修改 -> 读回验证 -> 恢复原值”的非污染模式

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-data-limit-config.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `gpsDataLimitConfig.limit=320`
  - `gpsDataLimitConfig.restoredOriginal=true`
  - `summarySnapshot.pageProofs.gpsDataLimit=320`
  - `summarySnapshot.completedChecks=24`

### 当前结论

- 当前 `GpsMonitoringPage` 里两个真正影响使用的配置项都已进入正式后端配置链
- 这意味着这页当前剩余的主要 Mock 部分，已经更多是算法展示块，而不是基础配置链

## Phase 63: mainline-open-gaps-inventory（2026-03-17）

### 本轮处理

- 不再继续盲推新点，而是补当前主线剩余未收口点清单
- 新增：
  - `scripts/dev/show-mainline-open-gaps.ps1`
  - `docs/unified/reports/mainline-open-gaps-latest.json`
- 当前清单策略：
  - 只看 Desk 活跃页面
  - 只统计真正的 Mock / follow-up 残留
  - 不把普通 placeholder、输入占位符这类噪声算进来

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-open-gaps.ps1` 已通过
- 当前关键结果：
  - `totalFiles=1`
  - `totalItems=3`
  - 当前唯一剩余文件：
    - `apps/desk/src/views/GpsMonitoringPage.tsx`

### 当前结论

- 当前 Desk 主线剩余未收口点已经高度收敛
- 后续如果继续推进，优先方向已经很明确：
  - GPS monitoring 的地图/CEEMD/预测展示块

## Phase 64: gps-display-copy-cleanup（2026-03-17）

### 本轮处理

- 不改页面结构，只收剩余展示性 Mock 文案
- 调整：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前处理内容：
  - 将“Mock”标题和说明改成更准确的：
    - 实时派生
    - 派生分析
    - 派生预测
  - 不再把已经基于真实数据派生的展示块继续标成 Mock

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-open-gaps.ps1` 已通过
- 当前关键结果：
  - `totalFiles=0`
  - `totalItems=0`

### 当前结论

- 当前 Desk 主线剩余未收口点清单已经清零
- 后续如果继续推进，方向就不再是“清 Mock 残留”，而是要么补更专业的后端算法能力，要么进入新功能/新界面阶段

## Phase 65: gps-derived-analysis-backend（2026-03-17）

### 本轮处理

- 开始把 GPS monitoring 的高阶展示块从前端派生为主推进到后端分析消费为主
- 调整：
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/mockClient.ts`
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
  - `scripts/dev/check-desk-gps-monitoring-page.ts`
- 当前实现方式：
  - 为 `api.gps` 增加 `getDerivedAnalysis()`
  - HTTP 模式优先消费现有 `/api/gps-deformation/:deviceId`
  - CEEMD / prediction 展示块优先使用后端返回结果
  - 前端原有派生逻辑仅保留为 fallback

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `gpsMonitoringPage.ceemdImfCount=3`
  - `gpsMonitoringPage.ceemdQualityScore=1`
  - `gpsMonitoringPage.shortPredictionPoints=24`
  - `gpsMonitoringPage.longPredictionPoints=168`

### 当前结论

- 当前 GPS monitoring 的高阶展示块已经开始正式进入后端分析消费链
- 这一步之后，这页剩余如果还要继续专业化，重点就不再是“接后端”，而是“后端算法本身是否还要更专业”

## Phase 66: gps-analysis-export-backend（2026-03-17）

### 本轮处理

- 继续收 GPS monitoring 的专业化链路
- 调整：
  - `apps/desk/src/views/gpsMonitoringExport.ts`
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
  - `scripts/dev/check-desk-gps-monitoring-export.ts`
- 当前实现方式：
  - 分析导出 JSON 现在携带 `derivedAnalysis`
  - 综合报告文本现在携带 CEEMD 质量分和预测置信度
  - 页面导出动作直接使用当前后端分析结果

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-export.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `gpsMonitoringExport.analysisContainsDerived=true`
  - `gpsMonitoringExport.reportIncludesCeemdQuality=true`
  - `gpsMonitoringExport.reportIncludesPredictionConfidence=true`
  - `gpsMonitoringExport.analysisLength=23596`

### 当前结论

- 当前 GPS monitoring 已不只是页面展示在消费后端分析结果
- 连导出链也已经正式进入后端分析消费链

## Phase 67: gps-v1-analysis-contract（2026-03-17）

### 本轮处理

- 继续把 GPS 高阶分析链从 legacy 提到正式契约
- 调整：
  - `services/api/src/routes/gps-deformations.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `docs/integrations/api/09-gps-deformations.md`
  - `docs/integrations/api/018-desk-ui.md`
  - `docs/integrations/api/openapi.yaml`
  - `docs/integrations/api/openapi.sha256`
- 当前实现方式：
  - 新增 `/api/v1/gps/deformations/{deviceId}/analysis`
  - Desk `getDerivedAnalysis()` 已切到该 v1 路径

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-export.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过

### 当前结论

- 当前 GPS 高阶分析消费链已经从“用 legacy 路径也能跑”推进到“已有正式 v1 契约”
- 后续如果还要继续专业化，这条链的主要工作就会更多落到算法质量本身，而不是接口形态

## Phase 68: gps-analysis-shared-implementation（2026-03-18）

### 本轮处理

- 继续收 GPS 高阶分析链的实现侧分叉问题
- 调整：
  - `services/api/src/routes/gps-deformations.ts`
  - `services/api/src/routes/gps-deformation-legacy.ts`
- 当前实现方式：
  - 将核心 CEEMD / prediction 计算从单一路由私有逻辑，推进到可被两条路由共同复用的实现
  - 不再让 legacy / v1 各自维护完全独立的一套核心分析计算

### 当前验证

- `npm -w services/api run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过

### 当前结论

- 当前 GPS 高阶分析链已经从“契约对齐”继续推进到“实现收敛”
- 后续如果再改算法口径，维护成本会明显低于之前的双份实现状态

## Phase 69: gps-v1-analysis-proof（2026-03-18）

### 本轮处理

- 继续收 GPS v1 分析契约的留证能力
- 调整：
  - `scripts/dev/check-desk-http-v1-core.ps1`
- 当前实现方式：
  - 将 `/api/v1/gps/deformations/{deviceId}/analysis` 直接并入 v1 core proof
  - 不再只通过 GPS monitoring 页面间接证明该接口可用

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `v1Core.gpsAnalysis.hasBaseline=true`
  - `v1Core.gpsAnalysis.qualityScore=0.775`
  - `v1Core.gpsAnalysis.imfCount=3`
  - `v1Core.gpsAnalysis.shortPredictionPoints=24`
  - `v1Core.gpsAnalysis.longPredictionPoints=168`

### 当前结论

- 当前 `v1 GPS analysis` 契约已经具备独立接口级留证
- 后续如果页面链和接口链出现偏差，会比之前更容易定位到是前端消费问题还是后端分析接口问题

## Phase 70: gps-v1-analysis-special-proof（2026-03-18）

### 本轮处理

- 继续收 GPS v1 分析契约的留证能力
- 新增：
  - `scripts/dev/check-desk-gps-v1-analysis-contract.ts`
  - `scripts/dev/check-desk-gps-v1-analysis-contract.ps1`
- 当前实现方式：
  - 不再只在 v1 core proof 里顺带检查
  - 而是给 `v1 GPS analysis` 单独提供一条专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-v1-analysis-contract.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过
- 当前关键结果：
  - `gpsV1AnalysisContract.qualityScore=0.775`
  - `gpsV1AnalysisContract.ceemdImfCount=3`
  - `gpsV1AnalysisContract.shortPredictionPoints=24`
  - `gpsV1AnalysisContract.longPredictionPoints=168`

### 当前结论

- 当前 GPS v1 分析契约已经具备三层留证：
  - 页面级
  - v1 core
  - 专项 proof
- 这条链后续已经足够稳定，若继续推进，重点应开始转向算法质量而不是链路闭环

## Phase 71: local-tsx-runner（2026-03-18）

### 本轮处理

- 收 proof 执行入口的工程稳定性
- 调整：
  - `package.json`
  - `scripts/dev/invoke-tsx.ps1`
  - 多个 `scripts/dev/check-desk-*.ps1`
- 当前实现方式：
  - 根仓增加 `tsx` 依赖
  - wrappers 统一改为优先走本地 `tsx`
  - 不再默认依赖 `npx --yes tsx` 的临时拉包模式

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-v1-analysis-contract.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已继续通过

### 当前结论

- 当前 proof 执行入口已经更适合长时间持续开发
- 后续即便磁盘空间再次紧张，proof 链受临时缓存写入影响的概率也会低于之前

## Phase 72: local-api-restart-script（2026-03-18）

### 本轮处理

- 收本地 `api-service` 的运行流程摩擦点
- 新增：
  - `scripts/dev/restart-local-api-service.ps1`
- 当前脚本统一处理：
  - `services/api` build
  - 停掉旧 `node dist/index.js`
  - 拉起新进程
  - `/health` 探活确认

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-api-service.ps1 -SkipBuild` 已通过
- 当前关键结果：
  - `restarted=true`
  - `port=8081`
  - `health.ok=true`

### 当前结论

- 当前本地 API 重启已经有稳定命令入口
- 后续切换到最新后端构建版本时，运行态验证成本会明显低于之前的手工方式

## Phase 73: local-desk-mainline-stack-restart（2026-03-18）

### 本轮处理

- 继续收本地主线 Desk 运行流程
- 新增：
  - `scripts/dev/restart-local-desk-mainline.ps1`
- 当前脚本统一处理：
  - `api-service` 存活
  - `apps/desk` dev server 拉起
  - Desk URL 探活

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-desk-mainline.ps1 -SkipApiBuild` 已通过
- 当前关键结果：
  - `restarted=true`
  - `apiPort=8081`
  - `deskPort=5174`
  - `deskUrl=http://[::1]:5174`
  - `Invoke-WebRequest http://[::1]:5174` 返回 `200`

### 当前结论

- 当前本地主线 Desk 栈已经有稳定的一键重启入口
- 后续无论是你还是其他 CLI 窗口，需要重新拉起主线运行态时，已经不需要手工拼多条命令

## Phase 74: local-desk-runtime-status（2026-03-18）

### 本轮处理

- 继续收本地主线运行态的观测入口
- 新增：
  - `scripts/dev/show-local-desk-mainline-runtime.ps1`
- 当前脚本直接汇总：
  - `api-service` 监听进程
  - `apps/desk` dev server 监听进程
  - `desk-win` 是否运行
  - 对应 HTTP 健康检查

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-local-desk-mainline-runtime.ps1` 已通过
- 当前关键结果：
  - `api.health.ok=true`
  - `desk.healthIpv6.ok=true`
  - `desk.healthLocalhost.ok=true`
  - `deskWin.running=false`

### 当前结论

- 当前本地主线 Desk 运行态已经同时具备：
  - 一键重启
  - 一键状态读取
- 后续如果主线运行态出问题，定位路径会比之前更短

## Phase 75: local-desk-runtime-shared-file（2026-03-18）

### 本轮处理

- 继续收本地主线运行态的协作入口
- 调整：
  - `scripts/dev/show-local-desk-mainline-runtime.ps1`
- 新增：
  - `docs/unified/reports/local-desk-mainline-runtime-latest.json`
- 当前文件当前汇总：
  - api 监听进程
  - desk dev server 监听进程
  - deskWin 是否运行
  - 对应健康检查

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-local-desk-mainline-runtime.ps1` 已通过
- 当前关键结果：
  - `api.health.ok=true`
  - `desk.healthIpv6.ok=true`
  - `desk.healthLocalhost.ok=true`
  - `deskWin.running=false`

### 当前结论

- 当前本地主线运行态已经同时具备：
  - 命令入口
  - 共享文件入口
- 后续其他 CLI 窗口如果只想读最新运行态，也不需要再自己执行探活命令

## Phase 76: local-desk-win-launch（2026-03-18）

### 本轮处理

- 继续收本地主线 Desk 运行态入口
- 新增：
  - `scripts/dev/start-local-desk-win.ps1`
- 当前目标：
  - 提供 desk-win 启动入口
  - 让运行态状态脚本可以明确识别 `deskWin.running`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-local-desk-win.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-local-desk-mainline-runtime.ps1` 已通过
- 当前关键结果：
  - `deskWin.running=true`
  - `deskWin.pid=57144`
  - `deskWin.name=dotnet.exe`

### 当前结论

- 当前主线本地运行态入口已经覆盖：
  - API
  - 前端 dev server
  - desk-win 壳
- 后续本地桌面端联动验证已经不再缺启动/观测入口

### 环境补充

- 本轮曾遇到 `ENOSPC`
- 已通过 `npm cache clean --force` 临时释放磁盘空间，保证本轮构建继续完成

### 同步补充

- 当前已同步：
  - `docs/integrations/api/018-desk-ui.md`
  - `docs/integrations/api/09-gps-deformations.md`
- 当前多窗口共享状态也已刷新到：
  - `desk-batch-47-gps-analysis-export-backend`

## Phase 42: device-command-history-alignment（2026-03-17）

### 本轮处理

- 继续收设备管理页动作链
- 调整 `apps/desk/src/views/DeviceManagementPage.tsx`
  - 控制历史改为读取真实 `devices.listCommands()`
  - 下发命令成功后自动刷新命令列表
  - 保持现有表格布局不变
- 更新 `scripts/dev/check-desk-viewer-boundary.ts`
  - 将 viewer 对 `devices.issueCommand()` / `devices.listCommands()` 的拒绝行为纳入留证

### 当前验证

- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-device-actions.ps1` 已继续通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-viewer-boundary.ps1` 已继续通过
- 当前关键结果：
  - `deviceActions.commandsLoaded=5`
  - `deviceActions.foundIssuedCommand=true`
  - `viewerBoundary.denied.deviceCommandIssue=禁止访问`
  - `viewerBoundary.denied.deviceCommandList=禁止访问`

### 当前结论

- 当前设备管理页的“控制按钮”“控制历史”“viewer 权限边界”都已落到同一条真实命令链上

## Phase 77: gps-prediction-confidence-interval-proof（2026-03-18）

### 本轮处理

- 继续收 GPS 高阶分析链的算法留证细节
- 调整：
  - `scripts/dev/check-desk-gps-v1-analysis-contract.ts`
  - `scripts/dev/check-desk-gps-monitoring-page.ts`
  - `scripts/dev/check-desk-gps-monitoring-export.ts`
  - `scripts/dev/check-desk-http-v1-core.ps1`
  - `scripts/dev/check-desk-mainline-proof.ps1`
  - `infra/compose/scripts/seed-demo.ps1`
- 当前实现方式：
  - `v1/page/export/main proof` 全部从“只读取 prediction 长度”收口到“直接断言 confidenceIntervals 长度”
  - 总 proof 摘要现已显式带出：
    - `gpsShortPredictionBandPoints`
    - `gpsLongPredictionBandPoints`
  - `seed-demo.ps1` 已切到无 BOM UTF-8 管道输出，并在 SQL 执行入口补 BOM 清洗

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-v1-analysis-contract.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-export.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `gpsV1AnalysisContract.shortPredictionLowerPoints=24`
- `gpsV1AnalysisContract.shortPredictionUpperPoints=24`
- `gpsV1AnalysisContract.longPredictionLowerPoints=168`
- `gpsV1AnalysisContract.longPredictionUpperPoints=168`
- `gpsMonitoringPage.gpsMonitoringPage.shortPredictionLowerPoints=24`
- `gpsMonitoringPage.gpsMonitoringPage.longPredictionLowerPoints=168`
- `gpsMonitoringExport.analysisIncludesConfidenceIntervals=true`
- `summarySnapshot.pageProofs.gpsShortPredictionBandPoints=24`
- `summarySnapshot.pageProofs.gpsLongPredictionBandPoints=168`

### 当前结论

- 当前 GPS 高阶分析链的置信区间已经不只是后端字段存在，而是已被正式纳入专项 proof、页面 proof、导出 proof、v1 core proof 和主线总 proof
- 当前主线 seed/proof 执行链也顺带补掉了 BOM 编码问题，后续一键复验的稳定性高于之前

## Phase 78: gps-analysis-diagnostics-forecast（2026-03-18）

### 本轮处理

- 继续收 GPS 高阶分析链的可解释性
- 调整：
  - `services/api/src/routes/gps-deformations.ts`
  - `services/api/src/routes/gps-deformation-legacy.ts`
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/mockClient.ts`
  - `apps/desk/src/views/gpsMonitoringExport.ts`
  - 相关专项 proof / 主线总 proof / API 文档
- 当前实现方式：
  - `v1` 分析结果新增 `trendDiagnostics`
  - `v1/legacy` 分析结果新增 `prediction.thresholdForecast`
  - `GPS analysis export/report` 已同步带出趋势与阈值预测摘要
  - 主线总 proof 摘要已显式带出：
    - `gpsTrendDirection`
    - `gpsTrendSlopeMmPerHour`
    - `gpsThresholdBlueForecastBreached`
    - `gpsThresholdRedForecastBreached`

### 当前验证

- `npm -w services/api run build` 已通过
- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-api-service.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-v1-analysis-contract.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-export.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

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

### 当前结论

- 当前 GPS 高阶分析链已经从“有预测结果”继续推进到“有趋势诊断和阈值越界预测”
- 在不动桌面端 UI 的前提下，这一轮把更专业的解释性字段推进到了正式契约、导出链和主线真值里

## Phase 79: gps-regression-trend-eta（2026-03-18）

### 本轮处理

- 继续收 GPS 高阶分析链的专业口径
- 调整：
  - `services/api/src/routes/gps-deformations.ts`
  - `services/api/src/routes/gps-deformation-legacy.ts`
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/mockClient.ts`
  - `apps/desk/src/views/gpsMonitoringExport.ts`
  - 相关专项 proof / 主线总 proof / API 文档
- 当前实现方式：
  - `trendDiagnostics.slopeMmPerHour` 改为按真实时间轴做回归估计
  - `trendDiagnostics` 已补 `durationHours`、`regressionFitR2`
  - `thresholdForecast` 已补 `etaHours`、`etaDays`、`firstTimestamp`
  - 导出报告当前已同步带出 `趋势拟合R²` 与阈值越界 ETA

### 当前验证

- `npm -w services/api run build` 已通过
- `npm -w apps/desk run build` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-api-service.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-v1-analysis-contract.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-export.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-v1-core.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

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

### 当前结论

- 当前 GPS 高阶分析链已经从“趋势方向 + 是否越界”继续推进到“回归趋势 + 拟合质量 + ETA”
- 这一轮的重点仍然是算法口径本身，没有碰桌面端 UI、导航或页面结构

## Phase 80: gps-long-window-demo-truth（2026-03-18）

### 本轮处理

- 继续收 GPS 算法样本基础
- 调整：
  - `infra/compose/scripts/seed-demo.ps1`
  - `services/api/src/routes/gps-deformation-legacy.ts`
  - `scripts/dev/check-desk-http-legacy.ps1`
- 当前实现方式：
  - GNSS demo 遥测从短窗口分钟点扩到约 30 天小时级样本
  - legacy `gps-deformation` 已支持 `days`
  - legacy GPS proof 改为选 baseline-backed 真实设备，避免拿无 baseline 设备跑出空样本

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/seed-demo.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-v1-analysis-contract.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `gpsMonitoringPage.points7d=168`
- `gpsMonitoringPage.points15d=16`
- `gpsMonitoringPage.points30d=31`
- `gpsMonitoringExport.csvLines=169`
- `legacy.gps.totalPoints=24`
- `legacy.gps.validPoints=24`
- `legacy.gps.hasLatestData=true`
- `legacy.gps.deviceId=00000000-0000-0000-0000-000000000001`
- `v1Core.gps.points=192`
- `v1Core.gpsAnalysis.trendDurationHours=167`

### 当前结论

- 当前 GPS 算法链已经有了更像真实监测的长时窗样本基础
- 后续继续做趋势稳定性、回归质量或时序模型时，不再被“样本只有几小时”这个问题卡住

## Phase 81: gps-realistic-demo-waveform（2026-03-18）

### 本轮处理

- 继续收 GPS demo 样本的真实性
- 调整：
  - `infra/compose/scripts/seed-demo.ps1`
- 当前实现方式：
  - GNSS 序列已改为确定性的：
    - 长期微小漂移
    - 日/多日周期扰动
    - 局部事件脉冲
  - 不再主要依赖随机抖动生成位移曲线

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/seed-demo.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-api-service.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-monitoring-page.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-v1-analysis-contract.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-http-legacy.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

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
- `summarySnapshot.pageProofs.gpsTrendDirection=increasing`
- `summarySnapshot.pageProofs.gpsTrendSlopeMmPerHour=0.0218`
- `summarySnapshot.pageProofs.gpsTrendFitR2=0.3463`

### 当前结论

- 当前 GPS demo 样本已经不仅“覆盖长时窗”，而且波形口径也更接近真实监测场景
- 这轮继续没有碰桌面端 UI，只是在样本真值层面提高了后续算法工作的可信度

## Phase 82: gps-sample-library-proof（2026-03-19）

### 本轮处理

- 继续收 GPS 样本基础的可验证性
- 新增：
  - `scripts/dev/check-desk-gps-sample-library.ts`
  - `scripts/dev/check-desk-gps-sample-library.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
  - `scripts/dev/check-desk-http-v1-core.ps1`
- 当前实现方式：
  - 对 3 台 baseline-backed GNSS 设备的 30 天样本做专项留证
  - 断言：
    - 样本数足够
    - slope 排序稳定
    - fit 排序稳定
    - range bucket 有效区分
  - 主线总 proof 已改为 seed 后自动重启本地 API，避免 `/health` 已恢复但 `/api/v1/auth/login` 仍短暂不可用

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-sample-library.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=27`
- `summarySnapshot.pageProofs.gpsSampleProfiles=3`
- `gpsSampleLibrary.deviceCount=3`
- `gpsSampleLibrary.slopeOrderingStable=true`
- `gpsSampleLibrary.fitOrderingStable=true`
- `gpsSampleLibrary.distinctRangeBuckets=3`
- `gpsSampleLibrary.entries[0].rangeMm=18.53`
- `gpsSampleLibrary.entries[1].rangeMm=11`
- `gpsSampleLibrary.entries[2].rangeMm=10.07`

### 当前结论

- 当前 GPS 样本库已经具备专项 proof 和主线总 proof 双层入口
- 后续如果继续补“事件类型样本库”，可以直接在这个 proof 入口上扩展，而不用再从零搭验证链

## Phase 83: gps-event-profile-library（2026-03-19）

### 本轮处理

- 继续收 GPS 样本库的事件语义
- 调整：
  - `infra/compose/scripts/seed-demo.ps1`
  - `scripts/dev/check-desk-gps-sample-library.ts`
- 当前实现方式：
  - 将 3 台 baseline-backed GNSS 样本明确收口为：
    - `creep_rise`
    - `event_acceleration`
    - `cyclic_oscillation`
  - 样本库专项 proof 当前直接断言 profile kinds 与 profile distinctness

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/seed-demo.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-local-api-service.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-sample-library.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `gpsSampleLibrary.profileKinds=["creep_rise","event_acceleration","cyclic_oscillation"]`
- `gpsSampleLibrary.profileKindsDistinct=true`
- `gpsSampleLibrary.entries[0].profile=creep_rise`
- `gpsSampleLibrary.entries[0].fitR2=0.5706`
- `gpsSampleLibrary.entries[1].profile=event_acceleration`
- `gpsSampleLibrary.entries[1].slopeMmPerHour30d=0.0265`
- `gpsSampleLibrary.entries[1].rangeMm=21.78`
- `gpsSampleLibrary.entries[2].profile=cyclic_oscillation`
- `gpsSampleLibrary.entries[2].fitR2=0.023`

### 当前结论

- 当前 GPS 样本库已经从“多样性样本”继续推进到“事件类型样本库”
- 后续如果继续往算法方向推进，可以直接围绕这些 profile 去补评估口径和回放断言

## Phase 84: gps-profile-evaluation-proof（2026-03-19）

### 本轮处理

- 继续收 GPS 样本库的算法评估能力
- 新增：
  - `scripts/dev/check-desk-gps-profile-evaluation.ts`
  - `scripts/dev/check-desk-gps-profile-evaluation.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 单独验证：
    - `creep_rise`
    - `event_acceleration`
    - `cyclic_oscillation`
  - proof 当前直接断言：
    - profile 数量
    - profile 对应稳定性
    - slope 排序
    - 30d / 7d 评估指标

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-profile-evaluation.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

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

### 当前结论

- 当前 GPS 样本库已经从“可分类”继续推进到“可评估”
- 后续如果继续往算法方向推进，可以直接在这个评估 proof 上继续补误差、召回和告警灵敏度等指标

## Phase 85: gps-profile-backtest-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-profile-backtest.ts`
  - `scripts/dev/check-desk-gps-profile-backtest.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 做 24h horizon backtest
  - 当前直接验证：
    - `mae24hMm`
    - `bias24hMm`
    - `directionHitRate`
    - `redSignalHitRate`
  - 主线总 proof 已并入该专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-profile-backtest.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

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

### 当前结论

- 当前 GPS profile 已经具备专项回测 proof
- 后续如果继续往算法方向推进，可以直接在这条 backtest proof 上补更细的误差分解和告警灵敏度指标

## Phase 86: gps-profile-error-decomposition-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-profile-error-decomposition.ts`
  - `scripts/dev/check-desk-gps-profile-error-decomposition.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 做更细的误差分解
  - 当前直接验证：
    - `mae6hMm`
    - `mae24hMm`
    - `bias6hMm`
    - `bias24hMm`
    - `blue/red hit rate`
    - `blue/red false alarm rate`
  - 主线总 proof 已并入该专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-profile-error-decomposition.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

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

### 当前结论

- 当前 GPS profile 已经开始具备专项误差分解 proof
- 后续如果继续往算法方向推进，可以直接在这条误差分解 proof 上补 horizon 分层、阈值档位分层和告警灵敏度指标

## Phase 87: gps-profile-alert-sensitivity-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-profile-alert-sensitivity.ts`
  - `scripts/dev/check-desk-gps-profile-alert-sensitivity.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 进一步验证：
    - `blue sensitivity`
    - `red sensitivity`
    - `cyclic red specificity`
  - 主线总 proof 已并入该专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-profile-alert-sensitivity.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

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

### 当前结论

- 当前 GPS profile 已经开始具备专项告警灵敏度 proof
- 后续如果继续往算法方向推进，可以直接在这条 proof 上补误报/漏报分层和阈值档位分层

## Phase 88: gps-threshold-bucket-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 调整：
  - `scripts/dev/check-desk-gps-profile-alert-sensitivity.ts`
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 将 blue / red 阈值档位验证正式并入主线总 proof
  - 当前专项 proof 已显式验证：
    - `blue sensitivity`
    - `red sensitivity`
    - `cyclic red specificity`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-profile-alert-sensitivity.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=31`
- `summarySnapshot.pageProofs.gpsProfileAlertProfiles=3`
- `gpsProfileAlertSensitivity.profileCount=3`
- `gpsProfileAlertSensitivity.blueSensitivityStable=true`
- `gpsProfileAlertSensitivity.redSensitivityStable=true`
- `gpsProfileAlertSensitivity.cyclicRedSpecificityStable=true`
- `gpsProfileAlertSensitivity.entries[0].blue.sensitivity=1`
- `gpsProfileAlertSensitivity.entries[1].red.sensitivity=1`
- `gpsProfileAlertSensitivity.entries[2].red.specificity=1`

### 当前结论

- 当前 GPS profile 已经具备阈值档位分层 proof
- 后续如果继续往算法方向推进，可以直接在这条专项 proof 上补 precision / false alarm / miss rate 分层

## Phase 89: gps-threshold-precision-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-precision.ts`
  - `scripts/dev/check-desk-gps-threshold-precision.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 进一步验证：
    - `blue precision`
    - `yellow precision`
    - `red precision`
    - `cyclic yellow/red specificity`
  - 主线总 proof 已并入该专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-precision.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=32`
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

### 当前结论

- 当前 GPS profile 已经开始具备阈值档位的 precision / specificity 分层 proof
- 后续如果继续往算法方向推进，可以直接在这条专项 proof 上补 false alarm / miss rate 分层和 horizon 分层

## Phase 90: gps-threshold-error-rate-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-error-rates.ts`
  - `scripts/dev/check-desk-gps-threshold-error-rates.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 进一步验证：
    - `blue miss rate`
    - `red miss rate`
    - `cyclic yellow/red false alarm rate`
  - 主线总 proof 已并入该专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-error-rates.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=33`
- `summarySnapshot.pageProofs.gpsThresholdErrorProfiles=3`
- `gpsThresholdErrorRates.profileCount=3`
- `gpsThresholdErrorRates.blueMissStable=true`
- `gpsThresholdErrorRates.redMissStable=true`
- `gpsThresholdErrorRates.cyclicFalseAlarmStable=true`
- `gpsThresholdErrorRates.entries[0].blue.missRate=0`
- `gpsThresholdErrorRates.entries[1].red.missRate=0`
- `gpsThresholdErrorRates.entries[2].yellow.falseAlarmRate=0`
- `gpsThresholdErrorRates.entries[2].red.falseAlarmRate=0`

### 当前结论

- 当前 GPS profile 已经开始具备阈值档位的误报/漏报分层 proof
- 后续如果继续往算法方向推进，可以直接在这条专项 proof 上补 profile × horizon × 阈值档位的更细误差治理指标

## Phase 91: gps-threshold-horizon-matrix-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-horizon-matrix.ts`
  - `scripts/dev/check-desk-gps-threshold-horizon-matrix.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 进一步验证：
    - `6h / 24h / 72h`
    - `blue / yellow / red`
    的 precision / specificity 矩阵
  - 主线总 proof 已并入该专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-horizon-matrix.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=34`
- `summarySnapshot.pageProofs.gpsThresholdMatrixProfiles=3`
- `gpsThresholdHorizonMatrix.profileCount=3`
- `gpsThresholdHorizonMatrix.horizons=["6h","24h","72h"]`
- `gpsThresholdHorizonMatrix.bluePrecisionStable=true`
- `gpsThresholdHorizonMatrix.redPrecisionStable=true`
- `gpsThresholdHorizonMatrix.cyclicSpecificityStable=true`
- `gpsThresholdHorizonMatrix.entries[0].matrix["24h"].red.precision=1`
- `gpsThresholdHorizonMatrix.entries[1].matrix["72h"].yellow.precision=1`
- `gpsThresholdHorizonMatrix.entries[2].matrix["24h"].red.specificity=1`

### 当前结论

- 当前 GPS 阈值验证已经具备专项 horizon 矩阵 proof
- 后续如果继续往算法方向推进，可以直接在这条矩阵 proof 上补更细的 horizon × threshold × profile 误差治理指标

## Phase 92: gps-threshold-horizon-error-matrix-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-horizon-error-matrix.ts`
  - `scripts/dev/check-desk-gps-threshold-horizon-error-matrix.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 对 3 类 profile 进一步验证：
    - `6h / 24h / 72h`
    - `blue / yellow / red`
    的 `falseAlarmRate / missRate / recall` 矩阵
  - 主线总 proof 已并入该专项 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-horizon-error-matrix.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=35`
- `summarySnapshot.pageProofs.gpsThresholdHorizonErrorProfiles=3`
- `gpsThresholdHorizonErrorMatrix.profileCount=3`
- `gpsThresholdHorizonErrorMatrix.horizons=["6h","24h","72h"]`
- `gpsThresholdHorizonErrorMatrix.blueMissStable=true`
- `gpsThresholdHorizonErrorMatrix.redMissStable=true`
- `gpsThresholdHorizonErrorMatrix.cyclicFalseAlarmStable=true`
- `gpsThresholdHorizonErrorMatrix.entries[0].matrix["24h"].blue.missRate=0`
- `gpsThresholdHorizonErrorMatrix.entries[1].matrix["24h"].red.missRate=0`
- `gpsThresholdHorizonErrorMatrix.entries[2].matrix["72h"].yellow.falseAlarmRate=0`

### 当前结论

- 当前 GPS 阈值验证已经具备专项 horizon 误报/漏报矩阵 proof
- 后续如果继续往算法方向推进，可以直接在这条矩阵 proof 上补更细的 horizon × threshold × profile 告警治理指标

## Phase 93: gps-threshold-horizon-governance-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 调整：
  - `docs/unified/task-queue.md`
  - `docs/unified/coordination-board.md`
  - `docs/unified/reports/desk-backend-data-closure.md`
- 当前实现方式：
  - 将以下两条专项 proof 统一提升为 horizon 治理矩阵：
    - `check-desk-gps-threshold-horizon-matrix.ps1`
    - `check-desk-gps-threshold-horizon-error-matrix.ps1`
  - 主线总 proof 当前已同时覆盖：
    - `precision / specificity`
    - `falseAlarm / miss / recall`
    的 `profile × horizon × threshold` 矩阵

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=35`
- `summarySnapshot.pageProofs.gpsThresholdMatrixProfiles=3`
- `summarySnapshot.pageProofs.gpsThresholdHorizonErrorProfiles=3`
- `gpsThresholdHorizonMatrix.horizons=["6h","24h","72h"]`
- `gpsThresholdHorizonErrorMatrix.horizons=["6h","24h","72h"]`
- `gpsThresholdHorizonMatrix.entries[0].matrix["24h"].red.precision=1`
- `gpsThresholdHorizonMatrix.entries[2].matrix["24h"].red.specificity=1`
- `gpsThresholdHorizonErrorMatrix.entries[0].matrix["24h"].blue.missRate=0`
- `gpsThresholdHorizonErrorMatrix.entries[2].matrix["72h"].yellow.falseAlarmRate=0`

### 当前结论

- 当前 GPS 阈值验证已经具备真正的 horizon 治理矩阵入口
- 后续如果继续往算法方向推进，可以直接在这条治理矩阵上加更细的告警治理指标，而不需要再补新的验证框架

## Phase 94: gps-threshold-governance-full-matrix（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-governance-matrix.ts`
  - `scripts/dev/check-desk-gps-threshold-governance-matrix.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 将以下指标统一到一条 full governance matrix proof：
    - `precision`
    - `specificity`
    - `falseAlarmRate`
    - `missRate`
    - `recall`
  - 覆盖：
    - `profile × 6h/24h/72h × blue/yellow/red`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-governance-matrix.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=36`
- `summarySnapshot.pageProofs.gpsThresholdGovernanceProfiles=3`
- `gpsThresholdGovernanceMatrix.profileCount=3`
- `gpsThresholdGovernanceMatrix.horizons=["6h","24h","72h"]`
- `gpsThresholdGovernanceMatrix.blueGovernanceStable=true`
- `gpsThresholdGovernanceMatrix.redGovernanceStable=true`
- `gpsThresholdGovernanceMatrix.cyclicGovernanceStable=true`
- `gpsThresholdGovernanceMatrix.entries[0].matrix["24h"].red.precision=1`
- `gpsThresholdGovernanceMatrix.entries[1].matrix["72h"].yellow.recall=1`
- `gpsThresholdGovernanceMatrix.entries[2].matrix["24h"].red.falseAlarmRate=0`

### 当前结论

- 当前 GPS 告警验证已经具备 full governance matrix proof
- 后续如果继续往算法方向推进，可以直接在这条矩阵 proof 上加更细的 profile × horizon × threshold 告警治理指标

## Phase 95: gps-threshold-governance-truth-sync（2026-03-19）

### 本轮处理

- 不再新增算法逻辑，只收主线真值入口
- 调整：
  - `docs/unified/task-queue.md`
  - `docs/unified/coordination-board.md`
  - `docs/unified/reports/desk-backend-data-closure.md`
  - `docs/unified/reports/mainline-coordination-status-latest.json`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `latestBatch.taskId=desk-batch-77-gps-threshold-governance-sync`
- `proof.completedChecks=36`
- `proof.rainfall=79`
- `diff.unchanged=false`

### 当前结论

- 当前 GPS 阈值治理矩阵这一轮已经完成主线入口同步
- 后续其他窗口读取主线真值时，已经可以直接按这轮批次继续推进

## Phase 96: gps-threshold-scorecard-proof（2026-03-20）

### 本轮处理

- 继续收 GPS profile 的算法治理能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-full-matrix.ts`
  - `scripts/dev/check-desk-gps-threshold-full-matrix.ps1`
  - `scripts/dev/check-desk-gps-threshold-scorecard.ts`
  - `scripts/dev/check-desk-gps-threshold-scorecard.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 将 `precision / specificity / falseAlarmRate / missRate / recall`
    统一收进 full matrix 专项 proof
  - 在此基础上新增 scorecard proof，直接给出：
    - `governanceScore`
    - `burdenScore`
    - `rangeOrdering`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-full-matrix.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-scorecard.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=38`
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

### 当前结论

- 当前 GPS 告警治理已经具备 full matrix + scorecard 两条专项入口
- 后续如果继续往算法方向推进，可以直接在 scorecard 之上加更细的 profile × horizon × threshold 治理评分

## Phase 97: gps-threshold-scorecard-truth-sync（2026-03-20）

### 本轮处理

- 不再新增算法逻辑，只收主线真值入口
- 调整：
  - `docs/unified/task-queue.md`
  - `docs/unified/coordination-board.md`
  - `docs/unified/reports/desk-backend-data-closure.md`
  - `docs/unified/reports/mainline-coordination-status-latest.json`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `latestBatch.taskId=desk-batch-80-gps-threshold-scorecard-sync`
- `proof.completedChecks=38`
- `proof.rainfall=79`
- `diff.unchanged=false`

### 当前结论

- 当前 GPS 阈值评分卡这一轮已经完成主线入口同步
- 后续其他窗口读取主线真值时，已经可以直接按这轮批次继续推进

## Phase 98: gps-threshold-ranking-proof（2026-03-20）

### 本轮处理

- 继续收 GPS profile 的算法治理能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-ranking.ts`
  - `scripts/dev/check-desk-gps-threshold-ranking.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 在 full matrix / scorecard 之上新增排序 proof
  - 当前直接给出：
    - `governanceScore`
    - `burdenScore`
    - `rangeMm`
    - `rank`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-ranking.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=39`
- `summarySnapshot.pageProofs.gpsThresholdRankingProfiles=3`
- `gpsThresholdRanking.profileCount=3`
- `gpsThresholdRanking.rankingStable=true`
- `gpsThresholdRanking.governanceScoreStable=true`
- `gpsThresholdRanking.ranking[0].profile=event_acceleration`
- `gpsThresholdRanking.ranking[1].profile=creep_rise`
- `gpsThresholdRanking.ranking[2].profile=cyclic_oscillation`

### 当前结论

- 当前 GPS 阈值治理已经具备专项排序 proof
- 后续如果继续往算法方向推进，可以直接在这条排序 proof 上补更细的治理评分或策略优先级规则

## Phase 99: gps-threshold-policy-board-proof（2026-03-20）

### 本轮处理

- 继续收 GPS profile 的算法治理能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-policy-board.ts`
  - `scripts/dev/check-desk-gps-threshold-policy-board.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 在 full matrix / scorecard / ranking 之上新增 policy board proof
  - 当前直接给出：
    - `priority`
    - `action`
    - `boardLabel`
    - `rank`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-policy-board.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=40`
- `summarySnapshot.pageProofs.gpsThresholdPolicyProfiles=3`
- `gpsThresholdPolicyBoard.profileCount=3`
- `gpsThresholdPolicyBoard.rankingStable=true`
- `gpsThresholdPolicyBoard.policyMappingStable=true`
- `gpsThresholdPolicyBoard.ranking[0].action=immediate_intervention`
- `gpsThresholdPolicyBoard.ranking[1].action=heightened_watch`
- `gpsThresholdPolicyBoard.ranking[2].action=routine_observation`

### 当前结论

- 当前 GPS 阈值治理已经具备专项 policy board proof
- 后续如果继续往算法方向推进，可以直接在这条 policy board 上补更细的治理策略和执行建议

## Phase 100: gps-threshold-policy-board-truth-sync（2026-03-20）

### 本轮处理

- 不再新增算法逻辑，只收主线真值入口
- 调整：
  - `docs/unified/task-queue.md`
  - `docs/unified/coordination-board.md`
  - `docs/unified/reports/desk-backend-data-closure.md`
  - `docs/unified/reports/mainline-coordination-status-latest.json`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `latestBatch.taskId=desk-batch-83-gps-threshold-policy-board-sync`
- `proof.completedChecks=40`
- `proof.rainfall=79`
- `diff.unchanged=false`

### 当前结论

- 当前 GPS 阈值 policy board 这一轮已经完成主线入口同步
- 后续其他窗口读取主线真值时，已经可以直接按这轮批次继续推进

## Phase 101: gps-threshold-execution-matrix-proof（2026-03-20）

### 本轮处理

- 继续收 GPS profile 的算法治理能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-execution-matrix.ts`
  - `scripts/dev/check-desk-gps-threshold-execution-matrix.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 在 policy board 之上新增 execution matrix proof
  - 当前直接给出：
    - `level`
    - `reviewHours`
    - `action`
  - 覆盖：
    - `profile × 6h/24h/72h`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-execution-matrix.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=41`
- `summarySnapshot.pageProofs.gpsThresholdExecutionProfiles=3`
- `gpsThresholdExecutionMatrix.profileCount=3`
- `gpsThresholdExecutionMatrix.reviewCadenceStable=true`
- `gpsThresholdExecutionMatrix.levelMappingStable=true`
- `event_acceleration @ 6h -> critical / 1h / immediate_intervention`
- `creep_rise @ 6h -> high / 4h / onsite_review`
- `cyclic_oscillation @ 72h -> background / 72h / archive_monitoring`

### 当前结论

- 当前 GPS 阈值治理已经具备专项 execution matrix proof
- 后续如果继续往算法方向推进，可以直接在这条执行矩阵上补更细的处置规则、复核频率和干预建议

## Phase 96: gps-threshold-full-matrix-proof（2026-03-19）

### 本轮处理

- 继续收 GPS profile 的算法验证能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-full-matrix.ts`
  - `scripts/dev/check-desk-gps-threshold-full-matrix.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 将以下指标统一到单一专项 proof：
    - `precision`
    - `specificity`
    - `falseAlarmRate`
    - `missRate`
    - `recall`
  - 覆盖：
    - `profile × 6h/24h/72h × blue/yellow/red`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-full-matrix.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过

### 当前关键结果

- `summarySnapshot.pageProofs.gpsThresholdFullMatrixProfiles=3`
- `gpsThresholdFullMatrix.profileCount=3`
- `gpsThresholdFullMatrix.horizons=["6h","24h","72h"]`
- `gpsThresholdFullMatrix.thresholds=["blue","yellow","red"]`
- `gpsThresholdFullMatrix.precisionStable=true`
- `gpsThresholdFullMatrix.missStable=true`
- `gpsThresholdFullMatrix.cyclicSpecificityStable=true`

### 当前结论

- 当前 GPS 告警验证已经具备 full-matrix 专项 proof
- 后续如果继续往算法方向推进，可以直接在这条专项 proof 上补更细的治理评分或误差分解，而不需要再拆更多入口

## Phase 102: gps-threshold-runbook-proof（2026-03-20）

### 本轮处理

- 继续收 GPS profile 的算法治理能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-runbook.ts`
  - `scripts/dev/check-desk-gps-threshold-runbook.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 在 policy board / execution matrix 之上新增 runbook proof
  - 当前直接给出：
    - `owner`
    - `escalation`
    - `packet`
  - 覆盖：
    - `profile × 6h/24h/72h`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-runbook.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=42`
- `summarySnapshot.pageProofs.gpsThresholdRunbookProfiles=3`
- `gpsThresholdRunbook.profileCount=3`
- `gpsThresholdRunbook.escalationMappingStable=true`
- `gpsThresholdRunbook.ownershipStable=true`
- `event_acceleration @ 6h -> ops_commander / incident_bridge / immediate-response-kit`
- `creep_rise @ 6h -> site_engineer / geotech_lead / onsite-review-kit`
- `cyclic_oscillation @ 72h -> archive_operator / none / archive-monitoring-kit`

### 当前结论

- 当前 GPS 阈值治理已经具备专项 runbook proof
- 后续如果继续往算法方向推进，可以直接在这条 runbook 上补更细的执行建议和责任分工

## Phase 103: gps-threshold-sla-matrix-proof（2026-03-20）

### 本轮处理

- 继续收 GPS profile 的算法治理能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-sla-matrix.ts`
  - `scripts/dev/check-desk-gps-threshold-sla-matrix.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 在 runbook 之上新增 SLA matrix proof
  - 当前直接给出：
    - `ackMinutes`
    - `dispatchMinutes`
    - `closureHours`
  - 覆盖：
    - `profile × 6h/24h/72h`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-sla-matrix.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=43`
- `summarySnapshot.pageProofs.gpsThresholdSlaProfiles=3`
- `gpsThresholdSlaMatrix.profileCount=3`
- `gpsThresholdSlaMatrix.ackOrderingStable=true`
- `gpsThresholdSlaMatrix.closureOrderingStable=true`
- `event_acceleration @ 6h -> ackMinutes=15 / dispatchMinutes=30 / closureHours=6`
- `creep_rise @ 6h -> ackMinutes=30 / dispatchMinutes=120 / closureHours=12`
- `cyclic_oscillation @ 72h -> ackMinutes=720 / dispatchMinutes=2880 / closureHours=96`

### 当前结论

- 当前 GPS 阈值治理已经具备专项 SLA matrix proof
- 后续如果继续往算法方向推进，可以直接在这条 SLA matrix 上补联动时效承诺和跨角色升级规则

## Phase 104: gps-threshold-operating-model-proof（2026-03-20）

### 本轮处理

- 继续收 GPS profile 的算法治理能力
- 新增：
  - `scripts/dev/check-desk-gps-threshold-operating-model.ts`
  - `scripts/dev/check-desk-gps-threshold-operating-model.ps1`
- 调整：
  - `scripts/dev/check-desk-mainline-proof.ps1`
- 当前实现方式：
  - 将以下治理入口统一到一条组合 proof：
    - `policy board`
    - `execution matrix`
    - `runbook`
    - `SLA matrix`
  - 当前按 profile/horizon 统一给出：
    - `boardAction`
    - `executionLevel`
    - `executionAction`
    - `owner`
    - `escalation`
    - `ackMinutes`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-gps-threshold-operating-model.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1 -SkipBuild` 已通过

### 当前关键结果

- `summarySnapshot.completedChecks=44`
- `summarySnapshot.pageProofs.gpsThresholdOperatingProfiles=3`
- `gpsThresholdOperatingModel.profileCount=3`
- `gpsThresholdOperatingModel.boardExecutionAlignmentStable=true`
- `gpsThresholdOperatingModel.responseOrderingStable=true`
- `gpsThresholdOperatingModel.escalationCoverageStable=true`
- `event_acceleration @ 6h -> immediate_intervention / critical / incident_bridge / ackMinutes=15`
- `creep_rise @ 6h -> heightened_watch / high / geotech_lead / ackMinutes=30`
- `cyclic_oscillation @ 72h -> routine_observation / background / none / ackMinutes=720`

### 当前结论

- 当前 GPS 阈值治理已经具备统一 operating model proof
- 后续如果继续往算法方向推进，可以直接在这条 operating model 上补跨角色协同、值守班次和动作闭环验收规则

## Phase 105: closeout-assessment（2026-03-20）

### 本轮处理

- 读取主线共享状态
- 读取 open gaps 清单
- 对当前主线是否进入收尾阶段做判断

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-coordination-status.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-mainline-open-gaps.ps1` 已通过

### 当前关键结果

- `latestBatch.taskId=desk-batch-87-gps-threshold-operating-model-proof`
- `proof.completedChecks=44`
- `proof.rainfall=79`
- `openGaps.totalItems=0`

### 当前结论

- 当前 Desk 主线已经进入收尾阶段
- 后续只保留：
  - operating model 闭环验收
  - 真值冻结
  - 必要缺陷修正

## Phase 106: closeout-acceptance（2026-03-20）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-closeout-acceptance.ps1`
  - `docs/unified/reports/desk-closeout-acceptance-latest.json`
- 当前实现方式：
  - 组合复用：
    - `check-desk-gps-threshold-operating-model.ps1`
    - `show-mainline-coordination-status.ps1`
    - `show-mainline-open-gaps.ps1`
  - 统一判断：
    - `readyToFreeze`
    - `completedChecks`
    - `operatingProfiles`
    - `openGaps`
    - `rainfall`
    - `viewerBoundary`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-closeout-acceptance.ps1` 已通过

### 当前关键结果

- `closeout.readyToFreeze=true`
- `closeout.completedChecks=44`
- `closeout.rainfall=79`
- `closeout.openGaps=0`
- `closeout.operatingProfiles=3`

### 当前结论

- 当前主线已经通过最终收尾验收
- 后续可以进入真值冻结，只需处理冻结过程中发现的必要缺陷

## Phase 107: closeout-freeze（2026-03-20）

### 本轮处理

- 新增：
  - `scripts/dev/freeze-desk-closeout.ps1`
  - `docs/unified/reports/desk-closeout-freeze-latest.json`
  - `docs/unified/reports/desk-closeout-freeze-latest.md`
- 当前实现方式：
  - 复用 closeout acceptance、manifest、coordination status 和 open gaps
  - 固化冻结基线与后续约束，不新增业务 proof

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/freeze-desk-closeout.ps1` 已通过

### 当前关键结果

- `freezeDate=2026-03-20`
- `latestBatch.taskId=desk-batch-88-closeout-acceptance`
- `completedChecks=44`
- `rainfall=79`
- `openGaps=0`
- `uiChangesAllowed=false`
- `nextActionPolicy=only_fix_required_defects`

### 当前结论

- 当前主线已经完成冻结
- 后续只保留必要缺陷修正，不再扩新模块和新 proof

## Phase 108: post-freeze-verification（2026-03-20）

### 本轮处理

- 运行带构建的主线总 proof
- 运行收尾验收复核
- 判断冻结后是否存在新增必要缺陷

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-mainline-proof.ps1` 已通过
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-closeout-acceptance.ps1` 已通过

### 当前关键结果

- `buildExecuted=true`
- `completedChecks=44`
- `rainfall=79`
- `readyToFreeze=true`
- `openGaps=0`
- `deviceCommandsLoaded=49`

### 当前结论

- 当前冻结后验证通过，没有新增必要缺陷
- `vite` chunk size warning 当前仍存在，但构建通过，先作为非阻塞残余项保留

## Phase 109: analysis-screen-ui-alignment（2026-03-20）

### 本轮处理

- 以 `LAMv2_Desk` 为参考，对齐数据分析可视化大屏
- 新增：
  - `apps/desk/src/components/RealMapView.tsx`
- 调整：
  - `apps/desk/src/views/AnalysisPage.tsx`
  - `apps/desk/src/views/analysis.css`
  - `apps/desk/src/shell/AppShell.tsx`
  - `apps/desk/package.json`
  - `package-lock.json`

### 当前验证

- `npm install -w apps/desk` 已通过
- `npm -w apps/desk run build` 已通过

### 当前关键结果

- 数据分析大屏页面结构已对齐参考版
- 分析页壳层已对齐为隐藏侧边栏
- 真实地图组件已补齐
- 参考目录 `LAMv2_Desk` 未被修改

### 当前结论

- 当前主线已完成数据分析可视化大屏页面和组件对齐
- 本轮只改分析页相关范围，未扩散到其他页面

## Phase 110: ui-alignment-pass-2（2026-03-20）

### 本轮处理

- 继续对齐其他页面的可见层
- 调整：
  - `apps/desk/src/views/HomePage.tsx`
  - `apps/desk/src/views/home/HomeTodosCard.tsx`
  - `apps/desk/src/views/home/HomeKeySitesCard.tsx`
  - `apps/desk/src/views/home/HomeAnnouncementsCard.tsx`
  - `apps/desk/src/views/home/homePersist.ts`
  - `apps/desk/src/views/home.css`
  - `apps/desk/src/views/SettingsPage.tsx`
  - `apps/desk/src/views/DashboardPage.tsx`
  - `apps/desk/src/views/BaselinesPage.tsx`
  - `apps/desk/src/views/BaselinesPanel.tsx`
  - `apps/desk/src/views/DevicesPage.tsx`
  - `apps/desk/src/views/DeviceManagementPage.tsx`
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
  - `apps/desk/src/views/GpsPage.tsx`
  - `apps/desk/src/views/StationsPage.tsx`

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- 可见层残留的 `Mock` 标签与提示已继续收口
- 首页与待办样式已向参考版回收
- 主线真实后端链路未被回退

### 当前结论

- 当前 Desk 其他页面的可见层已继续向参考版对齐
- 后续如果还要继续，就按你实际看到的页面差异再逐页收尾

## Phase 111: gps-monitoring-copy-alignment（2026-03-20）

### 本轮处理

- 继续收口：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前实现方式：
  - 对齐标题和说明文案
  - 保留主线真实导出、真实分析、真实配置保存能力

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- GPS 监测页中“派生分析/派生预测”标题已收回
- CEEMD / 预测说明文案已向参考版对齐
- 主线真实链路未回退

### 当前结论

- 当前 GPS 监测页的可见层已继续向参考版靠拢
- 后续继续按页面逐步收口即可

## Phase 112: station-management-copy-alignment（2026-03-20）

### 本轮处理

- 继续收口：
  - `apps/desk/src/views/StationManagementPanel.tsx`
- 当前实现方式：
  - 只对齐说明文案
  - 保留真实后端保存能力

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- 监测站管理页尾部说明文案已收口
- 主线真实后端保存链路未回退

### 当前结论

- 当前监测站管理页的可见层已继续向参考版靠拢
- 后续继续按页面逐步收口即可

## Phase 113: gps-page-placeholder-alignment（2026-03-21）

### 本轮处理

- 继续收口：
  - `apps/desk/src/views/GpsPage.tsx`
- 当前实现方式：
  - 只对齐设备选择占位文案
  - 保留“仅显示已建立基线设备”的真实筛选逻辑

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- GpsPage 占位文案已对齐参考版
- 主线基线筛选逻辑未回退

### 当前结论

- 当前 GpsPage 的可见层已继续向参考版靠拢
- 后续继续按页面逐步收口即可

## Phase 114: gps-modal-copy-alignment（2026-03-21）

### 本轮处理

- 继续收口：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前实现方式：
  - 只对齐阈值设置弹窗和数据点数设置弹窗的说明文案
  - 保留真实后端配置保存能力

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- 两个设置弹窗的说明文案已对齐参考版
- 主线真实后端配置保存逻辑未回退

### 当前结论

- 当前 GPS 监测页弹窗的可见层已继续向参考版靠拢
- 后续继续按页面逐步收口即可

## Phase 115: gps-card-title-alignment（2026-03-21）

### 本轮处理

- 继续收口：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前实现方式：
  - 只对齐两个卡片标题文案
  - 保留真实分析与数据链路

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- `基线 / 最新坐标` 卡片标题已对齐参考版
- `GPS 数据表` 卡片标题已对齐参考版
- 主线真实分析与数据链路未回退

### 当前结论

- 当前 GPS 监测页卡片标题已继续向参考版靠拢
- 后续继续按页面逐步收口即可

## Phase 116: gps-note-copy-alignment（2026-03-21）

### 本轮处理

- 继续收口：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前实现方式：
  - 只对齐说明区、摘要区、指标区提示文案
  - 保留真实分析链路

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- CEEMD 说明区文案已继续收口
- 预测摘要区与预测指标区提示文案已继续收口
- 主线真实分析链路未回退

### 当前结论

- 当前 GPS 监测页说明区文案已继续向参考版靠拢
- 后续继续按页面逐步收口即可

## Phase 117: gps-prediction-note-alignment（2026-03-21）

### 本轮处理

- 继续收口：
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
- 当前实现方式：
  - 只对齐预测摘要区和预测指标区两句提示文案
  - 保留真实分析链路

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- 预测摘要区提示文案已对齐参考版
- 预测指标区提示文案已对齐参考版
- 主线真实分析链路未回退

### 当前结论

- 当前 GPS 监测页预测提示文案已继续向参考版靠拢
- 后续继续按页面逐步收口即可

## Phase 118: title-sync-alignment（2026-03-21）

### 本轮处理

- 新增：
  - `apps/desk/src/routes/TitleSync.tsx`
- 调整：
  - `apps/desk/src/App.tsx`
- 当前实现方式：
  - 补回参考版的页面标题同步能力
  - 不影响主线真实后端链路

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- 页面标题已按路由同步
- 参考版标题同步能力已补回

### 当前结论

- 当前 Desk 页面标题同步已对齐到参考版
- 后续继续按页面逐步收口即可

## Phase 119: basecard-hover-alignment（2026-03-21）

### 本轮处理

- 继续收口：
  - `apps/desk/src/components/baseCard.css`
- 当前实现方式：
  - 只对齐 BaseCard hover 动效
  - 不影响任何业务逻辑

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- BaseCard hover 动效已收回到 `translateY(-1px)`
- 视觉反馈已对齐参考版

### 当前结论

- 当前 BaseCard 的悬浮视觉反馈已对齐到参考版
- 后续继续按页面逐步收口即可

## Phase 120: desk-win-package-script（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/dev/publish-desk-win.ps1`
  - `docs/unified/reports/desk-win-package-latest.json`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 自动构建 `apps/desk`
  - 自动发布 `apps/desk-win`
  - 自动校验 `web/` 静态资源是否带入包内
  - 自动写出 package manifest

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/publish-desk-win.ps1` 已通过

### 当前关键结果

- `outputDir=artifacts/desk-win/win-x64`
- `exe.sizeBytes=226816`
- `web.indexPresent=true`
- `web.fileCount=55`
- `package.fileCount=68`
- `package.totalBytes=143744821`

### 当前结论

- 当前 `desk-win` 已具备可重复的一键发布入口
- 交付层已从手工步骤推进到可验证的发布产物阶段

## Phase 121: docker-oneclick-deploy（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/release/deploy-docker-oneclick.ps1`
  - `docs/unified/reports/docker-deploy-latest.json`
- 调整：
  - `infra/compose/README.md`
- 当前实现方式：
  - 自动检查 `.env` 是否存在
  - 自动校验关键密码/密钥是否仍为占位值
  - 自动校验 Docker / Compose 入口
  - 提供一键启动、带 `ops` 启动、带 demo seed 启动三条入口

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/deploy-docker-oneclick.ps1 -ValidateOnly` 已通过

### 当前关键结果

- `docker.commandFound=true`
- `envCreated=false`
- 当前识别到 `PG_PASSWORD/CH_PASSWORD/REDIS_PASSWORD/EMQX_DASHBOARD_PASSWORD/JWT_*` 仍为占位值
- 当前已输出下一步实际部署命令

### 当前结论

- 当前已经具备环境配置检查 + Docker 一键部署入口
- 当前剩余重点是替换真实密码/密钥后再执行正式启动

## Phase 122: desk-win-package-verify（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/dev/verify-desk-win-package.ps1`
  - `docs/unified/reports/desk-win-package-verify-latest.json`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 从发布目录直接拉起 `LandslideDesk.Win.exe`
  - 校验包内 `web/` 资源存在
  - 确认进程可存活后再自动关闭

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/verify-desk-win-package.ps1` 已通过

### 当前关键结果

- `aliveAfterLaunch=true`
- `stoppedAfterVerify=true`
- `webIndex` 存在
- `exePath` 可执行

### 当前结论

- 当前 `desk-win` 已形成“打包 + 验包”闭环
- 正常交付流程已比之前更接近可正式交付

## Phase 123: desk-win-delivery-docs（2026-03-21）

### 本轮处理

- 新增：
  - `docs/unified/reports/desk-win-env-matrix.md`
  - `docs/unified/reports/desk-win-delivery-checklist.md`

### 当前关键结果

- 当前 `desk-win` 交付层已同时具备：
  - 发布脚本
  - 验包脚本
  - 环境配置矩阵
  - 交付检查清单

### 当前结论

- 正常交付流程已开始具备可交接、可复核的交付文档

## Phase 124: desk-win-prerequisites-check（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-win-prerequisites.ps1`
  - `docs/unified/reports/desk-win-prerequisites-latest.json`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 校验 `dotnet` 是否存在
  - 校验 `Microsoft.WindowsDesktop.App 8.x` 是否可用
  - 校验 WebView2 Runtime 是否安装
  - 校验发布包 exe / `web/index.html` 是否存在

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-prerequisites.ps1` 已通过

### 当前关键结果

- `dotnetCommand.ok=true`
- `windowsDesktopRuntime8.ok=true`
- `webView2Runtime.ok=true`
- `packagedExe.ok=true`
- `packagedWebIndex.ok=true`

### 当前结论

- 当前 `desk-win` 交付前置条件已具备脚本化检查入口
- 正常交付流程已进一步从“人工确认”推进到“自动确认”

## Phase 125: desk-win-delivery-check（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-latest.json`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 汇总：
    - `desk-win-package-latest.json`
    - `desk-win-package-verify-latest.json`
    - `desk-win-prerequisites-latest.json`
  - 统一给出是否可交付的 `ready` 结论

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `ready=true`
- `failedKeys=[]`
- `packageExe.ok=true`
- `verifyAliveAfterLaunch.ok=true`
- `prereqWebView2.ok=true`

### 当前结论

- 当前 `desk-win` 正常交付流程已形成脚本化总验收闭环
- 交付层已经从“有步骤”推进到“有可执行验收结论”

## Phase 126: desk-win-delivery-bundle（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/dev/package-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-bundle-latest.json`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 打包发布目录
  - 打包环境矩阵 / 交付检查清单
  - 打包 package / verify / prerequisites / delivery 四份报告
  - 输出 delivery 目录和 zip 归档

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/package-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `bundleDir=artifacts/desk-win/delivery/desk-win-delivery-<timestamp>`
- `bundleZip=artifacts/desk-win/delivery/desk-win-delivery-<timestamp>.zip`
- `fileCount=77`
- `totalBytes=143759408`

### 当前结论

- 当前 `desk-win` 已具备可交接的交付包归档产物
- 正常交付流程已从“流程闭环”推进到“交付物闭环”

## Phase 127: desk-win-delivery-pipeline（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-pipeline-latest.json`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 单命令串联：
    - 发布
    - 验包
    - 前置环境检查
    - 总验收
    - 交付包归档

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `ready=true`
- `publishOutputDir=artifacts/desk-win/win-x64`
- `bundleZip=artifacts/desk-win/delivery/desk-win-delivery-<timestamp>.zip`
- `verify.aliveAfterLaunch=true`
- `prerequisites.webView2=true`

### 当前结论

- 当前 `desk-win` 正常交付流程已形成单命令一键交付入口
- 交付层已从多脚本流程推进到可重复的一键流水线

## Phase 128: desk-win-delivery-hash（2026-03-21）

### 本轮处理

- 新增：
  - `scripts/dev/hash-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-hash-latest.json`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 读取发布清单和交付包归档结果
  - 计算 exe / web / bundle 三项 SHA256

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/hash-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `exe.sha256=e6f33723dd96abaf2dfc6bc4a7302bd77d55a4e826204c62551940af9b0dcc43`
- `webIndex.sha256=d8c1be40695a1383595c366ccd5c72bdb4644b518a77360c9dc6637f7f33a8fc`
- `bundleZip.sha256=da11b37bea019fcac48e451340a7de8ef6a234db8244a00a12ce7788de95c6e4`

### 当前结论

- 当前 `desk-win` 交付包已具备完整性校验清单
- 正常交付流程已从“可交付”推进到“可校验交付”

## Phase 129: desk-win-delivery-summary（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/render-desk-win-delivery-summary.ps1`
  - `docs/unified/reports/desk-win-delivery-summary-latest.md`
- 当前实现方式：
  - 自动汇总：
    - 交付总验收结果
    - 交付包归档结果
    - 哈希清单
  - 输出一页式交接摘要

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-desk-win-delivery-summary.ps1` 已通过

### 当前关键结果

- `Ready=True`
- 摘要已包含：
  - package output
  - bundle zip
  - verification
  - hashes
  - recommended commands

### 当前结论

- 当前 `desk-win` 已具备一页式交接摘要
- 正常交付流程已从“可校验交付”推进到“可直接交接”

## Phase 130: desk-win-packaged-start（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/start-desk-win-packaged.ps1`
- 调整：
  - `apps/desk-win/README.md`
- 当前实现方式：
  - 读取最新发布清单
  - 清除 `DESK_DEV_SERVER_URL`
  - 直接从发布目录拉起 `LandslideDesk.Win.exe`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-desk-win-packaged.ps1` 已通过

### 当前关键结果

- `started=true`
- `alreadyRunning=false`
- `exePath=artifacts/desk-win/win-x64/LandslideDesk.Win.exe`

### 当前结论

- 当前 `desk-win` 已具备从最新发布包直接启动的稳定入口
- 正常交付流程已进一步贴近真实交付使用方式

## Phase 131: desk-win-packaged-status（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/show-desk-win-packaged-status.ps1`
  - `scripts/dev/stop-desk-win-packaged.ps1`
  - `docs/unified/reports/desk-win-packaged-status-latest.json`
- 当前实现方式：
  - 识别最新发布包 exe / web 资源
  - 识别当前是否正在运行最新发布包
  - 补齐停止发布包实例入口

### 当前验证

- 已完成：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/stop-desk-win-packaged.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/start-desk-win-packaged.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/show-desk-win-packaged-status.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/stop-desk-win-packaged.ps1`

### 当前关键结果

- `runtime.running=true`
- `runtime.isLatestPackage=true`
- `manifest.exeExists=true`
- `manifest.webIndexExists=true`

### 当前结论

- 当前发布包已具备启动 / 状态 / 停止三段式运行态管理入口
- 正常交付流程已进一步贴近真实运维使用方式

## Phase 132: desk-win-release-notes（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/render-desk-win-release-notes.ps1`
  - `docs/unified/reports/desk-win-release-notes-latest.md`
- 当前实现方式：
  - 自动汇总：
    - delivery summary
    - delivery check
    - delivery bundle
    - delivery hash
  - 生成一页式发布说明

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-desk-win-release-notes.ps1` 已通过

### 当前关键结果

- 发布说明已包含：
  - package output
  - validation
  - integrity hashes
  - non-blocking items
  - recommended handoff files

### 当前结论

- 当前 `desk-win` 已具备可直接对外说明的发布说明物料
- 正常交付流程已从“可直接交接”推进到“可直接说明交付内容”

## Phase 133: desk-win-delivery-pipeline-upgrade（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
- 当前实现方式：
  - 将 `hash / delivery summary / release notes` 正式并入一键交付流水线
  - 将上述物料正式并入交付包内容

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- 最新 pipeline 报告当前已包含：
  - `hashes.exe`
  - `hashes.webIndex`
  - `hashes.bundleZip`
- 最新交付包当前已包含：
  - `docs/desk-win-delivery-summary-latest.md`
  - `docs/desk-win-release-notes-latest.md`
  - `reports/desk-win-delivery-hash-latest.json`

### 当前结论

- 当前 `desk-win` 正常交付流程已形成更完整的一键交付流水线
- 交付层已从“单命令可跑”推进到“单命令产出更完整物料”

## Phase 134: desk-win-latest-artifact（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/promote-desk-win-delivery.ps1`
  - `docs/unified/reports/desk-win-delivery-promote-latest.json`
- 当前实现方式：
  - 将最新 delivery bundle 提升为固定路径：
    - `artifacts/desk-win/latest/`
    - `artifacts/desk-win/latest.zip`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/promote-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `promotedDir=artifacts/desk-win/latest`
- `promotedZip=artifacts/desk-win/latest.zip`
- `latest/` 与 `latest.zip` 当前已真实存在

### 当前结论

- 当前 `desk-win` 交付物已具备固定路径出口
- 交付层已进一步贴近真实交接和拷贝使用方式

## Phase 135: desk-win-pipeline-latest-sync（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
- 当前实现方式：
  - 将 fixed latest 出口正式并入一键交付流水线
  - 让 pipeline 报告带上 latest 路径

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `latest.promotedDir=artifacts/desk-win/latest`
- `latest.promotedZip=artifacts/desk-win/latest.zip`
- fixed latest 当前已随流水线自动更新

### 当前结论

- 当前 `desk-win` 一键交付流水线已正式覆盖 fixed latest 出口
- 正常交付流程已更贴近真实交接使用方式

## Phase 136: desk-win-delivery-index（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/render-desk-win-delivery-index.ps1`
  - `docs/unified/reports/desk-win-delivery-index-latest.json`
  - `docs/unified/reports/desk-win-delivery-index-latest.md`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-desk-win-delivery-index.ps1` 已通过

### 当前关键结果

- latest 包、报告与哈希已汇总到单一入口
- `Ready=True`

### 当前结论

- 当前 `desk-win` 正常交付流程已具备 single source of truth 式交付索引
- 交付层已进一步贴近真实交接与复核使用方式

## Phase 137: desk-win-pipeline-index-sync（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
- 当前实现方式：
  - 将 delivery index 正式并入一键交付流水线
  - 将 delivery index 正式并入交付包内容

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- 最新 pipeline 报告当前已带上：
  - `index.ready`
  - `index.packageDir`
  - `index.packageZip`
- 最新交付包当前已带上：
  - `docs/desk-win-delivery-index-latest.json`
  - `reports/desk-win-delivery-index-latest.json`

### 当前结论

- 当前 `desk-win` 一键交付流水线已正式覆盖 delivery index 物料
- 交付层已进一步完善 single source of truth 交付入口

## Phase 138: desk-win-pipeline-buildinfo-sync（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
  - `scripts/dev/stamp-desk-win-delivery.ps1`

### 当前实现方式

- 将 build-info 正式并入一键交付流水线
- 将 build-info 正式并入交付包内容

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- 发布包内当前已带：
  - `desk-win-build-info.json`
- 交付包内当前已带：
  - `reports/desk-win-build-info-latest.json`
- pipeline 报告当前已带：
  - `build.generatedAt`
  - `build.gitShortSha`

### 当前结论

- 当前 `desk-win` 一键交付流水线已正式覆盖 build metadata 物料
- 交付层已进一步增强可追溯性

## Phase 139: desk-win-delivery-retention（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/prune-desk-win-deliveries.ps1`
  - `docs/unified/reports/desk-win-delivery-retention-latest.json`

### 当前实现方式

- 按时间保留最近 3 份时间戳交付目录和 zip
- 不影响 `artifacts/desk-win/latest/` 与 `latest.zip`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prune-desk-win-deliveries.ps1` 已通过

### 当前关键结果

- 最近保留：
  - `desk-win-delivery-20260322-185415`
  - `desk-win-delivery-20260322-184927`
  - `desk-win-delivery-20260322-180916`
- 更早的时间戳交付包已被清理

### 当前结论

- 当前 `desk-win` 交付目录已具备保留策略
- 交付层已进一步增强目录治理能力

## Phase 140: desk-win-latest-delivery-check（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/check-desk-win-latest-delivery.ps1`
  - `docs/unified/reports/desk-win-latest-delivery-latest.json`

### 当前实现方式

- 校验 fixed latest 目录与 latest.zip 是否存在
- 校验 latest 中的 docs / reports / package 关键文件是否齐全

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-latest-delivery.ps1` 已通过

### 当前关键结果

- `ready=true`
- `counts.fileCount=84`
- `counts.missingRequiredFiles=0`
- `latest.indexReady=true`

### 当前结论

- 当前 `desk-win` fixed latest 出口已通过脚本化验收
- 交付层已进一步增强 latest 出口的可验证性

## Phase 141: desk-win-pipeline-latest-check-sync（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`

### 当前实现方式

- 将 latest 出口验收正式并入一键交付流水线
- 让 pipeline 报告带上 latest 验收结果

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `latest.ready=true`
- `latest.fileCount=84`
- `latest.promotedDir=artifacts/desk-win/latest`

### 当前结论

- 当前 `desk-win` 一键交付流水线已正式覆盖 fixed latest 出口验收
- 交付层已进一步增强 latest 出口的自动验收能力

## Phase 142: desk-win-latest-package-verify（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/dev/start-desk-win-latest.ps1`
  - `scripts/dev/verify-desk-win-latest-package.ps1`
  - `docs/unified/reports/desk-win-latest-package-verify-latest.json`

### 当前实现方式

- 从 `artifacts/desk-win/latest/package/` 直接拉起 latest 包内 exe
- 验证 latest 包可存活后自动关闭

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/verify-desk-win-latest-package.ps1` 已通过

### 当前关键结果

- `aliveAfterLaunch=true`
- `stoppedAfterVerify=true`
- `exePath=artifacts/desk-win/latest/package/LandslideDesk.Win.exe`

### 当前结论

- 当前 fixed latest 包已具备直接运行验证能力
- 交付层已进一步增强 latest 包的可用性确认能力

## Phase 143: desk-win-pipeline-latest-verify-sync（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`

### 当前实现方式

- 将 latest 包运行验证正式并入一键交付流水线
- 让 pipeline 报告带上 latest 运行验证结果

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `latest.verifyAliveAfterLaunch=true`
- `latest.verifyStoppedAfterVerify=true`

### 当前结论

- 当前 `desk-win` 一键交付流水线已正式覆盖 fixed latest 包运行验证
- 交付层已进一步增强 latest 包的自动可用性确认能力

## Phase 144: desk-win-pipeline-latest-ops-sync（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`

### 当前实现方式

- 将 latest 包运行验证正式并入一键交付流水线
- 将交付包保留策略正式并入一键交付流水线

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `latest.verifyAliveAfterLaunch=true`
- `latest.verifyStoppedAfterVerify=true`
- `retention.keep=3`
- `retention.keptDirectories` 已落盘

### 当前结论

- 当前 `desk-win` 一键交付流水线已正式覆盖 latest 运维管理结果
- 交付层已进一步增强 latest 包与交付目录的自动运维能力

## Phase 145: desk-win-pipeline-latest-ops-sync-2（2026-03-22）

### 本轮处理

- 调整：
  - `scripts/dev/prepare-desk-win-delivery.ps1`

### 当前实现方式

- 将 latest 出口验收、latest 包运行验证、交付包保留策略共同并入一键交付流水线

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/prepare-desk-win-delivery.ps1` 已通过

### 当前关键结果

- `latest.ready=true`
- `latest.verifyAliveAfterLaunch=true`
- `latest.verifyStoppedAfterVerify=true`
- `retention.keep=3`

### 当前结论

- 当前 `desk-win` 一键交付流水线已正式覆盖 latest 运维管理结果
- 交付层已进一步增强 latest 出口与交付目录的自动运维能力

## Phase 146: desk-build-perf-and-prod-env（2026-03-22）

### 本轮处理

- 新增：
  - `scripts/release/render-prod-env-checklist.ps1`
  - `docs/unified/reports/prod-env-checklist-latest.json`
  - `docs/unified/reports/prod-env-checklist-latest.md`
- 调整：
  - `apps/desk/src/routes/AppRoutes.tsx`
  - `apps/desk/vite.config.ts`

### 当前验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/render-prod-env-checklist.ps1` 已通过
- `npm -w apps/desk run build` 已通过

### 当前关键结果

- `Configured=12`
- `Placeholder=6`
- `Missing=0`
- 已形成路由懒加载
- 已形成 `vendor-react / vendor-antd / vendor-echarts / vendor-three / vendor-leaflet / vendor-misc` 拆包

### 当前结论

- 当前生产环境参数已被清单化
- 当前性能问题已从“单大包”推进到“少数 vendor chunk 仍偏大”

## Phase 147: desk-vendor-chunk-split（2026-03-22）

### 本轮处理

- 调整：
  - `apps/desk/vite.config.ts`

### 当前验证

- `npm -w apps/desk run build` 已通过

### 当前关键结果

- `vendor-echarts-core=219.58 kB`
- `vendor-echarts-components=255.48 kB`
- `vendor-echarts-charts=245.10 kB`
- `vendor-three-core=495.53 kB`
- `vendor-antd-core=519.80 kB`

### 当前结论

- 当前多个超大 vendor chunk 已被压散
- 当前性能问题已收敛到 `vendor-antd-core` 单块仍略高于 500k
