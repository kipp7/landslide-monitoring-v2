---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-harmonyos-spatial-app-ui-foundation/proposal
---

## Why

当前仓库的移动端入口仍停留在“Flutter 通用巡检 App”口径：

- `apps/mobile/README.md`
- `docs/features/prd/mobile-app.md`
- `docs/features/flutter/app-architecture.md`

但用户已经明确把方向切到：

- HarmonyOS 系统 App
- 先做页面级 UI 效果，再继续深入
- 目标不是普通后台式手机端，而是“颠覆性、让人眼前一亮”的空间化产品

这意味着当前移动端不再只是“把桌面端功能搬到手机”，而是需要一条新的产品与设计主线：

- HarmonyOS-first
- event-centered
- spatial twin flavored
- page-first visual prototype before deeper runtime implementation

同时，当前仓库没有现成的 HarmonyOS 工程和工具链真值；如果直接开始写运行时代码，会在目录、技术路线、视觉系统、系统能力接入点上持续反复。因此需要先建立这条能力的规范与第一页原型方向。

## What Changes

- 新增 `harmonyos-spatial-app-ui` 能力规范
- 将移动端产品方向收口为：
  - HarmonyOS-first
  - 空间孪生型风险指挥 App
  - 事件优先而不是设备优先
- 冻结第一阶段目标为：
  - 先完成所有核心页面的高保真 UI 原型
  - 再进入 HarmonyOS 运行时落地
- 定义第一版主信息架构：
  - `空间`
  - `事件`
  - `任务`
  - `我的`
- 定义第一批核心页面：
  - 登录
  - 空间总览
  - 事件列表
  - 事件详情
  - 任务中心
  - 巡检任务详情 / 扫码进入
  - 设备 / 站点快览
  - 我的 / 设置
- 定义视觉系统和交互主张：
  - `Topographic`
  - `Spatial`
  - `Mission Control`
  - `Industrial Glass`
  - `Safety Orange`
- 明确 HarmonyOS 原生能力接入边界：
  - Push
  - Location
  - Scan
  - Linking

## Impact

- Affected specs:
  - `harmonyos-spatial-app-ui`（新增）
- Affected code:
  - `apps/mobile/`（移动端入口将从 Flutter 口径转向 HarmonyOS-first UI prototype / app workspace）
  - 未来可能新增：
    - `apps/mobile/prototype/`
    - 或 HarmonyOS 工程目录
- Affected docs:
  - `apps/mobile/README.md`
  - `docs/features/prd/mobile-app.md`
  - `docs/features/flutter/app-architecture.md`
  - 后续可能新增 HarmonyOS 设计与实现说明文档

## Non-Goals

- 本变更不实现官网 / 数字展厅
- 本变更不在第一轮直接交付完整可运行的 HarmonyOS 工程
- 本变更不把全量 3D 精模、完整预测配置、复杂 Web3 交互纳入第一阶段
- 本变更不把移动端继续定义为桌面端缩小版
- 本变更不把核心体验落成纯 WebView 套壳
