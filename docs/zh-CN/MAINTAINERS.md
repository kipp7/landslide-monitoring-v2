# 维护者指南

本项目公开仓库聚焦当前维护、可构建、可复核的系统面：Windows 桌面客户端、RK3568 边缘服务、RK2206 现场固件包、载板硬件交付资料、打包脚本和公开文档。

## 评审原则

- 改动应落在有文档说明的产品面内；不要在没有公开 README、验证路径和职责边界的情况下恢复历史模块。
- UI 改动建议保持 PR 小而清晰，并附截图或录屏；固件、边缘服务或硬件改动应写清复核要点。
- 不提交 `dist/`、`bin/`、`obj/`、`artifacts/`、本地报告、运行状态或打包输出目录等生成物。
- 不提交凭据、生产端点、私有现场配置、客户特定点位数据或本机环境值。
- 合并前应确认 CI 通过。

## 依赖更新

Dependabot 已配置为低噪音的每周更新：

- npm 依赖按运行时依赖和工具链依赖分组。
- GitHub Actions 依赖单独分组。
- semver-major 更新默认忽略，应在项目准备好做兼容性评审时手动处理。

评审依赖更新时运行：

```powershell
npm audit
npm run lint
npm run build
npm run edge:build
npm run edge:lint
dotnet build .\apps\windows-shell\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release
```

如果改动涉及打包流程，还需要运行：

```powershell
npm run desktop:publish
```

## 发布前检查

创建 release 前确认：

- README 和 `docs/` 与当前端到端公开范围一致。
- `CHANGELOG.md` 有对应日期的记录。
- Windows 发布包包含 `web/index.html`。
- 边缘服务可从仓库根目录 build/lint。
- 固件和硬件 README 与发布包内容一致。
- 清理生成物后工作区干净。
- main 分支 CI 为绿色。
