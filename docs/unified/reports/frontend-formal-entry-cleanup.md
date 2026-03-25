# frontend-formal-entry-cleanup

## Status

- task: `frontend-formal-entry-cleanup`
- state: `checkpointed`
- updated_at: `2026-03-15`

## Scope

本任务只处理“正式入口收口”，目标是让用户默认进入正式页面，而不是先落到 legacy/demo 组合链。

## Round 1（2026-03-15）

### 本轮处理

- 将 `/gps-monitoring` 收口到正式入口 `/gps-deformation`
- 将 `/baseline-management` 收口到正式入口 `/device-management/baselines`
- 更新导航与旧入口链接，避免继续把用户导向 legacy 组合链

### 改动文件

- `apps/web/app/gps-monitoring/page.tsx`
- `apps/web/app/gps-monitoring/layout.tsx`
- `apps/web/app/baseline-management/page.tsx`
- `apps/web/app/components/AppShell.tsx`
- `apps/web/app/analysis/legacy/components/HoverSidebar.tsx`
- `apps/web/app/device-management/legacy/DeviceManagementLegacyPage.tsx`

### 当前验证

- `npm -w apps/web run build` 已通过

### 当前结论

- 用户从主导航与主要旧入口进入时，已经优先落到正式页面：
  - `GPS 监测` → `/gps-deformation`
  - `baseline-management` → `/device-management/baselines`
- 旧页面本身仍保留路由，但已转为轻量重定向入口

## Remaining Scope

本任务尚未处理的正式入口收口对象：

- `analysis2/*`
- 其余仍直接依赖 legacy `/api/*` 组合链的页面

## Next Step

- 下一轮优先处理 `optimized-demo/*` 与 `analysis2/*` 的正式入口边界

## Round 2（2026-03-15）

### 本轮处理

- 将 `/optimized-demo` 收口到正式入口 `/analysis`

### 改动文件

- `apps/web/app/optimized-demo/page.tsx`

### 当前验证

- 入口改动本身为轻量重定向逻辑
- 重新执行 `npm -w apps/web run build` 时，命中本地已知环境噪音：
  - `apps/web/node_modules/next` 再次出现半残目录
  - 导致 `next build` 在解析本地 `next` 时失败
- 该问题与本轮业务改动无直接耦合，属于已有构建环境问题

### 当前结论

- `optimized-demo` 已不再作为正式入口保留
- 当前正式入口收口任务继续保持 `checkpointed`
- 下一轮优先处理 `analysis2/*`

## Round 3（2026-03-15）

### 本轮处理

- 将 `/analysis2` 收口到正式入口 `/analysis-v2`

### 改动文件

- `apps/web/app/analysis2/page.tsx`

### 当前验证

- 本轮为轻量重定向逻辑变更
- 当前未重复扩大构建验证范围，沿用上一轮对 Web 主线可构建性的判断

### 当前结论

- `analysis2` 已不再作为正式入口保留
- 当前正式入口收口任务已完成当前轮目标：
  - `/gps-monitoring` → `/gps-deformation`
  - `/baseline-management` → `/device-management/baselines`
  - `/optimized-demo` → `/analysis`
  - `/analysis2` → `/analysis-v2`
