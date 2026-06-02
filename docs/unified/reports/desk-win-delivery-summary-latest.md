# Desk-win 交付摘要 / Delivery Summary

> 当前摘要对应 2026-05-21 的最新 desk-win 交付集。  
> This summary reflects the latest desk-win delivery set as of 2026-05-21.

## 当前状态 / Current Status

- 交付状态：可交付。当前固定出口为 `artifacts/desk-win/latest/` 与 `artifacts/desk-win/latest.zip`。  
  Delivery status: ready for handoff. The fixed outputs are `artifacts/desk-win/latest/` and `artifacts/desk-win/latest.zip`.
- 桌面端形态：WPF + WebView2 桌面壳，内含 `apps/desk` 的静态前端资源。  
  Desktop form: WPF + WebView2 shell with bundled static assets from `apps/desk`.
- 当前正式客户端：`desk-win`。客户端业务数据入口固定为 `API-only`，不得直连 `PostgreSQL, ClickHouse`。  
  Current formal client: `desk-win`. Business data entry is fixed to `API-only` and must not connect directly to `PostgreSQL, ClickHouse`.
- 安装分发：同时提供 Inno 安装器与 custom BA 安装器。  
  Installation distribution: both the Inno installer and the custom BA installer are included.
- 后续页面能力：未来 Web 或其他客户端能力只能复用同一 API contract / client 边界，不得绕过 API。  
  Future page capabilities: any future Web or other client capability must reuse the same API contract/client boundary and must not bypass the API.

## 固定交付件 / Fixed Deliverables

- 解压即用包：`artifacts/desk-win/latest.zip`  
  Unpacked delivery package: `artifacts/desk-win/latest.zip`
- 固定 latest 目录：`artifacts/desk-win/latest/`  
  Fixed latest directory: `artifacts/desk-win/latest/`
- Inno 安装器：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`  
  Inno installer: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`
- custom BA 安装器：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`  
  Custom BA installer: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`

## 验证快照 / Verification Snapshot

- `latest.zip` 自动验证通过，关键结论为 `readyAfterLaunch=true`。  
  `latest.zip` passed automated verification, with `readyAfterLaunch=true`.
- Inno 安装器自动验证通过，关键结论为 `ready=true`。  
  The Inno installer passed automated verification with `ready=true`.
- custom BA 安装器自动验证未通过，当前报告为 `ready=false`。  
  The custom BA installer did not pass automated verification and currently reports `ready=false`.
- 运行与环境前置检查已完成，`.NET 8 WindowsDesktop Runtime` 与 `WebView2 Runtime` 均有留证。  
  Runtime and prerequisite checks are recorded, including `.NET 8 WindowsDesktop Runtime` and `WebView2 Runtime`.

## 真值文件 / Source-of-Truth Reports

- 交付索引：`docs/unified/reports/desk-win-delivery-index-latest.json`  
  Delivery index: `docs/unified/reports/desk-win-delivery-index-latest.json`
- 完整性校验：`docs/unified/reports/desk-win-delivery-hash-latest.json`  
  Integrity report: `docs/unified/reports/desk-win-delivery-hash-latest.json`
- latest 包验证：`docs/unified/reports/desk-win-latest-package-verify-latest.json`  
  Latest package verification: `docs/unified/reports/desk-win-latest-package-verify-latest.json`
- API-only 边界留证：`docs/unified/reports/desk-api-boundary-latest.json`  
  API-only boundary proof: `docs/unified/reports/desk-api-boundary-latest.json`
- Inno 安装器验证：`docs/unified/reports/desk-win-installer-verify-latest.json`  
  Inno installer verification: `docs/unified/reports/desk-win-installer-verify-latest.json`
- custom BA 安装器验证：`docs/unified/reports/desk-win-customba-installer-verify-latest.json`  
  Custom BA installer verification: `docs/unified/reports/desk-win-customba-installer-verify-latest.json`

## 已知非阻塞项 / Known Non-blocking Item

- 当前前端 chunk 报告仍存在 `1` 个超大 JS 包；这是已知非阻塞项，不影响本轮 desk-win 交付。  
  The frontend chunk report still shows `1` oversized JS bundles; this is a known non-blocking item and does not block this desk-win delivery.

## 交付建议 / Recommended Use

- 日常测试或直接发包，优先使用 `artifacts/desk-win/latest.zip`。  
  Use `artifacts/desk-win/latest.zip` first for routine testing or direct package handoff.
- 需要引导式安装时，使用 Inno 安装器。  
  Use the Inno installer when a guided installation path is preferred.
- 需要品牌化安装体验时，使用 custom BA 安装器。  
  Use the custom BA installer when a branded installation experience is required.
