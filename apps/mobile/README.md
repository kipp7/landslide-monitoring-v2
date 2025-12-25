# apps/mobile/

滑坡监测系统 v2 的移动端 App（Flutter）。

## 1) 技术栈（冻结）

- Flutter 3.x（当前：Flutter 3.38 / Dart 3.10）
- 状态管理：`flutter_bloc`
- 路由：`go_router`
- 网络：`dio`
- 图表：`fl_chart`
- 地图：`flutter_map` + 高德瓦片（Key 运行时注入，不写死）

## 2) 运行

默认 API Base URL 为 Android 模拟器访问宿主机：

- `http://10.0.2.2:8080/api/v1`

启动（示例）：

```bash
flutter run \
  --dart-define=AMAP_ANDROID_KEY=your_key \
  --dart-define=API_BASE_URL=http://10.0.2.2:8080/api/v1
```

说明：

- `AMAP_ANDROID_KEY`：高德瓦片服务 Key（不要提交到仓库）。
- `API_BASE_URL`：后端 v2 API 根路径（带 `/api/v1`）。

## 3) Mock API（可选）

当你只想跑通 App UI，不想初始化单机数据库时：

- 在 `services/api/.env` 设置 `MOBILE_API_MOCK=true`

API 会对移动端 MVP 接口返回 mock 数据（patrol + sos）。

## 4) Git 工作流（必须）

- 远端仓库：`https://github.com/kipp7/landslide-monitoring-v2.git`
- 禁止直接向 `main` push；必须走 PR
- 分支命名与合并规范见：`docs/guides/standards/git-workflow.md`

## 5) 相关文档

- App PRD：`docs/features/prd/mobile-app.md`
- Flutter 架构约束：`docs/features/flutter/app-architecture.md`
- API 契约（OpenAPI）：`docs/integrations/api/openapi.yaml`
