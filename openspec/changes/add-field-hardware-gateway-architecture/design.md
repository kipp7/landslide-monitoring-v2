## Context

当前项目的软件主链已经较成熟：

- 中心平台采用 `MQTT -> ingest -> Kafka -> ClickHouse/Postgres -> API -> Desk/Web`
- 设备身份采用 `device_id + device_secret`
- 固件行为已经定义了断电安全、指数退避、采样/上报解耦、命令回执
- `iot/` 文档已经明确：非 MQTT 直连接入应通过“适配器/网关”，不破坏中心主链

但现场硬件侧当前真实形态并不是“MQTT 设备代理”：

- RK2206 节点当前更像采集节点
- 节点通过 XL01/串口透传 JSON 给中心节点/本地接收端
- 现场链路已有自己的 ACK 机制

因此，当前真正需要冻结的不是平台主链，而是“现场边缘架构”的职责边界。

## Goals / Non-Goals

- Goals:
  - 明确节点、网关、平台三层架构和长期职责边界
  - 保护现有平台契约，不让现场私有协议污染主链
  - 提前把部署、信号、供电、功耗、冗余、缓存策略纳入同一套方案
  - 给真实硬件联调与后续实现提供清晰的阶段边界
- Non-Goals:
  - 不在本轮直接决定最终硬件 BOM
  - 不在本轮直接实现网关软件
  - 不在本轮直接把 RK2206 固件改成 MQTT 终端

## Existing Truth We Must Preserve

### Platform truth

- 中心平台继续以现有 v2 主链作为唯一标准入口
- 遥测标准格式继续使用 `TelemetryEnvelope`
- 命令与回执继续使用 `cmd/{device_id}` 与 `cmd_ack/{device_id}`
- 设备身份继续使用 `device_id + device_secret`

### Firmware truth

- 节点必须满足断电安全写入（A/B slot + CRC）
- 节点必须实现指数退避，避免连接风暴
- 节点必须把采样与上报频率解耦
- 节点不应承担平台内部组件知识（Kafka/ClickHouse/API）

### IoT integration truth

- 非 MQTT 直连接入应走“适配器/网关”模式
- 平台主链不应直接理解现场私有串口/无线包格式

## Decisions

### Decision: Use a three-layer field architecture

The field architecture SHALL be split into three layers:

1. `field node`
- 负责传感器采样、本地健康保护、最小缓存、现场链路 ACK、低功耗调度
- 不直接理解平台内部主链

2. `field gateway`
- 负责接收一个部署分区内多个节点的上报
- 负责协议转换、身份映射、时间戳补齐、缓存重放、链路观测、下行命令翻译
- 是平台的直接边缘对接点

3. `central platform`
- 继续使用现有标准契约与数据主链
- 不直接感知 XL01/串口/现场私有 JSON 细节

### Decision: Gateway adapts to platform, not vice versa

网关必须承担“适配层”职责。

这意味着：

- 节点可以继续保留现场协议与现场 ACK 语义
- 网关负责把现场包映射到平台 `TelemetryEnvelope`
- 平台不为节点的原始字段格式、节点短 ID、串口 ACK 语义做特殊分支

### Decision: Node identity and platform identity may differ

现场节点标识与平台设备标识不应强制相同。

Recommended model:

- `field_node_id`
  - 现场节点可读、可标识、可贴标
  - 可短且适合运维，例如 `A01`、`SLOPE1-GNSS-03`
- `device_id`
  - 平台 UUID 主键
  - 用于 MQTT username/topic、数据库主键、命令与审计

Gateway MUST own the mapping:

- `gateway_id`
- `field_node_id`
- `device_id`
- optional radio/channel/group metadata

### Decision: `install_label` is allowed as a field-facing label, but not as a machine identity

为了兼顾现场运维可读性与平台主身份稳定性，允许存在一个面向人类的现场标签。

Recommended model:

- `device_id`
  - 平台唯一机器身份
  - 用于认证、topic、数据库主键、命令与审计
- `install_label`
  - 面向施工、巡检、贴标、口头沟通
  - 例如：`S01-GNSS-01`、`S01-TILT-02`
  - 用于展示和现场管理，不参与认证和协议主逻辑
- optional `hardware_serial`
  - 用于制造、追溯、返修
  - 不替代 `device_id`

Rules:

- `install_label` MUST NOT be used as MQTT username
- `install_label` MUST NOT be used as topic identity
- `install_label` MUST NOT replace `device_id` in the platform data model
- UI MAY prefer showing `install_label`, but internal processing MUST continue using `device_id`

### Decision: One gateway per manageable coverage cell

不建议“一座山一个总网关”。

推荐原则：

- 一个网关只覆盖一个可控地形单元/遮挡单元/供电单元
- 不跨多个严重遮挡区
- 不为了减少网关数量而扩大到不可维护范围

评估维度：

- 视距与遮挡
- 地形转折与岩体遮挡
- 供电与防雷
- 回传链路质量
- 运维可达性

### Decision: Signal and power are first-class architecture concerns

节点架构不应仅按“能发包”设计，而应按“长期可部署”设计。

Required principles:

- sampling 与 report interval 必须解耦
- 高功耗器件必须支持策略化启停或分档
- 无线链路质量必须进入观测指标，而不是靠现场口头判断
- 节点与网关都必须定义断链缓存策略

Recommended profiles:

- Normal profile
  - 低频上报，优先长续航
- Focus profile
  - 中频采样/上报，用于风险关注期
- Alert profile
  - 短时高频，用于事件窗口

### Decision: Use a Field Telemetry Profile instead of a full-fat generic payload

节点侧协议应尽量直接对齐平台语义，但不应把“完整、冗长、低频静态信息过多”的 payload 作为现场链路默认格式。

Field Telemetry Profile SHOULD preserve platform semantics while constraining field transport cost.

Recommended high-frequency payload skeleton:

- `schema_version`
- `device_id`
- `seq`
- `metrics`
- optional `event_ts`

Default exclusions from high-frequency payloads:

- `install_label`
- large `meta`
- verbose diagnostics
- duplicated static configuration

Interpretation:

- 节点应直接使用平台 canonical metrics key
- 节点应尽量直接使用平台 `TelemetryEnvelope` 语义
- 但现场高频链路必须采用“轻量字段集”

### Decision: High-frequency and low-frequency telemetry must be separated

高频与低频信息不应混装到同一类常态上报里。

Recommended split:

1. high-frequency telemetry
- 倾角、关键环境值、电池状态、告警标志等高频监测值
- 目标是小包、低时延、低重传成本

2. low-frequency metadata/status
- 固件版本
- 配置快照
- 安装标签
- 设备诊断摘要
- 低频 GNSS 扩展状态

Benefits:

- 降低常态包长
- 降低链路占用与重传成本
- 避免把低频静态字段反复发入高频链路

### Decision: The field link MUST define framing and length budget explicitly

无论底层传输模块是否自带透明传输协议，现场链路都必须显式定义应用层 framing 与包长预算，不能把“逻辑上一条 JSON”默认等同于“链路层一个完整消息”。

Required controls:

- 明确高频上报的目标包长预算
- 明确超过预算时的处理策略
- 明确消息边界判定方式
- 明确节点/网关在重组完整消息前不得把字节流直接当成完整业务包处理

Recommended initial policy:

- 以“小包优先”作为长期原则
- 在现场试点前，不应把高频 payload 设计为依赖长 JSON 的稳定传输
- 数值阈值应以真实链路测试结果冻结，不应只根据 MCU 缓冲区长度假定可行

### Decision: Redundancy must be selective, not uniform

所有点位做双冗余通常不经济，也会增加现场复杂度。

Recommended redundancy tiers:

1. Platform layer
- 中心平台先按现有单机可恢复主链运行
- 通过备份、证据包、重放能力控制风险

2. Gateway layer
- 普通站点：单网关 + 备件/冷备
- 关键站点：可考虑双网关方案，但必须避免同频互扰与运维复杂度失控

3. Node layer
- 关键测点优先通过“多节点互补”而不是每节点完全双机热备
- 冗余目标应是“关键监测信息不丢”，不是“每一个硬件节点永不失效”

### Decision: Stage 1 and Stage 2 must be separated

Stage 1:

- 只做上行采集闭环
- 节点 -> 网关 -> 平台入库 -> API -> Desk/Web 展示

Stage 2:

- 再补命令闭环
- 平台命令 -> 网关翻译 -> 节点执行 -> 网关/节点回执 -> 平台审计

Reason:

- 上行链路与下行命令的复杂度不是一个级别
- 先把“真实数据长期稳定入库”做稳，比同时做控制闭环更重要

## RK3568 Gateway Assessment

### Decision: Ubuntu + RK3568 is an acceptable and recommended gateway baseline

`Ubuntu + RK3568` 作为现场网关是可行的，而且在当前阶段是合理候选。

Why it is suitable:

- 算力和内存明显高于 MCU 节点，足以承载：
  - 串口/无线接入
  - 协议转换
  - 本地缓存
  - MQTT/HTTP client
  - 日志与观测
- Ubuntu 生态成熟，利于：
  - 守护进程管理
  - 网络配置
  - 串口/USB 驱动支持
  - 本地落盘缓存
  - 运维和调试
- 与现有 Node.js / Fastify / MQTT tooling 更兼容

Constraints:

- RK3568 适合作为“网关”，不适合作为低功耗长期野外电池节点
- 必须具备稳定供电、掉电恢复、只读根文件系统或可恢复日志策略
- 必须明确：
  - eMMC/SSD 写入策略
  - 看门狗/开机自启动
  - 4G/5G/有线回传方案
  - 工业温度、外壳、防水、防雷

Recommended gateway software responsibilities on RK3568:

- field packet receiver
- mapping/config store
- local spool/cache
- MQTT or HTTP uplink adapter
- command translation worker
- health reporter

## Alternatives Considered

### Alternative A: Make RK2206 nodes speak platform MQTT directly

Rejected as phase-1 default.

Reasons:

- 节点复杂度显著上升
- 功耗、重连、证书/鉴权、命令处理都压到节点端
- 现场私有无线链路仍然存在，无法真正消灭网关问题

### Alternative B: Let platform accept raw XL01/serial JSON directly

Rejected.

Reasons:

- 平台边界被现场协议污染
- 后续任何硬件迭代都会逼平台改主链
- 无法形成稳定的标准契约

### Alternative C: HTTP uplink from gateway instead of MQTT uplink

Accepted as optional, not primary architecture truth.

Interpretation:

- 若现场网关开发优先级要求极低耦合，可以先复用 HTTP adapter 模式把数据送进 `telemetry.raw.v1`
- 但长期推荐仍是让网关输出平台标准的 `TelemetryEnvelope`

## Risks / Trade-offs

- 网关层增加了系统层级，但换来了边界清晰和演进能力
- 若过早做“双网关热备”，可能导致现场实施复杂度和无线干扰上升
- 若不建立 `field_node_id -> device_id` 映射规范，后续设备替换与审计会混乱
- 若忽略供电、防雷、维护可达性，只谈协议，方案会在现场失效

## Rollout Plan

### Phase A: Architecture freeze

- 冻结节点、网关、平台三层边界
- 冻结映射模型与阶段边界

### Phase B: Software-first protocol rehearsal

- 在不依赖真实硬件上线的前提下，先完成软件层面的对接调试
- 先分两段做：
  - 节点 -> 网关
  - 网关 -> 平台

Recommended outputs:

1. node-side simulator or replay generator
- 负责按 `Field Telemetry Profile` 生成标准化轻量消息
- 能模拟：
  - 高频数据
  - 低频补充数据
  - 乱序/重复/断连重发
  - 超预算包

2. gateway-side adapter harness
- 负责接收节点侧消息流
- 做：
  - framing 重组
  - 长度检查
  - 缓存与重放
  - 转发到 MQTT 或 HTTP adapter

3. platform-side validation harness
- 验证进入现有主链后的：
  - schema 合法性
  - ingest 可接收
  - Kafka/raw writer 可接收
  - API/Desk/Web 可见

Phase B success criteria:

- 不依赖真实现场硬件，也能先把协议和边界调顺
- 软件适配层问题先于硬件问题暴露

### Phase C: Uplink pilot

- 选一组真实点位
- 只验证节点 -> 网关 -> 平台上行闭环
- 不在本阶段做远程控制闭环

### Phase D: Gateway hardening

- 补本地缓存、重放、健康观测
- 补部署 runbook、运维手册、恢复流程

### Phase E: Command/ack phase

- 在上行稳定后，再接命令/回执

## Software Integration Boundary

### Node-to-gateway debugging boundary

This boundary SHOULD be treated as a transport-and-profile debugging stage.

It must answer:

- 节点发出的轻量消息是否满足 field telemetry profile
- framing 是否可被稳定重组
- 包长预算是否合理
- 高低频分层是否正确

This stage should not depend on:

- 平台数据库
- Desk 页面逻辑
- 真实站点部署

### Gateway-to-platform debugging boundary

This boundary SHOULD be treated as a standards-adaptation stage.

It must answer:

- 网关输出是否满足平台标准契约
- MQTT uplink 是否可用
- optional HTTP adapter uplink 是否可作为早期替代路径
- 缓存重放是否不会破坏平台幂等性与时序判断

This stage should not depend on:

- 真实无线链路质量
- 节点真实功耗
- 真实现场供电条件

## Recommended Software-First Validation Order

1. validate field telemetry profile off-device
- 先用软件生成器固化字段、长度、分层规则

2. validate gateway reconstruction and forwarding
- 再验证 framing、缓存、转发和错误处理

3. validate platform ingress and visibility
- 再验证 ingest、Kafka、writer、API 和 Desk/Web 可见性

4. validate end-to-end rehearsal
- 最后才用真实节点替换模拟器

## Recommended Evidence Per Phase

### Phase B evidence

- sample payload library
- field profile length report
- framing reconstruction logs
- adapter acceptance report

### Phase C evidence

- gateway runtime logs
- platform ingest logs
- telemetry visibility proof

### Phase D evidence

- outage replay proof
- cache recovery proof
- gateway reboot recovery proof

### Phase E evidence

- command dispatch proof
- ack/timeout proof
- audit trail proof

## Concrete Software Debug Blueprint

### 1. Node-side simulator responsibilities

在真实硬件还未成为唯一真值前，需要一个软件节点模拟器来稳定产出“可重复、可比较、可留证”的节点侧消息。

The node simulator SHOULD support at least these packet classes:

- normal high-frequency packet
- low-frequency metadata packet
- duplicate packet
- out-of-order packet
- oversized packet
- replay packet after simulated outage

The simulator SHOULD emit data using the same field telemetry profile that future firmware is expected to follow.

Recommended packet classes:

1. `hf-normal`
- high-frequency normal telemetry
- small packet
- only required identity + critical metrics

2. `lf-meta`
- low-frequency metadata/status packet
- carries configuration or diagnostic snapshot

3. `hf-duplicate`
- same `device_id + seq` repeated
- used to validate idempotency path

4. `hf-out-of-order`
- lower sequence arrives after a higher sequence
- used to validate ordering tolerance

5. `hf-oversized`
- exceeds the field profile length budget
- used to validate adapter rejection or downgrade behavior

6. `hf-replay`
- delayed resend after simulated outage
- used to validate spool/replay handling

### 2. Gateway adapter harness responsibilities

网关适配器调试桩不应一开始就依赖真实 RK3568 板卡，而应先在开发机上完成逻辑闭环。

The gateway harness SHOULD prove these behaviors:

- can receive framed field packets
- can reconstruct complete logical messages from a byte stream
- can reject malformed or over-budget payloads
- can write accepted messages into a local spool/cache representation
- can forward accepted messages toward the platform uplink contract

Recommended minimum adapter input model:

- input stream type
  - byte stream
  - framed packet stream
- transport metadata
  - receive timestamp
  - source link identifier
  - optional signal or quality metadata
- packet class marker
  - for rehearsal only

### 3. Recommended adapter internals

The gateway adapter SHOULD be split into internal responsibilities:

1. field input receiver
- serial/USB/radio stream reader

2. frame reassembler
- message boundary detection
- CRC or integrity verification

3. field profile validator
- required field check
- length budget check
- high-frequency vs low-frequency packet type check

4. local spool/cache
- append accepted messages for replay
- mark replayed vs pending

5. uplink publisher
- publish to MQTT uplink, or
- publish to optional HTTP adapter endpoint

6. health reporter
- expose adapter status, queue depth, and last successful uplink timestamp

### 3.1 Recommended spool record schema

The local spool/cache entry SHOULD contain:

- `spool_id`
- `received_ts`
- `device_id`
- `packet_class`
- `seq`
- `payload_hash`
- `payload_bytes`
- `state`
  - `pending`
  - `published`
  - `replayed`
  - `rejected`
- optional `rejection_reason`

Interpretation:

- spool records are not business truth
- spool records exist to support replay, audit, and debugging

### 4. Recommended uplink strategy during software-first phase

Primary path:

- gateway adapter -> MQTT `telemetry/{device_id}` -> existing ingest

Optional early path:

- gateway adapter -> HTTP adapter -> `telemetry.raw.v1`

Interpretation:

- MQTT remains the architecture truth
- HTTP adapter MAY be used as an early software-only debugging shortcut
- HTTP shortcut MUST NOT become the long-term excuse to skip MQTT alignment

### 4.1 Minimum MQTT uplink contract for rehearsal

The MQTT rehearsal contract SHOULD assume:

- topic: `telemetry/{device_id}`
- payload semantics: platform `TelemetryEnvelope`
- adapter may add only transport-side information that is allowed by the contract

The adapter MUST NOT:

- remap `device_id` into a different machine identity
- inject `install_label` into default high-frequency telemetry
- mutate canonical metric keys into adapter-local names

### 4.2 Minimum HTTP uplink contract for temporary fallback

The HTTP rehearsal contract SHOULD assume:

- endpoint: adapter-compatible ingestion endpoint
- body semantics: same field telemetry profile content expressed as a platform-acceptable payload

The HTTP fallback MAY be used for:

- early schema verification
- adapter output verification
- platform visibility verification

The HTTP fallback MUST NOT be treated as final architecture truth.

### 5. Recommended debug artifacts

Each software-first rehearsal SHOULD produce:

- payload samples
  - accepted packets
  - rejected packets
  - over-budget packets
- field length report
  - packet size by class
  - metrics count by class
- gateway adapter logs
  - reconstruction log
  - validation failures
  - spool enqueue/dequeue events
- spool snapshots
  - pending messages
  - replayed messages
- platform acceptance proof
  - ingest accepted
  - Kafka message written
  - writer-visible data
  - API-visible summary

### 5.1 Recommended evidence directory layout

Each rehearsal run SHOULD write to a timestamped evidence directory such as:

```text
backups/evidence/field-rehearsal-<timestamp>/
  node/
    payload-samples/
    profile-summary.json
  gateway/
    adapter.log
    framing.log
    spool-before.json
    spool-after.json
  platform/
    ingest-proof.json
    api-proof.json
    desk-proof.json
  summary.json
```

The summary SHOULD indicate:

- rehearsal scope
- packet classes exercised
- accepted vs rejected counts
- replay success or failure
- platform visibility result

### 6. Recommended validation sequence in practice

#### Step 1: Field profile validation

Goal:

- prove that the node-side message profile is stable before real field transport is involved

Success signals:

- required fields are present
- excluded fields do not leak into high-frequency packets
- packet classes are distinguishable

#### Step 2: Framing and reconstruction validation

Goal:

- prove that the gateway can reconstruct logical messages even when input arrives as non-contiguous byte streams

Success signals:

- complete messages reconstructed correctly
- malformed frames rejected
- duplicates identified or safely passed downstream

#### Step 3: Gateway uplink validation

Goal:

- prove that the gateway can forward reconstructed messages into platform-standard ingress

Success signals:

- MQTT publish accepted, or
- HTTP adapter accepted during temporary software rehearsal

#### Step 4: Platform visibility validation

Goal:

- prove that accepted uplink messages are visible through the existing software chain

Success signals:

- schema acceptance passes
- ingest acceptance passes
- writer/path acceptance passes
- API summary or relevant data endpoints show the message effects

### 6.1 Recommended platform acceptance probes

The platform-side acceptance probe set SHOULD include at least:

1. schema probe
- did the emitted payload satisfy the expected contract

2. ingest probe
- was the payload accepted by ingest or the temporary HTTP adapter

3. Kafka/raw probe
- did the message appear in the expected write chain with correct `device_id`, `seq`, and metrics

4. API probe
- can the message effects be observed through summary/state/series endpoints

5. Desk/Web visibility probe
- can the relevant UI path observe the intended state after the platform accepts the payload

### 7. What should remain out of scope for software-first debugging

The following MUST NOT be treated as blocked by software-first debugging:

- final antenna model
- final enclosure thermal design
- final field power wiring
- final lightning protection design

These remain critical architecture items, but they should not block protocol and adapter rehearsal at the software boundary.

## Build-vs-Buy Tooling Evaluation

### Decision: Use mature tools for debugging and probing, not as an excuse to skip architecture boundaries

现成成熟软件可以帮助我们降低前期联调成本，但不能替代对节点、网关、平台边界的正式设计。

Recommended principle:

- debug tools may accelerate rehearsal
- production architecture still needs a bounded gateway adapter design

### Candidate A: Node-RED

Recommended use:

- early software-first rehearsal
- serial input inspection
- quick transformation validation
- MQTT/HTTP forwarding experiments

Strengths:

- 上手快，适合快速搭一个“串口 -> 解析 -> MQTT/HTTP”链路
- 适合做人工可视化调试和消息观察
- 对前期验证 framing、字段映射、协议小步试错很有帮助

Limitations:

- 不适合作为长期核心网关逻辑真相来源
- 复杂缓存/重放/审计/版本化协议管理不够稳
- 随着逻辑增大，流程图式编排会降低可维护性

Decision:

- Node-RED is recommended as a temporary rehearsal and debugging tool
- Node-RED is not recommended as the final authoritative gateway implementation for this project

### Candidate B: MQTT desktop/CLI client tools

Recommended use:

- topic inspection
- payload publish/subscribe probe
- acceptance verification

Examples:

- MQTT desktop clients
- MQTT CLI probe tools

Decision:

- these tools are useful as probes and manual verification instruments
- they are not gateway architecture components

### Candidate C: Industrial edge protocol software such as Neuron/NeuronEX class products

Recommended use:

- future evaluation if the southbound field protocols become standard industrial protocols
- scenarios with Modbus/OPC-UA/PLC-style integration

Limitations for the current project:

- current field side is a custom XL01 transparent link rather than a standard industrial fieldbus
- custom serial framing and lightweight field profile still need project-specific logic
- adopting a heavy industrial edge stack too early may add deployment and licensing complexity without solving the custom protocol core

Decision:

- not recommended as the primary solution for the current XL01 custom field-link stage
- may be revisited later if the gateway southbound protocols standardize

### Candidate D: Lightweight custom adapter with mature runtime libraries

Recommended use:

- long-term gateway-bound implementation
- bounded protocol adapter
- spool/cache/replay/health reporting

Preferred approach:

- implement the gateway adapter as a small, explicit service
- use mature language/runtime libraries for serial I/O, MQTT, HTTP, logging, and local persistence
- keep business logic bounded and testable

Decision:

- this is the recommended long-term direction

## Recommended Tool Stack by Phase

### Phase B: Software-first rehearsal

- Node-RED or equivalent rapid tool for quick serial/packet transformation rehearsal
- MQTT probe client for topic and payload verification
- lightweight payload generator or replay script for node simulation

### Phase C/D: Production-bound gateway hardening

- replace visual-flow prototypes with a bounded adapter service
- keep probe tools for verification only

## Summary Judgment

Use mature software where it shortens feedback loops:

- yes for debugging
- yes for probing
- yes for temporary rehearsal

Do not let mature off-the-shelf tools become accidental architecture truth when the core field protocol remains custom and project-specific.

## Current Phase Decision

For the current project schedule, the recommended choice is:

- adopt the software-first, lightweight debugging path now
- use mature tools to get the node-gateway-platform chain working
- defer any decision about a long-lived custom gateway adapter until and unless this field link must be retained after the current integration phase

Interpretation:

- the team does not need to commit now to building a production-grade custom gateway service
- the immediate objective is successful and well-evidenced integration rehearsal
- if the link is later proven valuable enough to keep, the team may then revisit whether a bounded custom adapter is justified

Recommended current stack:

- Node-RED for rapid serial/flow debugging
- MQTTX for MQTT probes and manual acceptance
- lightweight replay/scripts for node simulation
- existing platform ingest/API/Desk/Web for downstream proof

## Open Questions

- `field_node_id` 是否要写入节点 flash 并长期保留，还是完全交由网关发现/配置
- 现场网关一期上行采用 MQTT 还是 HTTP 适配更利于落地
- 关键站点是否需要双网关，还是单网关 + 冷备更合适
- 节点断链缓存与网关断链缓存分别要保留多久
- 哪些传感器在正常档位下常开，哪些必须策略化唤醒
