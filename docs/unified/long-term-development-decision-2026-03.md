# 长期开发主线决策（2026-03）

## 1. 决策目标

当前需要明确一件事：

后续长期开发代码，到底应该以哪个仓库、哪个目录作为主线。

## 2. 候选方案

### 方案 A：继续以当前主仓 `landslide-monitoring-v2` 为长期源码主线

问题：

- 根级 `README` 与 `package.json` 仍是 Desk 仓定位
- `infra/compose` 不完整
- `services/*` 当前只有 `dist` 和 `.env`
- `apps/web` 不是源码态

结论：

- 不适合直接作为长期平台源码主线

### 方案 B：以参考仓 `openharmony` 继续长期开发

优点：

- 历史资料与源码完整

问题：

- 仓库历史包袱重
- 混杂 `txsmartropenharmony`、历史实验、论文、旧目录
- 不利于当前项目收口与受控并发

结论：

- 适合作为参考仓，不适合作为新的唯一长期开发主线

### 方案 C：以远端平台仓为基础，建立新的长期主线工作区

优点：

- 远端平台仓是完整 monorepo
- 包含 `apps`、`services`、`libs`、`infra`
- 当前也已经包含 `apps/desk` 与 `apps/desk-win`
- 适合做真正的一体化长期开发主线

结论：

- 这是当前最合适的长期方案

## 3. 最终决策

后续长期开发代码，统一采用：

- **长期主线仓**：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2-mainline`

这个目录是基于远端平台仓新建的干净工作区，用于后续长期开发。

## 4. 当前各仓库重新定位

### 长期主线仓

- `landslide-monitoring-v2-mainline`
- 用途：后续正式开发、长期维护、并发任务收口

### 当前集成仓

- `landslide-monitoring-v2`
- 用途：保留当前 Desk 集成状态、历史运行态、已有文档和本地数据

### 参考仓

- `openharmony`
- 用途：只读参考历史源码、架构和 GNSS / 论文 / 协议资料

### 桌面参考仓

- `LAMv2_Desk`
- 用途：只读参考桌面端历史实现

## 5. 为什么选择 `landslide-monitoring-v2-mainline`

### 原因一：它是完整源码态

已确认它具备：

- `apps/desk`
- `apps/desk-win`
- `apps/web`
- `apps/mobile`
- `services/*`
- `libs/*`
- `infra/compose/*`

说明它已经是适合作为长期 monorepo 主线的完整仓库。

### 原因二：它最适合并发开发

它天然支持：

- 平台链路开发
- Desk 开发
- 协议与规则开发
- 基础设施恢复

比当前运行态主仓更适合用 worktree 做并发分工。

### 原因三：它最容易持续收口

后续平台、Desk、协议、算法都可以逐步并入同一主线，而不是继续多中心开发。

## 6. 执行原则

- 后续“正式代码开发”优先进入 `landslide-monitoring-v2-mainline`
- 当前 `landslide-monitoring-v2` 不再作为长期平台源码主线
- `openharmony` 与 `LAMv2_Desk` 默认只读
- 如果需要迁移旧代码或旧资料，应迁移到 `landslide-monitoring-v2-mainline`

## 7. 风险与注意点

- 当前 `landslide-monitoring-v2` 中仍有一些本地运行态数据和历史上下文，短期内不能直接丢弃
- 迁移旧接口、旧 GNSS 逻辑、旧形变代码时，要避免把历史混乱一并带入主线
- 后续并发任务应优先围绕 `mainline` 展开，而不是继续在旧集成仓分叉

## 8. 当前结论

一句话：

**长期开发代码的位置，已经确定为 `landslide-monitoring-v2-mainline`。**
