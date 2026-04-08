---
title: field-rk3568-gateway-implementation-tasklist-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04
---

# RK3568 网关实施任务单（2026-04）

## 状态

- topic: `field-rk3568-gateway-implementation`
- state: `implementation-tasklist-frozen`
- updated_at: `2026-04-09`
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

当前这一层已继续向工业常驻形态推进：

- 串口打开失败不再要求主进程直接退出
- 运行期串口 `error/close` 会进入自动退避重连
- 重连状态必须进入 health，不能只留在 journal

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
- 最新现场拓扑已修正为：
  - `3 x RK2206 -> 1 个中心 XL01 -> RK3568 /dev/ttyS3`
- 因此当前主线不再是“继续找第二、第三个 southbound 串口”
- 而是：
  - 在同一条 `/dev/ttyS3` 串流里承载多个 `device_id`
  - 并把多个节点同时映射到同一个 `southboundPort`
- 当前 southbound 配置层更多是在回答：
  - 哪个 `device_id` 属于这个网关实例
  - 哪个节点当前允许被这个中心串流接收/下发
- 还没有进入：
  - 单口多节点真实并发输入
  - 多节点真实命令闭环
  - 多实例部署编排
  - 多无线链路调度
  - 节点离线/重连策略细化
  - 状态阈值的现场调优

4. 因此当前主线应继续收敛为
- 先让第二、第三个分节点通过中心 XL01 真正进入 `/dev/ttyS3` 串流
- 再在真实 `3 x RK2206` 条件下确认同一 southbound 口上的多节点运行事实
- 不再回头重做单节点 northbound 协议证明
- 现场执行优先复用当前脚本入口：
  - `scripts/dev/show-rk3568-field-gateway-serial-map.ps1`
  - `scripts/dev/set-rk3568-field-gateway-southbound-nodes.ps1`
  - `scripts/dev/check-rk3568-field-gateway-multiport-health.ps1`

## 11.1 2026-04-08 新发现的主阻塞

最新实机 proof 已经进一步说明：

- `cmd/{device_id}` 到共享 `/dev/ttyS3` 的命令转发仍然成立
- 但在 `A/B` 双节点同口运行时：
  - `cmd_ack/{device_id}` 仍可能丢失
- 当前 dominant failure mode 已不再只是“chunk 边界不好”
- 而是：
  - ACK payload 与 telemetry payload 在中心 XL01 汇聚后的同一条 southbound 字节流上发生交织

这意味着 RK3568 当前下一步不应继续只做 parser-only 补丁，而应补上：

1. 失败模式自动判定
- proof 脚本必须能直接标记：
  - `shared-stream-byte-interleaving`
  - `southbound-json-fragmentation`

2. 协议层整改入口
- 明确要求中心 XL01 / RK2206 southbound 链路至少满足其一：
  - ACK 独占发送窗口
  - 带边界帧封装的稳定传输

3. 现场证据化
- 后续命令 proof 不只看：
  - `commandsForwarded`
  - `ackMessagesPublished`
- 还要把 parse failure 的原始片段一起归档

## 11.2 2026-04-08 烧录后共享串口 ACK 已恢复

现场在真实 RK2206 固件树完成第一轮命令窗口整改并重新烧录后，`node B` 的共享串口命令 proof 已重新转绿。

1. 最新实机复证
- 执行入口：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-rk3568-field-gateway-node-command-proof.ps1 -DeviceId 00000000-0000-0000-0000-000000000002 -Action manual-collect -Password linaro`
- 最新命令证据：
  - `commandId = 3a989480-a41e-4bb3-98bf-1db7bd45b664`
- 最新结果：
  - `passed = true`
  - `diagnosis.summary = command-forward-and-ack-publish-succeeded`
- proof 前后统计已同步推进：
  - `commandsReceived: 4 -> 5`
  - `commandsForwarded: 4 -> 5`
  - `ackMessagesPublished: 1 -> 2`
  - `node B.commandForwards: 4 -> 5`
  - `node B.ackPublishes: 1 -> 2`

2. 日志与 health 已与 proof 一致
- RK3568 `journalctl` 已明确看到同一 `commandId` 的：
  - `field gateway command forwarded to serial`
  - `field gateway command ack published`
- 独立读取 `runtime-health.json` 也已确认：
  - `southbound.configuredNodes = 3`
  - `southbound.configuredPorts = 1`
  - `southbound.ports[0].ackMessages = 2`
  - `stats.ackMessagesPublished = 2`
  - `nodes[B].ackPublishes = 2`
- 这说明当前不再是“proof 里成功但 health 统计没跟上”的旧状态

3. 当前应如何解释剩余噪声
- 共享 `/dev/ttyS3` 串流中仍然存在：
  - `southbound-json-fragmentation`
  - `shared-stream-byte-interleaving`
  - `unclassified-parse-failure`
- 当前这类问题仍体现在：
  - `parseFailureCount = 47`
  - `schemaRejected = 688`
- 但这轮最新事实表明：
  - 它们仍是运行噪声和稳健性缺口
  - 已不再阻塞 `node B` 的 `manual_collect -> cmd_ack/{device_id}` 最小闭环

4. 因此当前主线应更新为
- 共享串口多节点命令闭环已经恢复到“可复证”状态
- 下一阶段不再停留在“ACK 为什么回不来”
- 而应转向两条更高价值的收口：
  - 让节点 `C` 进入同一中心 XL01 串流
  - 继续压低共享串口解析噪声，验证 `set_config` 与更长时间窗稳定性

## 11.3 2026-04-08 修复后 `set_config` 也已复证成功

在同一条修复后的共享串口链路上，`set_config` 的最小配置命令闭环也已完成实机复证。

1. 已完成的两次实机命令
- 切到 `300s`：
  - `commandId = 7acb0df9-5647-4551-a283-9d4b9ca0f78e`
  - `action = set-report-300`
  - `diagnosis.summary = command-forward-and-ack-publish-succeeded`
- 切回 `5s`：
  - `commandId = db328b8c-0874-4f35-81a1-ef576b8178f2`
  - `action = set-report-5`
  - `diagnosis.summary = command-forward-and-ack-publish-succeeded`

2. 当前实机统计已确认
- `commandsReceived = 7`
- `commandsForwarded = 7`
- `ackMessagesPublished = 4`
- `southbound.ports[0].ackMessages = 4`
- `nodes[B].commandForwards = 7`
- `nodes[B].ackPublishes = 4`
- 切回后 node `B` 已重新回到：
  - `status = online`
  - `lastTelemetryTs` 正常推进

3. 附带收口的脚本问题
- `run-rk3568-field-gateway-node-command-proof.ps1` 先前临时 payload 文件名只精确到秒
- 同一秒内并行运行不同 action 时会撞到同一个 `.tmp` 文件
- 已改为带毫秒时间戳：
  - `yyyyMMdd-HHmmss-fff`
- 这条修复不改变现场协议
- 但能避免控制侧 proof 并行时的伪失败

## 11.4 2026-04-08 严格 ACK 判定后，两节点共享串口仍未稳定收口

在把 proof 的通过条件收紧为：

- 不只要看到 `cmd_ack/{device_id}` 被发布
- 还要看到同一 `command_id` 的：
  - `status = acked`

之后，最新两节点共享串口一键基线结果已经从“全绿”修正为“仍未稳定收口”。

1. 当前固定入口
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-rk3568-shared-port-two-node-baseline.ps1 -Password linaro`

2. 最新结果
- `conclusion = baseline-failed-but-report-interval-restored-to-5s`
- 当前说明：
  - 两节点仍可运行
  - 但不能再把它表述为“稳定可交付”

3. 最新严格证据
- `manual_collect`
  - 本轮未拿到新的 `status=acked`
  - 因此判为未通过
- `set-report-5`
  - 恢复步骤成功
  - 最新恢复命令：
    - `commandId = 879673c0-ffcd-4ec2-b01b-ffa29aff4cfa`
    - `status = acked`

4. 因此当前主线应进一步收敛为
- `node C` 未到之前，不应把重点放在扩拓扑
- 而应先把当前：
  - `2 节点`
  - `1 条 /dev/ttyS3`
  - `manual_collect + set_config`
  收到真正稳定的 `status=acked`

## 11.5 2026-04-09 新 parser 候选过滤后的当前执行判断

最新第二轮 parser 候选过滤已经把一类“非 schema JSON 候选”噪声从候选池里剔掉，并且完成了串行实机复查。

1. 当前新事实：
- RK3568 最新复查窗口：
  - `node A = online`
  - `node B = online`
  - `node C = configured`
  - `parsedMessages = 7`
  - `publishedMessages = 7`
  - `schemaRejected = 0`
  - `lastError = null`
- 这说明新过滤已经对早期窗口生效

2. 但当前不应误判为“共享口稳定收口”：
- 同轮 node `B manual_collect` proof 仍然是：
  - 第 1 次失败
  - 第 2 次成功
- 当前最新结论仍然是：
  - `shared-port-command-succeeded-after-retry`
- 剩余 failure mode 仍然集中在：
  - `southbound-json-fragmentation`

3. 因此当前主线判断更新为：
- parser hardening 已继续前进
- 但 strict quality gate 还不能撤
- 现场命令入口仍应保留：
  - strict baseline
  - stable bounded-retry entry

## 11.6 2026-04-09 node C 到货前两天的冻结执行包

考虑到 node `C` 预计约两天后接入，当前不再继续泛化讨论，而是冻结一个明确的 pre-node-`C` 执行包。

1. 第一包：冻结已成立的入口，不再反复改部署线
- 保持当前正式入口冻结：
  - `scripts/dev/install-rk3568-field-gateway.ps1`
  - `scripts/dev/check-rk3568-field-gateway-runtime.ps1`
- 除非入口本身损坏，否则这两天不再重构安装/快照链

2. 第二包：继续压共享口噪声，但只做窄补丁
- 继续围绕：
  - `services/field-gateway/src/index.ts`
  做更窄的 parser / framing hardening
- 约束保持：
  - 不改 northbound contract
  - 不改 southbound 设备协议定义
  - 不把共享口问题写成“已根治”

3. 第三包：把双节点长窗口事实先补齐
- 在 node `C` 到货前，先拿到更长时间窗的：
  - `A + B` telemetry 连续性
  - `schemaRejected`
  - `publishFailures`
  - `spoolPending`
  观测
- 目标不是“单次 lucky green”
- 而是确认：
  - 共享口在较长窗口里的噪声量级
  - 当前补丁是否真的在压低 reject rate

4. 第四包：预定义 node `C` 的统一验收条件
- node `C` 接入后第一批验收必须固定为：
  - `/dev/ttyS3` 串流出现 `device_id = 00000000-0000-0000-0000-000000000003`
  - RK3568 `runtime-health.json` 中：
    - `node C = online`
  - 三节点 `10` 到 `15` 分钟 telemetry 连续
  - 先复跑 node `B manual_collect`
  - 再跑 node `C manual_collect`
  - 再做一次 `set_config` 回归

5. 第五包：按当前实测先冻结三节点容量预算
- 按 `5s` 上报频率：
  - 三节点每天 telemetry 约 `31.25 MiB`
  - 更保守预算约 `32.14` 到 `34.61 MiB / day`
- 当前工程含义是：
  - 本地 spool 上限
  - 中心侧月度存储
  - 证据文件保留策略
  都应开始按这个量级来设

## 11.7 2026-04-09 当前阶段结论

在 node `C` 未到之前，当前阶段已经不是“卡死”，而是处于明确的收口窗口：

1. 已冻结不再重开的部分
- northbound 合同
- RK3568 正式源码同步部署线
- Windows 侧运行快照入口

2. 当前仍是 blocker 的部分
- 共享 `/dev/ttyS3` 的 strict deterministic command closure
- `southbound-json-fragmentation` 噪声

3. 这两天最应该做的事
- 用窄补丁继续压 reject/noise
- 补双节点长窗口证据
- 把 node `C` 接入验收包提前写死

## 11.8 2026-04-09 板端单入口 acceptance 已固定

为避免后续继续靠三条分散命令人工拼接 RK3568 板端复核，当前已经冻结一条统一入口：

- `scripts/dev/check-rk3568-field-gateway-acceptance.ps1`

这条入口当前固定串起：

1. 可选重新部署
- `install-rk3568-field-gateway.ps1`

2. 板上 runtime 快照
- `check-rk3568-field-gateway-runtime.ps1`

3. 严格命令闭环 proof
- `run-rk3568-field-gateway-node-command-proof.ps1`

当前它的作用边界很明确：

- 不引入新的 northbound 合同
- 不替代 strict baseline / stable retry 双轨
- 只负责把“当前板端是否达到可复核、可交接状态”压成一条命令

它的最小接受条件固定为：

- `lsmv2-field-gateway.service = active + enabled`
- `mqtt.connected = true`
- `serial.open = true`
- `southbound.routeMode = configured-node-routing`
- `configuredNodes = 3`
- `node A = online`
- `node B = online`
- `node C = configured|online`
- topic contract 仍为：
  - `telemetry/{device_id}`
  - `cmd/{device_id}`
  - `cmd_ack/{device_id}`
- 指定节点 strict command proof 必须拿到：
  - `passed = true`
  - `ack status = acked`

当前最新实机结果已经证明这条入口可用：

- `DeployMode = install`
- `accepted = true`
- `currentBoundary = board-runtime-and-command-proof-ready`
- warmup:
  - `satisfied = true`
  - `elapsedSeconds = 5`
- 最新 strict proof：
  - `deviceId = 00000000-0000-0000-0000-000000000002`
  - `action = manual_collect`
  - `commandId = 4a0735c2-5a77-4bc0-8135-04805a0bd0a0`
  - `ack status = acked`
  - `parseFailureCount = 0`

因此，当前 RK3568 这条线也和中心侧一样，已经开始从：

- “有若干脚本能分别跑”

进入：

- “有一条可重复的 acceptance 入口”

## 12. 相关文档

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
