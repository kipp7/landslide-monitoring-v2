# Flutter App 架构与技术栈（v2）

本文件用于约束 App 的工程形态，确保：

- App **只依赖 API 契约**（OpenAPI），不依赖数据库/后端实现细节
- App **不硬编码**传感器/阈值/设备字段映射（来自 `/sensors` 与配置）
- App 能在弱网/离线情况下稳定工作（至少只读缓存）

## 1. 技术栈（建议冻结）

- Flutter：3.x
- 状态管理：Bloc + `flutter_bloc`
- 路由：`go_router`
- 网络：`dio`（统一拦截器、错误转换、traceId 打印）
- 本地缓存：
  - 轻量配置：`shared_preferences`
  - 结构化缓存：`hive`（缓存列表/详情/最近曲线，支持离线只读）
  - 安全存储：`flutter_secure_storage`（token 等敏感信息）
- 图表：`fl_chart`（或实现阶段替换为更合适方案，但需统一封装）
- 扫码（可选）：见 `docs/features/flutter/qr-scanning.md`

> 备注：如果未来引入 OpenAPI DTO 生成，则网络层与 model 层应统一改为“生成 DTO + 手写 ViewModel”，避免双份模型漂移。

## 2. 推荐目录结构（实现阶段）

```
lib/
  main.dart
  app.dart

  core/                    # 框架层：不包含业务
    api/                   # dio client / interceptor / error mapping
    storage/               # cache + secure storage
    utils/                 # time/format/validator/log

  data/                    # 数据层：DTO/Repository（只依赖 API）
    dto/                   # （推荐）由 OpenAPI 生成或手写对齐
    repositories/          # auth/device/data/alert 等

  features/                # 业务模块：UI + Bloc
    auth/
    home/
    stations/
    devices/
    monitoring/
    alerts/
    settings/

  shared/                  # 可复用组件（loading/empty/error/chart 容器）
    widgets/
    theme/

  routes/
    app_router.dart
```

## 3. 分层约束（必须遵守）

### 3.1 UI 层（Widgets/Pages）

- 不允许直接调用 dio
- 不允许硬编码传感器 key、单位、阈值
- 必须显式处理 loading/empty/error

### 3.2 Bloc 层

- 只做状态机与事件编排，不直接处理 JSON/字符串解析
- 所有副作用（网络/缓存）通过 Repository 注入

### 3.3 Repository 层

- 统一对齐 `docs/integrations/api/openapi.yaml`
- 错误必须转换为可展示的统一错误结构（带 traceId）
- 重要读接口必须做缓存（离线只读）

## 4. 与 v2 契约的闭环

App 端闭环定义：

- 所有数据来源都可追溯到 `docs/integrations/api/*` 中的某个接口
- `/sensors` 字典能驱动页面渲染（新增传感器无需改 App 代码即可展示）
- 告警处理动作（ACK/RESOLVE）写入事件流，App 能读回并展示结果

相关引用：

- App PRD：`docs/features/prd/mobile-app.md`
- API 契约：`docs/integrations/api/openapi.yaml`
- 前端/组件规范（同样适用于 App）：`docs/guides/standards/frontend-components.md`

