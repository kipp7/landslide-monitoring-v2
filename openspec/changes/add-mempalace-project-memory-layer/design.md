## Context

本仓库已经有三层长期信息结构：

- `docs/journal/`：原始时序历史
- `docs/unified/`：当前事实检查点
- `memory/`：提炼后的稳定记忆层

这些结构本身有效，但对新会话来说，重新检索和重建上下文的成本很高。MemPalace 适合作为本地全文/语义索引层，但不应直接成为“权威事实源”。

## Goals / Non-Goals

- Goals:
  - 为当前仓库建立本地、可刷新、可搜索的长期记忆索引
  - 让项目文档、记忆和关键源码可统一被检索
  - 不依赖云端 API，不让项目数据离开本机
  - 保持当前 `journal/unified/memory` 分层不变
- Non-Goals:
  - 不把 MemPalace 变成新的权威文档层
  - 不替换当前 `.tools/basic-memory` 工作流
  - 不要求当前 Codex 运行时动态获得新的 MCP 工具能力

## Decisions

- Decision: MemPalace 作为“并行索引层”引入，而不是替换现有记忆体系
  - Why:
    - 现有月记和记忆规则已经深度绑定仓库协作流程
    - 直接替换会破坏现有可追溯性与治理边界

- Decision: 使用项目本地 Python 虚拟环境安装
  - Why:
    - 避免污染全局 Python
    - 便于迁移、重建和固定运行入口

- Decision: 首次接入以 `projects` 模式矿整个仓库
  - Why:
    - 当前最核心的信息已经保存在仓库内部
    - 聊天原始导出并未在仓库内系统化保存，现阶段优先覆盖已有权威资料

- Decision: 提供 `install / refresh / search / wake-up` 四个稳定入口
  - Why:
    - 降低后续人为操作差异
    - 让 AI/操作者都能复用同一套入口

## Risks / Trade-offs

- 风险: 项目级全文索引会带来额外磁盘占用和首轮 mining 时间
  - Mitigation:
    - 运行态和 palace 数据全部放到本地忽略目录

- 风险: 用户可能把 MemPalace 误当成权威层
  - Mitigation:
    - 在文档和脚本帮助中明确写清“journal/unified/memory 才是源事实层”

- 风险: 当前 Codex 工具集无法动态接入新的 MCP server
  - Mitigation:
    - 先把本地 palace 和可执行入口建好
    - 后续在支持自定义 MCP 的客户端中再接入自动调用

## Migration Plan

1. 创建项目本地 MemPalace 运行目录和忽略规则
2. 在本地虚拟环境安装 MemPalace
3. 初始化当前仓库 palace
4. 执行首次项目 mining
5. 固化搜索/wake-up/刷新脚本
6. 记录使用说明和验证结果

## Open Questions

- 后续是否需要把仓库外部的 RK2206 工作树与聊天导出也纳入同一 palace
- 后续是否需要为支持 MCP 的客户端追加专用启动脚本
