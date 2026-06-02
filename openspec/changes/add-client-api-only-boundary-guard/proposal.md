---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-client-api-only-boundary-guard/proposal
---

## Why

当前阶段已经冻结为 `desk-win` 唯一正式交付客户端，但服务端底座仍然必须保持 `Docker + API` 的统一边界。

如果 `apps/desk` 或 `apps/desk-win` 后续引入 PostgreSQL / ClickHouse 直连、连接串、数据库驱动或表结构耦合，那么当前 `desk-win` 与后续 `Web` 都会被锁死在数据库实现细节上，破坏当前主线。

## What Changes

- 为 `apps/desk` 增加 API-only 数据边界要求：只能经由现有 API contract / client 层取数与下发命令
- 为 `apps/desk-win` 增加 shell 边界要求：不得引入数据库驱动、连接串或直接访问数据存储
- 增加可执行的边界检查脚本与 JSON 报告
- 将边界检查接入 `desk-win` 交付验收与交付包
- 记录 durable decision，固定“当前客户端唯一交付 = desk-win；客户端访问边界 = API-only”

## Impact

- Affected specs:
  - `desk-frontend`
  - `windows-desktop-shell`
- Affected code:
  - `scripts/dev/check-desk-win-delivery.ps1`
  - `scripts/dev/prepare-desk-win-delivery.ps1`
  - `scripts/dev/package-desk-win-delivery.ps1`
  - `scripts/dev/check-desk-win-latest-delivery.ps1`
  - new `scripts/dev/check-desk-api-boundary.ps1`
  - `apps/desk-win/README.md`
  - `docs/guides/standards/quality-gates.md`
