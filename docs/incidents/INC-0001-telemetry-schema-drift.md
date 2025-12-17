# INC-0001: 遥测字段硬编码导致的“Schema Drift”

## Summary

早期实现中，遥测数据结构被按“固定字段/固定列”处理（前端硬编码字段名、后端/数据库宽表依赖固定列）。当某些站点新增/缺失传感器时，出现数据无法展示、规则无法配置、频繁改表的连锁问题。

## Impact

- 新增传感器需要改数据库表结构与接口字段，研发周期长且容易遗漏。
- 某些节点缺少传感器字段时，前端渲染/规则配置出现异常（空值/崩溃/误判）。
- 告警规则难以复用：每次换设备类型都要重新写一套逻辑。

## Timeline（UTC）

- 设计阶段复盘：在重构规划中发现该问题属于结构性缺陷，决定在 v2 架构中根治。

## Root Cause(s)

- 直接原因：以“宽表 + 固定字段”为中心设计，导致新增指标必须 ALTER TABLE、修改 API、修改前端。
- 深层原因：
  - 缺少“契约唯一来源”（`integrations/`）导致前后端各写一份字段定义。
  - 缺少传感器字典/元数据层，导致展示与规则缺少统一依据。

## Detection

- 主要通过功能迭代时的重复工作暴露（每加一个传感器就要多处改动）。
- 监控层面缺少 “unknown sensor_key / schema mismatch” 指标告警。

## Resolution

根本修复策略（v2）：

- 遥测采用稀疏模型：每个指标按 `sensor_key + value` 表达，不要求每次上报字段一致。
- 传感器定义由 PostgreSQL `sensors` 字典表统一管理，前端展示与规则配置以字典为准。
- 遥测曲线与聚合由 ClickHouse 存储；元数据/规则/告警走 PostgreSQL。

## Corrective & Preventive Actions（CAPA）

- 建立并强制执行 ADR：
  - `docs/architecture/adr/ADR-0003-sparse-telemetry-model.md`
- 固化存储与契约入口：
  - `docs/integrations/storage/overview.md`
  - `docs/integrations/mqtt/mqtt-topics-and-envelope.md`
- 增加“契约一致性检查清单”（实现阶段写入 hooks/CI）：
  - `docs/guides/ai/hooks-workflow.md`

## References

- ADR：`docs/architecture/adr/ADR-0003-sparse-telemetry-model.md`
- Storage：`docs/integrations/storage/overview.md`
- MQTT：`docs/integrations/mqtt/mqtt-topics-and-envelope.md`

