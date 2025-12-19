# INC-0003: 前端/Next API 直连数据库（绕过契约导致 Schema Drift）

## Summary

现有实现中，前端（含 Next.js API routes）通过数据库 SDK 直接访问业务表/视图，并包含调试/管理类接口（inspect/db-admin）。这导致“契约不收敛、权限不统一、改表必炸”的结构性问题。

## Impact

- 架构影响：前端与 DB 强耦合，后端边界形同虚设，难以演进为 v2（Kafka/ClickHouse/规则引擎）架构。
- 安全影响：在缺少统一鉴权与审计时，调试/管理接口可能被滥用，造成数据泄露或 DoS（大查询）。
- 研发影响：接口/字段缺少权威来源，导致硬编码与多份文档长期不一致。

## Root Cause(s)

- 直接原因：为了快速实现页面功能，选择“前端直接查库”的最短路径。
- 深层原因：
  - 缺少 OpenAPI/契约驱动的开发流程（contract-first）。
  - 缺少后端“统一权限、审计、限流”的基础设施。

## Resolution

v2 根本修复：

- `integrations/api` 成为唯一 API 契约来源（OpenAPI + 模块文档）。
- 前端只通过 API 访问数据，不直接依赖 DB 表/视图命名。
- 所有调试/管理能力必须通过受控的管理员 API + 审计实现，生产环境禁用 inspect/db-admin。

## Corrective & Preventive Actions（CAPA）

- OpenAPI 入口：`docs/integrations/api/openapi.yaml`
- 安全 PRD：`docs/features/prd/security-and-access-control.md`
- 运维与审计 PRD：`docs/features/prd/system-operations-and-observability.md`

## References

- 后端规则：`docs/guides/standards/backend-rules.md`
- 存储契约：`docs/integrations/storage/README.md`

