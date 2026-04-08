---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/services/field-gateway/readme
---

# field-gateway（RK3568 v1 主网关骨架）

本服务是 RK3568 一期主链骨架，对应当前冻结的第一版目标：

- `/dev/ttyS3`
- `115200 8N1`
- JSON 边界重组
- 本地 spool/cache
- MQTT 上行
- health 文件输出

它是长期 `gateway core` 的起点，不是临时串口小脚本。

挂靠文档：

- `docs/unified/reports/field-rk3568-edge-runtime-network-architecture-2026-04.md`
- `docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04.md`
- `docs/unified/reports/field-rk3568-software-interface-alignment-2026-04.md`

## 环境变量

参考：`services/field-gateway/.env.example`

- `SERVICE_NAME`：默认 `field-gateway`
- `SERIAL_DEVICE`：当前 RK3568 实机基线为 `/dev/ttyS3`
- `SERIAL_BAUD_RATE`：当前基线为 `115200`
- `MQTT_URL`：例如 `mqtt://127.0.0.1:1883`
- `MQTT_USERNAME` / `MQTT_PASSWORD`：可选，但必须成对设置
- `MQTT_TOPIC_TELEMETRY_PREFIX`：默认 `telemetry/`
- `MQTT_TOPIC_COMMAND_PREFIX`：默认 `cmd/`
- `MQTT_TOPIC_ACK_PREFIX`：默认 `cmd_ack/`
- `SOUTHBOUND_NODES_JSON`：可选；用于冻结 `field_node_id -> device_id -> southbound_port` 映射
  - 若配置里出现多个不同 `southboundPort`，运行时会自动打开这些端口
- `SPOOL_ROOT_DIR`：本地缓存根目录
- `HEALTH_FILE_PATH`：health 文件输出路径
- `MQTT_PUBLISH_TIMEOUT_MS`：单次 MQTT 发布超时
- `REPLAY_INTERVAL_MS`：pending spool 重放周期
- `HEALTH_EMIT_INTERVAL_MS`：health 文件刷新周期
- `NODE_DEGRADED_AFTER_MS`：节点超过该时长未见 telemetry 时进入 `degraded`
- `NODE_OFFLINE_AFTER_MS`：节点超过该时长未见 telemetry 时进入 `offline`
- `PORT_DEGRADED_AFTER_MS`：端口超过该时长未见串口读入时进入 `degraded`
- `PORT_OFFLINE_AFTER_MS`：端口超过该时长未见串口读入时进入 `offline`
- `MAX_MESSAGE_BYTES`：单条串口重组消息最大字节数
- `MAX_PENDING_RECORDS`：pending spool 上限
- `SPOOL_RETENTION_PUBLISHED`：published 留存数
- `SPOOL_RETENTION_REJECTED`：rejected 留存数

## 本地运行

1. 在仓库根目录安装依赖：

- `npm install`

2. 构建服务：

- `npm run build --workspace @lsmv2/field-gateway`

3. 进入服务目录并准备环境：

- `cd services/field-gateway`
- 复制 `.env.example` 为 `.env`

4. 启动：

- `node dist/index.js`

## RK3568 常驻部署

第一版常驻部署件已经补到：

- `services/field-gateway/deploy/field-gateway.service.template`
- `services/field-gateway/deploy/field-gateway.env.rk3568.example`
- `services/field-gateway/deploy/install-rk3568.sh`

在 RK3568 仓库根目录执行：

```bash
sudo bash services/field-gateway/deploy/install-rk3568.sh \
  --mqtt-url mqtt://<broker-host>:1883
```

注意：

- 安装脚本默认保留已有 `/etc/lsmv2/field-gateway.env`
- 只有显式加 `--overwrite-env` 才会重写现场配置

默认安装结果：

- systemd 服务：
  - `lsmv2-field-gateway.service`
- 环境文件：
  - `/etc/lsmv2/field-gateway.env`
- 状态目录：
  - `/var/lib/lsmv2/field-gateway`

常用检查命令：

```bash
sudo systemctl status lsmv2-field-gateway --no-pager
sudo journalctl -u lsmv2-field-gateway -n 100 --no-pager
cat /var/lib/lsmv2/field-gateway/health/runtime-health.json
```

Windows 侧给 RK3568 做多节点接入时，当前推荐直接用这三条脚本：

- 发现远端串口映射：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\show-rk3568-field-gateway-serial-map.ps1`
  - 当前若主机尚未配置 SSH 免密，可追加：
    - `-Password linaro`
- 一次性写入 `SOUTHBOUND_NODES_JSON` 并重启服务：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\set-rk3568-field-gateway-southbound-nodes.ps1 -NodeSpec 'A|00000000-0000-0000-0000-000000000001|/dev/ttyS3|FIELD-NODE-A|true' -NodeSpec 'B|00000000-0000-0000-0000-000000000002|/dev/ttyUSB0|FIELD-NODE-B|true' -NodeSpec 'C|00000000-0000-0000-0000-000000000003|/dev/ttyUSB1|FIELD-NODE-C|true'`
  - 当前若主机尚未配置 SSH 免密，可追加：
    - `-Password linaro`
- 远端 health 验收：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-multiport-health.ps1 -NodeSpec 'A|00000000-0000-0000-0000-000000000001|/dev/ttyS3' -NodeSpec 'B|00000000-0000-0000-0000-000000000002|/dev/ttyUSB0' -NodeSpec 'C|00000000-0000-0000-0000-000000000003|/dev/ttyUSB1'`
  - 当前若主机尚未配置 SSH 免密，可追加：
    - `-Password linaro`

## 当前行为

- 串口收到分片文本后，按换行分隔恢复完整 JSON 行，并忽略启动阶段不成形的残片行
- 仅接受符合 `telemetry-envelope.v1.schema.json` 的标准消息
- 合法消息先写入 pending spool，再尝试 MQTT 发布
- 发布成功后转入 published spool
- 发布失败时保留在 pending，并记录失败信息以待重放
- 运行期持续输出 health 文件，供本地控制面或 sidecar 读取
- northbound 遥测接口保持与软件端一致：
  - topic:
    - `telemetry/{device_id}`
  - payload:
    - `TelemetryEnvelope v1`
- southbound 节点配置现在支持显式冻结：
  - `fieldNodeId`
  - `deviceId`
  - `installLabel`
  - `southboundPort`
  - `enabled`
- 当 `SOUTHBOUND_NODES_JSON` 中出现多个 `southboundPort` 时：
  - 网关会自动持有多个 southbound 串口
  - telemetry / ack 会按来源端口校验节点归属
  - `cmd/{device_id}` 会按目标节点路由到对应端口
- health 当前已经补到两层：
  - `southbound.ports[]`
  - `southbound.nodes[]`
- 当前状态层已补最小运行状态：
  - 节点：
    - `configured`
    - `online`
    - `degraded`
    - `offline`
  - 端口：
    - `configured`
    - `online`
    - `degraded`
    - `offline`
- 当前已补最小命令闭环骨架：
  - 订阅 `cmd/{device_id}`
  - 校验 `device-command.v1`
  - 原样写入 southbound 串口
  - 识别串口返回的 `device-command-ack.v1`
  - 回灌 `cmd_ack/{device_id}`

`SOUTHBOUND_NODES_JSON` 示例：

```json
[
  {
    "fieldNodeId": "A",
    "deviceId": "00000000-0000-0000-0000-000000000001",
    "installLabel": "FIELD-NODE-A",
    "southboundPort": "/dev/ttyS3",
    "enabled": true
  }
]
```

多端口示例：

```json
[
  {
    "fieldNodeId": "A",
    "deviceId": "00000000-0000-0000-0000-000000000001",
    "installLabel": "FIELD-NODE-A",
    "southboundPort": "/dev/ttyS3",
    "enabled": true
  },
  {
    "fieldNodeId": "B",
    "deviceId": "00000000-0000-0000-0000-000000000002",
    "installLabel": "FIELD-NODE-B",
    "southboundPort": "/dev/ttyUSB0",
    "enabled": true
  },
  {
    "fieldNodeId": "C",
    "deviceId": "00000000-0000-0000-0000-000000000003",
    "installLabel": "FIELD-NODE-C",
    "southboundPort": "/dev/ttyUSB1",
    "enabled": true
  }
]
```

## 当前非目标

这一版仍然还不负责：

- 多节点自动重连编排
- 多实例部署编排
- 超过 `manual_collect` / `set_config` 最小闭环之外的复杂命令编排
- Wi-Fi / 热点管理
- 本地 UI
- OpenClaw sidecar

这些能力后续分层接入，不能污染当前主链骨架。
