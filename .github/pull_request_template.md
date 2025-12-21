## 变更类型（必选）

- [ ] 新增功能（feat）
- [ ] 修复问题（fix）
- [ ] 文档/契约（docs）
- [ ] 重构（refactor）
- [ ] 工程/CI/脚本（chore）
- [ ] 测试（test）

## 背景与目标（为什么要改）

请用 3~10 行说明：

- 当前问题是什么
- 目标是什么（验收标准/DoD）
- 约束是什么（单机、契约优先、不写死等）

## 关联 Issue（推荐）

- 关联 Issue：
  - #

## 变更内容（做了什么）

- 影响范围（勾选）：docs / apps / services / libs / infra
- 关键变更点（列 3~8 条即可）：
  - 

## 验证方式（必须填写）

- [ ] 已运行 `python docs/tools/run-quality-gates.py`
- [ ] 已运行 `npm run lint`
- [ ] 已运行 `npm run build`
- [ ] 若修改了 OpenAPI：已运行 `python docs/tools/update-openapi-stamp.py`
- [ ] 若改动涉及 Web/API/契约（接口、schema、topics、存储表结构等）：已运行 `powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -Stage4Regression`
- [ ] 其他验证（如有）：
  - 

## 证据材料（建议）

当出现 “CI 偶现失败 / Docker 拉不起 / 环境差异” 时，请附上证据材料（日志/截图/压缩包），便于复盘与复现：

- 单机证据收集脚本：`infra/compose/scripts/collect-evidence.ps1`
- 端到端回归证据：`infra/compose/scripts/e2e-smoke-test.ps1` 会在 `backups/evidence/` 下自动生成证据包（注意：`backups/` 被 `.gitignore` 忽略，不要提交到仓库；需要时把证据路径/压缩包附在 PR 里）

## 风险与回滚（必须填写）

- 风险点：
  - 
- 回滚方式：
  - revert 该 PR（或说明具体回滚步骤）
