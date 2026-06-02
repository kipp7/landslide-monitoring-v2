---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-independent-promo-demo/tasks
---

## 1. Specification

- [x] 1.1 定义独立宣传官网 demo 的工作区边界
- [x] 1.2 定义首版 demo 的单页信息结构与章节范围
- [x] 1.3 定义 mock-only 运行边界与非目标
- [x] 1.4 定义移动端、低性能设备和 reduced-motion 降级规则

## 2. Demo Workspace

- [x] 2.1 新增独立工作区 `apps/promo-demo/`
- [x] 2.2 建立最小可运行的 Vue + TypeScript 前端骨架
- [x] 2.3 建立独立样式入口与视觉变量系统
- [x] 2.4 建立静态资源与 mock 内容目录

## 3. Experience Implementation

- [x] 3.1 实现高冲击 Hero 与首屏文案
- [x] 3.2 实现场景化山体/节点/风险网络视觉层
- [x] 3.3 实现“感知网络 -> 网关 -> 平台 -> 预警中心”叙事章节
- [x] 3.4 实现技术可信章节与最终 CTA

## 4. Quality

- [x] 4.1 保证桌面端主视口视觉完成度
- [x] 4.2 补齐移动端可读性与布局降级
- [x] 4.3 补齐 `prefers-reduced-motion` 降级
- [x] 4.4 避免将 demo 写成依赖现有后台壳的页面

## 5. Verification

- [x] 5.1 `openspec validate add-independent-promo-demo --strict`
- [x] 5.2 demo 工作区可安装依赖并启动
- [x] 5.3 demo 工作区可构建通过
- [x] 5.4 不影响现有 `apps/web`、`apps/desk`、`apps/desk-win` 默认入口
