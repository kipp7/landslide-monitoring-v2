# guides/testing/

本目录用于“可执行验收”的测试与验证文档，目标是让重构过程具备闭环：

- 你知道“现在是否可用”
- 你知道“出了问题去哪找证据”
- 你知道“怎么复现、怎么回滚”

## 1) 快速入口

- 单机基础设施冒烟测试：`docs/guides/testing/single-host-smoke-test.md`
- Web 本地登录联调：`docs/guides/testing/web-local-dev.md`
- 端到端冒烟测试（MQTT→Kafka→ClickHouse→API）：`docs/guides/testing/e2e-smoke-test.md`
- Telemetry 负载测试（单机）：`docs/guides/testing/telemetry-load-test.md`
- 问题排查与证据收集：`docs/guides/testing/troubleshooting-and-evidence.md`

## 2) 测试哲学（项目约束）

- 单机优先：先保证可恢复、可观测、可验证，再谈性能上限。
- 契约优先：测试用例尽量复用 `docs/integrations/*/examples` 作为输入。
- 不写死：测试必须验证“新增传感器/字段不改表/不改前端映射”的方向。
