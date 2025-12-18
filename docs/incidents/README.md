# incidents/

本目录保存事故复盘（Postmortem）。当旧 Bug 复现、同类问题再次出现时，这里是最关键的上下文来源。

原则：

- 复盘优先记录“事实与决策”，不是甩锅或写情绪化总结。
- 复盘必须能落地：要有可执行的纠正与预防措施（CAPA），并明确 owner/截止时间（实现阶段）。
- 与契约相关的结论必须回写到 `integrations/`（避免同类问题反复出现）。

模板：

- `docs/incidents/TEMPLATE-postmortem.md`

示例：

- `docs/incidents/INC-0001-telemetry-schema-drift.md`
- `docs/incidents/INC-0002-secrets-and-credentials-leak.md`
- `docs/incidents/INC-0003-frontend-direct-db-access.md`
- `docs/incidents/INC-0004-dockerhub-pull-timeout.md`
- `docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`
- `docs/incidents/INC-0006-git-https-connection-reset.md`
- `docs/incidents/INC-0007-compose-kafka-image-manifest-unknown.md`
- `docs/incidents/INC-0008-fastify-hook-signature-hang.md`
