# PRD：告警与规则（版本化规则 + 事件化告警）

## 1. 背景

旧系统告警逻辑容易硬编码且难以复盘；需要多传感器组合规则、窗口、防抖回差，并支持未来 AI/预测。

## 2. 目标

- 规则配置化与版本化：修改规则不覆盖旧版本，历史告警可解释可回放。
- 告警事件化：触发/更新/恢复/确认均以事件存档。
- 规则能力覆盖：多传感器 AND/OR、窗口、缺失策略、回差、防重复触发。

## 3. 非目标

- v1 不强制实现复杂模型训练平台；AI 先做插件接口与异步调用。

## 4. 功能需求

- DSL v1：完整规范与校验清单。
- 落库：alert_rule_versions 必须保存完整 dsl_json。
- API：创建规则、发布新版本、查询版本、告警列表（按 alertId 聚合）、告警事件流、ACK/RESOLVE。
- 回放：支持 dry-run（不落库）与落库两种模式（实现阶段）。

## 5. 验收标准

- 新建规则生成 v1 版本，查询版本能完整拿到 DSL JSON。
- 修改规则生成新版本，旧版本仍可查询。
- 告警触发后能查看完整事件流（含 ruleVersion 与 evidence）。

## 6. 依赖

- 规则 DSL：`docs/integrations/rules/rule-dsl-spec.md`
- 落库映射：`docs/integrations/rules/rule-dsl-storage-mapping.md`
- 告警 API：`docs/integrations/api/06-alerts.md`
- DB：`docs/integrations/storage/postgres/tables/08-alerts.sql`

