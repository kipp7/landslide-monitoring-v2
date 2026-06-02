# Desk-win 交接说明 / Production Handoff

> 用途：用于把当前 desk-win 交付包直接交给测试、验收或接收方。  
> Purpose: use this document when handing the current desk-win package to QA, reviewers, or external receivers.

## 交接范围 / Handoff Scope

- 固定 latest 目录：`artifacts/desk-win/latest/`  
  Fixed latest directory: `artifacts/desk-win/latest/`
- 固定 latest 压缩包：`artifacts/desk-win/latest.zip`  
  Fixed latest zip package: `artifacts/desk-win/latest.zip`
- Inno 安装器：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`  
  Inno installer: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\installer\LandslideDesk-Setup-win-x64-628c350.exe`
- custom BA 安装器：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`  
  Custom BA installer: `E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline\artifacts\desk-win\customba-installer\LandslideDesk-CustomBA-Setup-628c350-20260512-174022.exe`
- 客户端边界：当前正式客户端固定为 `desk-win`，业务数据入口固定为 `API-only`。  
  Client boundary: the current formal client is fixed to `desk-win` and its business data entry is fixed to `API-only`.

## 接收方必须拿到 / Mandatory Items for the Receiver

- 交付件本体：`latest/` 或 `latest.zip`。  
  The main delivery package: `latest/` or `latest.zip`.
- 至少一种安装器：Inno 或 custom BA，按接收场景选择。  
  At least one installer: choose Inno or custom BA depending on the handoff scenario.
- 交付索引与交付摘要。  
  The delivery index and the delivery summary.
- API-only 边界留证，确认客户端不直连 `PostgreSQL, ClickHouse`。  
  The API-only boundary proof confirming the client does not directly connect to `PostgreSQL, ClickHouse`.
- 人工验收清单与安装器验证报告。  
  The manual acceptance checklist and installer verification reports.

## 建议随包提供的说明文件 / Recommended Companion Documents

- `docs/unified/reports/desk-win-delivery-summary-latest.md`  
  `docs/unified/reports/desk-win-delivery-summary-latest.md`
- `docs/unified/reports/desk-win-release-notes-latest.md`  
  `docs/unified/reports/desk-win-release-notes-latest.md`
- `docs/unified/reports/desk-win-manual-acceptance-latest.md`  
  `docs/unified/reports/desk-win-manual-acceptance-latest.md`
- `docs/unified/reports/desk-win-delivery-index-latest.json`  
  `docs/unified/reports/desk-win-delivery-index-latest.json`
- `docs/unified/reports/desk-win-delivery-hash-latest.json`  
  `docs/unified/reports/desk-win-delivery-hash-latest.json`
- `docs/unified/reports/desk-api-boundary-latest.json`  
  `docs/unified/reports/desk-api-boundary-latest.json`

## 环境要求 / Environment Requirements

- Windows x64 目标机。  
  A Windows x64 target machine.
- 可正常加载 WebView2 Runtime。  
  A machine that can load the WebView2 Runtime.
- 交付给客户端的是 API 地址与客户端配置，不是数据库账号或数据库连接串。  
  Provide API endpoints and client configuration to the receiver, not database credentials or direct connection strings.
- 若走解压包运行路径，应确认 `.NET 8 WindowsDesktop Runtime` 已可用。  
  If the receiver uses the unpacked package path, confirm that `.NET 8 WindowsDesktop Runtime` is available.
- 若走安装器路径，应优先按安装器自身引导完成。  
  If the receiver uses an installer, follow the guided installer flow first.

## 接收方最小动作 / Minimum Receiver Actions

- 解压 latest.zip 或直接使用 latest/ 目录
- Unzip latest.zip or use the latest/ directory directly
- 启动 LandslideDesk.Win.exe，并确认进入可见 UI
- Launch LandslideDesk.Win.exe and confirm that it reaches a visible UI
- 如走安装器路径，完成一次安装、启动和卸载验证
- If the installer path is used, complete one install, launch, and uninstall cycle

## 当前验收结论 / Current Acceptance Result

- `latest.zip` 自动验证通过。  
  `latest.zip` passed automated verification.
- Inno 安装器自动验证通过。  
  The Inno installer passed automated verification.
- custom BA 安装器自动验证未通过。  
  The custom BA installer did not pass automated verification.
- API-only 边界验证通过：`ready=true`。  
  The API-only boundary validation passed with `ready=true`.
- 当前仍有 `1` 个超大 JS 包，但它们不阻塞本轮交付。  
  There are still `1` oversized JS bundles, but they do not block this handoff.

## 后续处理原则 / Follow-up Policy

- 使用 latest.zip 或 latest/ 作为主交付件
- Use latest.zip or latest/ as the primary handoff package
- 按接收场景提供 Inno 或 custom BA 安装器
- Provide the Inno or custom BA installer based on the receiver scenario
- 附带交付索引、发布说明和人工验收清单
- Include the delivery index, release notes, and manual acceptance checklist
- 后续页面能力继续沿用 API-only 客户端边界，不新增前端直连数据库路径
- Keep future page capabilities on the same API-only client boundary and do not add any direct database path on the client side
- 仅修复真实交接或试交付中暴露的问题
- Only fix defects discovered during real handoff or trial distribution
