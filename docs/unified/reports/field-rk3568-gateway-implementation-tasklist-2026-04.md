---
title: field-rk3568-gateway-implementation-tasklist-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04
---

# RK3568 网关实施任务单（2026-04）

## 状态

- topic: `field-rk3568-gateway-implementation`
- state: `implementation-tasklist-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. 这份任务单解决什么问题

[field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
已经冻结了：

- `3 x RK2206 + 1 x RK3568 + 1 x center server`

但它还是阶段基线，不是开发任务单。

这份文档继续往下压一层，专门回答：

1. RK3568 网关第一阶段到底要写哪些能力
2. 哪些能力必须先完成，哪些可以延后
3. 什么才算“网关最小可运行版本”真的成立

## 2. 它挂靠在哪条 authority 链上

这份任务单直接挂靠以下文档，不单独发明新方向：

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
- [field-rk3568-software-interface-alignment-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-software-interface-alignment-2026-04.md)

因此，它只负责：

- 把 `field gateway` 角色压成可实施清单

不负责：

- 重写平台主链
- 重新争论是不是还要厚翻译器
- 重新争论命令链是否已经证明

## 3. RK3568 当前必须承担的输入输出边界

### 3.1 输入边界

RK3568 当前必须接住：

1. `3 个 RK2206 分节点`
- 当前一期先允许从 `1 节点 -> 3 节点` 渐进实现
- 但代码模型必须一开始就按 `3 节点` 设计

2. 现场侧输入形态
- 串口 / XL01 / 透明链路文本流
- 可能分片
- 单个 chunk 不等于完整 JSON

3. 节点身份
- `field_node_id`
- `device_id`
- 物理端口 / 接入通道

### 3.2 输出边界

RK3568 当前必须输出：

1. 平台可接受 telemetry
- 保持 `device_id`
- 保持 `schema_version + device_id + seq + metrics + meta`
- topic 固定为：
  - `telemetry/{device_id}`

2. 留证结果
- 原始输入
- 重组后消息
- 校验结果
- 上行结果
- 失败原因

3. 网关运行状态
- 节点在线状态
- 缓存深度
- 上次成功上行时间
- 当前回传链路状态

## 4. 第一阶段最小目标

RK3568 第一阶段只追求一个最小闭环：

- `多节点接入 -> 重组/校验 -> 本地缓存 -> MQTT 上行 -> 失败可留证`

这一阶段不追求：

- 完整运维后台
- 复杂规则引擎
- 自动升级平台
- 复杂设备编排

一句话：

- 先做 `minimum viable gateway`

## 5. 实施任务包

### 5.1 接入层

必须完成：

1. 设计 `3 节点` 接入抽象
- 每个节点有独立输入通道
- 每个节点有独立接收缓冲

2. 固定节点配置源
- `field_node_id`
- `device_id`
- 端口/链路参数
- 安装标签

3. 固定启动与重连策略
- 网关启动时自动打开所有南向通道
- 断开后自动重试

交付物应包括：

- 接入配置文件格式
- 端口到节点的映射规则
- 启动日志和错误日志规范

### 5.2 适配层

必须完成：

1. chunk 重组
- 从分片文本流恢复完整 JSON

2. 完整性校验
- UTF-8
- JSON 可解析
- `schema_version`
- `device_id`
- `metrics`

3. 长度预算控制
- 超限消息拒绝或落异常证据
- 不让异常报文直接污染平台主链

4. 轻量确定性补齐
- 仅补齐网关能确定的字段
- 例如接收时间或网关观测时间

这一层禁止做：

- 任意重命名 canonical metrics key
- 引入新机器身份
- 让平台承担现场分片恢复

### 5.3 状态层

必须完成：

1. 节点运行状态
- online
- offline
- degraded

2. 网关总状态
- 当前连接节点数
- 当前缓存深度
- 最近错误类型

3. 命令/上报上下文
- 上次成功上报时间
- 上次失败上报时间
- 最近一次错误摘要

这一层的目标不是做大屏，而是给部署和排障留下稳定事实。

### 5.4 缓存层

必须完成：

1. 最小 spool/cache 模型
- 断网不立即丢消息
- 恢复后按顺序补传

2. 缓存记录结构
- 节点标识
- 原始消息
- 重组后的标准消息
- 首次接收时间
- 重试次数
- 当前状态

3. 故障恢复策略
- 进程重启后可继续处理未完成消息

这一层的一期目标不是高性能消息队列，而是稳定补传。

### 5.5 上行层

必须完成：

1. MQTT 上行主路径
- 平台 broker 地址
- 认证方式
- telemetry topic 约定

2. 上行确认与失败处理
- 成功写出
- 失败重试
- 超过阈值进入缓存

3. 一期调试旁路
- 允许 HTTP fallback 仅作为调试旁路
- 不得把 HTTP fallback 写成正式架构真值

### 5.6 下行层

必须完成最小翻译能力：

1. 平台命令接收
- 识别目标 `device_id`
- MQTT topic 固定为：
  - `cmd/{device_id}`
- payload 固定兼容：
  - `device-command.v1`

2. 网关到节点命令转译
- 转成节点可执行的现场格式

3. 一期最小支持集
- `manual_collect`
- `set_config`

4. 平台 ACK 回灌
- MQTT topic 固定为：
  - `cmd_ack/{device_id}`
- payload 固定兼容：
  - `device-command-ack.v1`

这一层当前不是总主线，但必须保留最小闭环，不然部署态会断半条链。

## 6. 推荐实施顺序

### Step 1

先落接入层与适配层：

- 多节点模型
- chunk 重组
- JSON 校验

### Step 2

再落缓存层：

- 断网缓存
- 恢复补传

### Step 3

再落上行层：

- MQTT 出口
- 重试与失败转缓存

### Step 4

最后补最小下行层和状态层：

- 命令转译
- 运行状态输出

## 7. 一期验收标准

RK3568 网关一期算完成，至少要满足：

1. 能同时维护 `3 节点` 的配置模型
2. 能从任一节点输入中恢复完整 JSON 消息
3. 能校验并过滤异常消息
4. 能把有效消息转发到平台 MQTT 入口
5. 断网时能缓存，恢复后能补传
6. 至少能对 `manual_collect` 与 `set_config` 做最小下行转译
7. 能留下一次端到端证据包

## 8. 当前不纳入一期的内容

以下内容明确不作为当前一期 blocker：

1. 网关 UI
2. 复杂 OTA
3. 高级规则引擎
4. 云边协同编排
5. 自动化设备发现
6. 大规模节点横向扩展

## 9. 风险与注意事项

当前最现实的风险是：

1. 现场链路消息边界不稳定
- 需要先把重组做扎实

2. 串口/无线端口易变
- 配置模型不能把固定端口号写死在代码逻辑里

3. 缓存写盘策略不当
- 容易造成 eMMC/SSD 写放大

4. 网关代码过早做厚适配
- 会把当前已接近 canonical 的现场消息再次做坏

## 10. 当前结论

当前 RK3568 网关主线应被压成：

- `多节点接入 + 薄适配 + 缓存补传 + MQTT 上行 + 最小下行翻译`

并且 northbound 软件接口必须继续固定为：

- `telemetry/{device_id} + TelemetryEnvelope v1`
- `cmd/{device_id} + device-command.v1`
- `cmd_ack/{device_id} + device-command-ack.v1`

这份任务单冻结后，RK3568 的后续工作不再以“继续证明链路”为主，而应以“把最小可运行网关真正写出来”为主。

## 11. 2026-04-08 当前实施检查点

截至 `2026-04-08`，这份任务单已有一部分正式落成：

1. 已落成能力
- 单 southbound 串口运行主线：
  - `/dev/ttyS3`
  - `115200 8N1`
- northbound 正式接口：
  - `telemetry/{device_id}`
  - `cmd/{device_id}`
  - `cmd_ack/{device_id}`
- 最小命令闭环：
  - `manual_collect`
  - `set_config`
- southbound 配置模型第一版：
  - `SOUTHBOUND_NODES_JSON`
  - `fieldNodeId`
  - `deviceId`
  - `installLabel`
  - `southboundPort`
  - `enabled`
- health 可观测面第一版：
  - `southbound.configuredNodes`
  - `southbound.activeSerialDevice`
  - `southbound.nodes[]`
  - `southbound.ports[]`
  - `nodes[].status`
  - `ports[].status`

2. 已完成的实机证明
- RK3568 实机已带显式 `SOUTHBOUND_NODES_JSON` 配置运行
- `runtime-health.json` 已证明：
  - `configuredNodes = 1`
  - 节点 `A -> device_id -> /dev/ttyS3` 映射已进入运行态
- southbound 运行时已升级为：
  - `single process, multi southbound ports`
- 当前 health 已证明：
  - `southbound.routeMode = configured-node-routing`
  - `southbound.configuredPorts = 1`
  - `southbound.ports[]` 已进入运行态
  - `southbound.ports[0].status = online`
  - `southbound.nodes[0].status = online`
- fresh runtime `manual_collect` 已再次跑通：
  - `cmd/{device_id} -> RK3568 -> /dev/ttyS3 -> cmd_ack/{device_id}`
- 当前最新实机命令证据：
  - `commandId = 19eef434-59ba-40df-9386-869d47421fed`

3. 仍未完成的部分
- `3 x RK2206` 多节点并发接入还没有真正上板
- 多 southbound 端口路由选择已经落地到运行时骨架
- 但第二、第三个真实端口还没有接进来
- 当前 southbound 配置层更多是在回答：
  - 哪个 `device_id` 属于这个网关实例
  - 哪个节点当前允许被这个串口实例接收/下发
- 还没有进入：
  - 多串口真实并发接入
  - 多实例部署编排
  - 多无线链路调度
  - 节点离线/重连策略细化
  - 状态阈值的现场调优

4. 因此当前主线应继续收敛为
- 先把第二、第三个 southbound 端口真正接入
- 再在真实 `3 x RK2206` 条件下确认运行事实
- 不再回头重做单节点 northbound 协议证明

## 12. 相关文档

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
