---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-modern-desktop-installer-shell/tasks
---

## 1. Discovery

- [ ] 1.1 明确现代化安装器壳层目标与视觉边界，不再将欢迎图替代为整体 UI 方案
- [ ] 1.2 评估 `WiX Burn + Bootstrapper UI` 与保留 Inno 两条路线的取舍
- [ ] 1.3 产出兼容性矩阵：Windows 版本、权限、WebView2、离线、并存、卸载、分发风险

## 2. Design

- [ ] 2.1 选定现代化安装器实现路线
- [ ] 2.2 定义可复用资产清单与适配层
- [ ] 2.3 定义失败回退策略：安装失败、Runtime 安装失败、离线环境、权限不足

## 3. Implementation

- [ ] 3.1 建立新的安装器工程或 bootstrapper 壳层
- [ ] 3.2 接入现有 `self-contained` 发布与 WebView2 检查逻辑
- [ ] 3.3 保持开始菜单、卸载入口、安装后启动和现有交付链兼容

## 4. Verification

- [ ] 4.1 补现代化安装器 smoke 与兼容性验证
- [ ] 4.2 更新交付文档与 modern installer 交接入口
- [ ] 4.3 明确是否将其升级为主交付路径，或继续与 Inno 并行