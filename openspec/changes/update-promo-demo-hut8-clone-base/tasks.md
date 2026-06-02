---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/update-promo-demo-hut8-clone-base/tasks
---

## 1. Specification

- [ ] 1.1 为 `independent-promo-demo` 增加参考站复刻基座要求
- [ ] 1.2 为 `independent-promo-demo` 增加固定舞台与 sticky rail 章节要求
- [ ] 1.3 为 `independent-promo-demo` 增加 proof/business/footer 收束要求

## 2. Research

- [ ] 2.1 保存 Hut 8 桌面端和移动端参考截图
- [ ] 2.2 写出 `PAGE_TOPOLOGY.md`
- [ ] 2.3 写出 `BEHAVIORS.md`
- [ ] 2.4 写出关键组件 spec

## 3. Homepage Shell

- [ ] 3.1 替换 `apps/promo-demo` 的 HUD 单屏壳子
- [ ] 3.2 建立固定顶栏与菜单抽屉
- [ ] 3.3 建立 landing hero + trilogy sticky 章节
- [ ] 3.4 建立 proof / business / footer 收束结构

## 4. Scene Integration

- [ ] 4.1 保留当前 `PromoScene` 作为固定背景舞台
- [ ] 4.2 用滚动章节驱动当前场景 stage 切换
- [ ] 4.3 压低旧 HUD 逻辑，避免继续主导页面

## 5. Verification

- [ ] 5.1 `openspec validate update-promo-demo-hut8-clone-base --strict`
- [ ] 5.2 `npm --prefix apps/promo-demo run build`
- [ ] 5.3 浏览器检查 hero、sticky chapter、proof 章节
