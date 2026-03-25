# Desk API 对齐报告

## 基本信息

- 任务名：`desk-api-align`
- 工作树：`desk-api-align`
- 当前状态：`in_progress`

## 本轮阅读

- `apps/desk/src/api/httpClient.ts`
- `apps/desk/src/api/client.ts`
- `services/api/src/index.ts`
- `services/api/src/routes/*`
- `docs/integrations/api/018-desk-ui.md`

## 本轮工作

- 盘点 Desk HTTP 模式当前实际调用的接口
- 对比 legacy `/api/*` 与 `/api/v1` 的实现情况
- 标出已实现、缺失、字段不一致、待迁移接口
- 输出迁移优先级与 Desk 侧 adapter 建议

## 当前结论

- Desk 当前依赖的 9 组接口中，有 4 组 legacy `/api/*` 在 `api-service` 中不存在：`/api/dashboard/summary`、`/api/dashboard/weekly-trend`、`/api/devices`、`/api/system/status`
- `/api/monitoring-stations`、`/api/baselines*`、`/api/gps-deformation/*` 虽然存在，但返回结构不能被当前 Desk `httpClient` 直接消费
- `/api/v1/dashboard`、`/api/v1/stations`、`/api/v1/devices`、`/api/v1/gps/baselines*`、`/api/v1/gps/deformations/*` 已实现，但 Desk 需要 response adapter 和字段映射
- Desk 登录仍是本地 stub，真实 JWT / RBAC 尚未接入

## 改动文件

- `docs/integrations/api/018-desk-ui.md`
- `docs/journal/2026-03.md`

## 冲突 / 阻塞

- 当前无直接冲突
- 上游平台恢复结论已满足本轮分析需要

## 是否可进入 integration

- 是

## 下一步建议

- 保持 `desk-api-implementation` 继续推进
- 下一步优先做构建验证与首轮 HTTP 联调

## 第二轮进展补充（Desk API 实施）

### 本轮工作

- 新增统一 transport：`apps/desk/src/api/httpTransport.ts`
- 新增统一 mapper：`apps/desk/src/api/httpMappers.ts`
- 将 `apps/desk/src/api/httpClient.ts` 切到 `/api/v1` 主路径
- 将 `auth/dashboard/stations/devices/baselines/gps/system` 的字段转换集中到 adapter 层

### 当前结论

- Desk API 第二轮已经开始真实实现，不再只是文档盘点
- 实现路线符合协调要求：先做 adapter，不直接分散改页面
- `weeklyTrend` 与 `system status` 目前仍采用过渡映射/fallback，后续需要正式契约或 UI 调整

### 当前阻塞

- 已补装当前 worktree 的前端依赖并执行构建验证
- `npm -w apps/desk run build` 失败，当前阻塞为 TypeScript 类型错误：
  - `src/api/ApiProvider.tsx`：`HttpClientOptions` 与 `exactOptionalPropertyTypes` 不兼容
  - `src/api/httpMappers.ts`：`Baseline.baselineAlt` 的可选字段类型不兼容
  - `src/App.tsx`：`refreshToken` 的 `undefined/null` 传递不兼容

### 当前判断

- 方向正确
- 但尚未达到 `ready_for_integration`
- 需要先修复 TypeScript 类型错误，再做首轮 HTTP 联调结论

## Desk HTTP Live Validation（2026-03-13）

### 本轮工作

- 对真实 `/api/v1` 做首轮联调
- 完成一轮复验
- 新增：
  - `scripts/dev/desk-http-live-validate.ts`

### 当前结论

- Desk 真实 API 联调已通过以下能力：
  - 登录 / refresh
  - dashboard
  - stations
  - devices
  - baselines
  - gps deformations
  - system status
- 复验中已修正：
  - `multi_sensor` / `multisensor` 到 `gnss` 的映射
  - `stations.area` 的回退策略

### 当前剩余问题

- `weeklyTrend` 仍是 fallback，不是后端正式契约
- `system status` 仍是健康摘要到 `cpu/mem/disk` 的兼容映射
- demo 中文 seed 存在编码异常
- 部分孤立设备仍缺 `stationId/stationName`

### 当前判断

- `desk-http-live-validation` 已完成当前轮目标
- 下一轮应转入“真实联调暴露问题修复”，而不是继续铺大范围新迁移
