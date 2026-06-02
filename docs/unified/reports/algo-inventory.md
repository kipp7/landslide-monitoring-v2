---
title: algo-inventory
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/algo-inventory
---

# 算法清点报告

## 基本信息

- 任务名：`algo-inventory`
- 工作树：`algo-inventory`
- 当前状态：`ready_for_integration`

## 最近结论

- 已完成第一轮算法全量清点
- 已形成清单和卡片底稿
- 已区分“已有代码 / 只有文档 / 缺验证”
- 已明确当前 `CEEMD` 实际是 `CEEMD-like` 近似实现
- 已记录风险等级方向冲突与验证缺失问题

## 主要输出

- `docs/algorithms/inventory.md`
- `docs/algorithms/cards.md`

## 当前待办

- 等待进入 `integration`
- 后续可继续承担 `algo-validation-plan`

## Algo Validation Plan（2026-03-12）

### 本轮工作

- 补齐验证计划、用例矩阵、样例清单和回放样例
- 新增：
  - `docs/algorithms/validation-plan.md`
  - `docs/algorithms/validation-cases.md`
  - `docs/algorithms/sample-manifest.md`
  - `docs/algorithms/samples/...`

### 当前结论

- 当前验证计划已从“策略层”推进到“样例资产层”
- 已具备：
  - P0/P1 的固定边界样例
  - 长时序 replay 样例
  - 回放说明与样例清单
- 当前剩余主要缺口：
  - AI worker 风险评分专用回放样例
  - 与 replay 样例配套的执行脚本或断言清单

### 当前判断

- `algo-validation-plan` 已完成当前轮目标
- 可以进入下一轮集成

## Algo Replay Assertions（2026-03-13）

### 本轮工作

- 为 replay 样例补结构化断言
- 新增离线校验脚本：
  - `scripts/dev/check-replay-sample.ps1`
  - `scripts/dev/check-ai-worker-replay-sample.ps1`
  - `scripts/dev/build-ai-worker-replay-event.ps1`
- 新增 AI worker low/medium/high replay 样例

### 当前结论

- replay 样例现在已经不只是“可读”，而是“可判定”
- 四个阶段 replay 样例已可本地 PASS/FAIL 校验
- AI worker low / medium / high replay 样例已具备
- 已能把 AI worker replay 样例桥接成 `telemetry.raw.v1` 事件 JSON
- 已补最小 legacy bridge：
  - `scripts/dev/build-legacy-gps-replay-bridge.ps1`
  - 可生成 baseline SQL、ClickHouse telemetry SQL、legacy request JSON 与 bridge bundle
- 已补 `scripts/dev/run-replay-suite.ps1`
- `run-replay-suite.ps1 -SkipBuilds` 已本地跑通：
  - 四个阶段 replay 样例
  - 三个 AI worker replay 样例

### 当前剩余问题

- 仍未进入真正 worker / 在线链路级回放
- 仍缺与在线链路配套的最终验证结论

### 当前判断

- `algo-replay-assertions` 已完成当前轮目标
- 下一轮应推进到在线 worker / 链路级 replay