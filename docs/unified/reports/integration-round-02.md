---
title: integration-round-02
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/integration-round-02
---

# 第二轮集成报告

## 基本信息

- 任务名：`integration-round-02`
- 工作树：`integration`
- 当前状态：`completed`

## 集成范围

- `runtime-validation`
- `sensor-dictionary-sync`
- `algo-validation-plan`
- `desk-api-implementation`

## 本轮工作

- 合入平台运行验证结论
- 合入 GNSS canonical key / 字典 / MQTT 示例修订
- 合入算法验证计划、样例清单、回放样例资产
- 合入 Desk API adapter 与本地 HTTP 烟测脚本
- 统一更新协调文档、报告和日志

## 已合入内容

### 来自 `platform-restore-check`

- 运行验证结论写回 `docs/unified/reports/platform-restore-check.md`

### 来自 `gnss-protocol`

- `docs/guides/standards/naming-conventions.md`
- `docs/integrations/mqtt/mqtt-topics-and-envelope.md`
- `docs/integrations/storage/postgres/tables/14-seed-data.sql`
- `docs/unified/reports/gnss-protocol.md`

### 来自 `algo-inventory`

- `docs/algorithms/validation-plan.md`
- `docs/algorithms/validation-cases.md`
- `docs/algorithms/sample-manifest.md`
- `docs/algorithms/samples/...`
- `docs/unified/reports/algo-inventory.md`
- `docs/unified/reports/algo-validation-plan.md`

### 来自 `desk-api-align`

- `apps/desk/src/api/httpTransport.ts`
- `apps/desk/src/api/httpMappers.ts`
- `apps/desk/src/api/httpClient.ts`
- `apps/desk/src/api/ApiProvider.tsx`
- `apps/desk/src/api/client.ts`
- `apps/desk/src/App.tsx`
- `apps/desk/src/stores/authStore.ts`
- `scripts/dev/desk-http-smoke.ts`
- `docs/integrations/api/018-desk-ui.md`

## 验证结果

### 平台运行验证

- `services/ingest`、`services/telemetry-writer`、`services/api` 本地构建已通过
- 当前运行级闭环仍阻塞于：
  - Docker daemon 未启动
  - `infra/compose/.env` 缺失

### Desk API 实施验证

- `npm -w apps/desk run build` 已通过
- `npx tsx scripts/dev/desk-http-smoke.ts` 已通过

## 冲突处理

- 继续沿用第一轮原则：主线仓已有 `docs/unified/`、`docs/journal/` 为统一基线
- 只合入专题新增产出，不以 worktree 补拷贝版本覆盖主线协调文档
- Desk adapter 实施与 GNSS 字典同步无直接冲突
- 算法验证资产为独立文档资产，与 Desk / 平台代码无直接冲突

## 第二轮集成结论

- 第二轮 4 条任务已全部达到当前轮目标
- Desk API 实施已经具备“可构建 + 本地烟测通过”的证据
- GNSS 字典同步已把 canonical key 补进主线文档和 seed
- 算法线已具备验证计划与样例资产基础

## 下一步建议

- 启动第三轮：
  - `desk-http-live-validation`
  - `algo-replay-assertions`
  - `platform-compose-up`
- 若要做真实联调，优先解决：
  - Docker daemon
  - `infra/compose/.env`
  - 本地基础设施启动