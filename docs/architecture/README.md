# architecture/

本目录描述“架构的长期事实”（Why），并以 ADR 记录关键决策理由（为什么选这个方案，而不是别的）。

入口：

- 总览（必读）：`docs/architecture/overview.md`
- ADR（决策记录）：`docs/architecture/adr/README.md`
- 规则引擎（Why/What）：`docs/architecture/rule-engine.md`
- 风险清单（最坏情况预案）：`docs/architecture/risk-register.md`

说明：

- 与外部交互的“契约”只写在 `docs/integrations/`（API/MQTT/Kafka/Storage/Rules）。
- 与落地操作相关的“怎么做”只写在 `docs/guides/`（部署、runbook、最佳实践）。

