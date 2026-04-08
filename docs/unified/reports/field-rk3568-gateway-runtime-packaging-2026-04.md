---
title: field-rk3568-gateway-runtime-packaging-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-runtime-packaging-2026-04
---

# RK3568 网关运行包装基线（2026-04）

## 状态

- topic: `field-rk3568-gateway-runtime-packaging`
- state: `runtime-packaging-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. 这份文档解决什么问题

`services/field-gateway` 第一版骨架已经存在，并且通过了：

- `build`
- `lint`

但如果没有运行包装，它仍然只是“能启动的服务代码”，还不是“RK3568 上可长期常驻的网关进程”。

因此这份文档要冻结的是：

- systemd 服务名
- 环境文件位置
- 状态目录位置
- 安装脚本入口
- 现场维护时的最小运维命令

## 2. 它挂靠在哪条 authority 链上

这份文档直接挂靠：

- [field-rk3568-edge-runtime-network-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-edge-runtime-network-architecture-2026-04.md)
- [field-rk3568-gateway-implementation-tasklist-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04.md)

它不重新定义架构，只冻结第一版主网关进程的运行包装。

## 3. 第一版运行包装真值

当前第一版 `field-gateway` 的运行包装基线冻结为：

1. 服务名
- `lsmv2-field-gateway.service`

2. 运行用户
- 默认：`linaro`

3. 板端环境文件
- `/etc/lsmv2/field-gateway.env`

4. 板端状态目录
- `/var/lib/lsmv2/field-gateway`

5. 当前串口真值
- `/dev/ttyS3`
- `115200 8N1`

6. 代码入口
- `services/field-gateway/dist/index.js`

## 4. 当前仓库交付物

当前仓库已经补齐以下交付物：

1. 服务代码
- `services/field-gateway/src/index.ts`
- `services/field-gateway/src/config.ts`

2. 环境样例
- `services/field-gateway/.env.example`
- `services/field-gateway/deploy/field-gateway.env.rk3568.example`

3. 运行包装
- `services/field-gateway/deploy/field-gateway.service.template`
- `services/field-gateway/deploy/install-rk3568.sh`

4. 说明文档
- `services/field-gateway/README.md`
- `services/field-gateway/deploy/README.md`

## 5. systemd 原则

当前 unit 的原则固定为：

1. 开机自启动
2. 异常自动重启
3. 依赖 `network-online.target`
4. 对串口设备做存在性约束
5. 主程序只读代码目录
6. 可写范围只给状态目录

也就是说，当前不是“开个终端跑 node”，而是正式进入：

- `systemd managed gateway core`

## 6. 安装入口

当前标准安装入口冻结为：

```bash
sudo bash services/field-gateway/deploy/install-rk3568.sh \
  --mqtt-url mqtt://<broker-host>:1883
```

当前脚本行为原则：

1. 默认会：
- 安装/更新 systemd unit
- 创建状态目录
- 生成环境文件
- `enable --now` 启动服务

2. 默认不会：
- 覆盖已存在的现场环境文件

3. 若确需重写环境文件：
- 显式加 `--overwrite-env`

## 7. 最小运维命令

当前现场最小运维命令冻结为：

```bash
sudo systemctl status lsmv2-field-gateway --no-pager
sudo journalctl -u lsmv2-field-gateway -n 100 --no-pager
cat /var/lib/lsmv2/field-gateway/health/runtime-health.json
```

这三条分别负责：

- 看服务状态
- 看近期日志
- 看当前 health 真值

## 8. 当前仍未纳入这一步的内容

这一步仍然不负责：

1. 多节点 southbound 抽象
2. 最小下行命令翻译
3. Wi-Fi / AP 管理进程
4. 本地 UI
5. OpenClaw sidecar

## 9. 当前结论

当前 RK3568 第一版主网关已经不再只是：

- `可编译代码`

而是已经推进到：

- `可按 systemd 常驻的运行包装基线`

## 10. 2026-04-08 实机运行证据

本轮已经在真实 RK3568 板上完成第一份常驻证据：

1. 板端运行真值
- 主机：`rk3568-ubuntu`
- 服务：`lsmv2-field-gateway.service`
- 串口：`/dev/ttyS3`
- 波特率：`115200 8N1`
- MQTT：`mqtt://192.168.124.17:1883`

2. 实机运行结果
- `systemctl status` 显示服务处于 `active (running)`
- `runtime-health.json` 已确认：
  - `serial.open = true`
  - `mqtt.connected = true`
  - `parsedMessages > 0`
  - `publishedMessages > 0`
- `journalctl` 已确认连续发布 telemetry：
  - `seq=1092`
  - `seq=1093`
  - `seq=1094`
  - `seq=1095`

3. 现场串口流形态结论
- 当前 RK3568 实时抓样显示：
  - 串口数据以完整 JSON 起始
  - 每条 telemetry 以换行分隔
  - 12 秒样本内共抓到 `2` 条完整 JSON 行
- 更早的旧样本同时证明：
  - 启动瞬间也可能先接到上一条消息的尾段残片

4. 因此冻结的解析策略调整为
- 主路径使用：
  - `newline-delimited JSON framing`
- 启动残片处理使用：
  - 忽略不以 `{...}` 成形的行
- 不再默认“启动先丢到首个换行后再开始计数大括号”
- 这样才能同时覆盖：
  - 首条就是完整 JSON
  - 首条是上一报文尾段残片

5. 这一步意味着
- RK3568 第一版运行包装不仅已经存在
- 而且已经完成：
  - `实机串口接入`
  - `实机常驻运行`
  - `实机 MQTT 上行`
  - `实机 health 留证`

## 11. 2026-04-08 实机命令闭环证据

本轮在上述运行包装基线之上，又完成了第一份 RK3568 常驻命令闭环证据：

1. northbound 命令入口
- topic:
  - `cmd/00000000-0000-0000-0000-000000000001`
- command type:
  - `manual_collect`

2. 实机结果
- RK3568 日志已确认：
  - `field gateway command forwarded to serial`
  - `field gateway command ack published`
- 板端 health 已确认：
  - `commandsReceived = 1`
  - `commandsForwarded = 1`
  - `ackMessagesPublished = 1`
  - `commandRejects = 0`
  - `commandWriteFailures = 0`
  - `ackPublishFailures = 0`
- 本机 MQTT 实测已确认：
  - fresh runtime `manual_collect`
  - 收到同一 `command_id` 的 `cmd_ack/{device_id}`

3. 当前可冻结的闭环真值
- `cmd/{device_id} -> RK3568 -> /dev/ttyS3 -> XL01/RK2206 -> cmd_ack/{device_id}`

## 12. health 写盘稳定性修复

本轮还修掉了一个已暴露的稳定性问题：

- 历史故障：
  - `runtime-health.json` 偶发 `ENOENT rename`
- 根因判断：
  - 同进程近同时写 health 时，旧临时文件名只含 `pid + Date.now()`，存在同毫秒碰撞风险
- 当前修复：
  - health 临时文件名已加入 `randomUUID()`

修复后重新下发并观察的新窗口里，没有再出现新的 `ENOENT rename` 日志。

## 13. 2026-04-08 多节点 southbound 配置层实机固化

在前述单节点命令闭环已经跑通之后，本轮继续把 southbound 配置层真正固化到了 RK3568 常驻环境里。

1. 板端环境文件新增并显式冻结：
- `MQTT_TOPIC_COMMAND_PREFIX=cmd/`
- `MQTT_TOPIC_ACK_PREFIX=cmd_ack/`
- `SOUTHBOUND_NODES_JSON=[{"fieldNodeId":"A","deviceId":"00000000-0000-0000-0000-000000000001","installLabel":"FIELD-NODE-A","southboundPort":"/dev/ttyS3","enabled":true}]`

2. 板端 health 真值新增：
- `southbound.configuredNodes`
- `southbound.activeSerialDevice`
- `southbound.nodes[]`

3. 本轮实机结果已确认：
- `lsmv2-field-gateway.service` 带新配置重启成功
- `runtime-health.json` 已出现：
  - `configuredNodes = 1`
  - `fieldNodeId = A`
  - `deviceId = 00000000-0000-0000-0000-000000000001`
  - `southboundPort = /dev/ttyS3`
- 遥测继续正常上行
- 重新发布 fresh runtime `manual_collect` 后，命令闭环继续成立

4. 本轮新的命令闭环证据：
- `commandId = f8f46ff4-d514-4114-b2b4-8e8c2e5c4aee`
- MQTT 已收到同一 `command_id` 的：
  - `cmd_ack/00000000-0000-0000-0000-000000000001`
- 板端 health 已更新为：
  - `commandsReceived = 1`
  - `commandsForwarded = 1`
  - `ackMessagesPublished = 1`
- southbound 节点统计也已同步更新为：
  - `commandForwards = 1`
  - `ackPublishes = 1`

5. 这一步意味着：
- RK3568 现在不只是“有多节点配置代码”
- 而是已经把第一版 southbound 节点映射层：
  - 落进运行配置
  - 落进 health 可观测面
  - 并在实机上重新证明不会破坏既有 northbound 命令闭环

## 14. 2026-04-08 多端口 southbound 运行时已落地并完成单节点回归

在上一阶段只做到“节点映射进入配置和 health”之后，本轮继续把 southbound 运行时本身从：

- 单 `SerialPort`

抬升为：

- 按 `SOUTHBOUND_NODES_JSON` 自动打开多个 southbound 端口

1. 当前运行时能力新增：
- 当 `SOUTHBOUND_NODES_JSON` 中出现多个不同 `southboundPort` 时：
  - 网关会自动打开这些串口
  - telemetry / ack 会按来源端口校验节点归属
  - `cmd/{device_id}` 会按目标节点绑定端口下发
- health 新增端口级可观测面：
  - `serial.configuredPorts`
  - `serial.openPortCount`
  - `southbound.routeMode`
  - `southbound.configuredPorts`
  - `southbound.ports[]`

2. 当前选择的实现线已明确为：
- 网关核心先支持：
  - `single process, multi southbound ports`
- 后续部署层再决定是否拆成：
  - 单端口单实例
  - 或继续维持单实例多端口

3. 实机回归结果
- 在当前单节点现场配置下重新下发并重启：
  - `lsmv2-field-gateway.service`
- `runtime-health.json` 已确认：
  - `routeMode = configured-node-routing`
  - `configuredPorts = 1`
  - `ports[0].serialDevice = /dev/ttyS3`
  - `ports[0].mappedNodeCount = 1`
- telemetry 继续正常上行
- fresh runtime `manual_collect` 回归再次跑通：
  - `commandId = 19eef434-59ba-40df-9386-869d47421fed`
- 节点级与端口级统计同时更新：
  - `nodes[0].commandForwards = 1`
  - `nodes[0].ackPublishes = 1`
  - `ports[0].commandWrites = 1`
  - `ports[0].ackMessages = 1`

4. 这一步的意义
- 当前 RK3568 网关已经不是“只能跑单串口”
- 而是已经具备：
  - 面向 `3 x RK2206` 的多端口 southbound 运行时骨架
  - 且已在真实单节点环境完成兼容性回归

下一步不应再回头做单节点协议证明，而应直接进入：

- 第二、第三个 southbound 端口的实际接入
- 多节点并发输入下的运行事实采集
- 多端口部署策略是否拆实例的最后收口

下一步应继续按主线推进：

- 进入多节点 southbound 抽象
- 补最小下行命令转译
- 继续收口中心部署路径，减少对临时 host-run 进程的依赖

## 15. 2026-04-08 状态层最小门槛已实机进入运行态

在多端口 southbound 运行时落地之后，本轮继续把最小状态层补到了 RK3568 常驻主线里。

1. 新增状态层配置项：
- `NODE_DEGRADED_AFTER_MS`
- `NODE_OFFLINE_AFTER_MS`
- `PORT_DEGRADED_AFTER_MS`
- `PORT_OFFLINE_AFTER_MS`

2. 当前状态派生规则：
- 节点基于最近一次 telemetry 时间派生：
  - `configured`
  - `online`
  - `degraded`
  - `offline`
- 端口基于最近一次串口读入时间和端口打开状态派生：
  - `configured`
  - `online`
  - `degraded`
  - `offline`

3. 当前实机结果已确认：
- RK3568 重启后的 `runtime-health.json` 已出现：
  - `southbound.ports[0].status = online`
  - `southbound.nodes[0].status = online`
- telemetry 继续正常上行
- 当前状态层改动没有破坏多端口运行时，也没有破坏单节点主链

4. 这一步意味着：
- 网关现在不再只是“记录统计值”
- 而是已经具备最小运行状态判断能力
- 后面接第二、第三节点时，可以直接靠 health 观察：
  - 哪个节点掉线
  - 哪个端口半掉线
  - 是否是串口层而不是 northbound 主链的问题

## 16. 2026-04-08 多节点接线前的运维脚本入口已补齐

为了避免第二、第三节点接入时继续靠手工敲 SSH 命令，本轮补了三条 Windows 侧入口脚本：

1. 远端串口发现：
- `scripts/dev/show-rk3568-field-gateway-serial-map.ps1`
- 作用：
  - 通过 SSH 抓取 RK3568 的：
    - `/dev/serial/by-id`
    - `/dev/serial/by-path`
    - `/dev/ttyS*`
    - `/dev/ttyUSB*`
    - `/dev/ttyACM*`
  - 同时带出当前：
    - `/etc/lsmv2/field-gateway.env`
    - `runtime-health.json`

2. 远端 southbound 节点配置落板：
- `scripts/dev/set-rk3568-field-gateway-southbound-nodes.ps1`
- 作用：
  - 按 `fieldNodeId|deviceId|southboundPort|installLabel|enabled` 规格生成标准 `SOUTHBOUND_NODES_JSON`
  - 远端更新：
    - `MQTT_TOPIC_COMMAND_PREFIX=cmd/`
    - `MQTT_TOPIC_ACK_PREFIX=cmd_ack/`
    - `SOUTHBOUND_NODES_JSON=...`
  - 默认重启：
    - `lsmv2-field-gateway.service`

3. 远端多端口 health 验收：
- `scripts/dev/check-rk3568-field-gateway-multiport-health.ps1`
- 作用：
  - 校验：
    - `southbound.routeMode = configured-node-routing`
    - `configuredNodes`
    - `configuredPorts`
    - 每个期望节点是否进入运行态
    - 每个期望端口是否进入运行态

这意味着下一轮真实接第二、第三节点时，现场主线已经收敛成：

- 先跑串口发现脚本
- 再跑配置落板脚本
- 最后跑 health 验收脚本

这样可以减少临时手工操作，把 RK3568 多节点接入收口到一条更稳定的现场操作线。

## 17. 2026-04-08 当前 Windows 主机已复证密码式 SSH 入口可用

在本机未配置 RK3568 SSH 免密 key 的情况下，当前三条 Windows 侧脚本已经补上 `-Password` 支持。

1. 当前已复证可直接使用：
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\show-rk3568-field-gateway-serial-map.ps1 -Password linaro`

2. 本次实机发现结论：
- `show-rk3568-field-gateway-serial-map.ps1 -Password linaro` 已成功返回 JSON
- RK3568 当前可见候选串口只有：
  - `/dev/ttyS1`
  - `/dev/ttyS3`
  - `/dev/ttyS4`
  - `/dev/ttyS7`
  - `/dev/ttyS8`
  - `/dev/ttyS9`
- 当前没有发现：
  - `/dev/ttyUSB*`
  - `/dev/ttyACM*`
  - `/dev/serial/by-id`
  - `/dev/serial/by-path`
- 当前运行态仍然只有：
  - 节点 `A`
  - `southboundPort = /dev/ttyS3`
  - `configuredPorts = 1`

3. 因此下一步的硬前提已经明确：
- 第二、第三节点接入前，必须先让 RK3568 侧出现新的真实 southbound 设备
- 否则当前还不能进入多节点落板和 health 验收

## 18. 2026-04-08 现场拓扑修正为“单口多节点”

结合最新现场说明，当前真实硬件拓扑不是：

- `3 x RK2206 -> 3 个 southbound 串口 -> RK3568`

而是：

- `3 x RK2206 -> 1 个中心 XL01 -> RK3568 /dev/ttyS3`

这意味着当前主线应立即修正为：

1. RK3568 侧仍只持有一个 southbound 口：
- `/dev/ttyS3`

2. 真正需要扩展的是：
- 同一条中心串流里承载多个不同 `device_id`
- 而不是继续追第二、第三个 `/dev/ttyUSB*`

3. 当前多端口能力并不作废：
- 它保留为后续可选扩展能力
- 但当前现场主线应优先按：
  - `single southbound port`
  - `multiple field nodes over one center XL01 stream`
  继续推进

4. 这一步之后的验收重点应改成：
- 中心 XL01 转出的 `/dev/ttyS3` 串流里，是否能稳定看到多个不同 `device_id`
- `SOUTHBOUND_NODES_JSON` 是否可以把多个节点同时映射到同一个 `/dev/ttyS3`
- `field-gateway` 是否能继续按 `device_id` 正常上行、下行和 health 归档

## 19. 2026-04-08 RK3568 部署与运行态快照工具已补齐

在共享口双轨冻结之后，这一轮继续把 RK3568 主网关的生产侧入口收成了可重复执行的安装和体检链，而不是继续依赖现场临时 SSH 命令。

1. 当前新增或补强的仓库交付物：
- `services/field-gateway/deploy/check-rk3568-runtime.sh`
- `scripts/dev/check-rk3568-field-gateway-runtime.ps1`
- `scripts/dev/install-rk3568-field-gateway.ps1`
- `services/field-gateway/deploy/install-rk3568.sh`

2. 这一轮冻结的操作职责：
- `install-rk3568.sh`
  - 继续作为板端正式安装入口
  - 现在允许显式写入：
    - `MQTT_TOPIC_TELEMETRY_PREFIX`
    - `MQTT_TOPIC_COMMAND_PREFIX`
    - `MQTT_TOPIC_ACK_PREFIX`
- `install-rk3568-field-gateway.ps1`
  - 作为 Windows 主机侧一键远程安装或更新入口
  - 通过 SSH 把本地仓库中的安装脚本直接送到 RK3568 执行
- `check-rk3568-runtime.sh`
  - 作为板端当前运行态快照入口
  - 输出：
    - service active/enabled/show
    - env 文件内容
    - health 文件内容
    - journal tail
- `check-rk3568-field-gateway-runtime.ps1`
  - 作为 Windows 主机侧远程快照入口
  - 通过 SSH 把本地 `check-rk3568-runtime.sh` 内容直接送到 RK3568 执行
  - 不依赖远端仓库当前是否已经同步到最新脚本版本

3. 当前快照安全约束：
- `check-rk3568-runtime.sh` 读取 env 时已默认对包含以下关键字的键做脱敏：
  - `PASSWORD`
  - `SECRET`
  - `TOKEN`
- 因此当前 runtime 快照可以进：
  - authority 报告
  - 月记
  - 任务记忆
- 但不应把明文 MQTT 凭据重新写回仓库文档

4. 2026-04-08 最新权威快照事实
- 快照文件：
  - `.tmp/rk3568-field-gateway-runtime-latest.json`
- 快照时间：
  - `2026-04-08T14:47:37Z`
- 代码根目录：
  - `/home/linaro/landslide-monitoring-v2-mainline`
- 服务：
  - `lsmv2-field-gateway.service`
  - `active`
  - `enabled`
- 当前 env 真值：
  - `SERIAL_DEVICE=/dev/ttyS3`
  - `MQTT_URL=mqtt://192.168.124.17:1883`
  - `MQTT_TOPIC_COMMAND_PREFIX=cmd/`
  - `MQTT_TOPIC_ACK_PREFIX=cmd_ack/`
  - `MQTT_PASSWORD=***REDACTED***`
- 当前 southbound 真值：
  - `routeMode=configured-node-routing`
  - `configuredNodes=3`
  - `configuredPorts=1`
  - `/dev/ttyS3.status=online`
  - `node A.status=online`
  - `node B.status=online`
  - `node C.status=configured`
- 当前累计运行统计：
  - `commandsReceived=32`
  - `commandsForwarded=32`
  - `ackMessagesPublished=23`
  - `spoolPending=0`

5. 这一轮没有回避的风险事实
- 当前不能把 RK3568 共享口链路表述成“已经完全工业级稳定”
- 最新快照仍明确显示：
  - `schemaRejected=1013`
  - `lastError=Unexpected number in JSON at position 1`
- `journalTail` 里仍持续出现：
  - `field gateway json parse failed`
  - `field gateway schema invalid`
- 所以这批工具的意义是：
  - 把部署和运行态取证入口固定下来
  - 让下一轮可以直接面向：
    - parser / framing hardening
    - node C 接入准备
  - 而不是再回到“如何远程看板子当前状态”这种基础问题

## 20. 2026-04-08 共享流第一轮 parser hardening 已实机落板

在运行态入口收口之后，本轮没有回头继续争论架构，而是直接对 `services/field-gateway/src/index.ts` 做了最小共享流容错增强，并且把新代码真实部署到了 RK3568 上。

1. 当前这轮 parser hardening 的代码边界：
- 对明显不以 `{` 开头、且无法从中恢复出完整对象的中段碎片：
  - 不再强行 `JSON.parse`
  - 直接跳过
- 对已能 `JSON.parse`、但 telemetry schema 仍卡在对象型遗留字段的 payload：
  - 把 `metrics` 中非标量值迁移出 `metrics`
  - 当前已显式覆盖：
    - `legacy_valid_flags`
  - 归位到 `meta`
- gateway 对外发布的 telemetry payload 也改为：
  - 发布归一化后的 envelope JSON
  - 不再把原始坏形态直接带进 northbound

2. 同轮补齐的部署侧修正：
- `scripts/dev/install-rk3568-field-gateway.ps1`
  - 现在会把以下文件一并送到板端临时目录：
    - `install-rk3568.sh`
    - `check-rk3568-runtime.sh`
    - `field-gateway.service.template`
  - 不再出现模板缺失导致的：
    - `sed: ... field-gateway.service.template: No such file or directory`
- `install-rk3568-field-gateway.ps1`
  - 现在会先把远端多行输出收成单字符串再截取 JSON
  - 避免因为 stdout 多行而误报：
    - `Substring startIndex cannot be larger than length of string`
- `install-rk3568.sh`
  - 当前已修正为：
    - 服务已在运行时，安装完成后要显式 `restart`
    - 不再只做 `enable --now` 而把旧进程继续留在场上

3. 当前板端代码同步事实
- RK3568 上 `/home/linaro/landslide-monitoring-v2-mainline` 当前是代码目录
- 但不是 git 仓库
- 所以这一轮 parser hardening 的源码落板采用的是：
  - 受控一轮的文件级同步
  - 远端 `npm run build --workspace @lsmv2/field-gateway`
  - 再执行修正后的安装脚本重启服务
- 这也意味着：
  - “把当前本地代码包直接同步到 RK3568”的正式部署器
  - 仍是后续需要继续补齐的一层

4. 2026-04-08 实机重启后的新窗口证据
- 最新服务启动真值：
  - `MainPID = 1013180`
  - `ExecMainStartTimestamp = Wed 2026-04-08 23:04:34 CST`
- 重启后约 25 秒窗口内：
  - `parsedMessages = 20`
  - `publishedMessages = 21`
  - `schemaRejected = 0`
  - `lastError = null`
  - `node A = online`
  - `node B = online`
  - `node C = configured`
- 这说明第一轮 hardening 至少已经把：
  - 最显眼的启动窗口碎片噪声
  - `legacy_valid_flags` 类对象型 schema 拒绝
  在短窗口内明显压低

5. 同轮命令线回归事实
- node `B` 再次执行：
  - `manual_collect`
- fresh command 证据：
  - `commandId = 06a0d5c1-0430-4ec8-aaa7-4c59f0bea305`
  - `ackStatus = acked`
  - `conclusion = single-shot-proof-succeeded`
- 重启后最新 runtime-health 也已确认：
  - `commandsReceived = 1`
  - `commandsForwarded = 1`
  - `ackMessagesPublished = 1`
  - `node B.commandForwards = 1`
  - `node B.ackPublishes = 1`

6. 当前不能夸大的结论
- 这轮不是宣布共享流已经干净
- 在更长一点的同一进程窗口里，最新 health 仍然回升到了：
  - `schemaRejected = 2`
  - `lastError = Expected ',' or '}' after property value in JSON at position 572`
- 而日志里仍能看到：
  - ACK / telemetry 交织残片
  - 被撕裂的 telemetry 片段
- 所以当前正式结论应保持克制：
  - 第一轮 hardening 已经把共享流噪声从“起步就大量报错”压到“短窗口可清零、长一点窗口仍有少量残余”
  - 并且没有打断 node `B` 的命令闭环
  - 下一步仍需继续做更强的 shared-stream parser/framing hardening

## 21. 2026-04-08 RK3568 正式源码同步部署线已落板并回归通过

在上一轮确认 RK3568 上 `/home/linaro/landslide-monitoring-v2-mainline` 不是 git 仓库之后，本轮把“本地源码送板、远端重建、再安装重启”这条线正式补进了现有安装入口，而不再依赖临时一次性脚本。

1. 当前新增并冻结的部署真值：
- `scripts/dev/install-rk3568-field-gateway.ps1`
  - 默认先执行受控源码同步
  - 再远端执行：
    - `services/field-gateway/deploy/install-rk3568.sh`
- 同步边界不是整仓库复制
  - 而是当前 `field-gateway` 运行所需最小集合：
    - 根目录 `package.json`
    - 根目录 `package-lock.json`
    - 根目录 `tsconfig.base.json`
    - `services/field-gateway` 的：
      - `src/`
      - `deploy/`
      - `package.json`
      - `tsconfig.json`
      - `.env.example`
      - `README.md`
    - `libs/observability`
    - `libs/validation`
    - `docs/integrations/mqtt/schemas`

2. 这一轮同时修掉的部署缺口：
- 第一次把正式同步线跑到真实 RK3568 上时，暴露出：
  - 远端旧 `dist` 已被清理
  - 但只重建了 `@lsmv2/field-gateway`
  - 没有重建：
    - `@lsmv2/observability`
    - `@lsmv2/validation`
- 现场真实报错为：
  - `Cannot find module '/home/linaro/landslide-monitoring-v2-mainline/node_modules/@lsmv2/observability/dist/index.js'`
- 当前修复后，`install-rk3568.sh` 现已固定为：
  - 先清理：
    - `services/field-gateway/dist`
    - `libs/observability/dist`
    - `libs/validation/dist`
  - 再按顺序重建：
    - `@lsmv2/observability`
    - `@lsmv2/validation`
    - `@lsmv2/field-gateway`

3. 当前安装入口的稳定性补强：
- `install-rk3568-field-gateway.ps1`
  - 现在会在安装后等待：
    - `lsmv2-field-gateway.service`
    进入 `active`
  - 若最终未进入 `active`
    - 直接报错
    - 不再把“看起来有 JSON 输出”的失败安装当成功

4. 2026-04-08 最新实机回归证据：
- 最新复查快照：
  - `.tmp/rk3568-field-gateway-runtime-after-sync.json`
- 快照时间：
  - `2026-04-08T15:39:52Z`
- 当前服务真值：
  - `isActive = active`
  - `isEnabled = enabled`
  - `MainPID = 1055431`
  - `ExecMainStartTimestamp = Wed 2026-04-08 23:39:34 CST`
- 当前运行 health 真值：
  - `emitted_ts = 2026-04-08T15:39:53.285Z`
  - `serial.open = true`
  - `mqtt.connected = true`
  - `routeMode = configured-node-routing`
  - `node A = online`
  - `node B = online`
  - `node C = configured`
  - `parsedMessages = 5`
  - `publishedMessages = 5`
  - `schemaRejected = 1`
- 同轮 node `B` 命令回归也继续成立：
  - `action = manual_collect`
  - `commandId = a13b9273-fa8c-4a6e-a491-2c94702fde8c`
  - `ackStatus = acked`
  - `conclusion = single-shot-proof-succeeded`

5. 当前应冻结的正式结论：
- RK3568 的 Windows 侧安装入口现在已经不只是：
  - “送一个 installer 到板子上执行”
- 而是已经提升为：
  - “定向同步运行所需源码 -> 远端清理/重建工作区 -> 安装并等待服务回到 active”
- 这条线已经在真实 RK3568 上完成了一次：
  - 失败暴露
  - 缺口修复
  - 再部署成功
  的完整闭环
- 当前仍不能夸大的点保持不变：
  - 共享 `/dev/ttyS3` 解析噪声还在
  - 这轮补的是正式部署线
  - 不是宣布 shared-stream hardening 已完成
