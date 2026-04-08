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

下一步应继续按主线推进：

- 先把这套运行包装落到 RK3568 实机
- 再进入多节点 southbound 抽象或最小下行能力
