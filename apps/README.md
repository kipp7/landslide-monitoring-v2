---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/apps/readme
---

# apps/

可交付应用层（User-facing artifacts）。

规则：

- App/Web **只依赖** `services/api` 提供的 HTTP API（OpenAPI），禁止直连数据库。
- 共享 DTO/Client 最终应来自 `docs/integrations/api/openapi.yaml` 的 codegen（见 `docs/guides/standards/code-generation.md`）。

子目录：

- 当前默认正式客户端：
  - `apps/desk/`：桌面端业务 UI
  - `apps/desk-win/`：Windows 原生壳
- `apps/web/` 和 `apps/mobile/` 当前不是默认开发目标，除非用户明确要求对应端的工作。
- `apps/web/`：Web 管理端（Next.js + TypeScript）
- `apps/mobile/`：移动端（Flutter，用 Android Studio 开发也放这里）
