# AI 交接指南（换窗口/换模型/换 AI 的“自解释”方案）

本指南解决的问题：

- 对话窗口结束后，新的 AI/新模型如何知道“做到哪一步、下一步做什么”？
- 如何避免新 AI 误改架构/误改规范/重复踩坑？
- 如何让“规范、契约、决策、进度”变成仓库自解释（repo self-explained）？

## 1) 交接的最小事实（Single Source of Truth）

交接不要依赖聊天记录，依赖仓库内的权威入口：

1) **当前进度与下一步**：`docs/guides/roadmap/project-status.md`
2) **大局与决策（Why）**：`docs/architecture/`（ADR）
3) **需求与验收（What）**：`docs/features/`
4) **契约（Interface）**：`docs/integrations/`（唯一来源）
5) **规范与流程（How-to）**：`docs/guides/standards/`
6) **历史问题与坑**：`docs/incidents/`

## 2) 新 AI 接手时必须做的 7 步（强制）

1) 读：`docs/README.md`
2) 读：`docs/guides/roadmap/project-status.md`
3) 读：`docs/guides/standards/README.md`
4) 读：`docs/integrations/README.md`
5) 看最近合并记录（定位最近变更点）：
   - `git log -20 --oneline`
6) 运行本地门禁（确认环境正常）：
   - `python docs/tools/run-quality-gates.py`
7) 开始工作前先写“计划/范围”，并确保不越界（不扩大范围、不改既定技术栈）。

## 3) 交接时必须更新哪些东西（强制）

当你合并一个 PR，如果它影响“下一步/里程碑/风险/约束”，必须同步更新：

- `docs/guides/roadmap/project-status.md`

当你引入新的关键决策（影响多个模块交互边界），必须：

- 新增 ADR：`docs/architecture/adr/`

当你修改契约（API/MQTT/Kafka/Rules/Storage），必须：

- 修改 `docs/integrations/`（唯一来源）
- 通过门禁：`python docs/tools/run-quality-gates.py`

当你踩到新坑（例如网络、CI、部署、数据一致性），必须：

- 新增/更新 Incident：`docs/incidents/`

## 4) 为何“不能只靠 README/聊天记录”

- README 只能给入口，不能表达“当前工作正在进行到哪一步”。
- 聊天记录不可控：会丢、会断、会换模型，不能作为工程事实。
- 交接需要“可验证”：靠 PR/commit/门禁与文档索引才能闭环。

## 5) 推荐的“未来可拓展”机制（不要求现在实现）

如果未来多人协作/持续迭代，建议逐步引入：

- GitHub Projects（看板）或 Issues（里程碑）来承载“任务进度”
- CODEOWNERS（关键目录 review）
- 自动化检查：PR 若修改 `services/` 或 `integrations/`，要求更新 `project-status.md`（CI gate）

## 6) 常见误区（必须避免）

- 新 AI 直接开始写代码，不先读 `project-status.md` 与 `integrations/`。
- 未经 ADR 直接改变技术路线（例如换语言、换消息中间件）。
- 在 `apps/` 中硬编码传感器字段/阈值/单位（违反不写死原则）。

