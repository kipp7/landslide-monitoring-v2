# guides/audits/

本目录存放“现状审查/差距分析”报告：把旧项目的缺点、风险与整改任务用结构化方式记录下来，并映射到 v2 的 PRD/契约/ADR。

原则：

- 只记录“可验证事实 + 风险 + 建议动作”，避免情绪化描述。
- 审查结果必须可落地：每条问题至少对应一个处理动作（PRD/Spec/契约变更/删除旧功能）。
- 涉及安全问题（密钥泄露、越权、任意 SQL 等）优先写 incidents，并在此处引用。

入口：

- `docs/guides/audits/landslide-monitor-code-audit.md`

