---
title: unified-baseline-2026-03
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/unified-baseline-2026-03
---

# 统一基线（2026-03）

## 1. 本次统一确认的目标

本次不是直接改业务代码，而是先把当前项目的全局基线统一下来，确保后续开发可以持续推进，不再依赖零散记忆。

本次统一确认解决四个问题：

- 现在有哪些仓库，它们分别负责什么
- 现在的技术栈和数据库到底是什么
- 当前真正的主线是什么
- 后续应该按什么顺序推进

## 2. 当前仓库角色确认

### 当前主开发仓

- 路径：`E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2`
- 角色：当前正式开发、并发集成、桌面端联调、文档收口

### 历史参考仓

- 路径：`E:\学校\06 工作区\2\openharmony`
- 角色：历史源码、架构设计、MQTT 契约、存储模型、服务链路的主要参考来源

### 桌面端参考仓

- 路径：`E:\学校\02 项目\99 山体滑坡优化完善\LAMv2_Desk`
- 角色：Windows 客户端的实现参考

### 远端仓

- 平台仓：`https://github.com/kipp7/landslide-monitoring-v2`
- 桌面仓：`https://github.com/kipp7/LAMv2_Desk`
- 当前只在 `remote-inspect/` 中做只读对比，不作为直接开发目录

## 3. 当前项目主线确认

当前项目不是单一前端项目，也不是单一硬件项目，而是一套完整的滑坡监测预警系统。

当前主线应统一为：

- 设备侧采集与上报
- 平台侧接入、存储、规则、接口
- Windows 端作为当前主要展示与操作客户端
- GNSS / 形变 / 风险分析作为核心业务分析能力

## 4. 当前技术栈确认

### 平台与后端

- 语言：TypeScript（strict）
- API：Express + TypeScript
- MQTT Broker：EMQX
- 消息总线：Kafka（单机 KRaft）
- 存储：
  - PostgreSQL：设备、站点、规则、告警、权限、审计
  - ClickHouse：遥测时序数据
  - Redis：缓存、去重、限流计数
- 部署：Docker Compose（单机）

### Web / 可视化 / 桌面端

- Web：Next.js + TypeScript
- 桌面前端：Vite + React + TypeScript
- UI：Ant Design
- 状态管理：Zustand
- 图表与地图：ECharts、Leaflet、Three
- Windows 壳：.NET 8 WPF + WebView2

### 设备接入与协议

- 设备接入主通道：MQTT
- 身份模型：`device_id + device_secret`
- 遥测模型：稀疏 `metrics` map
- 命令通道：`cmd/{device_id}`
- 回执通道：`cmd_ack/{device_id}`

## 5. 当前数据库确认

### 已确认的数据库与存储职责

- PostgreSQL：业务型强一致数据
- ClickHouse：高吞吐遥测历史与曲线查询
- Redis：缓存与去重

### 已确认的本地状态

- 当前主仓下存在 `data/postgres`、`data/clickhouse`、`data/kafka`、`data/redis`
- 说明本地曾保留过一套基础设施运行数据
- 后续需判断这些数据是可恢复数据，还是仅作为历史残留

## 6. 当前数据主链确认

当前统一采用以下主链：

设备采集  
→ MQTT 上报  
→ ingest 校验与转发  
→ Kafka 缓冲  
→ telemetry-writer 写入 ClickHouse  
→ rule-engine 生成告警  
→ API 提供查询与联动  
→ Windows Desk / Web 展示

## 7. 当前桌面端状态确认

当前桌面端已不是概念验证，而是已有可持续延展的骨架：

- 支持 `Mock / HTTP` 双模式
- 有设备管理中心
- 有 GNSS 基线管理
- 有 GPS 形变监测
- 有系统状态与分析大屏
- 有 Windows 托盘与全屏能力

当前问题不在于“没有桌面端”，而在于：

- Desk 仍处于 legacy `/api/*` 与 v2 目标契约并存状态
- 需要继续把 Desk 所需接口与平台主仓 API 做一致化

## 8. 当前已确认的主要文档依据

### 平台架构

- `openharmony/docs/architecture/overview.md`
- `openharmony/docs/features/roadmap.md`

### 数据链路与存储

- `openharmony/docs/features/prd/telemetry-ingestion.md`
- `openharmony/docs/integrations/storage/README.md`
- `openharmony/docs/integrations/storage/clickhouse/01-telemetry.sql`

### MQTT 与设备协议

- `openharmony/docs/integrations/mqtt/device-identity-and-auth.md`
- `openharmony/docs/integrations/mqtt/mqtt-topics-and-envelope.md`

### 桌面端

- `docs/AI_WORKLOG.md`
- `docs/API_INTEGRATION.md`
- `LAMv2_Desk`

## 9. 当前最重要的统一结论

### 结论一：项目不是没基础，而是基础分散

当前已经有：

- 平台技术栈
- 数据链路设计
- 数据库存储职责
- MQTT 契约
- Desk 工作记录
- GNSS / 形变相关历史资料

真正的问题是它们分散在多个仓与多个阶段的材料里。

### 结论二：后续要以“统一主线”继续，而不是多中心推进

后续必须统一按：

- 当前主开发仓：持续开发与文档收口
- 参考仓：只读参考
- 桌面仓：只读参考

### 结论三：当前最优先的是“恢复基线与验证闭环”

优先级高于继续堆功能的事情是：

- 核查基础设施能否恢复
- 核查服务源码与可运行性
- 核查 API 与 Desk 的接口一致性
- 打通一条最小数据闭环

## 10. 当前仍未完全确认的部分

- 当前主仓内各 `services/*` 的源码完整度
- 当前本地 `data/` 中保留数据的可用性
- 当前 Desk 依赖接口与平台主 API 的真实对齐程度
- GNSS / 基线 / 形变算法在“文档、代码、接口”三层的一致性
- 固件与单片机代码的当前权威落点

## 11. 后续执行原则

- 不再直接从感觉出发推进
- 先确认依据，再拆任务，再并发实现
- 文档先于实现，接口先于联调，闭环先于优化

## 12. 本文件的作用

本文件是当前项目的“统一确认版总基线”。

后续每次开始新一轮开发前，都应先基于本文件回答：

- 这次要改的是哪条主线
- 这次改动依赖哪份资料
- 这次改动会影响闭环中的哪一段