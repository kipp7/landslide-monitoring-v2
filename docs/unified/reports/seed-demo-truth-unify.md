# seed-demo-truth-unify

## Status

- task: `seed-demo-truth-unify`
- state: `completed`
- updated_at: `2026-03-15`

## Scope

本轮只处理 seed/demo 真值统一，不同时展开前端正式入口迁移。

## 本轮处理

### 1. 统一运行态真值

当前明确：

- 运行态 demo 真值以 `infra/compose/scripts/seed-demo.ps1` 为准
- `docs/integrations/storage/postgres/tables/14-seed-data.sql` 应与它保持同一口径

### 2. 已修正内容

- `docs/integrations/storage/postgres/tables/14-seed-data.sql`
  - `DEMO001.latitude` 从 `21.6847` 修正为 `22.6847`
- `docs/integrations/api/04-stations.md`
  - 相关示例坐标统一修正为 `22.6847 / 108.3516`
- `docs/integrations/api/08-gps-baselines.md`
  - baseline 示例坐标统一修正为 `22.6847 / 108.3516`

## 当前结论

- 当前主线关于 `DEMO001` 的核心 demo 坐标已与 `seed-demo.ps1` 对齐
- 运行态真值入口已明确为：
  - `infra/compose/scripts/seed-demo.ps1`
- `14-seed-data.sql` 仍保留为初始化参考，但不再与运行态口径冲突

## 仍待后续处理

- 其余 legacy/demo 页面里残留的旧坐标与旧命名仍需逐步清理
- `seed-demo.ps1` 与 `14-seed-data.sql` 的角色边界，后续可继续在文档中写得更明确

## Next Step

- 转入下一条实现任务：前端正式入口收口
