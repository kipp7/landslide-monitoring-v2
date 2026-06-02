---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/apps/mobile/readme
---

# apps/mobile/

当前移动端工作区的真值不是旧的 Flutter 巡检 App，而是面向 HarmonyOS 产品方向的高保真页面原型基线。

## 当前定位

- 产品方向：HarmonyOS-first 山体风险空间指挥 App
- 当前交付物：`React + Vite` 页面级高保真原型
- 当前目标：先冻结页面体系、视觉语言、信息架构，再进入 HarmonyOS 原生运行时落地
- 当前主导航：
  - `空间`
  - `事件`
  - `任务`
  - `我的`

## 当前原型说明

- 入口：`apps/mobile/src/`
- 运行命令：
  - `npm --workspace apps/mobile run dev`
  - `npm --workspace apps/mobile run build`
  - `npm --workspace apps/mobile run lint`
- 当前页面：
  - 登录
  - 空间总览（当前改为“总览 + 分流”页面，只保留只读 `WebGL / Three.js` 空间预览）
  - 3D 模型舱（`/space/model`，当前为专注模式 `WebGL / Three.js` 动态场景，支持热点命中与回中）
  - 事件列表
  - 事件详情
  - 任务中心
  - 任务详情
  - 设备 / 站点快览
  - 我的 / 设置
  - 状态基线页（`/me/states`，统一预览 `loading / empty / error / offline`）

## 当前约束

- 这不是最终 HarmonyOS 运行时代码，不得误写成“已完成鸿蒙工程”
- 原型必须显式表达 HarmonyOS 相关能力接入位：
  - Push
  - Location
  - Scan
  - Linking
- 当前 3D 场景已做路由级懒加载拆分，避免把 `Three.js` 场景整体压进登录首包
- 当前模型页已接入 `gsap` / `@gsap/react`，用于模型舱入场和焦点信息过渡
- 当前环境未确认 `hvigorw` / `ohpm` / `DevEco` 工具链真值，因此先做页面与交互基线

## 历史参考

- 旧的 Flutter v2 口径仍保留在以下文档中，但它们现在属于历史实现参考，不再是当前产品真值：
  - `docs/features/prd/mobile-app.md`
  - `docs/features/flutter/app-architecture.md`

## 参考

- 当前变更提案：`openspec/changes/add-harmonyos-spatial-app-ui-foundation/`
- App PRD（含历史 Flutter 参考）：`docs/features/prd/mobile-app.md`
- Flutter 架构（历史参考）：`docs/features/flutter/app-architecture.md`
