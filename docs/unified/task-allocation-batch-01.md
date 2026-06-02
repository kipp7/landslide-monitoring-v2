---
title: task-allocation-batch-01
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/task-allocation-batch-01
---

# 第一批并发任务建议

## 目标

在统一主线和并发环境准备完成后，先启动第一批最关键的任务，尽快恢复主线开发能力。

## 任务总原则

- 先恢复基线
- 再统一接口
- 再收口 GNSS / 算法
- 最后再做更深入功能开发

## 任务 1：平台恢复核查

### 工作树

- `codex/platform-restore-check`

### 目标

- 核查 `infra/compose`
- 核查 `services/api`
- 核查 `services/ingest`
- 核查 `services/telemetry-writer`
- 给出主线平台可恢复性结论

### 产出

- 服务与基础设施现状清单
- 可运行性结论
- 最小闭环恢复建议

## 任务 2：Desk ↔ 平台 API 对齐

### 工作树

- `codex/desk-api-align`

### 目标

- 对齐 `docs/API_INTEGRATION.md` 与平台主 API
- 标出已实现、缺失、字段不一致、待迁移接口

### 产出

- Desk ↔ 平台 API 对齐表
- 接口迁移优先级建议

## 任务 3：GNSS / 基线 / 设备协议收口

### 工作树

- `codex/gnss-protocol`

### 目标

- 从参考仓和旧资料中提取 GNSS、基线、设备协议的当前有效内容
- 统一字段和术语

### 产出

- GNSS 资料清单
- 设备协议摘要
- 基线与形变相关字段统一说明

## 任务 4：算法清点与卡片底稿

### 工作树

- `codex/algo-inventory`

### 目标

- 清点当前已有形变、基线、风险、健康算法资料
- 明确哪些已有实现、哪些只有文档、哪些缺验证

### 产出

- 算法全量清单
- 算法卡片底稿
- 后续算法优先级建议

## 集成顺序

建议统一按以下顺序进入 `integration`：

1. 平台恢复核查
2. Desk API 对齐
3. GNSS / 协议收口
4. 算法清点

## 当前阶段不要并发做的事情

- 不要同时大改平台接口和 Desk 页面逻辑
- 不要在 GNSS 协议未统一前大改设备字段
- 不要在平台闭环未恢复前大规模新增算法实现
- 不要继续把旧集成仓当成长期开发主线

## 本批任务完成后的下一步

当这一批完成后，再进入：

- 最小闭环恢复
- GNSS / 形变 / 基线执行版文档
- 设备固件入口
- 规则和告警细化