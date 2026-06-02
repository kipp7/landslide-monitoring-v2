---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-independent-promo-demo/proposal
---

## Why

当前已经明确需要一套“科技感拉满、视觉冲击强、可用于宣传与展示”的官网 demo，但用户已经进一步收口范围：

- 先做**独立 demo**
- 不嵌入当前 `apps/web`
- 不嵌入当前 `apps/desk` / `apps/desk-win`
- 先把视觉表达、叙事结构和场景感做出来，再根据效果回调方案

如果直接把这条线接入现有 Web 管理端或桌面端，会立刻引入多余约束：

- 现有登录与后台壳结构会干扰宣传页的公共访问体验
- 后台产品页的布局与状态管理会拖慢高冲击视觉 demo 的迭代
- 当前目标是“独立体验 demo”，不是“并入正式产品导航”

因此本轮应该先增加一个独立的宣传官网 demo 工作区，允许快速迭代视觉与交互表达，同时与现有主产品线隔离。

## What Changes

- 新增 `independent-promo-demo` 能力规范
- 新增一个独立宣传官网 demo 工作区
  - 建议位置：`apps/promo-demo/`
  - 与当前 `apps/web`、`apps/desk`、`apps/desk-win` 解耦
- 首版 demo 聚焦单页沉浸式体验，而不是完整多页官网
- 首版 demo 的内容边界固定为：
  - 高冲击 Hero
  - 山体/节点/风险网络的场景化表达
  - 感知网络与平台链路叙事
  - 技术可信章节
  - 收口 CTA
- 首版 demo 使用本地 mock 文案和 mock 视觉数据运行
- 首版 demo 预留未来接入 `Three.js` / `three-vue-tres` 风格场景层的结构，但本轮不要求完整 3D 引擎化

## Impact

- Affected specs:
  - `independent-promo-demo`（新增）
- Affected code:
  - `apps/promo-demo/`（新工作区）
  - 根级工作区自动包含 `apps/*`，无需修改根 `package.json` 的 `workspaces`
- Affected docs:
  - 官网方向长期参考入口继续更新：
    - `memory/references/promo-site-inspiration-and-tech-direction.md`

## Non-Goals

- 本轮不把 demo 接到当前 `apps/web` 导航或登录入口
- 本轮不把 demo 接到 `apps/desk` 或 `apps/desk-win`
- 本轮不接后端 API、不接数据库、不接鉴权
- 本轮不做完整企业官网信息架构
- 本轮不强制落完整 `Three.js` / `web3` 体系，只保留后续扩展位
