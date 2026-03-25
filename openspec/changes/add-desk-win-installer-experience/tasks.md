## 1. Contract

- [x] 1.1 定义安装器分发形态：EXE 安装器 + latest 便携包并存
- [x] 1.2 明确前置运行时策略：`.NET` 采用 `self-contained`，WebView2 由安装器处理
- [x] 1.3 为安装、卸载、首次启动补安装器验收条件

## 2. Packaging

- [x] 2.1 调整 `desk-win` 发布链，支持 `self-contained` 产物
- [x] 2.2 选择并接入一个 Windows 安装器方案
- [x] 2.3 安装器支持安装目录、快捷方式、卸载入口、安装后启动
- [x] 2.4 安装器支持 WebView2 Runtime 检查与安装

## 3. Verification

- [x] 3.1 增加安装器构建脚本
- [x] 3.2 增加安装/卸载/首次启动 smoke
- [x] 3.3 更新交付文档与最终交接单
