---
title: field-program-direction-and-task-split-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04
---

# 现场主线方向与任务拆分（2026-04）

## 状态

- topic: `field-program-mainline`
- state: `execution-direction-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. `full-path` 脚本到底是干什么的

当前统一入口脚本：

- `scripts/dev/run-field-hardware-uplink-full-proof.ps1`

它不是“部署脚本”，也不是“网关正式程序”。

它当前承担的是：

1. 证明链路
- 用一条命令验证：
  - 真机样本
  - 平台写入
  - Web/API 可见性
  这一整条链是否仍然可用

2. 固定当前验收入口
- 避免每次都分开记：
  - replay 脚本
  - Web product visibility 脚本
  - 环境是否就绪

3. 形成阶段基线
- 让后续 RK3568 网关开发、RK2206 固件开发、中心部署联调都共享同一条“下游验收线”

一句话：

- `full-path` 脚本是当前阶段的软件闭环验收入口，不是最终产品形态

## 2. 我们现在真正处在哪个阶段

当前已经完成的不是产品，而是：

- `现场链路可行性 + 平台闭环可行性`

已经拿到的事实：

- XL01/串口侧真实上行已经可捕获
- 真机样本可以进入：
  - MQTT
  - `device_state`
  - API
  - Web 产品读路径
- 当前统一复跑命令已经存在：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-hardware-uplink-full-proof.ps1`

所以当前主 blocker 已经不是：

- “能不能传”
- “能不能下发命令”

而是：

- `如何把现场系统真正收口成可实施、可编码、可部署的正式方案`

## 3. 当前总目标应该压成哪几条主线

当前总任务必须压成 4 条，不再散开。

### A. 现场链路与网关软件主线

目标：

- 把 `XL01 分节点 -> 主节点/RK3568 -> 平台` 这条链定型

本线关注：

- 分节点到网关的数据格式
- framing / 长度预算 / 重组
- 多节点接入
- 网关缓存与重放
- 网关向平台的 MQTT 上行
- 命令下行翻译边界

这条线当前优先级：

- `最高`

### B. RK3568 网关程序主线

目标：

- 写出真正能管理 3 个分节点的边缘网关程序

本线关注：

- 3 个 RK2206 分节点接入模型
- 串口/无线输入管理
- 节点身份映射
- 本地 spool/cache
- 健康监控
- 与平台连接

这条线当前优先级：

- `最高`

### C. RK2206 固件主线

目标：

- 让节点成为长期可运行的采集端，而不是只会演示上报

本线关注：

- 多传感器接入
- 采样与上报解耦
- 低功耗
- 本地最小缓存
- 节点侧健康保护
- 必要的命令执行

这条线当前优先级：

- `高`

### D. 中心部署与平台运行主线

目标：

- 明确 RK3568 到中心服务器的正式部署拓扑

本线关注：

- 服务器部署哪些组件
- API / Web / Postgres / ClickHouse / MQTT / Kafka 的边界
- 边缘放什么，中心放什么
- 如何支持现场运维与证据留存

这条线当前优先级：

- `高`

## 4. 接下来不该再浪费时间的点

以下内容短期内不应再当主线反复纠结：

- 单次命令到底还能不能发
- 单条真机样本到底还能不能进平台
- Web 这次是不是又能看到
- 串口号这台电脑上是不是又变了

这些问题仍然要管，但它们现在应该被归类为：

- `执行细节`
- `环境细节`

不再是路线问题。

## 5. 现在应该怎么拆任务

### Phase 1：冻结正式系统边界

这一阶段只做“定型”，不继续散点验证。

必须产出：

1. RK3568 网关职责冻结
- 管几个节点
- 输入输出接口
- 缓存职责
- 对平台的上行方式

2. RK2206 节点职责冻结
- 采什么
- 多久采
- 多久报
- 哪些传感器常开
- 低功耗档位怎么切

3. 中心部署拓扑冻结
- 中心服务器跑哪些组件
- RK3568 与中心怎么连
- 哪些链路必须在线
- 哪些可以缓存后补传

### Phase 2：按角色进入编码

编码拆成 3 包并行推进：

1. `RK3568 gateway`
- 多节点接入
- 重组/缓存/转发
- 与平台 MQTT 对接

2. `RK2206 firmware`
- 多传感器
- 低功耗
- 节点状态机

3. `platform deployment/integration`
- 中心部署
- 接入验收
- 运行监控

### Phase 3：现场演练

做真实 3 节点接入演练：

- `3 x RK2206 -> 1 x RK3568 -> center server`

验收点只看 4 件事：

- 数据稳定上传
- 节点可区分
- 网关可缓存/恢复
- 平台可见

## 6. 当前最建议的任务顺序

时间紧，建议直接按下面顺序推进。

### 第一步

先写一份正式的：

- `RK3568 网关 + 3 个 RK2206 + 中心服务器`

阶段化架构与任务拆分文档。

目的：

- 把后面所有编码和联调都挂到这一份主线上

### 第二步

立刻开始 RK3568 网关程序最小版本设计：

- 节点接入数 = 3
- 上行出口 = MQTT
- 本地最小缓存 = 必须
- 平台验收 = 复用当前 `full-path` 脚本和下游 proof

### 第三步

同步拉出 RK2206 固件任务单：

- 多传感器
- 低功耗
- 上报节奏
- 节点健康策略

### 第四步

最后才补中心部署定稿：

- 单机中心服务器拓扑
- 组件放置
- 运行/恢复策略

## 7. 当前单一执行线

从现在开始，当前主线建议压成一句话：

- `先冻结 3 节点 + 1 网关 + 1 中心服务器 的正式方案，再进入 RK3568/RK2206/中心部署三线编码`

## 8. 当前结论

当前最重要的判断是：

- `full-path` 已经够用了
- 不需要再围着单条 proof 打转
- 现在必须进入：
  - 方案收口
  - 任务拆分
  - 角色编码

## 9. 相关文档

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-uplink-full-proof-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-uplink-full-proof-latest.json)
- [field-uplink-platform-closure.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/memory/tasks/field-uplink-platform-closure.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
