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

## 环境变量

参考：`services/field-gateway/.env.example`

- `SERVICE_NAME`：默认 `field-gateway`
- `SERIAL_DEVICE`：当前 RK3568 实机基线为 `/dev/ttyS3`
- `SERIAL_BAUD_RATE`：当前基线为 `115200`
- `MQTT_URL`：例如 `mqtt://127.0.0.1:1883`
- `MQTT_USERNAME` / `MQTT_PASSWORD`：可选，但必须成对设置
- `MQTT_TOPIC_TELEMETRY_PREFIX`：默认 `telemetry/`
- `SPOOL_ROOT_DIR`：本地缓存根目录
- `HEALTH_FILE_PATH`：health 文件输出路径
- `MQTT_PUBLISH_TIMEOUT_MS`：单次 MQTT 发布超时
- `REPLAY_INTERVAL_MS`：pending spool 重放周期
- `HEALTH_EMIT_INTERVAL_MS`：health 文件刷新周期
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

## 当前行为

- 串口收到分片文本后，按 JSON 花括号边界做重组
- 仅接受符合 `telemetry-envelope.v1.schema.json` 的标准消息
- 合法消息先写入 pending spool，再尝试 MQTT 发布
- 发布成功后转入 published spool
- 发布失败时保留在 pending，并记录失败信息以待重放
- 运行期持续输出 health 文件，供本地控制面或 sidecar 读取

## 当前非目标

这一版明确还不负责：

- 多节点并发接入
- 平台下行命令翻译
- Wi-Fi / 热点管理
- 本地 UI
- OpenClaw sidecar

这些能力后续分层接入，不能污染当前主链骨架。
