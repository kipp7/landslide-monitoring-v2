---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/apps/web/readme
---

# apps/web/

Web 管理端（v2）。

注意：

- 当前默认正式客户端不是 Web 端，而是：
  - `apps/desk/`
  - `apps/desk-win/`
- 除非用户明确要求 Web 管理端/B 端后台工作，否则不要将本目录作为默认原型来源、默认优化对象或默认验收面。
- 当前短期策略是保留源码但冻结其默认优先级，不物理删除。

约束：

- 禁止硬编码传感器 key/阈值/设备映射（来自 `/sensors` 与规则/配置）
- 仅依赖 API（OpenAPI）与生成的 DTO/Client

实现开始前建议先完成：

- 生成 types/client 的脚本与门禁接入（见 `docs/guides/standards/code-generation.md`）
