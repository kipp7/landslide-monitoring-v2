# RK2206 XL01 现场节点固件

本目录是山体滑坡监测系统中 RK2206 节点 A/B/C 的唯一维护源码。当前生产候选版本使用 XLS1 紧凑广播轮询，不再维护另一份手工复制的 OpenHarmony vendor 源码。

## 当前生产基线

- 固件标记：`fw-compact-broadcast-poll-v2-20260724`
- 遥测负载：46 字节紧凑数据，封装后为 64 字节现场链路帧
- 网关轮询：RK3568 每秒发送一次广播命令
- 节点时隙：A/B/C 分别延迟 0/340/680 ms 回传
- 北向链路：RK3568 解码后继续使用既有 JSON、MQTT、Kafka 和 ClickHouse 合约
- 自动恢复：生产轮询模式连续 180 秒没有收到有效网关命令时，由看门狗重建节点链路
- 真实传感器：UM220-IV GNSS、RS485 土壤温度/水分/可选电导率、RS485 倾角
- 虚拟传感器：关闭

协议和现场长跑证据见：

- `docs/field-tests/xls1-compact-telemetry-v1.md`
- `docs/field-tests/xls1-compact-broadcast-poll-v2.md`

## 目录结构

```text
firmware/rk2206-xl01/
├─ app/                 # 身份、命令、遥测和共享端口业务模型
├─ config/              # 集中式板级与生产参数
├─ drivers/
│  ├─ sensors/          # GNSS、SC16IS752、Modbus 和现场传感器
│  └─ xl01/             # XLS1 串口、COBS/CRC 帧和广播轮询
├─ main/                # OpenHarmony 应用入口与任务编排
├─ tests/               # 可在主机运行的紧凑遥测黄金向量测试
├─ utils/               # FIFO 与看门狗工具
├─ BUILD.gn             # OpenHarmony 构建目标
├─ PINOUT.md            # 接线基线
└─ CHANGELOG.md         # 固件变更记录
```

这个分层已经符合当前维护需要。不要把 A/B/C 拆成三套源码；三者仅身份不同，由构建脚本生成。

## 硬件路由

| 功能 | 当前路由 | 参数 |
| --- | --- | --- |
| XL01 | `EUART2_M1 PB2/PB3` | 115200 baud |
| UM220-IV GNSS | `EUART0_M0 PB6/PB7` | 115200 baud |
| SC16IS752 | `EI2C0_M0 PB4/PB5` | 地址 `0x4D`，晶振 1.8432 MHz |
| 土壤传感器 | SC16IS752 channel 0 | Modbus 地址 1，4800 8N1 |
| 倾角传感器 | SC16IS752 channel 1 | Modbus 地址 1，4800 8N1 |

更改硬件前必须同步复核 `config/app_config.h`、`PINOUT.md` 和实际板卡。

## A/B/C 身份

身份配置集中在 `config/app_config.h`，三个字段必须成组修改：

| 节点 | `DEVICE_ID` | `INSTALL_LABEL` | `LEGACY_NODE_LABEL` |
| --- | --- | --- | --- |
| A | `00000000-0000-0000-0000-000000000001` | `FIELD-NODE-A` | `A` |
| B | `00000000-0000-0000-0000-000000000002` | `FIELD-NODE-B` | `B` |
| C | `00000000-0000-0000-0000-000000000003` | `FIELD-NODE-C` | `C` |

公开源码中的 `DEVICE_SECRET` 必须保持占位符 `CHANGE_ME_DEVICE_SECRET`。生产 `.env`、私钥和服务器凭据不得进入本目录或公开 Release。

## OpenHarmony 集成

构建时目标目录为：

```text
<OpenHarmonyRoot>/vendor/isoftstone/rk2206/samples/xl01_landslide_monitor_v1.1
```

手工构建可以把本目录内容复制到上述位置，然后在 OpenHarmony 根目录运行：

```bash
hb build -f
```

推荐使用仓库脚本自动生成 A/B/C。脚本只临时同步广播版文件，逐个写入节点身份，导出 IMG/BIN 后恢复 SDK 原文件：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\firmware\build-xl01-compact-broadcast-v2.ps1 `
  -SdkRoot "F:\2\openharmony\txsmartropenharmony" `
  -ContainerName "openharmony-dev"
```

## 测试

紧凑遥测 Python 黄金向量：

```powershell
python .\scripts\field\compact_telemetry_codec_test.py
```

C 主机测试位于：

```text
firmware/rk2206-xl01/tests/compact_telemetry_builder_host_test.c
```

真实固件验收还必须包含：A/B/C 身份核对、串口帧校验、广播批次完整率、MQTT 发布、ClickHouse 落库和长时间无重启观察。

## 发布

所有固件二进制必须与对应 OpenHarmony 源码成对发布。统一入口：

```text
scripts/firmware/package-xl01-release.ps1
```

它会同时生成：

- A/B/C IMG、BIN、loader 的固件 ZIP
- 完整工程、vendor 目录副本、构建脚本、测试和文档的源码 ZIP
- 两个资产各自的逐文件清单和最终 SHA-256

GitHub 上传后必须用 `scripts/firmware/verify-release-source-assets.ps1` 验证两个资产同时存在。完整命令见 `docs/zh-CN/RELEASE.md`。
