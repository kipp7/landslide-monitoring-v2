## Why

当前 `apps/desk` 虽然能用 Mock 数据跑 UI，但 Mock 数据与未来 v2 后端 API 的契约尚未收敛：容易出现页面之间字段不一致、错误处理不统一、后续切换到 HTTP 成本高的问题。

本变更的目标是建立一套 **可扩展的桌面端 API Contract 层**：前端只依赖稳定的 TypeScript 接口与 DTO，底层可以在 Mock/HTTP 之间切换。

## What Changes

- 定义 `desk-api-contract`：统一 DTO、分页、筛选、时间范围等常见模型
- 统一错误模型与错误提示策略（network/timeout/validation/unauthorized）
- 统一 Mock 数据工厂（可配置延迟、可复现 seed）
- 为未来 HTTP 模式预留（baseUrl、token、拦截器、重试策略）

## Non-Goals

- 不要求一次性覆盖所有 v2 API
- 不引入代码生成（OpenAPI -> client）作为前置条件（后续可加）

