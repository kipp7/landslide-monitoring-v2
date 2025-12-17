# libs/

跨端共享库（不可直接对外提供服务）。

目的：

- 避免每个服务/应用重复实现同一套校验、错误结构、traceId 传播等基础能力
- 让后端服务拆分后仍保持一致性

建议模块：

- `libs/validation/`：schema 校验与错误映射
- `libs/observability/`：日志、traceId、metrics
- `libs/shared-types/`：共享 DTO（最终由 OpenAPI 生成）

