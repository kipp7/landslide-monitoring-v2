# PRD 模板：<功能名称>

> 该模板用于“明确要做什么（What）”，并作为 AI 实现/修 Bug 的唯一需求来源之一。

## 1. 背景（Background）

- 为什么要做这个功能？
- 当前痛点是什么？（最好可量化）

## 2. 目标（Goals）

- G1:
- G2:

## 3. 非目标（Non-goals）

- NG1:

## 4. 用户与场景（Users & Scenarios）

- 用户角色：
- 典型场景：

## 5. 用户故事（User Stories）

- US1: 作为…我想…从而…

## 6. 功能规格（Functional Requirements）

- FR1:
- FR2:

## 7. 验收标准（Acceptance Criteria）

- AC1: 给定…当…那么…
- AC2:

## 8. 数据与接口依赖（Dependencies）

- 依赖 API：引用 `docs/integrations/api/...`
- 依赖 MQTT/Kafka：引用 `docs/integrations/mqtt/...`、`docs/integrations/kafka/...`
- 依赖存储：引用 `docs/integrations/storage/...`
- 依赖规则：引用 `docs/integrations/rules/...`

## 9. 约束与边界条件（Constraints & Edge Cases）

- 断电重连
- 重复上报/乱序
- 缺失传感器
- 大查询限制（时间范围/点数）

## 10. 指标与监控（Metrics）

- 业务指标：
- 技术指标（SLO/SLA）：

## 11. 风险与对策（Risks）

- R1:

## 12. 里程碑（Milestones）

- M0:
- M1:

