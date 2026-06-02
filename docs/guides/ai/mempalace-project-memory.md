---
title: MemPalace Project Memory
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/ai/mempalace-project-memory
---

# MemPalace Project Memory

## Purpose

为当前仓库增加一个本地、可搜索、可刷新、可导出的 MemPalace 并行记忆层，降低 AI 会话反复重建上下文的成本。

## Source Of Truth Boundary

MemPalace 不是新的权威文档层。

当前项目的权威分层保持不变：

- `docs/journal/`：原始时序历史
- `docs/unified/`：当前事实与统一报告
- `memory/`：提炼后的稳定记忆

MemPalace 的角色是：

- 对这些资料做本地语义索引
- 提供搜索和 wake-up 上下文
- 帮助后续 AI/操作者更快找到既有结论和证据

## Runtime Layout

- 本地虚拟环境：
  - `.tools/mempalace/.venv`
- 本地 palace：
  - `.tools/mempalace/palace`
- 刷新日志：
  - `.tmp/mempalace/refresh.stdout.log`
  - `.tmp/mempalace/refresh.stderr.log`
- 原生索引恢复诊断日志：
  - `.tmp/mempalace/refresh.highsync.stdout.log`
  - `.tmp/mempalace/refresh.highsync.stderr.log`
- 项目配置：
  - `mempalace.yaml`
  - `entities.json`

## Stable Entry Points

项目根目录稳定入口：

```powershell
.\mempalace.ps1 status
.\mempalace.ps1 search "AB stable C pending"
.\mempalace.ps1 wake-up
.\mempalace.ps1 refresh -Background
```

说明：

- 这不是系统级全局 PATH 安装，而是仓库根目录稳定入口
- PowerShell 主入口固定为 `.\mempalace.ps1`
- `.\mempalace.cmd` 保留给 `cmd.exe` 或兼容场景
- 若未来还要做“整机任意目录都能直接调用”，需要再额外加用户级 shim 到 PATH

安装与初始化：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\install-mempalace-project-memory.ps1
```

稳定刷新：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\refresh-mempalace-project-memory.ps1 -ResetPalace -Background
```

说明：

- 该入口现在不是单进程全仓 `mine`，而是分批增量刷新
- 每批默认按 `文件数 + 文本字节量` 双阈值推进，尽量绕开本机 `ONNX/Chroma` 内存抖动
- 会跳过部分超大机器生成文件：
  - `apps/web/public/china.json`
  - `docs/unified/reports/history/desk-mainline-proof-*.json`
  - `docs/unified/reports/desk-mainline-proof-latest.json`
- 对超大的 `.json` / `.sql` 文件默认做硬阈值过滤，避免单文件打出数百到上千 drawers
- 长文 chunk 已调大，优先保障索引稳定性和可恢复性
- 日常刷新通常不需要 `-ResetPalace`，只有重建本地 palace 时才加
- 当前创建 collection 时会显式带上较高的 `HNSW sync_threshold=1000000`
- 这是为了避开这台 Windows + `Chroma 1.5.7` 环境里 persisted HNSW segment 在 sync/compaction 后不可重开的路径

查看刷新状态：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-mempalace-project-memory.ps1
```

当前 `status` 已改成走 sqlite 元数据快照，不再为取状态而重开整个 Chroma collection。
`status` 现在是只读命令，不再默认触发后台刷新；是否 stale 直接看 `freshness.sourceNewerThanIndex`。

搜索：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\search-mempalace-project-memory.ps1 -Query "AB stable C pending"
```

当前 `search` / `wake-up` 如果发现索引落后于仓库源文件，会先自动拉起一次后台刷新，再使用上一次已完成的索引结果。
刷新不是常驻守护进程，而是“按需自动补索引”。

导出 wake-up 上下文：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\wake-up-mempalace-project-memory.ps1 -OutFile .tmp\mempalace-wakeup.txt
```

## Native Vector Index Recovery

这一轮已经把项目记忆层从“只能依赖 sqlite 回退”恢复到了“原生 `Chroma` 向量索引可直接 reopen/query”的状态。

本轮收紧了三件事：

- `mempalace/backends/chroma.py`
  - collection 创建时固定采用高 `sync_threshold`
  - `ChromaCollection` 增加显式 `close()` / 生命周期收口
- 项目刷新脚本
  - 增加单写入锁，避免并发刷新争用同一个 palace
- `search` / `mine` / `status`
  - 用完 collection 后显式关闭 client，减少 Windows 本地句柄与 segment 状态漂移

当前恢复结论：

- 原生探针可直接通过：
  - `count`
  - `get`
  - `query`
- `check-mempalace-project-memory.ps1` 当前返回：
  - `mode = sqlite-metadata`
- 当前项目快照为：
  - `indexedSourceFiles = 1119`
  - `drawerCount = 3891`

保留 sqlite fallback，但它现在只是兜底，不再是主路径。

## Recommended Use

- 大任务续跑前：
  - 先执行一次 `check-mempalace-project-memory.ps1`
  - 再用 `search-mempalace-project-memory.ps1` 查关键结论
- 重大文档、月记、统一报告更新后：
  - 重跑一次 `refresh-mempalace-project-memory.ps1`
- 新会话准备：
  - 生成 `wake-up` 文本供支持自定义上下文的客户端使用

## MCP Note

MemPalace 自带 MCP server，当前本地命令可输出接入命令：

```powershell
.tools\mempalace\.venv\Scripts\mempalace.exe --palace .\.tools\mempalace\palace mcp
```

但当前这套 Codex 工具运行时并不会动态增加新的 MCP 工具能力，所以本仓库先固定为：

- 本地 palace + 固定脚本入口
- 支持 MCP 的客户端后续再接入自动调用
