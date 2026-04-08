---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/services/field-gateway/deploy/readme
---

# field-gateway 部署件

本目录只负责 RK3568 第一版 `field-gateway` 的运行固化，不负责多节点、下行命令或网络管理进程。

## 文件

- `field-gateway.service.template`
  - systemd unit 模板
- `field-gateway.env.rk3568.example`
  - RK3568 板端环境变量样例
- `install-rk3568.sh`
  - 在 RK3568 Ubuntu 上安装/更新 systemd 服务的脚本
- `check-rk3568-runtime.sh`
  - 在 RK3568 上输出当前 `field-gateway` 运行态快照的脚本

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

## 最小部署方式

在 RK3568 仓库根目录执行：

```bash
sudo bash services/field-gateway/deploy/install-rk3568.sh \
  --mqtt-url mqtt://<broker-host>:1883
```

说明：

- 安装脚本默认会保留已存在的 `/etc/lsmv2/field-gateway.env`
- 只有显式传入 `--overwrite-env` 才会重写现场环境文件

完成后常用命令：

```bash
sudo systemctl status lsmv2-field-gateway --no-pager
sudo journalctl -u lsmv2-field-gateway -n 100 --no-pager
cat /var/lib/lsmv2/field-gateway/health/runtime-health.json
bash services/field-gateway/deploy/check-rk3568-runtime.sh
```

Windows 主机当前推荐入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\install-rk3568-field-gateway.ps1 -Password linaro
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-runtime.ps1 -Password linaro
```
