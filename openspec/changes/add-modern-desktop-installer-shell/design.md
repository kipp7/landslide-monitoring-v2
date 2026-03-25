## Context

当前 `desk-win` 已经完成：

- `self-contained` 桌面端发布
- WebView2 Bootstrapper 安装
- Inno 安装器构建与 smoke
- delivery bundle / latest 交付链集成

现有短板不是“安装链路不存在”，而是 Inno 只能提供有限的向导壳层定制，无法让整体安装器气质真正现代化。

## Goals / Non-Goals

- Goals:
  - 让安装器整体视觉形成现代、品牌化、简约的统一感
  - 最大化复用现有发布、运行时、验证、交付链
  - 把兼容性作为首要约束，而不是附属项
- Non-Goals:
  - 不重写桌面应用本体
  - 不推翻当前 Inno 作为短期稳定交付路径
  - 不在本阶段实现自动更新与正式签名

## Decisions

- Decision: 优先探索 `WiX Burn + Bootstrapper UI`
  - Why:
    - 能改变整个安装器入口和流程观感，而不是只换侧边图
    - 更适合处理 prerequisite / bundle / bootstrapper 级逻辑
    - 可以把现有 `self-contained` 与 WebView2 逻辑挂接进去

- Decision: 保留现有 Inno 路线作为稳定回退
  - Why:
    - 现有路线已经通过 smoke，并且已进入交付链
    - 新路线在完全验证前不应替代现有可交付路径

- Decision: 最大限度复用现有脚本链
  - Reuse candidates:
    - `scripts/dev/publish-desk-win-selfcontained.ps1`
    - `scripts/dev/verify-desk-win-installer.ps1`
    - `scripts/dev/prepare-desk-win-delivery.ps1`
    - `docs/unified/reports/desk-win-installer-latest.json`
    - `artifacts/desk-win/prerequisites/MicrosoftEdgeWebView2Setup.exe`

## Compatibility Matrix

- OS:
  - Windows 10 x64
  - Windows 11 x64
- Install mode:
  - `per-user` without admin when possible
  - 明确需要提权的场景与提示
- Runtime:
  - `.NET` 继续 `self-contained`
  - WebView2 支持已安装 / 在线安装 / 离线失败提示 / 回退
- Coexistence:
  - 新安装器与旧 Inno 安装器
  - 新安装器与 `latest` 便携包
- Lifecycle:
  - install
  - first launch
  - upgrade
  - uninstall
  - rollback on failure
- Distribution risks:
  - SmartScreen
  - 杀软误报
  - 受限网络
  - 校园/单位设备限制

## Risks / Trade-offs

- 新安装器壳层视觉更强，但实现复杂度高于 Inno
- WiX Burn 需要额外工程与打包知识，首轮接入成本不可忽略
- 若过早切主线，可能影响当前已完成的交付稳定性

## Migration Plan

1. 先保留 Inno 路线不动，维持现成交付能力
2. 新建 modern installer 支路，打通 bootstrapper MVP
3. 用现有 smoke / delivery 流程验证新路线
4. 仅在兼容性和交付链都通过后，决定是否提升为主交付路径

## Estimate

- 提案与技术选型：0.5 天
- Bootstrapper MVP 接入并复用现有发布链：1 到 2 天
- 兼容性补齐与 smoke 适配：1 到 2 天
- 文档与交付链接入：0.5 到 1 天

保守估计：`3 到 5 个工作日`

如果只做“能跑的现代化 MVP”而不立刻做完整交付切换，可能压缩到 `1.5 到 2.5 天`。
