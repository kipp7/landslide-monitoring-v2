---
title: rk3568-ec200a-4g-reverse-ssh
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/deployment/rk3568-ec200a-4g-reverse-ssh
---

# RK3568 EC200A-CN 4G 云端链路与反向 SSH

## 当前结论

RK3568 已将 EC200A-CN 作为正式云端链路使用：

- 4G 网卡：`usb0`
- 4G 网关：`192.168.43.1`
- RK3568 侧地址：`192.168.43.100`
- 云服务器：`134.175.187.208`
- 蜂窝 APN：`cmnet`
- DNS：`223.5.5.5,119.29.29.29`
- 云端业务路由：`134.175.187.208/32 -> usb0`
- 默认外网路由：优先 `usb0`，网线 `eth0` 作为本地管理和兜底

因为 EC200A 蜂窝地址是运营商内网地址，不能直接从公网打进 RK3568，所以远程 SSH 采用“RK3568 主动连云服务器”的反向隧道。

如果后续更换云服务器，先读：[cloud-server-migration-and-rk3568-public-access.md](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/guides/deployment/cloud-server-migration-and-rk3568-public-access.md)。那份文档记录了需要同步修改的云端、RK3568、桌面端和文档入口，避免只改一半导致旧服和新服混连。

## 常驻服务

RK3568 上新增两个 systemd 服务：

- `lsmv2-rk3568-cellular-cloud-route.service`
- `lsmv2-rk3568-cellular-cloud-route.timer`
- `lsmv2-rk3568-reverse-tunnel.service`

用途：

- `cellular-cloud-route`：每 60 秒确认并修复 4G 优先路由、云服务器主机路由和 DNS。
- `reverse-tunnel`：通过 4G 主动连云服务器，把 RK3568 调试入口映射到云服务器本机回环端口。

## 云服务器回环端口

这些端口只监听在云服务器 `127.0.0.1`，默认不直接暴露公网：

- `127.0.0.1:22079` -> RK3568 SSH `127.0.0.1:22`
- `127.0.0.1:28081` -> RK3568 field-link-monitor `127.0.0.1:18081`
- `127.0.0.1:28082` -> RK3568 Hermes supervisor `127.0.0.1:18082`
- `127.0.0.1:28087` -> RK3568 alarm actuator `127.0.0.1:18087`

云端 Docker 容器不能直接访问宿主机 `127.0.0.1`，因此服务器还启用了一个只监听 Docker bridge 的本机桥接服务：

- 服务：`lsmv2-docker-loopback-bridge.service`
- 复现脚本：[install-cloud-rk3568-loopback-bridge.sh](/E:/学校/02%20项目/99%20山体滑坡优化完善/landslide-monitoring-v2-mainline/scripts/deploy/install-cloud-rk3568-loopback-bridge.sh)
- `172.18.0.1:28081` -> 云服务器 `127.0.0.1:28081`
- `172.18.0.1:28082` -> 云服务器 `127.0.0.1:28082`
- `172.18.0.1:28087` -> 云服务器 `127.0.0.1:28087`

该桥接只给云端容器使用，不对公网开放。

## 从本机 SSH 到 RK3568

推荐方式：

```powershell
ssh -i "key\1.pem" -o HostKeyAlias=rk3568-4g -J ubuntu@134.175.187.208 -p 22079 linaro@127.0.0.1
```

也可以先登录云服务器，再从云服务器进入 RK3568：

```bash
ssh -i "key/1.pem" ubuntu@134.175.187.208
ssh -p 22079 linaro@127.0.0.1
```

## 调试 RK3568 侧车

在云服务器上直接访问：

```bash
curl http://127.0.0.1:28081/v1/summary
curl http://127.0.0.1:28082/v1/supervision
curl http://127.0.0.1:28087/status
```

如果要从 Windows 浏览器临时查看，可以先把云服务器回环端口转发回本机：

```powershell
ssh -i "key\1.pem" -L 28081:127.0.0.1:28081 -L 28082:127.0.0.1:28082 -L 28087:127.0.0.1:28087 ubuntu@134.175.187.208
```

然后访问：

- `http://127.0.0.1:28081/v1/summary`
- `http://127.0.0.1:28082/v1/supervision`
- `http://127.0.0.1:28087/status`

## RK3568 侧检查命令

```bash
systemctl status lsmv2-rk3568-cellular-cloud-route.service --no-pager
systemctl status lsmv2-rk3568-cellular-cloud-route.timer --no-pager
systemctl status lsmv2-rk3568-reverse-tunnel.service --no-pager
cat /var/lib/lsmv2/cellular-cloud/status.json
ip route get 134.175.187.208
ip route
```

预期：

- `134.175.187.208` 走 `usb0`
- 默认路由优先 `usb0`
- `192.168.124.0/24` 局域网管理仍走 `eth0`
- `lsmv2-rk3568-reverse-tunnel.service` 为 `active`

## 云服务器侧检查命令

```bash
ss -lnt | grep -E '127.0.0.1:(22079|28081|28082|28087)'
curl http://127.0.0.1:28081/v1/summary
curl http://127.0.0.1:28082/v1/supervision
curl http://127.0.0.1:28087/status
```

云端 Docker bridge 检查：

```bash
sudo bash scripts/deploy/install-cloud-rk3568-loopback-bridge.sh
systemctl status lsmv2-docker-loopback-bridge.service --no-pager
ss -lnt | grep -E '172.18.0.1:(28081|28082|28087)'
curl http://172.18.0.1:28081/v1/summary
curl http://172.18.0.1:28082/v1/supervision
curl http://172.18.0.1:28087/status
```

脚本默认只绑定 Docker bridge 地址 `172.18.0.1`，并会拒绝公网通配绑定，避免误暴露 RK3568 反向隧道。

云端 API 容器应配置：

```text
RK3568_ALARM_ACTUATOR_URL=http://172.18.0.1:28087
RK3568_FIELD_LINK_MONITOR_URL=http://172.18.0.1:28081/v1/summary
RK3568_HERMES_EDGE_SUPERVISOR_URL=http://172.18.0.1:28082/v1/supervision
RK3568_STATUS_HTTP_TIMEOUT_MS=6000
```

## 业务链路

RK3568 `field-gateway` 已指向云服务器 MQTT：

```text
MQTT_URL=mqtt://134.175.187.208:1883
```

由于云服务器 `134.175.187.208/32` 被固定到 `usb0`，所以 MQTT 上行和命令订阅都会优先走 EC200A 4G。

## 注意事项

- 不要把反向端口绑定到 `0.0.0.0`，否则等于把 RK3568 SSH 暴露到公网。
- 如果更换 SIM 或运营商，先检查 `AT+CPIN?`、`AT+CEREG?`、`AT+CGATT?` 和 APN。
- 当前 APN `cmnet` 已验证能访问云服务器；此前 `cmiot` 出现过只有上行无下行的受限状态。
- 当前 RK3568 不能直接公网 SSH：EC200A 蜂窝 PDP 地址是运营商内网地址，RK3568 `usb0` 也是模块内部 NAT 地址。除非购买公网 APN、固定公网 IP、VPDN/APN 专线或运营商 VPN 专网，否则公网无法主动打进板子。
- 即使后续拿到公网 IP，也优先保留反向隧道或 VPN，不建议直接暴露 SSH。
