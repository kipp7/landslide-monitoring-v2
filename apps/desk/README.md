---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/apps/desk/readme
---

# 桌面端（Windows）- UI Mock

目标：先用 mock 数据把桌面端 UI 做出来，并提前封装 API 接口层，后续再切换到真实后端。

当前角色：

- 当前正式 Windows 客户端的业务 UI 主入口
- 默认与 `apps/desk-win/` 配套开发
- 当前默认作为桌面端原型和优化来源

## 开发

在仓库根目录（本 worktree）执行：

```bash
npm install
npm -w apps/desk run dev
```

## 构建

```bash
npm -w apps/desk run build
```
