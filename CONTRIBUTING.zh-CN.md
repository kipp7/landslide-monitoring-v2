# 贡献指南

[English](CONTRIBUTING.md)

感谢你帮助改进山体滑坡监测 V2。

## 开发环境

在仓库根目录安装依赖：

```powershell
npm install
```

运行桌面 UI：

```powershell
npm run dev
```

启动 Windows 原生壳并连接开发服务器：

```powershell
npm run desktop:dev
```

## 提交 Pull Request 前

根据改动范围运行检查：

```powershell
npm audit
npm run lint
npm run build
npm run edge:build
npm run edge:lint
```

如果改动涉及 Windows 打包，也请运行：

```powershell
npm run desktop:publish
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\verify-windows-package.ps1
```

如果改动涉及固件或硬件资料，请同步更新对应 README，并说明构建、复核或打板上下文。

## Pull Request 规范

- 每个 PR 聚焦一个功能、修复或文档主题。
- 可见界面改动请附截图或短录屏。
- 公开安装、命令、范围或行为变化需要同步更新中英文文档。
- 不要提交 `artifacts/`、`dist/`、`bin/`、`obj/`、本地报告或运行状态目录等生成产物。
- 不要提交真实凭据、私有端点、现场口令、客户特定点位数据、本地证据包或本地环境文件。

## 项目约定

- 使用面向公开项目的目录名，例如 `apps/desktop-ui`、`edge/rk3568-gateway`、`firmware/rk2206-xl01` 和 `hardware/carrier-board`。
- 桌面端自动化脚本统一放在 `scripts/desktop`。
- 本地打包报告统一放在 `docs/reports`。
- 边缘服务应能通过根目录 workspace 脚本构建。
- 硬件文件作为可复核工程交付资料维护，不作为未经检查的打板保证。
- 优先保留清晰的工程文档，不提交内部工作日志。

## Commit 风格

建议使用简洁的 conventional-style 前缀：

- `feat:` 用户可见的新功能
- `fix:` Bug 修复
- `docs:` 文档
- `chore:` 工程维护
- `ci:` CI 配置
