---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/update-promo-demo-hut8-clone-base/design
---

## Context

当前 promo-demo 面临的问题已经不是“场景清不清楚”，而是“整站壳体是否足够像一个真正能打的技术官网”。用户明确要求先按参考站整站方法重建，再往里面灌入我们的产品语义。

已经做出的方向决策：

- 首页结构母模板固定为 `Hut 8`
- `Lusion` 只保留为局部场景气质参考，不再作为全站骨架

## Goals / Non-Goals

- Goals:
  - 用 Hut 8 的结构语法重建 `apps/promo-demo` 首页
  - 让当前 3D 场景退居固定背景舞台
  - 建立可复用的 sticky chapter shell
  - 为后续继续逐章复刻提供明确研究文档和 spec
- Non-Goals:
  - 不做 investor/news 完整后半站
  - 不做真实内容运营后台
  - 不在本轮追求所有滚动动效与媒体层完全一比一

## Decisions

### Decision: 采用 “固定背景舞台 + 长滚动 rail + 重复 sticky 章节” 作为首页基础结构

选择：

- 顶栏固定
- 背景场景固定
- chapter rail 使用 sticky shell

不选择：

- 继续使用单屏 HUD 式布局
- 继续以右侧控制面板主导结构

原因：

- 这正是 Hut 8 最有辨识度、且最适合当前产品的骨架
- 当前已有 3D 场景，最合理的做法是把它收编成舞台层，而不是继续围着 HUD 转

### Decision: 当前 3D Scene 先只承担“舞台层”，不承担整个页面语法

选择：

- `PromoScene` 作为固定背景层保留
- 页面章节切换用 DOM + sticky 实现

原因：

- 这样能最快拉开与旧 demo 的差异
- 不会再把所有难度压到 3D 场景内部

### Decision: 章节命名沿用产品语义，但视觉语法优先贴近参考站

例如：

- `Power` -> `前兆感知`
- `Digital Infrastructure` -> `边缘网关`
- `Compute` -> `区域模型`

原因：

- 用户要的是“像那个站的壳子”，不是继续只拿灵感
- 但最终站点必须说我们自己的产品语言

## Risks / Trade-offs

- 风险：
  - 页面会暂时出现“结构像 Hut 8，但局部细节还没完全对齐”的过渡状态
  - sticky 章节过多时，文字切换容易出现叠影和节奏问题
  - 当前 3D 背景与文案覆盖层仍需继续调镜头和亮度
- 缓解：
  - 先把 hero / trilogy / proof 三个关键段落做稳
  - 后续逐章做视觉 QA 截图比对
  - 将 3D 深化集中在 data-theater 段落

## Migration Plan

1. 固定参考站：
   - `Hut 8`
2. 生成研究资料：
   - 页面拓扑
   - 行为记录
   - 关键组件 spec
3. 替换 `apps/promo-demo` 首页壳子
4. 保留当前 Three/Tres scene 作为背景
5. 浏览器截图对比，继续逐章修正

## Open Questions

- 是否在下一轮引入更强的章节进出过渡，而不只是 sticky 定位
- 是否把 proof 章节继续拆成独立组件，作为后续 `three-vue-tres` 深化接口
