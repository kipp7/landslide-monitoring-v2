---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/apps/promo-demo/readme
---

# 独立宣传官网 Demo

这是一个与当前 `apps/web`、`apps/desk`、`apps/desk-win` 解耦的独立宣传官网 demo。

当前定位：

- 单页沉浸式展示
- mock-only
- 以重型 3D 场景、空间叙事和高冲击视觉为主

## 启动

在仓库根目录执行：

```powershell
npm install --workspace apps/promo-demo
npm -w apps/promo-demo run dev
```

默认地址：

- `http://localhost:4173`

## 构建

```powershell
npm -w apps/promo-demo run build
```

## 当前技术栈

- Vue 3
- Vite
- Three.js
- GSAP

## 当前边界

- 不接 API
- 不接数据库
- 不接鉴权
- 不嵌入现有后台或桌面端
