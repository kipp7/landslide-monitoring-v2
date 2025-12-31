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
