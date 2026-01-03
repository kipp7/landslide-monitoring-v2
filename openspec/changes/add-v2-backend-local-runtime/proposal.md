## Why

桌面端目前以 Mock 为主，但 v2 后端最终仍需要稳定运行，否则无法从“演示 UI”走向“真实数据平台”。目前后端存在“API 多、bug 多、跑不起来”的问题，需要先建立一个可持续推进的最小可运行基线（local runtime baseline）。

本变更的目标是：先让 v2 后端在本地 **可构建、可启动、可健康检查**，并提供少量关键接口作为后续联调入口。

## What Changes

- 明确本地启动的最小链路（Docker DB + API service）
- 让 `services/api` 可 build + start，并提供稳定的 `/health`
- 整理并修复关键配置（env、端口、DB 连接、依赖）
- 给桌面端未来联调预留一组“最小接口”（站点/设备/GPS/告警的只读查询优先）

## Non-Goals

- 不要求一次性修完所有 API
- 不在本变更内把桌面端从 Mock 全量切到 HTTP

