---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/libs/readme
---

# libs/

后端共享库，不直接对外提供服务。

目的：

- `regional-model-library/`：区域数据规范、模型工件、质量门禁和样本构建
- `rules/`：告警规则 DSL 解析与执行

通用校验和可观测性包已经统一放在 `packages/validation/` 与 `packages/observability/`，供后端和 RK3568 边缘服务共同复用。
