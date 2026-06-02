---
title: field-shared-port-source-control-implementation-boundary-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-shared-port-source-control-implementation-boundary-2026-04
---

# 共享口源侧控制实现边界核定（2026-04）

## 状态

- topic: `field-shared-port-source-control-implementation-boundary`
- state: `implementation-boundary-confirmed`
- updated_at: `2026-04-12`
- authority: `current`
- related_change:
  - [add-shared-port-source-stream-control](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/proposal.md)

## 1. 这轮核定解决什么问题

这轮不再讨论“要不要做 source-side control”，而是核定三个实现级事实：

1. 当前真正还在跑、也真正可改的主线代码入口在哪
2. 哪条旧线应当明确降级为废弃实验
3. RK3568 当前应当先从哪段发送路径下手

## 2. 当前已确认的实现级事实

### 2.1 当前主线可执行的控制点在 RK3568 `field-gateway`

当前真实拓扑已经固定为：

- `RK2206 field node A/B/C`
- `-> center XL01`
- `-> RK3568 /dev/ttyS3`
- `-> MQTT / API / Web`

当前现场已确认参与这条链路、且已经有实机 proof 的运行物是：

- `services/field-gateway`
- `services/field-link-monitor`
- `scripts/dev/*rk3568*`

其中当前真正承接 southbound command send path 的代码入口是：

- `services/field-gateway/src/index.ts`

因此，当前主线实现边界必须落在 RK3568 这条已部署、已验真的发送路径上，而不是继续假设存在另一条尚未落板的中心控制程序。

### 2.2 “中心侧 RK2206 烧录”只保留为废弃实验候选

外部 RK2206 固件树里确实仍能看到：

- `FIELD_NODE_ROLE_SOURCE_CONTROLLER`
- `app/shared_port_scheduler.c`
- `app/shared_port_scheduler.h`

但从当前主线 authority 起，这条线只保留为：

- 历史实验候选
- 外部固件能力备忘

而不再作为：

- 当前实现入口
- 当前下一步默认动作
- 当前主线任务单的执行前提

因此以下表述从本轮起一律撤出当前权威口径：

- “先确认中心节点是不是可重新烧录的 RK2206 控制板”
- “先把中心节点切到 `FIELD_NODE_ROLE_SOURCE_CONTROLLER` 再继续主线”
- “当前实现优先走中心侧 RK2206 烧录”

### 2.3 RK3568 不是 parser-only 补丁点，而是当前真实的发送治理入口

当前证据已经证明：

- RK3568 能从 MQTT 接收 `cmd/{device_id}`
- 能将命令转发到 `/dev/ttyS3`
- 能在同一服务里观察 ACK / telemetry / rejected evidence
- 能持续产出 runtime / proof / quality latest

更重要的是，当前 repo 内真正能直接落代码并立刻影响现场闭环的地方，就是：

- `handleMqttMessage(...)`
- `resolveNodeForCommand(...)`
- `writeCommandToSerial(...)`
- `handlePayloadCandidate(...)`
- `publishCommandAck(...)`

所以现在对 RK3568 的正确描述不是“只能被动看污染”，而是：

- 它仍不能把已经损坏的上行碎片神奇恢复成稳定闭环
- 但它确实拥有当前唯一在主仓内、可直接实施的 southbound command send-path 治理入口

## 3. 关于 “XL01 能不能存储数据” 的正式答案

正式答案保持不变：

- `XL01` 透传模块不应被当作存储层
- 当前版本也不要求为了这个问题再新开“中心侧 RK2206 烧录”主线

当前阶段真正要先做的，不是让 `XL01` 存历史，也不是再加一条中心固件线，而是先把 RK3568 到中心 XL01 之间的命令发送路径治理起来：

- per-port send ownership
- command serialization
- ACK quiet-window

## 4. 当前主线代码入口映射

### 4.1 命令接收入口

- `services/field-gateway/src/index.ts`
  - MQTT `subscribe(cmd/+)`
  - `mqttClient.on("message", ...)`
  - `handleMqttMessage(...)`

### 4.2 目标节点与端口解析入口

- `services/field-gateway/src/index.ts`
  - `resolveNodeForCommand(...)`

### 4.3 串口写入口

- `services/field-gateway/src/index.ts`
  - `writeCommandToSerial(...)`

### 4.4 ACK / telemetry 回读入口

- `services/field-gateway/src/index.ts`
  - `handlePayload(...)`
  - `handlePayloadCandidate(...)`
  - `publishCommandAck(...)`
  - `publishRecord(...)`

## 5. 当前真正缺的不是“再找中心烧录物”，而是 RK3568 发送治理

当前真正缺失的实现能力是：

1. 同一 southbound 口的显式单写者 ownership
2. 命令写入后的 ACK quiet-window
3. 围绕命令 lane 的 per-port 调度状态

当前 `index.ts` 里的 southbound command path 仍然是：

- MQTT 消息一到
- 直接 `handleMqttMessage(...)`
- 直接 `writeCommandToSerial(...)`
- `serialPort.write(...) + drain(...)`

这说明当前 mainline 的第一落点，不该再回到“中心侧 RK2206 烧录”，而是要把这条直接写串口路径拆出来并治理。

## 6. 第一版实现边界结论

### 6.1 当前更优先的第一版主线

第一版当前应优先做的是：

1. 固定“中心侧 RK2206 烧录”为废弃实验，不再当主线依赖
2. 继续拆 `services/field-gateway/src/index.ts`
3. 在 RK3568 的 southbound command path 上引入：
   - per-port single writer
   - command lane
   - ACK quiet-window
4. 保持现有 northbound 契约不动
5. 用现有 proof / observation / edge-quality 入口复证

### 6.2 这不等于把 RK3568 说成“直连三口”

当前绝不能误写成：

- RK3568 直接连 3 个分节点串口

当前做的是：

- 在 `RK3568 <-> center XL01` 这条共享 `/dev/ttyS3` 邻接路径上治理命令发送窗口

也就是：

- 处理命令何时写入中心路径
- 处理命令写入后如何保留 ACK 观察窗口
- 不去改写现场真实硬件拓扑

## 7. 建议的当前代码改造顺序

1. 先冻结当前 authority：
   - 中心侧 RK2206 烧录 = 废弃实验
2. 再拆 `handleMqttMessage(...) -> writeCommandToSerial(...)`
3. 把 per-port send ownership 收进 `field-gateway`
4. 给命令发送后增加 quiet-window 状态
5. 继续复跑：
   - `manual_collect`
   - `set_config`
   - observation
   - edge-link-quality

## 8. 当前阶段最稳的结论

当前最稳、也最不自欺的结论是：

- “中心侧 RK2206 烧录”已经从当前主线 authority 中移除
- 当前主仓真正可执行、可复证、可继续推进的实现入口是：
  - `services/field-gateway/src/index.ts`
- 下一步不是再追一条未落板的中心固件线
- 而是直接治理 RK3568 到中心 XL01 的 southbound command send path
