# 质量门禁（Quality Gates，必须通过）

本文件把“高质量、高规范”落地为**可执行检查项**。任何代码/契约变更必须满足以下门禁，避免后期数据量变大、功能增多后出现不可收拾的返工。

## 1) 契约门禁（必过）

- OpenAPI 与 API 文档一致：`docs/integrations/api/*.md` ↔ `docs/integrations/api/openapi.yaml`
- MQTT/Kafka/Rules 示例可被 JSON Schema 校验（示例位于 `integrations/*/examples`）

执行：

- `python docs/tools/validate-contracts.py`
- 或一键：`python docs/tools/run-quality-gates.py`

## 2) 禁止硬编码门禁（必过）

- 前端禁止写死：传感器 key、单位、阈值、设备/站点列表、告警规则
- 后端禁止写死：遥测指标列（必须走稀疏指标模型）

审查要点：

- 前端所有显示名/单位必须来自 `/sensors`
- 规则阈值必须来自规则 DSL（而不是写在页面里）

## 3) 可靠性门禁（必过）

- 所有写操作必须有幂等设计（commandId、ruleVersion、exportId）
- 所有导出/大查询必须有上限与异步策略（避免单机 OOM）
- 所有外部输入必须有校验（HTTP/MQTT/Kafka），失败进入 DLQ 并可追踪（traceId）

## 4) 安全门禁（必过）

- 禁止提交真实密钥/凭据/Token（见 `incidents/INC-0002-secrets-and-credentials-leak.md`）
- 禁止前端直连数据库（见 `incidents/INC-0003-frontend-direct-db-access.md`）
- 所有敏感操作必须写审计日志（操作人、目标、时间、结果）

## 5) 格式化门禁（必过）

- 必须遵循 `.editorconfig`（UTF-8、末尾换行、去除行尾空格）
- JS/TS 必须通过 Prettier（实现阶段可加 ESLint）

## 6) 建议的提交流程（单人也适用）

- 修改契约/文档后：先跑 `python docs/tools/validate-contracts.py`
- 提交前：跑 `python docs/tools/run-quality-gates.py`

## 7) CI（建议）

当仓库托管在 GitHub 时，建议启用 CI 强制门禁：

- `.github/workflows/quality-gates.yml`

CI 的原则是“只复用本地脚本，不另写一套规则”，避免本地与 CI 不一致。

补充（Rulesets 必读）：

- 如果你在 GitHub Rulesets 中配置 “Required status checks”，本仓库应选择 `docs-and-contracts`（Actions job 名）。
- 具体踩坑与 422 修复过程见：`docs/incidents/INC-0005-github-rulesets-and-status-checks-setup.md`

## 8) Git 推送纪律（必须）

- 禁止直接 push 到 `main`（必须走 PR）
- 分支命名、提交信息、合并方式必须遵守：`docs/guides/standards/git-workflow.md`
