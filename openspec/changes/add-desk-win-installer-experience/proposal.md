# Change: Desk-win Installer Experience

## Why

当前 `desk-win` 已具备可交付的 latest 包，但仍属于“复制/解压后直接运行”的发布形态，不是普通用户习惯的“下一步 -> 下一步 -> 完成”安装体验。

如果要进一步降低现场部署门槛，就需要补一条独立的安装器分发能力：明确安装目录、快捷方式、卸载入口，并处理运行前置条件。

## What Changes

- 为 `desk-win` 增加 EXE 安装器分发形态
- 优先采用 `self-contained` 桌面端发布，避免用户单独安装 `.NET 8 WindowsDesktop Runtime`
- 安装器负责检查并安装 WebView2 Runtime（Bootstrapper 或离线安装包）
- 安装器提供：
  - 安装目录选择
  - 开始菜单 / 桌面快捷方式
  - 卸载入口
  - 安装完成后启动应用
- 补充安装/卸载/首次启动的验收脚本与交接文档

## Non-Goals

- 不在本变更中处理自动更新
- 不在本变更中处理生产代码签名
- 不切换当前已完成的 latest 便携包交付方式，安装器是新增分发路径
- 不改动 Desk 页面 UI、业务逻辑或后端接口

## Impact

- Affected specs: `windows-desktop-distribution`
- Affected code:
  - `apps/desk-win/*`
  - `scripts/dev/*`
  - `docs/unified/reports/*`
  - 可能新增安装器工程或安装脚本目录
