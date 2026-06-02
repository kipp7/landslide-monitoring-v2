---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/services/field-gateway/deploy/readme
---

# field-gateway 部署件

本目录负责 RK3568 第一版 `field-gateway` 的运行固化，以及与之配套的 `network bootstrap` 守护固化。

## 文件

- `field-gateway.service.template`
  - systemd unit 模板
- `field-gateway.env.rk3568.example`
  - RK3568 板端环境变量样例
- `install-rk3568.sh`
  - 在 RK3568 Ubuntu 上安装/更新 systemd 服务的脚本
- `check-rk3568-runtime.sh`
  - 在 RK3568 上输出当前 `field-gateway` 运行态快照的脚本
- `rk3568-network-bootstrap.py`
  - RK3568 `STA first, AP fallback` 守护主程序
- `rk3568-network-bootstrap.service.template`
  - `network bootstrap` systemd unit 模板
- `rk3568-network-bootstrap.env.example`
  - `network bootstrap` 环境变量样例
- `install-rk3568-network-bootstrap.sh`
  - 在 RK3568 Ubuntu 上安装/更新 `network bootstrap` 服务的脚本
- `check-rk3568-network-bootstrap.sh`
  - 在 RK3568 上输出当前 `network bootstrap` 运行态快照的脚本
- `../../field-link-monitor/deploy/install-rk3568-field-link-monitor.sh`
  - 在 RK3568 Ubuntu 上安装/更新本地链路质量 sidecar
- `../../field-link-monitor/deploy/check-rk3568-field-link-monitor.sh`
  - 在 RK3568 上输出当前本地链路质量 sidecar 运行态快照

## 当前运行约定

- 运行用户默认：
  - `linaro`
- 串口默认：
  - `/dev/ttyS3`
  - `115200 8N1`
- 环境文件默认：
  - `/etc/lsmv2/field-gateway.env`
- 状态目录默认：
  - `/var/lib/lsmv2/field-gateway`
- 服务名默认：
  - `lsmv2-field-gateway.service`
- `network bootstrap` 环境文件默认：
  - `/etc/lsmv2/network-bootstrap.env`
- `network bootstrap` 状态目录默认：
  - `/var/lib/lsmv2/network-bootstrap`
- `network bootstrap` 服务名默认：
  - `lsmv2-rk3568-network-bootstrap.service`
- AP fallback 热点名默认：
  - `rk3568-1`

## 最小部署方式

在 RK3568 仓库根目录执行：

```bash
sudo bash services/field-gateway/deploy/install-rk3568.sh \
  --mqtt-url mqtt://<broker-host>:1883 \
  --overwrite-env
```

说明：

- 安装脚本默认会保留已存在的 `/etc/lsmv2/field-gateway.env`
- 只有显式传入 `--overwrite-env` 才会重写现场环境文件
- 当前主线在重写环境文件时会直接写入：
  - `FIELD_LINK_MODE=cobs-crc-v1`
  - `SOUTHBOUND_NODES_JSON=A/B/C -> /dev/ttyS3`
  - `COMMAND_* quiet window`
  - `SOUTHBOUND_POLLING_*`

完成后常用命令：

```bash
sudo systemctl status lsmv2-field-gateway --no-pager
sudo journalctl -u lsmv2-field-gateway -n 100 --no-pager
cat /var/lib/lsmv2/field-gateway/health/runtime-health.json
bash services/field-gateway/deploy/check-rk3568-runtime.sh
```

Windows 主机当前推荐入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\install-rk3568-field-gateway.ps1 -Password linaro -OverwriteEnv
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-runtime.ps1 -Password linaro
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\install-rk3568-network-bootstrap.ps1 -Password linaro
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-network-bootstrap.ps1 -Password linaro
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-link-monitor.ps1 -Password linaro
```

如果当前目标是直接在 RK3568 本机把只读 sidecar 固化出来，再执行：

```bash
sudo bash services/field-link-monitor/deploy/install-rk3568-field-link-monitor.sh
bash services/field-link-monitor/deploy/check-rk3568-field-link-monitor.sh
```
