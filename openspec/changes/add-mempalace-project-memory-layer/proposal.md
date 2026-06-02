# Change: Add MemPalace Project Memory Layer

## Why

当前项目的上下文主要分散在月记、统一报告、`memory/`、源码与运行证据中。信息量已经超过单次会话稳定重建的成本，导致 AI 协作反复回溯、重复判断、阶段边界同步失真。

引入 MemPalace 的目标不是替换现有记忆体系，而是在现有仓库内新增一个本地、可搜索、可重复刷新、可脚本化的并行记忆索引层，提升后续 AI 会话的检索效率与连续性。

## What Changes

- 新增项目级 MemPalace 接入层，作为 `docs/journal/`、`docs/unified/`、`memory/`、源码与关键脚本的本地索引
- 提供 Windows 本地安装、初始化、刷新、搜索与 wake-up 脚本
- 明确“现有月记/统一文档/Basic Memory 仍是权威层，MemPalace 仅作为并行索引层”
- 固化可重复的项目接入范围、忽略规则和刷新流程
- 补齐使用文档与验证步骤

## Impact

- Affected specs:
  - `ai-memory-operations`（new）
- Affected code:
  - `.gitignore`
  - `scripts/dev/*mempalace*.ps1`
  - `.tools/mempalace/*`
  - `docs/guides/ai/*`
  - `openspec/changes/add-mempalace-project-memory-layer/*`
