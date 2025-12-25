# Flutter App 架构与技术栈（v2）

本文件用于约束 App 的工程形态，确保：

- App **只依赖 API 契约**（OpenAPI），不依赖数据库/后端实现细节
- App **不硬编码**传感器/阈值/设备字段映射（来自 `/sensors` 与配置）
- App 能在弱网情况下稳定工作（不强制离线，仅保留最近一次成功缓存作为兜底）

## 1. 技术栈（建议冻结）

- 平台：Android（v1），iOS 后续评估
- Flutter：3.x
- 状态管理：Bloc + `flutter_bloc`
- 路由：`go_router`
- 网络：`dio`（统一拦截器、错误转换、traceId 打印）
- 本地缓存：
  - 轻量配置：`shared_preferences`
  - 结构化缓存：`hive`（缓存列表/详情/最近曲线）
  - 安全存储：`flutter_secure_storage`（token 等敏感信息）
- 图表：`fl_chart`（或实现阶段替换为更合适方案，但需统一封装）
- 地图：flutter_map + 高德瓦片（国内方案）
- 扫码（可选）：见 `docs/features/flutter/qr-scanning.md`

> 备注：如果未来引入 OpenAPI DTO 生成，则网络层与 model 层应统一改为“生成 DTO + 手写 ViewModel”，避免双份模型漂移。

### 1.1 可靠性与兜底（必做）

- 只对幂等读请求做重试（指数退避），避免写请求重复提交。
- 网络统一超时（连接/读写分开设置），失败要给出可理解提示。
- 重要列表/详情保留“最后一次成功结果”，避免空白页。
- 错误统一映射并展示 `traceId`，便于后端排查。
- 地图 SDK 统一封装为 MapAdapter，便于未来切换供应商。
- 地图 Key 通过 `--dart-define=AMAP_ANDROID_KEY=...` 注入，禁止写死。

### 1.2 兼容性原则（必遵守）

- 优先选择纯 Dart 组件，避免原生插件与 Flutter/AGP 版本冲突。
- 需要原生插件时，必须支持 Flutter embedding v2 与当前 AGP。
- 每次升级 Flutter/AGP 后，至少验证 Android 33+ 模拟器启动与地图渲染。

## 2. 开发环境（Windows + Android）

- 安装 Flutter SDK（stable 3.x），路径建议 `D:\flutter`
- 安装 Android Studio（含 Android SDK / Emulator）
- 配置环境变量：`PATH` 加入 Flutter，`ANDROID_SDK_ROOT` 指向 SDK
- 执行：`flutter doctor` + `flutter doctor --android-licenses`
- 准备模拟器或真机（Android 13/14）
- 可选：VS Code + Flutter/Dart 插件

## 3. 推荐目录结构（实现阶段）

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

## 4. 分层约束（必须遵守）

### 4.1 UI 层（Widgets/Pages）

- 不允许直接调用 dio
- 不允许硬编码传感器 key、单位、阈值
- 必须显式处理 loading/empty/error

### 4.2 Bloc 层

- 只做状态机与事件编排，不直接处理 JSON/字符串解析
- 所有副作用（网络/缓存）通过 Repository 注入

### 4.3 Repository 层

- 统一对齐 `docs/integrations/api/openapi.yaml`
- 错误必须转换为可展示的统一错误结构（带 traceId）
- 重要读接口必须做缓存（兜底展示）

## 5. 与 v2 契约的闭环

App 端闭环定义：

- 所有数据来源都可追溯到 `docs/integrations/api/*` 中的某个接口
- `/sensors` 字典能驱动页面渲染（新增传感器无需改 App 代码即可展示）
- 告警处理动作（ACK/RESOLVE）写入事件流，App 能读回并展示结果

相关引用：

- App PRD：`docs/features/prd/mobile-app.md`
- API 契约：`docs/integrations/api/openapi.yaml`
- 前端/组件规范（同样适用于 App）：`docs/guides/standards/frontend-components.md`
