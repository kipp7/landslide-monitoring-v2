## 1. 设计 API Contract 与 DTO
- [ ] 1.1 盘点 `apps/desk` 当前页面所需数据模型（设备、站点、GNSS、告警等）
- [ ] 1.2 定义通用类型：`Id`、`Timestamp`、`PageRequest`、`PageResponse`
- [ ] 1.3 定义时间范围/粒度枚举（用于趋势与历史）
- [ ] 1.4 定义错误模型：`ApiError`（code/message/details/retryable）
- [ ] 1.5 定义分页/排序/过滤通用参数（sortBy/sortOrder/filters）
- [x] 1.6 定义枚举：设备类型、传感器类型、在线状态、告警等级
- [ ] 1.7 定义 GIS/地图模型：经纬度、坐标系、边界框
- [x] 1.8 定义监测站模型：`StationSummary`/`StationDetail`
- [x] 1.9 定义设备模型：`DeviceSummary`/`DeviceDetail`/`DeviceStatus`
- [ ] 1.10 定义传感器模型：`SensorSummary`/`SensorDetail`/`TelemetryPoint`
- [ ] 1.11 定义时间序列响应：`TimeseriesPoint`/`Series`/`DownsampledSeries`
- [ ] 1.12 定义导出模型：`ExportJob`/`ExportFormat`（先用于 mock）

## 2. API Provider 抽象
- [x] 2.1 定义 `DeskApi` 接口（按 domain 分组：auth/stations/devices/gps/alerts）
- [x] 2.2 Mock 实现：数据工厂 + 可控延迟 + 失败注入（用于演示与测试）
- [x] 2.3 HTTP 实现骨架：baseUrl/token/headers/timeout（先不联调）
- [ ] 2.4 HTTP 实现：统一 request 封装（超时/重试/headers）
- [ ] 2.5 支持请求取消（AbortController）与竞态处理（最新请求覆盖旧请求）
- [ ] 2.6 支持缓存策略（内存缓存：列表/详情短缓存）
- [x] 2.7 统一鉴权 token 存取（localStorage/sessionStorage）
- [x] 2.8 统一 baseUrl 配置与环境切换（dev/mock/http）
- [ ] 2.9 Provider 侧基础埋点：请求耗时、失败率（先 console）
- [ ] 2.10 为关键方法补齐示例与注释（便于其他 AI 并行开发）

## 3. Mock 数据体系
- [ ] 3.1 建立可复现 seed（刷新页面不“跳变”）
- [ ] 3.2 建立数据关联：站点-设备-传感器-测点关系一致
- [ ] 3.3 支持筛选与分页（至少前端侧模拟）
- [ ] 3.4 支持时间序列生成（GPS/雨量/倾角等）
- [ ] 3.5 数据工厂：站点生成器（地理分布 + 风险等级）
- [ ] 3.6 数据工厂：设备生成器（类型、厂家、序列号、固件）
- [ ] 3.7 数据工厂：传感器生成器（与设备类型匹配）
- [ ] 3.8 时间序列：支持不同规律（周期、噪声、突变、缺失）
- [ ] 3.9 告警事件：按阈值/规则触发并可复现
- [ ] 3.10 支持实时数据刷新模拟（轮询/定时增量）
- [ ] 3.11 支持 CRUD 的乐观更新模拟（新增/编辑/删除）
- [ ] 3.12 支持失败注入：按 endpoint/概率/一次性失败

## 4. 错误与提示
- [ ] 4.1 统一错误映射：网络错误/超时/401/500/校验错误
- [ ] 4.2 统一消息提示策略（AntD message/notification）
- [ ] 4.3 为关键操作增加“可重试”路径（重试按钮/自动重试可选）
- [ ] 4.4 表单提交校验错误结构（fieldErrors）与 UI 映射
- [ ] 4.5 页面级错误输出统一（ApiError -> 可读提示 + 详情）
- [ ] 4.6 离线模式提示策略（网络断开时降级到 mock）

## 5. 切换与配置
- [x] 5.1 设置页支持切换数据源：Mock / HTTP（持久化）
- [ ] 5.2 增加 `DESK_API_MODE` 环境变量（默认 mock）
- [ ] 5.3 调试面板：显示当前模式/baseUrl/最近请求（仅开发态）
- [ ] 5.4 快速重置 mock 数据（清 seed/重建数据）

## 6. 验证与演示
- [ ] 6.1 Mock 模式：全页面数据一致性检查（站点/设备/GPS）
- [ ] 6.2 HTTP 模式：可切换且不会导致页面崩溃（接口不可用也可进入页面）

## 7. 告警与处置 Contract（面向实际使用）
- [ ] 7.1 定义枚举：`AlertLevel`、`AlertStatus`、`AlertSourceType`
- [ ] 7.2 定义模型：`AlertEventSummary`/`AlertEventDetail`（关联站点/设备/传感器）
- [ ] 7.3 定义模型：`AlertRuleSummary`/`AlertRuleDetail`（阈值/策略/静默）
- [ ] 7.4 增加 `alerts.list`：分页/过滤/排序（level/status/stationId/deviceId/timeRange）
- [ ] 7.5 增加 `alerts.get`：按 id 获取详情（含最近数据点）
- [ ] 7.6 增加 `alerts.ack`：确认告警（可选备注）
- [ ] 7.7 增加 `alerts.assign`：指派责任人/班组（Mock）
- [ ] 7.8 增加 `alerts.close`：关闭告警（结论/原因/措施，Mock）
- [ ] 7.9 增加 `alerts.silence`：按站点/设备静默一段时间（Mock）
- [ ] 7.10 增加 `alerts.stats`：用于首页/大屏的汇总统计（按等级/状态）
- [ ] 7.11 增加 `alerts.trend`：告警趋势（24h/7d/30d）
- [ ] 7.12 Mock：告警事件生成器（与时间序列异常相关联）
- [ ] 7.13 Mock：告警可复现（seed 固定，刷新不乱跳）
- [ ] 7.14 Mock：支持“新增告警”模拟（用于演示通知/处置流程）
- [ ] 7.15 HTTP：实现骨架与路由映射（不联调也可运行）
- [ ] 7.16 错误模型：告警处置字段校验（fieldErrors）
- [ ] 7.17 定义导出模型：`AlertExportJob`（先 mock）
- [ ] 7.18 契约文档：补齐 alert 相关示例 payload（请求/响应）
- [ ] 7.19 Provider：告警域缓存策略（列表短缓存，详情按需缓存）
- [ ] 7.20 验证：为告警域补齐最小 contract 校验用例

## 8. 待办/工单 Contract（闭环处置）
- [ ] 8.1 定义枚举：`WorkOrderStatus`、`WorkOrderPriority`、`WorkOrderType`
- [ ] 8.2 定义模型：`WorkOrderSummary`/`WorkOrderDetail`（关联告警/站点/设备）
- [ ] 8.3 增加 `workorders.list`：分页/过滤/排序（status/priority/assignee/timeRange）
- [ ] 8.4 增加 `workorders.create`：创建工单（Mock）
- [ ] 8.5 增加 `workorders.update`：编辑工单（Mock）
- [ ] 8.6 增加 `workorders.transition`：状态流转（新建->处理中->待复核->已完成）
- [ ] 8.7 增加 `workorders.comment`：追加处理记录（Mock）
- [ ] 8.8 增加 `workorders.attach`：附件元数据（文件由桌面端导入/导出提供）
- [ ] 8.9 增加 `workorders.export`：导出工单清单（Mock）
- [ ] 8.10 定义模型：`TodoSuggestion`（系统建议：离线/预警/缺基线）
- [ ] 8.11 增加 `todos.suggestions`：获取系统建议列表（由前端或后端生成）
- [ ] 8.12 增加 `todos.list/create/update/delete/complete`：人工待办 CRUD（Mock）
- [ ] 8.13 Mock：待办与工单数据关联（建议可一键转工单）
- [ ] 8.14 权限：viewer 只读，admin 可写（Contract 层体现）
- [ ] 8.15 验证：为待办/工单域补齐最小 contract 校验用例

## 9. 公告/配置中心 Contract（面向运维）
- [ ] 9.1 定义模型：`Announcement`（level/category/pinned/route/expireAt）
- [ ] 9.2 增加 `announcements.list`：分页/过滤（category/activeOnly）
- [ ] 9.3 增加 `announcements.create/update/delete`：公告管理（admin）
- [ ] 9.4 增加 `announcements.markRead`：标记已读（按用户）
- [ ] 9.5 定义模型：`AppConfig`（首页小组件/刷新频率/默认时间范围）
- [ ] 9.6 增加 `config.get/set`：配置读取与更新（Mock）
- [ ] 9.7 Mock：公告与配置的 seed 与持久化（演示可用）
- [ ] 9.8 HTTP：公告/配置路由骨架（不联调也可运行）
- [ ] 9.9 错误模型：公告字段校验与权限错误（403）
- [ ] 9.10 验证：为公告/配置域补齐最小 contract 校验用例

## 10. 诊断/审计 Contract（现场可排障）
- [ ] 10.1 定义模型：`AuditEvent`（actor/action/resource/route/result/time）
- [ ] 10.2 增加 `audit.list`：审计日志查询（过滤 actor/action/timeRange）
- [ ] 10.3 增加 `system.info`：版本/构建信息（前端/桌面壳/后端）
- [ ] 10.4 增加 `system.healthDetail`：更完整的健康信息（DB/队列/缓存）
- [ ] 10.5 定义模型：`DiagnosticsBundleRequest`（用于导出诊断包）
- [ ] 10.6 增加 `diagnostics.export`：生成诊断包任务（先 mock）
- [ ] 10.7 统一 requestId：贯穿 provider 请求链路（便于排障）
- [ ] 10.8 统一重试标记：`retryable` 与推荐重试策略
- [ ] 10.9 增加“运行时能力”标记：桌面端/浏览器差异（capabilities）
- [ ] 10.10 增加 “feature flags” 模型（逐步上线开关）
- [ ] 10.11 Mock：审计事件生成与持久化（关键操作写入）
- [ ] 10.12 HTTP：诊断/审计路由骨架（不联调也可运行）
- [ ] 10.13 文档：诊断/审计示例 payload 与常见错误码
- [ ] 10.14 Provider：日志采样与脱敏策略（不输出敏感信息）
- [ ] 10.15 验证：为诊断/审计域补齐最小 contract 校验用例
