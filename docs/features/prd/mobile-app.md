# PRD：移动端 App（Flutter，v2）

## 1. 背景

移动端用于现场巡检与告警处理，解决“只能在 PC 端看数据/处理告警”带来的响应延迟。移动端必须**不依赖数据库**，只依赖 v2 API 契约（OpenAPI）。

## 2. 目标

- 首期聚焦 Android 端交付（iOS 作为后续扩展）。
- 支持账号登录、设备/站点查看、告警处理（ACK/RESOLVE）。
- 支持“现场快速判断”：设备在线状态、关键传感器最新值、趋势图（短时间范围）。
- 弱网可用：请求失败可重试并提示；离线不作为 v1 强制能力（可选展示最近一次成功数据）。
- 与 Web 一致：所有传感器显示名/单位/枚举等来自后端字典（`/sensors`），禁止硬编码。

## 3. 非目标（v2 首期）

- iOS 端交付与离线编辑不纳入 v1。
- 不要求完整 OTA 管理（可由运维/后端后续补齐）。
- 不要求在 App 端编辑复杂 Rule DSL（首期以查看/启停为主，编辑可后续迭代）。
- 不强制实现推送（Push）体系（可先用轮询/SSE，后续再引入 FCM/HMS）。

## 4. 用户与场景

- 现场运维人员：查看站点/设备在线情况、确认告警、记录处理备注。
- 管理员：快速查看系统状态与趋势，辅助决策。

## 5. 功能需求（按模块）

### 5.1 认证与权限

- 登录：`POST /auth/login`
- Token 刷新：`POST /auth/refresh`
- 当前用户：`GET /auth/me`
- 修改密码：`PUT /auth/password`

约束：

- Token 缓存必须加密存储（移动端安全要求，见 `security-and-access-control.md`）。
- App UI 必须基于权限控制（permissions）显示/隐藏入口。

### 5.2 首页/概览

- 仪表盘汇总：`GET /dashboard`
- 系统状态（可选）：`GET /system/status`

### 5.3 站点与设备

- 站点列表/详情：`GET /stations`、`GET /stations/{stationId}`
- 设备列表/详情：`GET /devices`、`GET /devices/{deviceId}`
- 设备传感器字典：`GET /sensors`
- 设备最新状态：`GET /data/state/{deviceId}`

展示约束：

- `sensorKey` 直接使用后端返回，不允许在 App 端做二次映射。
- 单位/显示名从 `/sensors` 获取，缺失时以兜底规则显示（例如显示 `sensorKey`）。

### 5.4 趋势与历史

- 曲线查询：`GET /data/series/{deviceId}`
- 原始点查询（调试）：`GET /data/raw/{deviceId}`（默认不展示入口，仅调试模式可用）

性能约束（单机适配）：

- App 默认 interval 使用 `1m/5m`，避免一次拉取海量 raw 点。
- App 必须限制单次查询范围（UI 限制），与后端上限一致。

### 5.5 告警

- 告警列表：`GET /alerts`
- 告警事件流：`GET /alerts/{alertId}/events`
- ACK：`POST /alerts/{alertId}/ack`
- RESOLVE：`POST /alerts/{alertId}/resolve`

交互约束：

- ACK/RESOLVE 必须要求填写（或可选）备注，且必须可审计（后端写 operation logs）。

### 5.6 地图（站点地图）

- 站点地图：`GET /stations`（使用 `latitude/longitude`）
- 站点标注：显示站点名称、状态、风险区（来自 `metadata`）
- 交互：点击标注进入站点详情/设备列表

约束：

- 地图仅展示站点级别（不做设备点位图）。
- 地图 SDK 采用国内方案（高德地图）。

### 5.7 设备控制（可选）

- 下发命令：`POST /devices/{deviceId}/commands`

约束：

- App 只提供“有限集合的标准命令”（见 `integrations/firmware/ota-and-config.md`），禁止自由输入任意 JSON（避免误操作）。

### 5.8 扫码（可选但推荐）

用途：现场快速打开设备/站点/告警详情页面。

规范：

- 二维码内容必须是 `lsm://v2/...`（不允许包含 `device_secret`）
- 技术选型与内容规范：`docs/features/flutter/qr-scanning.md`

### 5.9 巡查上报与 SOS

- 巡查上报（巡查人员）：`GET /patrol/reports`、`POST /patrol/reports`、`GET /patrol/reports/{reportId}`
- SOS 求助（公众版）：`POST /sos`、`GET /sos/{sosId}`

约束：

- 巡查上报允许不绑定 `stationId`（现场快速记录）
- SOS 必须包含经纬度与优先级，描述与联系方式可选

## 6. 非功能需求（NFR）

- 稳定性：弱网不崩溃；请求失败必须可重试并显示错误原因。
- 兼容性：Android 优先（可选 iOS），但接口与数据结构必须完全契约化（OpenAPI）。
- 兜底：允许保留最近一次成功数据（列表/详情/趋势）以避免空白页。
- 可观测性：客户端必须输出最少可用日志（不包含 token/secret），便于排查现场问题。

## 7. 验收标准

- App 完成登录与退出；可正确展示当前用户信息与权限列表。
- App 可浏览站点/设备列表，并能展示设备最新状态与指定传感器的 1h 曲线。
- App 可对告警执行 ACK 与 RESOLVE，且后端可在事件流中看到对应事件。
- App 全程无硬编码传感器 key/单位/阈值，新增传感器无需改 App 代码即可展示。
- App 可展示站点地图并可点击进入站点详情。
- App 扫码可直接打开设备详情（扫码内容为 `lsm://v2/device/{deviceId}`），并能正确处理 404/无权限（如启用扫码）。

## 8. 依赖与引用

- API 契约：`docs/integrations/api/openapi.yaml`
- 前端组件规范（同样适用于 App 的“禁止硬编码”原则）：`docs/guides/standards/frontend-components.md`
- 安全：`docs/features/prd/security-and-access-control.md`
- 设备命令：`docs/features/prd/device-commands.md`

## 9. 框架与技术栈（冻结建议）

> 你前面提到的“App 用什么框架/技术栈”，这里给出 v2 的冻结建议，避免实现阶段选型反复。

- 平台：Android（v1），iOS 后续评估。
- 框架：Flutter 3.x
- 状态管理：Bloc + `flutter_bloc`
- 路由：`go_router`
- 网络：`dio`（统一拦截器/错误映射/traceId 日志）
- 存储：
  - `flutter_secure_storage`：token 等敏感信息
  - `shared_preferences`：轻量配置
  - `hive`：结构化缓存（列表/详情/最近曲线）
- 图表：`fl_chart`（封装成通用 chart 容器组件）
- 地图：高德瓦片（flutter_map，国内方案）
- 扫码（可选）：`mobile_scanner`（详见 `docs/features/flutter/qr-scanning.md`）
  - Key 注入：运行时使用 `--dart-define=AMAP_ANDROID_KEY=...`

架构约束入口：

- `docs/features/flutter/app-architecture.md`
