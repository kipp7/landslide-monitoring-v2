---
title: integration-round-03
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/integration-round-03
---

# 第三轮集成报告

## 基本信息

- 任务名：`integration-round-03`
- 工作树：`integration`
- 当前状态：`completed`

## 集成范围

- `platform-compose-up`
- `desk-http-live-validation`
- `algo-replay-assertions`

## 本轮工作

- 合入平台基础设施真实启动与最小带鉴权闭环实跑结论
- 合入 Desk 对真实 API 的首轮联调与复验结果
- 合入算法 replay 断言、离线校验脚本与 AI worker replay 样例

## 已合入内容

### 来自 `platform-restore-check`

- `infra/compose/README.md`
- `infra/compose/docker-compose.yml`
- `infra/compose/docker-compose.app.yml`
- `infra/compose/scripts/create-kafka-topics.ps1`
- `infra/compose/scripts/e2e-smoke-test.ps1`
- `infra/compose/scripts/init-postgres.ps1`
- `services/ingest/.env.example`
- `services/telemetry-writer/.env.example`

### 来自 `desk-api-align`

- `apps/desk/src/App.tsx`
- `apps/desk/src/api/ApiProvider.tsx`
- `apps/desk/src/api/client.ts`
- `apps/desk/src/api/httpClient.ts`
- `apps/desk/src/api/httpTransport.ts`
- `apps/desk/src/api/httpMappers.ts`
- `apps/desk/src/api/mockClient.ts`
- `apps/desk/src/stores/authStore.ts`
- `scripts/dev/desk-http-smoke.ts`
- `scripts/dev/desk-http-live-validate.ts`
- `docs/integrations/api/018-desk-ui.md`

### 来自 `algo-inventory`

- `docs/algorithms/replay-assertions.md`
- `docs/algorithms/sample-manifest.md`
- `docs/algorithms/validation-plan.md`
- `docs/algorithms/validation-cases.md`
- `docs/algorithms/samples/...`
- `scripts/dev/check-replay-sample.ps1`
- `scripts/dev/check-ai-worker-replay-sample.ps1`
- `scripts/dev/build-ai-worker-replay-event.ps1`

## 验证结果

### 平台 Compose / 闭环

- Docker daemon 可达
- ClickHouse `8123/ping` 可达
- 平台工作树日志显示：
  - Compose 已成功启动
  - PostgreSQL / ClickHouse / Kafka / Redis / EMQX 已完成初始化
  - 最小带鉴权数据闭环曾实跑通过
- 当前注意：
  - `api-service` 当前没有常驻在 `8081`
  - 因此真实联调不应假定环境永远在线

### Desk 真实联调

- `apps/desk` 构建已通过
- `scripts/dev/desk-http-smoke.ts` 本地 smoke 已通过
- 工作树日志显示真实 `/api/v1` 联调已完成，并做过一轮复验
- 当前剩余问题：
  - `weeklyTrend` 仍是 fallback
  - `system status` 仍是兼容映射
  - demo 中文 seed 有编码异常
  - 部分孤立设备仍缺 `stationId/stationName`

### 算法 replay

- replay 样例已具备结构化断言
- 离线校验脚本已存在
- AI worker low/medium/high 三组 replay 样例已具备

## 冲突处理

- 无硬冲突
- 主要注意点：
  - 平台环境“曾通过”不等于“当前持续在线”
  - Desk 真实联调已通过当前轮目标，但仍有数据质量与契约残缺问题
  - 算法 replay 已有样例与脚本，但尚未进入真正 worker 在线回放

## 第三轮集成结论

- 第三轮任务整体已达到当前轮目标
- 平台、Desk、算法三条线都已从“文档层”推进到更接近可执行验证的状态
- 当前最适合进入下一轮的是：
  - 让平台环境稳定常驻
  - 让 Desk 针对剩余真实数据问题做修复
  - 让算法 replay 进入在线 worker/链路级验证

## 下一轮建议

- `platform-runtime-stabilization`
- `desk-live-issues-fix`
- `algo-worker-online-replay`