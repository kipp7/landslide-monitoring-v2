# archive/

本目录用于归档旧项目与已完成内容：**永远保留背后的故事**，但不作为权威契约或当前实现依据。

使用规则：

- 任何“仍可能被实现/依赖”的内容不要放入 archive；应放入 `features/`、`integrations/`、`guides/` 或 `architecture/`。
- archive 中的文件应标注时间与背景，说明它为何被归档、被什么取代。
- 当你想引用 archive 中的结论时，优先把结论提炼回权威目录（并在 archive 里链接过去）。

建议结构（可选）：

- `archive/legacy-docs/`：旧文档快照（如未来需要）
- `archive/decisions/`：被废弃/被替代的决策
- `archive/experiments/`：实验性方案、PoC 记录

说明：

- 本项目不保留旧目录占位文档（按当前规划要求），避免历史信息干扰权威入口。
