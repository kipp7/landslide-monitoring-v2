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

下一步应继续按主线推进：

- 进入多节点 southbound 抽象
- 补最小下行命令转译
- 继续收口中心部署路径，减少对临时 host-run 进程的依赖
