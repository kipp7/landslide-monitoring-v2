# Delta for v2 Backend Runtime

## ADDED Requirements

### Requirement: Local Startup Baseline
v2 后端 MUST 提供可重复的本地启动基线：在干净环境下按文档步骤可启动数据库与 API 服务。

#### Scenario: Clean machine local startup
- **WHEN** 开发者在干净机器按文档步骤执行启动
- **THEN** 数据库与 API 服务 MUST 可启动并保持运行

### Requirement: API Health Endpoint
API 服务 MUST 提供 `/health` 健康检查端点，并返回 200 与基础运行信息。

#### Scenario: Health check
- **WHEN** 请求 `/health`
- **THEN** MUST 返回 200，并包含版本/运行时间等信息

### Requirement: Developer Auth Token
在本地开发模式下，API 服务 MUST 支持 `Authorization: Bearer dev` 作为开发通行证（仅用于开发环境）。

#### Scenario: Dev token request
- **WHEN** 请求带 `Authorization: Bearer dev`
- **THEN** API MUST 允许访问受保护接口（开发环境）

### Requirement: Minimum Read APIs for Desk
API 服务 MUST 优先提供一组“桌面端联调最小只读接口”（站点/设备/GPS/告警），用于逐步替换 Mock。

#### Scenario: Desk reads stations
- **WHEN** 桌面端请求站点列表接口
- **THEN** API SHOULD 返回可用于渲染的站点数据（含必要字段）
