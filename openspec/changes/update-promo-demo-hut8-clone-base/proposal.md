---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/update-promo-demo-hut8-clone-base/proposal
---

## Why

当前 `apps/promo-demo` 的单屏地图已经把“看不懂的抽象母体”纠正成了可读场景，但用户已经明确否决继续在这套自创版式上慢慢修：

- 当前壳子不是一个足够强的宣传官网骨架
- 视觉节奏与品牌气质还不够像真正的大厂技术官网
- 用户要求先找参考站，直接复刻，再把山体滑坡产品内容叠加进去

本轮已经锁定 `https://www.hut8.com/` 作为首页结构母模板，因此需要一次独立变更来记录：

- 从 map-first HUD demo
- 切到 browser-first 的 reference clone homepage

## What Changes

- 将 `apps/promo-demo` 的首页壳体切换为 Hut 8 风格的长滚动固定舞台结构
- 保留当前 3D 场景作为固定背景舞台，而不是继续让 HUD 面板主导画面
- 将首页重排为一条可持续扩展的章节机器：
  - landing manifesto
  - 三段重复 sticky chapter
  - narrative / proof chapter
  - business / footer
- 将文案语义替换为山体滑坡产品表达：
  - 前兆感知
  - 边缘网关
  - 区域模型
  - 可信闭环
  - 部署证明
- 将后续 three-vue-tres 深化的位置收口到 proof / data-theater 章节，而不是全站同时重做

## Impact

- Affected specs:
  - `independent-promo-demo`
- Affected code:
  - `apps/promo-demo/src/App.vue`
  - `apps/promo-demo/src/style.css`
  - `apps/promo-demo/src/components/clone-shell/*`
  - `apps/promo-demo/src/lib/sections.ts`
  - `apps/promo-demo/src/lib/cloneShellContent.ts`
- Affected docs:
  - `docs/research/hut8/*`
  - `docs/research/components/hut8/*`

## Non-Goals

- 本轮不做 Hut 8 全站逐像素全页面复刻
- 本轮不接真实业务后端或真实部署数据
- 本轮不把 `apps/promo-demo` 接回桌面端或 `apps/web`
- 本轮不立即重做所有 3D 镜头脚本，只先让首页骨架成立
