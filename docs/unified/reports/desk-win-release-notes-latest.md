# Desk-win 发布说明 / Release Notes

> 版本定位：本版为当前可交付的 desk-win 阶段性发布。  
> Release scope: this is the current handoff-ready desk-win release.

## 本次发布包含 / This Release Includes

- WPF + WebView2 桌面端外壳。  
  A WPF + WebView2 desktop shell.
- 已打入包内的 `apps/desk` 静态前端资源。  
  Bundled static frontend assets from `apps/desk`.
- API-only 客户端边界留证，当前正式客户端固定为 `desk-win`。  
  API-only client boundary proof with the current formal client fixed to `desk-win`.
- 固定 latest 出口、delivery bundle、Inno 安装器、custom BA 安装器。  
  Fixed latest outputs, a delivery bundle, an Inno installer, and a custom BA installer.
- 交付摘要、交接说明、人工验收清单与验证报告。  
  A delivery summary, production handoff, manual acceptance checklist, and verification reports.

## 本轮确认通过 / Confirmed in This Release

- 解压包启动验证通过：`readyAfterLaunch=true`。  
  The unpacked package launch verification passed with `readyAfterLaunch=true`.
- Inno 安装器验证通过：`ready=true`。  
  The Inno installer verification passed with `ready=true`.
- custom BA 安装器验证未通过：`ready=false`。  
  The custom BA installer verification did not pass and currently reports `ready=false`.
- API-only 边界验证通过：`ready=true`，`allowedDataEntry=API-only`。  
  The API-only boundary validation passed with `ready=true` and `allowedDataEntry=API-only`.
- 前置环境检查与交付总验收报告已生成。  
  Prerequisite checks and delivery acceptance reports have been generated.

## 推荐交付组合 / Recommended Handoff Set

- `artifacts/desk-win/latest.zip`  
  `artifacts/desk-win/latest.zip`
- `artifacts/desk-win/latest/`  
  `artifacts/desk-win/latest/`
- `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`  
  `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`
- `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`  
  `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`

## 推荐同时附带的文档 / Recommended Companion Documents

- `docs/unified/reports/desk-win-delivery-summary-latest.md`  
  `docs/unified/reports/desk-win-delivery-summary-latest.md`
- `docs/unified/reports/desk-win-production-handoff-latest.md`  
  `docs/unified/reports/desk-win-production-handoff-latest.md`
- `docs/unified/reports/desk-win-manual-acceptance-latest.md`  
  `docs/unified/reports/desk-win-manual-acceptance-latest.md`
- `docs/unified/reports/desk-win-delivery-index-latest.json`  
  `docs/unified/reports/desk-win-delivery-index-latest.json`
- `docs/unified/reports/desk-win-delivery-hash-latest.json`  
  `docs/unified/reports/desk-win-delivery-hash-latest.json`

## 已知非阻塞项 / Known Non-blocking Items

- 当前 chunk 报告仍有 `1` 个超大 JS 包，属于后续优化项，不影响本轮交付。  
  The current chunk report still contains `1` oversized JS bundles. This remains a follow-up optimization item and does not block this release.
- Docker 单机部署路径仍保留，但不替代本轮常规 desk-win 交付路径。  
  The Docker single-machine deployment path remains available, but it does not replace the standard desk-win delivery path for this release.
- 未来 Web 只作为后续适配方向，不是当前正式交付端；后续页面能力必须复用同一 API-only 边界。  
  Future Web remains a later adaptation path rather than the current formal delivery client; future page capabilities must reuse the same API-only boundary.

## 接收方建议 / Guidance for Receivers

- 只需快速体验时，优先使用 `artifacts/desk-win/latest.zip`。  
  Use `artifacts/desk-win/latest.zip` first when the receiver only needs a quick evaluation build.
- 需要标准安装卸载流程时，使用 Inno 安装器。  
  Use the Inno installer when a standard install and uninstall flow is required.
- 需要更完整品牌化安装体验时，使用 custom BA 安装器。  
  Use the custom BA installer when a more branded installation experience is required.
- 不向客户端侧分发数据库连接串、数据库账号或直连数据库 SDK。  
  Do not distribute database connection strings, database credentials, or direct database SDKs to the client side.

## 真值快照 / Source-of-Truth Snapshot

- 当前 delivery bundle：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\delivery\desk-win-delivery-20260512-174210.zip`  
  Current delivery bundle: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\delivery\desk-win-delivery-20260512-174210.zip`
- API-only 边界留证：`docs/unified/reports/desk-api-boundary-latest.json`  
  API-only boundary proof: `docs/unified/reports/desk-api-boundary-latest.json`
- Exe SHA256：`3596580a69f3befbd34f37dad6fee2b96076797c4de4c6da2ab850c30c12a41c`  
  Exe SHA256: `3596580a69f3befbd34f37dad6fee2b96076797c4de4c6da2ab850c30c12a41c`
- WebIndex SHA256：`86ce58918b660a580492fb94b0a2e37dcac2761533c937d9a864f4f7262e7f24`  
  WebIndex SHA256: `86ce58918b660a580492fb94b0a2e37dcac2761533c937d9a864f4f7262e7f24`
- BundleZip SHA256：`70275ebdfc9e7fe2fdc27fa9249d8bcb8f46376e868ba4cbb245be1fb58617e5`  
  BundleZip SHA256: `70275ebdfc9e7fe2fdc27fa9249d8bcb8f46376e868ba4cbb245be1fb58617e5`
