# apps/web/

Web 管理端（v2）。

约束：

- 禁止硬编码传感器 key/阈值/设备映射（来自 `/sensors` 与规则/配置）
- 仅依赖 API（OpenAPI）与生成的 DTO/Client

实现开始前建议先完成：

- 生成 types/client 的脚本与门禁接入（见 `docs/guides/standards/code-generation.md`）

