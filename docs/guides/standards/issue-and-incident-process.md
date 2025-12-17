# Issue 与 Incident 流程（必须遵守）

目标：保证问题与需求的管理闭环，做到“可追溯、可复盘、可防再发”。

## 1) 什么时候用 Issue

适用于：

- 一般性 bug（不影响整体推进/可绕过）
- 需求讨论与拆分（待明确的 PRD）
- 工程任务（脚本、CI、重构小项）

要求：

- Issue 必须写清“验收标准”（DoD）
- 必须标注影响范围（docs/services/apps/infra）

仓库已提供模板：

- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`

## 2) 什么时候用 Incident（事故复盘）

适用于（满足任一即为 Incident）：

- 暴露/提交了真实密钥、凭据、生产连接信息
- 导致数据严重丢失/重复/错算，且影响范围不可忽略
- 导致设备大面积离线、连接风暴、告警误报/漏报
- 影响推进的系统性问题（例如基础设施无法复现部署）

要求：

- 必须使用模板：`docs/incidents/TEMPLATE-postmortem.md`
- 必须在 References 中链接到：相关 ADR / 契约 / PRD / PR
- 必须产出 CAPA（纠正与预防措施），并拆成 Issue 进入执行

## 3) 复盘闭环（CAPA）

每个 Incident 必须至少产生：

- 1 个“流程/门禁”改进（例如新增校验、加强 CI）
- 1 个“技术修复”改进（例如修复 schema drift、补充幂等键）

所有 CAPA 必须：

- 有 Owner
- 有 Due date
- 有验证方式（可执行命令/测试/门禁）

## 4) 与门禁/契约的关系

- 修改契约后必须跑门禁：`python docs/tools/run-quality-gates.py`
- OpenAPI 变更必须更新 stamp：`python docs/tools/update-openapi-stamp.py`

