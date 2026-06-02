---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/update-promo-demo-tres-digital-twin/proposal
---

## Why

当前 `apps/promo-demo` 已经从抽象发光母体转成了可读的三维监测地图，但仍然停留在“可讨论 demo”层级：

- 场景表达仍偏 low-poly / demo look
- 现场构筑物与坡脚细节不足
- 原始 `Three.js` imperative 场景控制器继续扩展的维护成本偏高

用户已经明确收口本轮方向：

- 做成高保真数字孪生
- 补护栏、电杆、坡脚细节
- 将当前锁定场景迁到 `three-vue-tres` 深化

这已经超出普通视觉迭代，属于 promo-demo 的场景架构与能力升级，需要独立变更记录。

## What Changes

- 将 `apps/promo-demo` 的三维场景宿主从 raw imperative scene controller 升级为 `three-vue-tres` / `@tresjs/core` 风格容器
- 将当前地图场景拆成可维护的场景层：
  - terrain / geology
  - village / vegetation
  - field infrastructure
  - telemetry / alert
- 将 promo-demo 的视觉基线从“科技风 demo”提升为“高保真数字孪生场景”
- 明确要求补足现场部署细节：
  - 护栏
  - 电杆
  - 坡脚构筑物
  - 风险坡面周边地物
- 保持现有单屏、mock-only、独立运行边界不变

## Impact

- Affected specs:
  - `independent-promo-demo`
- Affected code:
  - `apps/promo-demo/package.json`
  - `apps/promo-demo/vite.config.ts`
  - `apps/promo-demo/src/components/PromoScene.vue`
  - `apps/promo-demo/src/components/tres/*`
  - `apps/promo-demo/src/composables/*`
- Affected runtime:
  - `apps/promo-demo` 的 WebGL 场景初始化方式
  - promo-demo 的构建依赖树

## Non-Goals

- 本轮不把 promo-demo 接回 `apps/web` 或桌面端
- 本轮不接真实 API、真实设备数据或地图服务
- 本轮不追求 GIS 级精确测绘
- 本轮不引入完整地理坐标系或瓦片地图系统
