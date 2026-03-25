# Desk-win 发布说明 / Release Notes

> 版本定位：本版为当前可交付的 desk-win 阶段性发布。  
> Release scope: this is the current handoff-ready desk-win release.

## 本次发布包含 / This Release Includes

- WPF + WebView2 桌面端外壳。  
  A WPF + WebView2 desktop shell.
- 已打入包内的 `apps/desk` 静态前端资源。  
  Bundled static frontend assets from `apps/desk`.
- 固定 latest 出口、delivery bundle、Inno 安装器、custom BA 安装器。  
  Fixed latest outputs, a delivery bundle, an Inno installer, and a custom BA installer.
- 交付摘要、交接说明、人工验收清单与验证报告。  
  A delivery summary, production handoff, manual acceptance checklist, and verification reports.

## 本轮确认通过 / Confirmed in This Release

- 解压包启动验证通过：`readyAfterLaunch=true`。  
  The unpacked package launch verification passed with `readyAfterLaunch=true`.
- Inno 安装器验证通过：`ready=True`。  
  The Inno installer verification passed with `ready=True`.
- custom BA 安装器验证通过：`ready=True`。  
  The custom BA installer verification passed with `ready=True`.
- 前置环境检查与交付总验收报告已生成。  
  Prerequisite checks and delivery acceptance reports have been generated.

## 推荐交付组合 / Recommended Handoff Set

- `artifacts/desk-win/latest.zip`  
  `artifacts/desk-win/latest.zip`
- `artifacts/desk-win/latest/`  
  `artifacts/desk-win/latest/`
- `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-938f86e.exe`  
  `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-938f86e.exe`
- `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-938f86e-20260324-094034.exe`  
  `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-938f86e-20260324-094034.exe`

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

## 接收方建议 / Guidance for Receivers

- 只需快速体验时，优先使用 `artifacts/desk-win/latest.zip`。  
  Use `artifacts/desk-win/latest.zip` first when the receiver only needs a quick evaluation build.
- 需要标准安装卸载流程时，使用 Inno 安装器。  
  Use the Inno installer when a standard install and uninstall flow is required.
- 需要更完整品牌化安装体验时，使用 custom BA 安装器。  
  Use the custom BA installer when a more branded installation experience is required.

## 真值快照 / Source-of-Truth Snapshot

- 当前 delivery bundle：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\delivery\desk-win-delivery-20260324-093559.zip`  
  Current delivery bundle: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\delivery\desk-win-delivery-20260324-093559.zip`
- Exe SHA256：`e6f33723dd96abaf2dfc6bc4a7302bd77d55a4e826204c62551940af9b0dcc43`  
  Exe SHA256: `e6f33723dd96abaf2dfc6bc4a7302bd77d55a4e826204c62551940af9b0dcc43`
- WebIndex SHA256：`116953072022e8e84f1423def3f4430355d9d4abcab9a83279854243059dc4b4`  
  WebIndex SHA256: `116953072022e8e84f1423def3f4430355d9d4abcab9a83279854243059dc4b4`
- BundleZip SHA256：`09db30cb9c1488cacaf69294b156294b394b8d1ad95d31699c8115fc5044b0f2`  
  BundleZip SHA256: `09db30cb9c1488cacaf69294b156294b394b8d1ad95d31699c8115fc5044b0f2`
