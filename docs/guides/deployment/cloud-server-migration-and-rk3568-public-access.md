---
title: cloud-server-migration-and-rk3568-public-access
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/deployment/cloud-server-migration-and-rk3568-public-access
---

# 云服务器迁移与 RK3568 公网访问结论

## 适用场景

当后续更换云服务器、重装服务器、切换云厂商，或希望确认 RK3568 是否可以直接公网 SSH 时，优先读本页。

当前结论：

- 系统可以换服务器，不需要重做架构。
- 需要同步迁移云端服务、RK3568 配置、桌面端云端直连包和运维文档。
- RK3568 当前不能被公网直接访问，应继续使用反向 SSH 隧道。
- 后续最稳妥的产品化方向是把服务器 IP 抽象成域名。

## 当前稳定拓扑

当前云服务器：

- 公网 IP：`134.175.187.208`
- API：`http://134.175.187.208:8080`
- MQTT：`mqtt://134.175.187.208:1883`
- EMQX Dashboard：`http://134.175.187.208:18083`

RK3568 4G链路：

- 4G 模块：EC200A-CN
- APN：`cmnet`
- 蜂窝 PDP 地址：`10.217.14.146`
- RK3568 侧网卡：`usb0=192.168.43.100/24`
- 4G 网关：`192.168.43.1`
- 云服务器主机路由：`134.175.187.208/32 -> usb0`
- DNS：`223.5.5.5,119.29.29.29`

云服务器本机回环反向隧道：

- `127.0.0.1:22079` -> RK3568 SSH `127.0.0.1:22`
- `127.0.0.1:28081` -> RK3568 field-link-monitor `127.0.0.1:18081`
- `127.0.0.1:28082` -> RK3568 Hermes supervisor `127.0.0.1:18082`
- `127.0.0.1:28087` -> RK3568 alarm actuator `127.0.0.1:18087`

云服务器 Docker 网桥访问：

- 服务：`lsmv2-docker-loopback-bridge.service`
- 复现脚本：[install-cloud-rk3568-loopback-bridge.sh](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/scripts/deploy/install-cloud-rk3568-loopback-bridge.sh)
- 状态文件：`/var/lib/lsmv2/docker-loopback-bridge/status.json`
- `172.18.0.1:28081` -> 云服务器 `127.0.0.1:28081` -> RK3568 field-link-monitor
- `172.18.0.1:28082` -> 云服务器 `127.0.0.1:28082` -> RK3568 Hermes supervisor
- `172.18.0.1:28087` -> 云服务器 `127.0.0.1:28087` -> RK3568 alarm actuator
- 作用：只让云端 Docker 容器访问云服务器回环反向隧道，不把 RK3568 侧车端口暴露到公网。

安全边界：

- 反向隧道端口只监听云服务器 `127.0.0.1`。
- Docker 网桥桥接端口只监听云服务器 Docker bridge 地址 `172.18.0.1`。
- 不要把 `22079/28081/28082/28087` 绑定到 `0.0.0.0`。
- 桌面端只访问云端 API，不直接访问数据库、ClickHouse、Kafka、RK3568 串口或 RK3568 私有端口。

## RK3568 能不能直接公网访问

当前不能。

原因：

- EC200A 当前拿到的蜂窝 PDP 地址是 `10.217.14.146`，属于运营商内网地址。
- RK3568 看到的 `usb0=192.168.43.100` 是 EC200A 模块内部 NAT 后的局域网地址。
- 公网无法主动连入这些地址，因此不能直接从公网 SSH 到 RK3568。

如果一定要直接公网访问，需要运营商或物联网卡服务商提供：

- 公网 APN
- 固定公网 IP
- VPDN/APN 专线
- 运营商 VPN 专网

即使拿到公网 IP，也不建议直接暴露 SSH。推荐继续使用反向隧道或 VPN，原因是安全性和可控性更好。

## 换服务器时必须迁移的内容

### 1. 新云服务器

要做：

- 安装 Docker 和 Docker Compose。
- 拉取或上传当前仓库。
- 准备生产环境变量文件：[infra/compose/.env](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/infra/compose/.env)。
- 确认强密码和密钥：
  - `PG_PASSWORD`
  - `CH_PASSWORD`
  - `REDIS_PASSWORD`
  - `EMQX_DASHBOARD_PASSWORD`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
- 恢复 PostgreSQL 和 ClickHouse 数据卷或备份。
- 启动云端服务。
- 确认安全组或防火墙放行：
  - `8080` API
  - `1883` MQTT
  - `18083` EMQX Dashboard，仅调试需要
  - `22` SSH，仅管理需要

基础验证：

```bash
curl http://127.0.0.1:8080/health
curl http://新服务器IP:8080/health
ss -lnt | grep -E ':(8080|1883|18083)\b'
```

云端 API 需要读取 RK3568 实时状态和报警执行器时，还要配置：

```text
RK3568_ALARM_ACTUATOR_URL=http://172.18.0.1:28087
RK3568_FIELD_LINK_MONITOR_URL=http://172.18.0.1:28081/v1/summary
RK3568_HERMES_EDGE_SUPERVISOR_URL=http://172.18.0.1:28082/v1/supervision
RK3568_STATUS_HTTP_TIMEOUT_MS=6000
```

说明：

- 这三个地址是云端 Docker 容器访问宿主机反向隧道的地址，不是公网地址。
- `RK3568_STATUS_HTTP_TIMEOUT_MS` 不能太小；4G 反向隧道偶发延迟会超过 2500ms，当前默认使用 `6000ms`。

### 2. MQTT 和 EMQX 凭证

要做：

- 新服务器上的 MQTT 用户、密码、ACL 要与云端 API 和 RK3568 一致。
- RK3568 `field-gateway` 使用的 MQTT 凭证要同步更新。
- 不要在文档或聊天中明文打印生产密码。

验证：

- RK3568 日志应出现 `field gateway mqtt connected`。
- 云端应能收到 RK3568 上行遥测或命令订阅状态。

### 3. RK3568 配置

需要更新这些文件：

- `/etc/lsmv2/rk3568-cellular-cloud.env`
- `/etc/lsmv2/field-gateway.env`
- `/etc/lsmv2/rk3568-reverse-tunnel.env`

重点字段：

- 云服务器 IP 或域名
- `MQTT_URL=mqtt://新服务器:1883`
- MQTT 用户名和密码
- 反向隧道远端主机
- 反向隧道远端用户 `rk3568-tunnel`

更新后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart lsmv2-rk3568-cellular-cloud-route.service
sudo systemctl restart lsmv2-rk3568-reverse-tunnel.service
sudo systemctl restart lsmv2-field-gateway.service
sudo systemctl status lsmv2-rk3568-cellular-cloud-route.timer --no-pager
sudo systemctl status lsmv2-rk3568-reverse-tunnel.service --no-pager
sudo systemctl status lsmv2-field-gateway.service --no-pager
```

验证：

```bash
ip route get 新服务器IP
curl http://新服务器IP:8080/health
journalctl -u lsmv2-field-gateway.service -n 80 --no-pager
```

### 4. 新服务器反向隧道用户

新服务器需要创建低权限用户：

```bash
sudo useradd -m -s /usr/sbin/nologin rk3568-tunnel
sudo mkdir -p /home/rk3568-tunnel/.ssh
sudo chmod 700 /home/rk3568-tunnel/.ssh
sudo touch /home/rk3568-tunnel/.ssh/authorized_keys
sudo chmod 600 /home/rk3568-tunnel/.ssh/authorized_keys
sudo chown -R rk3568-tunnel:rk3568-tunnel /home/rk3568-tunnel/.ssh
```

然后把 RK3568 的反向隧道公钥加入：

```bash
/home/rk3568-tunnel/.ssh/authorized_keys
```

注意：

- 当前 RK3568 私钥路径是 `/home/linaro/.ssh/lsmv2_rk3568_reverse_ed25519`。
- 不要复制私钥到聊天或文档。
- 公钥可以放到新服务器 `authorized_keys`。

云服务器验证：

```bash
ss -lnt | grep -E '127.0.0.1:(22079|28081|28082|28087)'
curl http://127.0.0.1:28081/v1/summary
curl http://127.0.0.1:28082/v1/supervision
curl http://127.0.0.1:28087/status
```

如果云端 API 容器需要访问这些状态口，还要启用 Docker 网桥桥接：

```bash
sudo bash scripts/deploy/install-cloud-rk3568-loopback-bridge.sh
systemctl status lsmv2-docker-loopback-bridge.service --no-pager
ss -lnt | grep -E '172.18.0.1:(28081|28082|28087)'
curl http://172.18.0.1:28081/v1/summary
curl http://172.18.0.1:28082/v1/supervision
curl http://172.18.0.1:28087/status
```

该脚本默认只绑定 `172.18.0.1`，并会拒绝 `0.0.0.0` 或 `::` 这类公网通配地址，避免误把 RK3568 SSH/侧车端口暴露到公网。

### 5. Windows 桌面端云端直连包

旧的云端包如果仍然写着旧服务器，就会继续连旧服务器。换服务器后需要重新生成：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-desk-win-cloud-delivery.ps1 `
  -CloudApiBaseUrl "http://新服务器IP:8080" `
  -CloudMqttUrl "mqtt://新服务器IP:1883"
```

生成产物：

- [artifacts/desk-win/latest-cloud/](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/artifacts/desk-win/latest-cloud/)
- [artifacts/desk-win/latest-cloud.zip](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/artifacts/desk-win/latest-cloud.zip)

临时调试可以用环境变量覆盖：

```powershell
$env:DESK_API_BASE_URL="http://新服务器IP:8080"
```

但正式交付不要依赖临时环境变量，应重新打包。

### 6. 文档和记录

需要同步更新：

- [docs/guides/deployment/desktop-cloud-package.md](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/guides/deployment/desktop-cloud-package.md)
- [docs/guides/deployment/rk3568-ec200a-4g-reverse-ssh.md](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/guides/deployment/rk3568-ec200a-4g-reverse-ssh.md)
- [docs/journal/2026-05.md](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/journal/2026-05.md)
- `memory/` 下对应长期记忆

## 不需要改的内容

正常换服务器时，不需要改：

- RK2206 固件
- XLS1/XL01 无线链路协议
- COBS + CRC v1 帧协议
- RS485 传感器字段
- 桌面端页面业务逻辑
- 模型结构
- 数据库 schema，除非迁移时顺便升级版本

如果同时更换设备编号、节点编号或数据库结构，才需要重新检查这些层。

## 推荐升级：用域名代替裸 IP

短期可以继续使用 IP。但从产品化和减少返工角度，建议引入域名：

- API：`http://api.example.com:8080` 或 HTTPS `https://api.example.com`
- MQTT：`mqtt://mqtt.example.com:1883`
- 运维入口：只限管理端访问，不公开暴露

好处：

- 后续换服务器时，桌面端云包可以少改甚至不改。
- 文档、截图、材料更像产品。
- 服务器 IP 变化只需要改 DNS。

注意：

- 当前 RK3568 路由守护是按云服务器主机路由工作的，若从 IP 切到域名，需要让脚本支持域名解析后再写入主机路由，或者换服务器时仍同步更新解析后的目标 IP。
- 如果使用 HTTPS，还需要证书和反向代理。

## 快速迁移验收清单

完成迁移后，按顺序验收：

- 新服务器 `/health` 返回 OK。
- 新服务器 `1883` MQTT 可连。
- RK3568 `ip route get 新服务器IP` 走 `usb0`。
- RK3568 `field-gateway` 日志显示 MQTT connected。
- 新服务器 `127.0.0.1:22079/28081/28082/28087` 都监听。
- 新服务器能 `curl` 到 `28081/28082/28087`。
- 新服务器 `lsmv2-docker-loopback-bridge.service` 为 `active/enabled`。
- 新服务器 Docker 网桥 `172.18.0.1:28081/28082/28087` 可访问 RK3568 侧车。
- 云端 API `/api/v1/system/status` 返回 `fieldEdge.available=true` 和 `hermesEdge.available=true`。
- 云端 API `/api/v1/field-alarm/status` 返回 `actuator.available=true` 且 `dryRun=false`。
- Windows 桌面端云包启动后实际 API 指向新服务器。
- 桌面端能登录、查看设备、查看系统监控、下发报警命令。
- 旧服务器停掉后，桌面端和 RK3568 仍能正常工作。
