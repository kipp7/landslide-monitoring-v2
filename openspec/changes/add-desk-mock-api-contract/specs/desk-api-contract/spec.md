# Delta for Desk API Contract

## ADDED Requirements

### Requirement: Typed Desk API Surface
桌面端前端 MUST 通过一个稳定的 TypeScript `DeskApi` 接口访问数据，避免页面直接依赖具体 Mock/HTTP 实现细节。

#### Scenario: UI calls domain API
- **WHEN** 页面需要读取“监测站列表”
- **THEN** MUST 调用 `api.stations.list(...)` 而不是直接访问 Mock 数据数组

### Requirement: Mock/HTTP Pluggable Implementations
`DeskApi` MUST 支持 Mock 与 HTTP 两种实现，并能在运行时通过设置切换。

#### Scenario: Switch to HTTP mode
- **WHEN** 用户在设置中切换为 HTTP 模式
- **THEN** 前端 MUST 使用 HTTP 实现（即使接口不可用也不应崩溃）

### Requirement: Deterministic Mock Data
Mock 数据 MUST 可复现（支持 seed），并保持跨页面的数据关联一致（站点-设备-传感器）。

#### Scenario: Stable identity mapping
- **WHEN** 用户刷新页面
- **THEN** 同一站点/设备的 `id` 与名称 SHOULD 保持一致

### Requirement: Standard Pagination and Filtering
`DeskApi` MUST 提供一致的分页与筛选模型（PageRequest/PageResponse），供表格与列表复用。

#### Scenario: List page request
- **WHEN** 表格请求第 2 页数据
- **THEN** SHOULD 使用统一分页参数（page/pageSize/sort/filter）

### Requirement: Normalized Error Model
`DeskApi` MUST 将底层错误（网络/超时/HTTP 状态码/校验错误）统一映射为 `ApiError`，便于 UI 统一处理与提示。

#### Scenario: Network timeout
- **WHEN** 请求超时
- **THEN** MUST 返回 `ApiError` 且标记 `retryable=true`
