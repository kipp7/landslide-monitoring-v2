---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/update-promo-demo-tres-digital-twin/design
---

## Context

当前 promo-demo 已经验证了“地图优先”的叙事方向，但还没有达到高保真数字孪生的说服力。

同时，当前场景实现仍集中在一个大型 imperative `createPromoScene.ts` 中，继续叠加复杂地物、细节与动效会带来三个问题：

- 维护成本持续升高
- 场景层之间难以独立调优
- 后续无法顺畅迁入更高密度的数字孪生细节

因此本轮不只是补细节，而是要同时完成场景架构升级。

## Goals / Non-Goals

- Goals:
  - 迁移 promo-demo 到 `@tresjs/core` 容器
  - 将场景拆成独立层级和可复用 composable
  - 把视觉基线拉到“高保真数字孪生”而不是“低模科技 demo”
  - 强化现场部署可信感
- Non-Goals:
  - 不做真实 GIS 引擎
  - 不做真实测绘精度承诺
  - 不接线上后端与真实设备流

## Decisions

### Decision: 使用 `@tresjs/core` 作为场景宿主，保留 `three` 作为底层几何与材质能力

- 选择：
  - `@tresjs/core`
  - `three`
  - 必要时辅以 `@tresjs/cientos`
- 不选择：
  - 继续把所有逻辑堆在单个 imperative 控制器里

原因：

- 用户明确要求迁到 `three-vue-tres`
- Tres 更适合组件化拆分复杂 scene graph
- 底层 `three` 仍保留可控性，适合自定义高保真细节

### Decision: 场景按“环境 / 现场 / 网络 / 风险”四层拆分

- `TerrainLayer`
  - 地形、坡面、坡脚、地貌色带
- `SettlementLayer`
  - 村落、植被、远山、地表雾
- `InfrastructureLayer`
  - 指挥中心、道路、护栏、电杆、站点、链路
- `HazardLayer`
  - 风险坡面、预警区、告警强化逻辑

原因：

- 方便分别调材质、动画和镜头
- 方便后续继续提保真度

### Decision: 高保真定义为“工程可信感 + 地形层次 + 现场细节”

本轮高保真不靠更重粒子或更高亮 bloom，而靠：

- 坡面与地层层次
- 构筑物细节
- 环境前后景关系
- 高风险点的聚焦控制

原因：

- 用户当前最不接受的是“看不懂”和“像 demo 摆件”
- 数字孪生的说服力来自现场可信度，不来自泛滥的发光特效

## Risks / Trade-offs

- 风险：
  - Tres 迁移期间，构建和类型层可能出现适配问题
  - 组件化后初期重复代码可能上升
  - 高保真细节会抬高 bundle 与渲染成本
- 缓解：
  - 保留 `three` 原生几何和材质能力
  - 继续坚持 mock-only，避免外部系统变量
  - 将高保真主要投入到静态构筑物和材质层，而不是无上限动画

## Migration Plan

1. 先引入 Tres 容器与基础依赖
2. 用 Tres 组件承载现有单屏场景
3. 逐层迁移环境与基础设施
4. 再补护栏、电杆、坡脚等细节
5. 最后重新平衡 alert mode 的焦点与亮度

## Open Questions

- 是否在后续引入 `@tresjs/post-processing` 做更受控的 bloom / tone pipeline
- 是否为最终正式站保留两个质量档位：
  - demo high
  - perf safe
