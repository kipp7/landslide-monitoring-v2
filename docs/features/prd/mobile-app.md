# PRD：移动端 App（Flutter，v2）

## 1. 背景

移动端用于现场巡检与告警处理，解决“只能在 PC 端看数据/处理告警”带来的响应延迟。移动端必须**不依赖数据库**，只依赖 v2 API 契约（OpenAPI）。

## 2. 目标

- 支持账号登录、设备/站点查看、告警处理（ACK/RESOLVE）。
- 支持“现场快速判断”：设备在线状态、关键传感器最新值、趋势图（短时间范围）。
- 支持离线/弱网：至少能浏览最近一次缓存的数据与告警列表（只读）。
- 与 Web 一致：所有传感器显示名/单位/枚举等来自后端字典（`/sensors`），禁止硬编码。

## 3. 非目标（v2 首期）

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

### 5.6 设备控制（可选）

- 下发命令：`POST /devices/{deviceId}/commands`

约束：

- App 只提供“有限集合的标准命令”（见 `integrations/firmware/ota-and-config.md`），禁止自由输入任意 JSON（避免误操作）。

### 5.7 扫码（可选但推荐）

用途：现场快速打开设备/站点/告警详情页面。

规范：

- 二维码内容必须是 `lsm://v2/...`（不允许包含 `device_secret`）
- 技术选型与内容规范：`docs/features/flutter/qr-scanning.md`

## 6. 非功能需求（NFR）

- 稳定性：弱网不崩溃；请求失败必须可重试并显示错误原因。
- 兼容性：Android 优先（可选 iOS），但接口与数据结构必须完全契约化（OpenAPI）。
- 可观测性：客户端必须输出最少可用日志（不包含 token/secret），便于排查现场问题。

## 7. 验收标准

- App 完成登录与退出；可正确展示当前用户信息与权限列表。
- App 可浏览站点/设备列表，并能展示设备最新状态与指定传感器的 1h 曲线。
- App 可对告警执行 ACK 与 RESOLVE，且后端可在事件流中看到对应事件。
- App 全程无硬编码传感器 key/单位/阈值，新增传感器无需改 App 代码即可展示。
- App 扫码可直接打开设备详情（扫码内容为 `lsm://v2/device/{deviceId}`），并能正确处理 404/无权限。

## 8. 依赖与引用

- API 契约：`docs/integrations/api/openapi.yaml`
- 前端组件规范（同样适用于 App 的“禁止硬编码”原则）：`docs/guides/standards/frontend-components.md`
- 安全：`docs/features/prd/security-and-access-control.md`
- 设备命令：`docs/features/prd/device-commands.md`

## 9. 框架与技术栈（冻结建议）

> 你前面提到的“App 用什么框架/技术栈”，这里给出 v2 的冻结建议，避免实现阶段选型反复。

- 框架：Flutter 3.x
- 状态管理：Bloc + `flutter_bloc`
- 路由：`go_router`
- 网络：`dio`（统一拦截器/错误映射/traceId 日志）
- 存储：
  - `flutter_secure_storage`：token 等敏感信息
  - `shared_preferences`：轻量配置
  - `hive`：结构化缓存（列表/详情/最近曲线），支持离线只读
- 图表：`fl_chart`（封装成通用 chart 容器组件）
- 扫码（可选）：`mobile_scanner`（详见 `docs/features/flutter/qr-scanning.md`）

架构约束入口：

- `docs/features/flutter/app-architecture.md`
