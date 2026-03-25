## Why

当前 `/api/system/status` 已明确是“健康摘要模型”，它适合 Desk 当前主链，但不等价于 CPU / 内存 / 磁盘资源占用。

如果继续把健康摘要硬映射成 `cpuPercent / memPercent / diskPercent`，会制造假数据。更稳的做法是新增一条独立的“资源占用模型”接口，让后端与前端在语义上彻底分离。

## What Changes

- 新增独立的资源占用接口：`/api/v1/system/resources`
- 定义独立的 `SystemResourceStatus` 模型，不与健康摘要模型混用
- 文档中明确：
  - `/api/v1/system/status` = 健康摘要模型
  - `/api/v1/system/resources` = 资源占用模型

## Non-Goals

- 不在本变更中修改 Desk 前端 UI
- 不把现有 `/api/v1/system/status` 改成资源占用模型
- 不在本变更中引入复杂主机监控代理
