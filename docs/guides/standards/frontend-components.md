# 前端公共组件与通用组件规范（必须遵守）

目标：组件可复用、可测试、可替换；避免“页面里写死业务规则/字段映射”导致后续重构成本爆炸。

## 1. 分层与目录建议（实现阶段）

推荐三层组件：

- `components/ui/`：纯 UI（按钮、表格、弹窗、图表容器），**不做数据请求**，不包含业务字段名
- `components/domain/`：领域组件（告警列表、设备详情卡、曲线面板），只依赖 API DTO，不依赖 DB
- `pages/*` 或 `app/*`：路由页面，只做组合与布局

## 2. 数据获取与状态

- 数据请求必须集中在 `lib/api/` 或 hooks（如 `hooks/useDevices()`），组件不直接调用数据库 SDK。
- 所有组件必须显式处理：
  - loading（骨架屏或占位）
  - empty（无数据）
  - error（统一错误提示）

## 3. 禁止硬编码（核心红线）

- 禁止在前端硬编码：
  - 设备列表、站点坐标、图例名称、传感器 key、阈值/告警规则
- 这些必须来自后端：
  - 站点/设备元数据：API `/stations`、`/devices`
  - 传感器字典：API `/sensors`
  - 规则与告警：API `/alert-rules`、`/alerts`

## 4. 类型与命名

- DTO 类型必须与 OpenAPI 保持一致（建议未来由 `openapi.yaml` 生成）。
- `sensorKey` 永远使用 `snake_case`，不做前端二次映射。
- 时间统一用 UTC；展示层才做本地化显示。

## 5. 组件 API（Props）规范

- Props 必须最小化、可组合：
  - 只接收 `id` 或完整 DTO，不要接收一堆平铺字段
  - `onAction` 统一用 `{ type, payload }` 或明确的回调签名
- 禁止把“样式配置 + 业务逻辑”混在一起；样式用主题变量/Design Token（实现阶段）。

## 6. 图表/曲线组件规范（强制）

目标：曲线组件可复用，且能在“新增传感器/新增指标”时无需改前端代码。

- 图表组件不得依赖固定字段名（例如 `displacement_mm` 写死在组件里）
- 图表必须通过 `sensorKey + sensors 字典` 动态渲染：
  - 显示名、单位、数据类型来自 `/sensors`
  - 颜色/阈值/基线来自后端配置（站点/设备 metadata 或规则）
- 统一输入：曲线组件只接受 `DeviceSeriesResponse`（或其等价 DTO），不接受“拼装后的数组”

建议公共组件：

- `DeviceSeriesChart`：按 `sensorKey` 渲染多条曲线（统一 legend/tooltip）
- `SensorSelector`：从 `/sensors` + 设备已声明 sensors 生成候选项
- `TimeRangePicker`：统一时间范围选择（UTC 输入/本地展示）

## 7. 表单与校验（强制）

- 表单输入必须做前端校验（必填、类型、范围），但不能替代后端校验
- 与 API 交互的表单必须能回显服务端错误（字段级别错误提示）
- 规则编辑器（Rule DSL）必须以 DSL JSON 为唯一状态，不允许把 DSL 拆成散落状态导致提交时丢字段
