# INC-0002: 密钥/凭据泄露风险（env 与源码回退常量）

## Summary

在现有项目中发现“密钥/凭据治理缺失”的迹象：本地环境文件可能被纳入仓库，且部分源码存在“没有环境变量就使用内置常量”的回退写法（包括第三方数据库/外部 AI 服务的 key）。

## Impact

- 安全影响：凭据一旦泄露，可能导致未授权数据访问、服务被滥用调用、以及难以审计追责。
- 工程影响：团队会形成“先把 key 写死跑起来”的坏习惯，后续更难按规范收敛。

## Timeline（UTC）

- 设计审查阶段发现该问题，并决定在 v2 规范中彻底禁止。

## Root Cause(s)

- 直接原因：开发阶段为了快速验证，把 key 写入 `.env.local` 或源码回退常量。
- 深层原因：
  - 缺少“仓库级安全基线”（扫描/拒绝提交规则、secret rotation 流程）。
  - 缺少契约优先与环境规范（哪些配置必须存在、如何注入、如何在单机部署）。

## Detection

- 通过对项目目录进行“凭据关键字/常见 token 形态”扫描发现。

## Resolution

v2 的根本修复：

- **仓库中禁止出现任何真实凭据**：所有敏感项必须在部署机以 env/secret 文件注入。
- 任何“回退常量”必须只允许 placeholder，不允许真实 key。
- 建议在实现阶段加入 hooks/CI：
  - secret 扫描（基础正则即可）
  - 对 `*.env*` 提交做保护（只允许 `.example`）

## Corrective & Preventive Actions（CAPA）

- 新增 PRD（安全基线）：`docs/features/prd/security-and-access-control.md`
- 更新 hooks 建议：`docs/guides/ai/hooks-workflow.md`
- 强制契约优先：`docs/integrations/README.md`

## References

- 标准：`docs/guides/standards/backend-rules.md`
- AI 清单：`docs/guides/ai/checklists.md`

