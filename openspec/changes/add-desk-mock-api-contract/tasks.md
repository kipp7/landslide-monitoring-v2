## 1. 设计 API Contract 与 DTO
- [ ] 1.1 盘点 `apps/desk` 当前页面所需数据模型（设备、站点、GNSS、告警等）
- [ ] 1.2 定义通用类型：`Id`、`Timestamp`、`PageRequest`、`PageResponse`
- [ ] 1.3 定义时间范围/粒度枚举（用于趋势与历史）
- [ ] 1.4 定义错误模型：`ApiError`（code/message/details/retryable）

## 2. API Provider 抽象
- [ ] 2.1 定义 `DeskApi` 接口（按 domain 分组：auth/stations/devices/gps/alerts）
- [ ] 2.2 Mock 实现：数据工厂 + 可控延迟 + 失败注入（用于演示与测试）
- [ ] 2.3 HTTP 实现骨架：baseUrl/token/headers/timeout（先不联调）

## 3. Mock 数据体系
- [ ] 3.1 建立可复现 seed（刷新页面不“跳变”）
- [ ] 3.2 建立数据关联：站点-设备-传感器-测点关系一致
- [ ] 3.3 支持筛选与分页（至少前端侧模拟）
- [ ] 3.4 支持时间序列生成（GPS/雨量/倾角等）

## 4. 错误与提示
- [ ] 4.1 统一错误映射：网络错误/超时/401/500/校验错误
- [ ] 4.2 统一消息提示策略（AntD message/notification）
- [ ] 4.3 为关键操作增加“可重试”路径（重试按钮/自动重试可选）

## 5. 验证与演示
- [ ] 5.1 Mock 模式：全页面数据一致性检查（站点/设备/GPS）
- [ ] 5.2 HTTP 模式：可切换且不会导致页面崩溃（即使接口不可用）

