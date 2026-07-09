# 系统总览

Landslide Monitoring V2 是一套端到端山体滑坡监测系统，包含现场传感节点、边缘网关、Windows 操作员客户端和载板硬件资料。

## 当前维护的产品面

| 产品面 | 路径 | 职责 |
| --- | --- | --- |
| Windows 桌面客户端 | `apps/desktop-ui`, `apps/windows-shell` | 操作员界面和原生 Windows 宿主。 |
| RK3568 边缘网关 | `edge/rk3568-gateway` | 串口采集、MQTT 上行、本地健康文件、现场链路监督和声光报警驱动。 |
| RK2206 现场固件 | `firmware/rk2206-xl01` | 传感器采集、GPS/形变处理、命令 ACK 和遥测封装。 |
| 载板硬件资料 | `hardware/carrier-board` | PCB 布局说明、打板包、原理图预览、BOM 和坐标文件。 |
| 共享工程包 | `packages` | 边缘服务使用的轻量校验和可观测性工具。 |

## 运行链路

```text
RS485/GPS/SHT30/MPU6050 传感器
  -> RK2206 现场节点固件
  -> XL01 / southbound 串口链路
  -> RK3568 field gateway
  -> MQTT / 兼容监测 API
  -> Windows 桌面操作员客户端
```

## 仓库策略

当前公开树发布项目自有源码、硬件交付资料和运维文档。供应商 SDK 全量树、本地凭据、生成缓存、现场日志和机器相关证据包不进入公开主分支。
