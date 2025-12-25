# 最终验收走查（参考区 vs v2）

目的：对照参考区（`E:\学校\06 工作区\2\openharmony\landslide-monitor`）逐页走查 v2 的落地点，确认“功能不缺失”，并把仍存在的缺口拆成最小 WS 子项继续推进。

本页只记录“走查结论与证据入口”，不做 UI 细节讨论（UI 尽量保持 v2 风格）。

## 0) 走查前提

- 参考区 Web 路由清单：`docs/guides/roadmap/reference-web-route-inventory.md`
- v2 Web 路由清单：`docs/guides/roadmap/v2-web-route-inventory.md`
- 功能缺口对照表：`docs/guides/roadmap/gap-audit.md`
- WS 登记表：`docs/guides/roadmap/v2-module-workstreams.md`

## 1) 路由对照（入口级）

结论：参考区路由入口均已在 v2 中具备等价落地点（包含兼容跳转入口）。

| 参考区 Route | 参考区 Source | v2 Route | v2 Source | 结论 |
|---|---|---|---|---|
| `/` | `openharmony/landslide-monitor/frontend/app/page.tsx` | `/` | `apps/web/app/page.tsx` | ✅ |
| `/login` | `openharmony/landslide-monitor/frontend/app/login/page.tsx` | `/login` | `apps/web/app/login/page.tsx` | ✅ |
| `/analysis` | `openharmony/landslide-monitor/frontend/app/analysis/page.tsx` | `/analysis` | `apps/web/app/analysis/page.tsx` | ✅ |
| `/analysis2` | `openharmony/landslide-monitor/frontend/app/analysis2/page.tsx` | `/analysis2` | `apps/web/app/analysis2/page.tsx` | ✅ |
| `/optimized-demo` | `openharmony/landslide-monitor/frontend/app/optimized-demo/page.tsx` | `/optimized-demo` | `apps/web/app/optimized-demo/page.tsx` | ✅ |
| `/device-management` | `openharmony/landslide-monitor/frontend/app/device-management/page.tsx` | `/device-management` | `apps/web/app/device-management/page.tsx` | ✅ |
| `/baseline-management` | `openharmony/landslide-monitor/frontend/app/baseline-management/page.tsx` | `/baseline-management` | `apps/web/app/baseline-management/page.tsx` | ✅ |
| `/gps-monitoring` | `openharmony/landslide-monitor/frontend/app/gps-monitoring/page.tsx` | `/gps-monitoring` | `apps/web/app/gps-monitoring/page.tsx` | ✅ |
| `/system-monitor` | `openharmony/landslide-monitor/frontend/app/system-monitor/page.tsx` | `/system-monitor` | `apps/web/app/system-monitor/page.tsx` | ✅ |
| `/debug-api` | `openharmony/landslide-monitor/frontend/app/debug-api/page.tsx` | `/debug-api`（兼容跳转到 `/ops/debug-api`） | `apps/web/app/debug-api/page.tsx` | ✅ |

## 2) 功能点走查（动作级）

走查建议按下面顺序（每一项都可以在 v2 Web 中点击验证；若发现缺口，直接拆最小 WS 并登记）。

### 2.1 `/analysis`（运行大屏）

- ✅ 地图与设备点位：站点坐标 -> 设备标记 + 点击选设备（WS-N.1/WS-N.2）
- ✅ 实时数据：SSE `/realtime/stream` + 断线重连与状态展示（WS-K.2/WS-N.3）
- ✅ 异常/告警：`/alerts` 与聚合视图（WS-K.4/WS-N.3）
- ✅ AI 预测入口：`/api/v1/ai/predictions*` + Web 小组件（WS-L.1/WS-N.4）
- ✅ 视频监控入口：Camera/ESP32-CAM（WS-K.1）

### 2.2 `/gps-monitoring`（GPS 监测）

- ✅ 基础轨迹 + 查询条件（WS-D.4）
- ✅ 导出：CSV/JSON 报告（WS-D.6）
- ✅ 高级分析分栏：CEEMD-lite/预测/数据详情/风险-基准点（WS-D.7）
- ✅ 导出对齐：XLSX/图表 PNG/Markdown 报告（WS-D.8）

### 2.3 `/device-management` 与 `/baseline-management`

- ✅ 设备/站点管理与 API 统一走 v2（WS-B/WS-M.1/WS-A）
- ✅ 基准点管理与高级工具（WS-D.3/WS-D.5/WS-K.5）

### 2.4 `/system-monitor` 与 `/debug-api`

- ✅ `/system-monitor`：参考区同名页面已迁移（系统性能监控中心）
- ✅ `/ops/system-monitor`：运维系统监控（WS-G/WS-J）
- ✅ `/debug-api`：兼容入口跳转到 `/ops/debug-api`（WS-G/WS-J）
- ✅ `/ops/debug-api` 已补齐参考区 `/debug-api` 的“一键连通性测试”（`/health`、`/huawei/*`；危险 POST 默认关闭 + 二次确认）（WS-G.3 / PR #221）

### 2.5 `/analysis2`（监测点面板）

- ✅ 页面可渲染且不重定向到 `/analysis`（WS-O.5）
- ✅ 左侧折叠面板：异常/监测点/传感器/设备/视图可切换（WS-O.5）
- ✅ 详情卡片：Point/Sensor/Alert/View/Device 切换显示正常（WS-O.5）

## 3) 仍需确认的项（人工验收）

以下不属于“缺口已确认”，但建议在最终验收时手工点一遍，避免“入口有但细节漏掉”：

- 权限/RBAC：不同角色登录后，导航与页面权限是否符合预期（WS-A）
- 摄像头：视频地址/鉴权/跨域策略在目标环境是否可用（WS-K.1）
- GPS：真实设备数据下的预测列表/质量检查响应时延与错误提示（WS-D.7/WS-D.8）
