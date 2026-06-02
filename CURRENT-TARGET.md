---
title: CURRENT-TARGET
type: note
permalink: landslide-monitoring-v2-mainline/current-target
---

# Current Target

当前默认开发目标固定为 Windows 桌面端：

- `apps/desk/`：桌面端业务 UI 主入口
- `apps/desk-win/`：Windows 原生壳程序

当前正式交付基线固定为：

- `artifacts/desk-win/latest/`

当前交付索引固定为：

- `docs/unified/reports/desk-win-delivery-index-latest.md`

当前交接说明固定为：

- `docs/unified/reports/desk-win-production-handoff-latest.md`

重要规则：

- 除非用户明确要求 Web 管理端工作，否则不要把 `apps/web/` 当作默认原型来源、默认优化对象或默认验收面。
- `artifacts/desk-win/` 是交付基线集合，但当前唯一正式版本目录是 `artifacts/desk-win/latest/`。
- 开发源码入口和交付基线不是一回事：
  - 开发看 `apps/desk/` 和 `apps/desk-win/`
  - 交付看 `artifacts/desk-win/latest/`
