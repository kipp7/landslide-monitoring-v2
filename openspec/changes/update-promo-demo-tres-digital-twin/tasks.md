---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/update-promo-demo-tres-digital-twin/tasks
---

## 1. Specification

- [ ] 1.1 为 `independent-promo-demo` 增加 Tres 场景架构要求
- [ ] 1.2 为 `independent-promo-demo` 增加高保真数字孪生要求
- [ ] 1.3 为 `independent-promo-demo` 增加现场细节构筑物要求

## 2. Tres Migration

- [ ] 2.1 在 `apps/promo-demo` 中引入 `@tresjs/core`
- [ ] 2.2 将 `PromoScene.vue` 切换为 Tres 场景宿主
- [ ] 2.3 建立场景层组件目录与基础 composable

## 3. Digital Twin Scene

- [ ] 3.1 重构 terrain / geology 层
- [ ] 3.2 重构 village / vegetation / backdrop 环境层
- [ ] 3.3 重构 infrastructure 层，补站点、道路、护栏、电杆和坡脚细节
- [ ] 3.4 重构 hazard / alert 层，保留高风险焦点并压制过曝

## 4. Quality

- [ ] 4.1 保持现有 `总览 / 站点 / 监测 / 预警` 模式切换语义
- [ ] 4.2 保持 mock-only 运行边界
- [ ] 4.3 保持移动端和 reduced-motion 的可接受降级

## 5. Verification

- [ ] 5.1 `openspec validate update-promo-demo-tres-digital-twin --strict`
- [ ] 5.2 `npm --prefix apps/promo-demo run build`
- [ ] 5.3 浏览器实机验证总览态、站点态、预警态
