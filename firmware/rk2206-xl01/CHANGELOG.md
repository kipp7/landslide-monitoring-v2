# 更新日志

## [2026-07-23] - XLS1 单无线包紧凑遥测实验

- 新增固定 `46` 字节 compact telemetry v1；叠加 field-link 头、CRC32、COBS 和结束符后总长固定为 `64` 字节。
- 继续保留 JSON 命令与命令 ACK，云端 MQTT/JSON 合同不变。
- 覆盖温湿度、土壤温湿度、电导率、三轴倾角、GPS、雨量、有效位、告警位、序号、uptime 和命令标签。
- 固件标记：`fw-compact-single-packet-v1-20260723`。
- 本版本仅用于独立实验分支；`competition-suite-20260723` 仍是正式回滚基线。

## [2026-07-19] - 一秒轮询 v2

- `poll_latest_telemetry` 改为由匹配的 `scheduler_poll` 遥测帧确认完成，不再单独发送 ACK 或进入 2.7 秒静默保护。
- 网关轮询周期固定为 1000 ms；轮询下行使用 64 字节分块和 10 ms 间隔，普通控制命令参数不变。
- 节点上行仍保留 32 字节分块，间隔调整为 15 ms；轮询请求检查周期调整为 50 ms。
- 固件标记：`fw-one-second-poll-v2-20260719`。A/B/C 仍只差三项设备身份宏。

## [2026-07-19] - 现场链路自动恢复

- 同步已在 RK2206 厂商构建树验证的生产固件：COBS/CRC 帧、RK3568 轮询、SC16IS752 双路 RS485、土壤温湿度/可选电导率和倾角采集。
- 新增独立 `FieldLinkHealth` 任务。生产轮询模式连续 180 秒未成功处理网关命令时，通过硬件看门狗复位 RK2206，重建 MCU 侧 UART 和协议状态。
- 新固件标记为 `fw-field-link-auto-recovery-20260719`；A/B/C 使用相同恢复逻辑，只修改三项设备身份宏。
- 当前 PCB 未将 DL-XLS1 的复位或电源控制线接入 RK2206，因此该恢复不是无线模块硬断电。

## [v2.0] - 2025-10-22 - 模块化架构

### 架构重构

将代码重构为模块化分层架构，便于维护、测试和扩展。

#### 分层设计原则

采用经典的**分层架构**模式，将系统划分为5个独立层次：

```
┌─────────────────────────────────────┐
│  配置层 (config/)                   │ ← 集中管理所有参数
├─────────────────────────────────────┤
│  工具层 (utils/)                    │ ← 可复用通用模块
├─────────────────────────────────────┤
│  驱动层 (drivers/)                  │ ← 硬件抽象接口
├─────────────────────────────────────┤
│  应用层 (app/)                      │ ← 数据结构定义
├─────────────────────────────────────┤
│  主程序 (main/)                     │ ← 业务逻辑编排
└─────────────────────────────────────┘
```

#### 模块清单

**1. 配置模块**
- `config/app_config.h` - 全局参数集中管理

**2. 工具模块**
- `utils/fifo.h/.c` - FIFO缓冲区管理
- `utils/watchdog_mgr.h/.c` - 看门狗封装

**3. 驱动模块**
- `drivers/xl01/xl01_driver.h/.c` - XL01无线通信驱动
- `drivers/sensors/sht30_driver.h/.c` - SHT30温湿度传感器
- `drivers/sensors/mpu6050_driver.h/.c` - MPU6050加速度/陀螺仪
- `drivers/sensors/gps_driver.h/.c` - GPS定位模块

**4. 应用模块**
- `app/sensor_data.h` - 传感器数据结构定义

**5. 主程序**
- `main/landslide_main.c` - 主业务逻辑

#### 设计优势

| 原则 | 实现 | 优势 |
|-----|-----|------|
| **单一职责** | 每个模块功能明确 | 易于理解和维护 |
| **开放封闭** | 对扩展开放，对修改封闭 | 新增传感器无需改动现有代码 |
| **依赖倒置** | 面向接口编程 | 驱动可独立替换 |
| **接口隔离** | 最小化接口依赖 | 模块间低耦合 |
| **里氏替换** | 驱动接口统一 | 传感器可互换 |

### 📁 文件变更

#### 新增文件 (15个)
```
✅ config/app_config.h
✅ utils/fifo.h
✅ utils/fifo.c
✅ utils/watchdog_mgr.h
✅ utils/watchdog_mgr.c
✅ drivers/xl01/xl01_driver.h
✅ drivers/xl01/xl01_driver.c
✅ drivers/sensors/sht30_driver.h
✅ drivers/sensors/sht30_driver.c
✅ drivers/sensors/mpu6050_driver.h
✅ drivers/sensors/mpu6050_driver.c
✅ drivers/sensors/gps_driver.h
✅ drivers/sensors/gps_driver.c
✅ app/sensor_data.h
✅ main/landslide_main.c
```

#### 删除文件 (1个)
```
❌ xl01_framework.c  (876行单体文件 → 15个模块化文件)
```

#### 修改文件 (3个)
```
📝 BUILD.gn         - 更新编译源文件列表
📝 README_zh.md     - 反映新架构
📝 CHANGELOG.md     - 本文件
```

### 🔄 迁移对比

| 方面 | v1.1 (单体) | v2.0 (模块化) |
|-----|------------|--------------|
| **文件数** | 1个876行 | 15个文件 |
| **配置管理** | 分散在代码中 | 集中在 `config/` |
| **传感器驱动** | 混在主文件 | 独立 `drivers/sensors/` |
| **通信驱动** | 混在主文件 | 独立 `drivers/xl01/` |
| **工具函数** | 嵌入主文件 | 独立 `utils/` |
| **数据结构** | 主文件顶部 | 独立 `app/` |
| **可测试性** | 难以测试 | 模块独立可测 |
| **新增传感器** | 修改主文件 | 添加新驱动文件 |
| **维护难度** | 高（影响面大） | 低（影响面小） |

### 🎯 功能保留

所有 v1.1 的功能在 v2.0 中**完全保留**，包括：

- ✅ 模块化传感器支持（GPS/SHT30/MPU6050/Virtual）
- ✅ ACK确认机制（应用层）
- ✅ 防丢包机制（FIFO + 三任务架构）
- ✅ 看门狗保护
- ✅ 低功耗支持
- ✅ 统计监控
- ✅ JSON数据格式

### 📚 升级指南

#### 从 v1.1 升级到 v2.0

**代码无需修改**，只需重新编译：

```bash
cd /root/workspace/txsmartropenharmony
hb build -f
```

**配置修改**（如需要）：

旧方式（v1.1）：
```c
// 在 xl01_framework.c 顶部修改
#define NODE_ID "A"
```

新方式（v2.0）：
```c
// 在 config/app_config.h 中修改
#define NODE_ID "A"
```

### 🔬 技术亮点

#### 1. 驱动抽象层
每个传感器驱动提供统一接口：
```c
int XXX_Init(void);      // 初始化
int XXX_Read(...);       // 读取数据
```

#### 2. 配置集中化
所有可调参数集中在 `config/app_config.h`：
- 节点配置（NODE_ID）
- 传感器开关（ENABLE_XXX）
- 上传参数（UPLOAD_INTERVAL_MS）
- 硬件配置（UART_ID, I2C_ADDR）

#### 3. 工具模块化
通用功能独立封装：
- `fifo.c` - FIFO缓冲区（可复用）
- `watchdog_mgr.c` - 看门狗管理（可复用）

#### 4. 头文件管理
严格的包含路径：
```c
#include "../../config/app_config.h"    // 相对路径
#include "../drivers/xl01/xl01_driver.h"
```

### 💡 最佳实践示例

#### 添加新传感器（完整流程）

**1. 创建驱动**
```bash
drivers/sensors/
├── bh1750_driver.h     # 光照传感器头文件
└── bh1750_driver.c     # 光照传感器实现
```

**2. 实现接口**
```c
// bh1750_driver.c
#include "bh1750_driver.h"
#include "../../config/app_config.h"

int BH1750_Init(void) {
    // I2C初始化
    return 0;
}

int BH1750_Read(float *lux) {
    // 读取光照值
    return 0;
}
```

**3. 更新配置**
```c
// config/app_config.h
#define ENABLE_BH1750  1
#define BH1750_I2C_ADDR  0x23
```

**4. 更新数据结构**
```c
// app/sensor_data.h
typedef struct {
    // ...
    float lux;
    int lux_valid;
} SensorData;
```

**5. 集成主程序**
```c
// main/landslide_main.c
#if ENABLE_BH1750
#include "../drivers/sensors/bh1750_driver.h"
#endif

// SystemInit() 中：
#if ENABLE_BH1750
BH1750_Init();
#endif

// SensorCollectionTask() 中：
#if ENABLE_BH1750
if (BH1750_Read(&g_sensor_data.lux) == 0) {
    g_sensor_data.lux_valid = 1;
}
#endif
```

**6. 更新构建**
```gn
// BUILD.gn
sources = [
    // ...
    "drivers/sensors/bh1750_driver.c",
]
```

完成！新传感器已集成，**无需修改其他模块**。

---

## [v1.1] - 2025-10-22

### ✨ 新增
- **真正的ACK确认机制**: 应用层ACK，中心节点必须回复"ACK\n"才算成功
- **准确的统计信息**: 成功率、重试次数、失败次数真实反映通信质量
- **ACK配置选项**: 可启用/禁用ACK检查，支持两种模式

### 🔧 改进
- ACK超时等待机制（1秒超时）
- 自动重试机制（最多3次）
- 优化输出格式（✓ ACK / ✗ FAILED）
- 接收到ACK/OK自动识别

---

## [v1.0] - 2025-10-22

### 新增功能
- **模块化框架**: 模块化传感器支持
- **防丢包机制**: 1024字节FIFO + 三任务架构
- **看门狗保护**: 10秒超时自动重启
- **低功耗支持**: 可配置上传间隔、预留休眠接口
- **统计监控**: 实时监控发送/接收/错误

### 🎯 核心特性
1. **模块化传感器**
   - GPS (ENABLE_GPS)
   - SHT30温湿度 (ENABLE_SHT30)
   - MPU6050加速度/陀螺仪 (ENABLE_MPU6050)
   - 虚拟数据测试 (ENABLE_VIRTUAL)

2. **三任务架构**
   - UartRxTask (高优先级, 1ms轮询)
   - DataProcessTask (普通优先级, 10ms)
   - SensorUploadTask (低优先级)

3. **FIFO缓冲**
   - 1024字节环形缓冲区
   - 防止高速接收时数据丢失

---

## [v0.x] - 2025-10-21 及之前

### 已删除的旧版本文件
以下文件已在 v1.1 清理时删除：
- `xl01_test_virtual.c`
- `xl01_simple_test.c`
- `xl01_test_transparent.c`
- `xl01_sensor_upload.c`
- `xl01_full_sensors.c`
- `cc9d.c / cc9d.h`
- `crc8.c / crc8.h`

---

## 版本对比

| 特性 | v0.x | v1.0 | v1.1 | v2.0 |
|------|------|------|------|------|
| 架构 | 单文件 | 单文件 | 单文件 | **模块化** ✨ |
| 文件数 | 1-3 | 1 | 1 | **15** ✨ |
| 分层设计 | ✗ | ✗ | ✗ | **✓** ✨ |
| 驱动独立 | ✗ | ✗ | ✗ | **✓** ✨ |
| 配置集中 | ✗ | ✗ | ✗ | **✓** ✨ |
| 可测试性 | 低 | 低 | 低 | **高** ✨ |
| 可维护性 | 低 | 中 | 中 | **高** ✨ |
| 可扩展性 | 低 | 中 | 中 | **高** ✨ |
| 模块化传感器 | ✗ | ✓ | ✓ | ✓ |
| FIFO缓冲 | 部分 | ✓ | ✓ | ✓ |
| 三任务架构 | ✗ | ✓ | ✓ | ✓ |
| 看门狗 | ✗ | ✓ | ✓ | ✓ |
| ACK确认 | ✗ | 假 | **真** | ✓ |
| 统计监控 | 基础 | ✓ | ✓ | ✓ |

---

## 路线图

### 已完成 ✅
- [x] XL01通信基础 (v0.1)
- [x] 虚拟数据测试 (v0.2)
- [x] 三任务架构 (v0.5)
- [x] FIFO防丢包 (v1.0)
- [x] 看门狗保护 (v1.0)
- [x] ACK确认机制 (v1.1)
- [x] **模块化架构重构 (v2.0)** ✨

### 进行中 ⏳
- [ ] SHT30温湿度驱动完善（已有框架）
- [ ] MPU6050 IMU驱动完善（已有框架）
- [ ] GPS NMEA解析完善（已有框架）

### 计划中 📋
- [ ] 单元测试框架
- [ ] 驱动层Mock测试
- [ ] 低功耗深度休眠
- [ ] 数据压缩传输
- [ ] 本地存储（掉电缓存）
- [ ] OTA升级支持
- [ ] 多节点组网测试
- [ ] 长期稳定性测试

---

## 架构演进

```
v0.x: 原型验证
└─> 单文件，快速验证功能

v1.0: 功能完整
└─> 单文件，基础功能完整

v1.1: ACK增强
└─> 单文件，真实ACK确认

v2.0: 架构升级
└─> 模块化分层架构
    ├── 配置层：集中管理
    ├── 工具层：可复用模块
    ├── 驱动层：硬件抽象
    ├── 应用层：数据定义
    └── 主程序：业务编排
```

---

## 贡献者

- 项目维护者 - 架构设计、实现和测试验证

---

## 许可

Apache License 2.0
