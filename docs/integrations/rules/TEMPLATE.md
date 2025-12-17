# integrations/rules/ Template

用途：当规则系统演进（新增算子/窗口类型/缺失策略/AI 条件）时，优先在这里记录契约变化，避免多处文档各写一份导致不一致。

## Change Summary

- What changed:
- Why:
- Backward compatibility:

## DSL（Versioned）

- `dslVersion`：
- 新增字段/枚举：
- 示例（最小可运行）：

## Storage Mapping

- Postgres 表：
- 字段映射与索引：
- 事件化告警模型是否受影响：

## API Impacts

- 受影响接口：
- 前端/Flutter 需要适配的点：

## Replay / Backtest

- 是否影响回放幂等：
- 是否需要重算历史数据：

