# 平台服务与数据闭环核查（2026-03）

## 1. 核查目标

本次核查用于回答：

- 当前主开发仓是否具备恢复平台最小闭环的基础
- `infra/compose`、`services/api`、`services/ingest`、`services/telemetry-writer` 当前处于什么状态
- 当前真正的断点在哪里

## 2. 核查范围

本次重点核查：

- `infra/compose`
- `services/api`
- `services/ingest`
- `services/telemetry-writer`
- Desk 当前接口文档与平台主线之间的关系

对比依据包括：

- 当前主开发仓 `landslide-monitoring-v2`
- 远端只读比对仓 `remote-inspect/landslide-monitoring-v2`
- 当前 Desk 工作记录与 API 对接文档

## 3. 当前主开发仓实际状态

### 3.1 根级定位

当前主开发仓根级配置仍然是 **Desk 仓定位**：

- `README.md` 描述的是 `LAMv2 Desk（Windows）`
- `package.json` 只声明了 `apps/*` workspace
- Node 版本要求仍是 `>=18`

这说明当前主开发仓从根级来看，仍更接近“桌面端集成仓”，而不是完整的平台源码仓。

### 3.2 apps 状态

当前主开发仓 `apps/` 下：

- `apps/desk`：完整，含 `src`、`package.json`、`vite.config.ts`
- `apps/desk-win`：完整，含 WPF 工程
- `apps/web`：只有 `.next_v2_dev`
- `apps/mobile`：不存在

结论：

- Windows Desk 侧是当前主仓里最完整的可持续开发部分
- Web 侧在当前主仓内不是源码态

### 3.3 infra 状态

当前主开发仓 `infra/compose` 下只有：

- `.env`

缺失：

- `docker-compose.yml`
- `env.example`
- `README.md`

而远端平台仓中这些文件是完整存在的。

结论：

- 当前主开发仓 **没有完整的基础设施编排文件**
- 单靠当前主仓本身，无法直接恢复标准平台基础设施

### 3.4 services 状态

当前主开发仓中核查到的核心服务目录形态基本一致：

- `api`
- `ingest`
- `telemetry-writer`
- `rule-engine-worker`
- `command-ack-receiver`
- `command-dispatcher`

这些目录当前都只有类似内容：

- `dist/`
- `.env`

并且 `dist/index.js` 存在。

但缺失：

- `package.json`
- `src/`
- `tsconfig.json`
- `README.md`

而这些文件在远端平台仓中均存在。

结论：

- 当前主开发仓里的服务目录是 **运行产物态**，不是完整源码态
- 这些服务可能能以 `node dist/index.js` 方式尝试运行
- 但它们**不具备可持续维护、重建、重装依赖、重新构建**的基础条件

## 4. 与远端平台仓的差异

远端平台仓 `remote-inspect/landslide-monitoring-v2` 具备：

- 平台型 `README`
- 完整 monorepo `package.json`
- `libs/*`、`services/*`、`apps/*` workspace
- 完整 `infra/compose/docker-compose.yml`
- 完整 `services/*` 源码结构
- 完整 `docs/architecture`、`docs/integrations`、`docs/features`

而当前主开发仓缺少其中最关键的：

- 平台根级 workspace 配置
- 平台服务源码
- 基础设施编排文件
- Web 源码

结论：

- 当前主开发仓并不是远端平台仓的等价本地副本
- 当前主开发仓更像是 **Desk 主线 + 平台运行产物 + 本地数据目录** 的集成工作区

## 5. 当前数据闭环能恢复到哪一步

### 可以确认存在的部分

- Desk 前端源码
- Desk Windows 壳源码
- 服务运行产物 `dist`
- 本地 `data/postgres`、`data/clickhouse`、`data/kafka`、`data/redis`

### 无法直接确认或恢复的部分

- 标准 Compose 启动链路
- 服务源码构建链
- 从源码重新安装依赖并构建平台服务
- Web 管理端源码链路

### 当前最可能的实际情况

当前主仓可能还能做：

- Desk 前端开发
- Desk 壳运行
- 基于已有 `dist` 尝试手工启动部分平台服务

但当前主仓不适合作为：

- 平台后端从源码持续开发的唯一基线

## 6. 当前闭环断点判断

### 断点 A：基础设施缺编排

- `infra/compose` 缺少标准 Compose 文件
- 说明基础设施恢复能力不完整

### 断点 B：平台服务缺源码

- `services/*` 只有 `dist`
- 无法按正常工程方式维护平台后端

### 断点 C：Web 管理端缺源码

- `apps/web` 只有构建产物
- 当前主仓不能作为完整平台前端基线

### 断点 D：Desk 与平台契约仍未完全统一

- Desk 文档中当前仍以 legacy `/api/*` 为主
- 平台设计已转向 v2 规范契约

## 7. 核查结论

### 结论一

当前主开发仓 **不能单独作为完整平台闭环的源码基线**。

### 结论二

当前主开发仓 **可以继续作为当前 Desk 主线与集成工作区**。

### 结论三

若要恢复完整平台闭环，后续必须明确从何处补回：

- 基础设施编排
- 平台服务源码
- Web 源码

当前最自然的来源是：

- 远端平台仓
- 或 `openharmony` 参考仓中对应的完整源码

### 结论四

因此后续不应再把“当前主仓已经是完整平台源码仓”作为前提。

更准确的定位应是：

- 当前主仓：Desk + 集成 + 运行态工作区
- 远端/参考仓：平台源码与架构依据来源

## 8. 后续恢复策略建议

### 方案 A：把当前主仓继续定位为集成仓

做法：

- 保持 Desk 主线在当前主仓
- 平台源码以远端平台仓或参考仓为准
- 通过 API 对接而不是强行在当前主仓中继续维护平台源码

优点：

- 风险小
- 不会打乱你当前 Desk 线

缺点：

- 平台与 Desk 仍分两个主中心

### 方案 B：在当前主仓中重新补回平台源码基线

做法：

- 从远端平台仓或参考仓受控迁移 `infra/compose`、`services/*`、`apps/web`
- 重新把当前主仓恢复为真正的 monorepo

优点：

- 后续统一开发体验更好

缺点：

- 迁移量大
- 与当前 Desk 工作区冲突风险更高

## 9. 当前最推荐的下一步

基于当前状态，最推荐先做：

1. 先生成 Desk ↔ 平台 API 对齐清单
2. 再决定平台源码是“分仓联调”还是“迁回当前主仓”
3. 再进入 GNSS / 基线 / 形变 / 算法的统一收口

## 10. 本文件的作用

本文件用于明确一个事实：

当前主开发仓适合继续承担 **Desk 主线与统一文档主线**，  
但它还不是一个可以直接长期维护平台后端源码的完整基线。
