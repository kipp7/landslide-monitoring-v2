---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-independent-promo-demo/design
---

## Context

用户当前要的不是“把现有后台做美化”，而是一个独立、炫、具有概念张力的宣传官网 demo。

同时用户又明确要求：

- 先独立做
- 不嵌入当前 Web 管理端
- 不嵌入当前桌面端
- 先看效果，再调整方案

这意味着本轮最重要的不是平台集成，而是：

- 快速形成一个可以观看和讨论的视觉成品
- 不污染现有产品入口
- 给后续路线选择保留空间

## Goals / Non-Goals

- Goals:
  - 做出一个可独立运行的宣传官网 demo
  - 形成清晰的视觉母体、章节叙事和技术调性
  - 让后续可选择继续深化为正式官网
- Non-Goals:
  - 不改当前 `apps/web` 的后台结构
  - 不改当前桌面端
  - 不接后端与数据库
  - 不追求首版就是完整官网

## Decisions

### Decision: 独立工作区优先于嵌入现有 Web

- 选择：
  - 新建 `apps/promo-demo/`
- 不选择：
  - 在 `apps/web` 中增加一条公共路由

原因：

- 当前 `apps/web` 主要承担后台管理端角色
- 独立 demo 更利于快速推视觉
- 后续若成功，可再决定是否迁回 Next.js 正式站点

### Decision: 首版优先做“2.5D 沉浸式叙事”，而不是重型 3D 引擎工程

- 选择：
  - 首版以强视觉层、空间分层、动效节奏和场景感为主
- 保留：
  - 后续接入 `Three.js` / `three-vue-tres` 风格场景层的能力

原因：

- 用户当前要先看 demo
- 首版最该证明的是：
  - 方向对不对
  - 视觉语言成不成立
  - 信息叙事是否有冲击力

### Decision: Mock-only

- 首版所有内容都使用本地 mock
- 不接 API
- 不接设备实时数据

原因：

- 让 demo 完全不受现有产品稳定性影响
- 避免官网体验被技术集成拖慢

## Risks / Trade-offs

- 风险：
  - 如果首版视觉太轻，会显得像普通 landing page
  - 如果首版技术过重，会把 demo 变成渲染试验场
- 取舍：
  - 本轮偏向“高冲击、可演示、可快速调整”
  - 而不是“技术最复杂”

## Migration Plan

后续可能路径：

1. demo 成立
   - 继续强化为正式宣传站
2. demo 中的视觉层成立
   - 再评估是否迁入 `apps/web` 或独立正式站
3. 需要重型 3D
   - 评估引入 `Three.js` 或 `three-vue-tres` 风格场景模块

## Open Questions

- 首版 demo 是否固定采用 `React + Vite`
- 首版是否直接引入轻量 3D / WebGL 层
- 首版品牌文案要偏：
  - 产品宣传
  - 技术官网
  - 数字展演
