# XL01 滑坡监测节点 - 模块化架构 v2.0

## 项目简介

基于 RK2206 + XL01 无线模块的滑坡监测节点，采用分层模块化架构设计。

**当前版本**: v2.0  
**状态**: 可构建的公开固件包
**架构**: 分层模块化设计

---

## 架构特点

### 模块化分层设计

```
xl01_landslide_monitor/
├── config/           # 配置层：全局参数集中管理
│   └── app_config.h
├── utils/            # 工具层：通用功能模块
│   ├── fifo.h/.c           # FIFO缓冲区
│   └── watchdog_mgr.h/.c   # 看门狗管理
├── drivers/          # 驱动层：硬件抽象
│   ├── xl01/               # 无线通信模块驱动
│   │   ├── xl01_driver.h
│   │   └── xl01_driver.c
│   └── sensors/            # 传感器驱动
│       ├── sht30_driver.h/.c    # 温湿度
│       ├── mpu6050_driver.h/.c  # 加速度/陀螺仪
│       └── gps_driver.h/.c      # GPS定位
├── app/              # 应用层：数据结构定义
│   └── sensor_data.h
└── main/             # 主程序：业务逻辑
    └── landslide_main.c
```

### 设计优势

| 特性 | 说明 |
|-----|------|
| **关注点分离** | 配置、驱动、应用逻辑各司其职 |
| **硬件抽象** | 传感器驱动独立，易于测试和替换 |
| **低耦合** | 模块间依赖最小化 |
| **高内聚** | 相关功能组织在一起 |
| **可维护性** | 单一职责原则，修改影响面小 |
| **可测试性** | 独立模块便于单元测试 |
| **可扩展性** | 新增传感器只需添加新驱动模块 |

---

## 核心功能

### 1. 模块化传感器支持
每个传感器可独立启用/禁用（在 `config/app_config.h` 中配置）：
```c
#define ENABLE_GPS          0    // GPS定位模块
#define ENABLE_SHT30        0    // 温湿度传感器
#define ENABLE_MPU6050      0    // 加速度/陀螺仪
#define ENABLE_VIRTUAL      1    // 虚拟数据（测试用）✓
```

### 2. ACK确认机制
当前 ACK 机制分成两层：

1. **链路级 ACK**
- 节点 ↔ 无线/网关之间的确认
- 当前仍使用 `"ACK"` / `"OK"` 字符串
- 只用于确认串口/无线链路发送成功

2. **平台命令回执**
- 不再停留在 `"ACK"` / `"OK"`
- 对齐软件主线：
  - `cmd_ack/{device_id}`
  - `DeviceCommandAck v1`

当前代码里保留的 `ENABLE_ACK_CHECK` / `ACK_TIMEOUT_MS` 主要属于第 1 层，也就是链路级 ACK：
```c
#define ENABLE_ACK_CHECK    1       // 启用ACK检查
#define ACK_TIMEOUT_MS      1000    // ACK超时（毫秒）
#define MAX_RETRY_COUNT     3       // 最大重试次数
```

工作流程：
1. RK2206 发送遥测或标准回执 payload
2. 等待网关/接收端返回链路级 `"ACK\n"` / `"OK"`
3. 收到 ACK → 链路发送成功 ✓
4. 超时 → 自动重试（最多3次）

### 3. 防丢包机制
- **1024字节FIFO缓冲** - 高速接收不丢数据
- **三任务架构**:
  - `UartRxTask` (高优先级, 1ms轮询)
  - `DataProcessTask` (普通优先级)
  - `SensorUploadTask` (低优先级)

### 4. 看门狗保护
```c
#define ENABLE_WATCHDOG     1       // 启用看门狗
#define WATCHDOG_TIMEOUT    10      // 超时时间（秒）
```
系统异常时自动重启恢复。

### 5. 低功耗支持
```c
#define UPLOAD_INTERVAL_MS  5000    // 上传间隔（可调）
#define ENABLE_LOW_POWER    0       // 低功耗模式（预留）
```

---

## 配置参数

所有配置参数都在 `config/app_config.h` 文件中集中管理：

### 身份配置
```c
#define IDENTITY_SCHEMA_VERSION  1
#define CRED_VERSION             1
#define DEVICE_ID                "00000000-0000-0000-0000-000000000001"
#define DEVICE_SECRET            "CHANGE_ME_DEVICE_SECRET"
#define INSTALL_LABEL            "FIELD-NODE-A"
#define LEGACY_NODE_LABEL        "A"   // 仅调试标签，不再作为平台主身份
```

### 上传配置
```c
#define UPLOAD_INTERVAL_MS  5000    // 上传间隔
                                    // 推荐值：
                                    //   3000 = 快速监测
                                    //   5000 = 标准（推荐）
                                    //  10000 = 省电模式
```

### 硬件配置
```c
// XL01无线模块
#define XL01_UART_ID    EUART2_M1   // UART2
#define XL01_BAUDRATE   115200      // 波特率

// I2C传感器
#define I2C_IDX         EI2C0_M0    // PB4/PB5
#define SHT30_I2C_ADDR  0x44        // SHT30地址
#define MPU6050_I2C_ADDR 0x68       // MPU6050地址

// GPS模块
#define GPS_UART_ID     EUART0_M0   // PB6/PB7
#define GPS_BAUDRATE    9600        // 波特率
```

---

## 🚀 快速开始

### 1. 编译固件

```bash
# 进入Docker容器
docker exec -it openharmony-dev bash

# 编译
cd /root/workspace/txsmartropenharmony
hb build -f

# 固件位置
# out/rk2206/isoftstone-rk2206/liteos.bin
```

### 2. 烧录固件

使用HiBurn工具烧录 `liteos.bin` 到RK2206。

生产轮询模式下，`poll_latest_telemetry` 不单独发送命令 ACK，遥测帧本身作为轮询成功回执。普通控制命令仍保留 ACK 和共享串口静默保护。网关按每秒一个节点轮询时，三个节点分别约每三秒上报一次。

### 3. 配置接收端 / 网关

**临时串口接收示例（仅链路验证，不是最终平台真相）**
```python
import serial
ser = serial.Serial("COM3", 115200)
while True:
    if ser.in_waiting > 0:
        line = ser.readline().decode('utf-8').strip()
        print(line)
        # 回复链路级 ACK（如果启用了 ACK 检查）
        ser.write(b"ACK\n")
```

说明：

- 这段 Python 只适合验证串口/无线链路本身
- 当前长期目标不是“中心节点长期回 ACK 字符串”
- 而是让网关或适配层最终把数据接入软件主线：
  - 遥测：`telemetry/{device_id}`
  - 命令：`cmd/{device_id}`
  - 回执：`cmd_ack/{device_id}`

### 4. 观察输出

**RK2206串口输出**:
```
========================================
  Configuration Summary
========================================
  Device ID: 00000000-0000-0000-0000-000000000001
  Upload Interval: 5000 ms
  ACK Check: Enabled
  Sensors: Virtual ✓
========================================

[SEND #1] 245 bytes device=00000000-0000-0000-0000-000000000001 ✓ ACK
  Temp:25.0°C Humi:60.0% Tilt:0.00° GPS:OK Bat:99%
```

**当前建议对齐到平台主线的上报格式**:
```json
{
  "schema_version": 1,
  "device_id": "00000000-0000-0000-0000-000000000001",
  "event_ts": null,
  "seq": 1,
  "metrics": {
    "temperature_c": 25.0,
    "humidity_pct": 60.0,
    "tilt_x_deg": 0.0,
    "tilt_y_deg": 0.0,
    "gps_latitude": 22.543000,
    "gps_longitude": 114.057900,
    "battery_pct": 99,
    "warning_flag": false
  },
  "meta": {
    "install_label": "FIELD-NODE-A",
    "legacy_node": "A",
    "uptime_s": 5,
    "legacy_valid_flags": {
      "temp_ok": 1,
      "imu_ok": 1,
      "gps_ok": 1
    }
  }
}
```

当前软件主线对应 topic：

- 遥测：`telemetry/{device_id}`
- 命令：`cmd/{device_id}`
- 回执：`cmd_ack/{device_id}`

---

## 🔧 传感器接入流程（模块化方式）

### Step 1: 测试虚拟数据（当前状态）
```c
#define ENABLE_VIRTUAL 1  // ✓
```
确保 XL01 通信正常，且链路级 ACK 机制工作。

### Step 2: 接入SHT30温湿度
1. 连接硬件（I2C）
2. 修改配置（`config/app_config.h`）：
   ```c
   #define ENABLE_VIRTUAL 0
   #define ENABLE_SHT30   1
   ```
3. 驱动已实现在 `drivers/sensors/sht30_driver.c`
4. 编译测试

### Step 3: 接入MPU6050加速度/陀螺仪
```c
#define ENABLE_MPU6050 1
```
驱动已实现在 `drivers/sensors/mpu6050_driver.c`

### Step 4: 接入GPS模块
```c
#define ENABLE_GPS 1
```
驱动已实现在 `drivers/sensors/gps_driver.c`（需完善NMEA解析）

---

## 📝 添加新传感器（模块化）

遵循模块化原则，添加新传感器非常简单：

### 1. 创建驱动模块
在 `drivers/sensors/` 下创建 `xxx_driver.h` 和 `xxx_driver.c`：

```c
// drivers/sensors/xxx_driver.h
#ifndef DRIVERS_SENSORS_XXX_DRIVER_H
#define DRIVERS_SENSORS_XXX_DRIVER_H

int XXX_Init(void);
int XXX_Read(float *value);

#endif

// drivers/sensors/xxx_driver.c
#include "xxx_driver.h"
#include "../../config/app_config.h"

int XXX_Init(void) {
    // 初始化代码
    return 0;
}

int XXX_Read(float *value) {
    // 读取代码
    return 0;
}
```

### 2. 更新配置
在 `config/app_config.h` 中添加：
```c
#define ENABLE_XXX  1
```

### 3. 更新数据结构
在 `app/sensor_data.h` 的 `SensorData` 结构体中添加字段：
```c
typedef struct {
    // ...现有字段...
    float xxx_value;  // 新传感器数据
    int xxx_valid;    // 数据有效标志
} SensorData;
```

### 4. 集成到主程序
在 `main/landslide_main.c` 中：
```c
// 引入头文件
#if ENABLE_XXX
#include "../drivers/sensors/xxx_driver.h"
#endif

// SystemInit() 中初始化
#if ENABLE_XXX
XXX_Init();
#endif

// SensorCollectionTask() 中读取
#if ENABLE_XXX
if (XXX_Read(&g_sensor_data.xxx_value) == 0) {
    g_sensor_data.xxx_valid = 1;
}
#endif

// DataUploadTask() 中添加到JSON
// "xxx":%.2f,"xxx_ok":%d,
```

### 5. 更新构建配置
在 `BUILD.gn` 的 `sources` 中添加：
```gn
"drivers/sensors/xxx_driver.c",
```

完成！新传感器已集成，无需修改其他模块。

---

## 📊 当前软件主线对齐后的遥测格式

```json
{
  "schema_version": 1,   // 契约版本
  "device_id": "00000000-0000-0000-0000-000000000001",
  "event_ts": null,
  "seq": 123,            // 序列号
  "metrics": {
    "temperature_c": 25.5,
    "humidity_pct": 62.3,
    "accel_x_g": 0.15,
    "accel_y_g": 0.09,
    "accel_z_g": 1.02,
    "gyro_x_dps": 0.5,
    "gyro_y_dps": -0.3,
    "gyro_z_dps": 0.1,
    "tilt_x_deg": 0.15,
    "tilt_y_deg": 0.09,
    "gps_latitude": 22.543012,
    "gps_longitude": 114.057923,
    "battery_pct": 85,
    "warning_flag": false
  },
  "meta": {
    "install_label": "FIELD-NODE-A",
    "legacy_node": "A",
    "uptime_s": 615,
    "legacy_valid_flags": {
      "temp_ok": 1,
      "imu_ok": 1,
      "gps_ok": 1
    }
  }
}
```

---

## 📈 统计监控

每10个数据包输出统计信息：
```
========== Statistics ==========
  Uptime: 50 sec
  Sent: 10/10 (Success: 100.0%)
  Retries: 0, Failed: 0
  Total bytes: 2450
  RX packets: 0
================================
```

---

## ❓ 故障排查

### 问题1: 接收端 / 网关收不到数据
**检查**:
- ✓ XL01天线是否连接
- ✓ 串口连接（白线→RX, 绿线→TX）
- ✓ XL01是否配置为透传模式
- ✓ 波特率是否匹配（115200）

### 问题2: ACK总是超时
**检查**:
- ✓ 接收端 / 网关程序是否运行
- ✓ 接收端是否回复链路级 `"ACK\n"`
- ✓ 串口号是否正确
- ✓ 增加超时：`#define ACK_TIMEOUT_MS 2000`

### 问题3: 平台命令回执没有闭环
**检查**:
- ✓ 当前是否只完成了链路级 ACK，而没有输出标准 `DeviceCommandAck v1`
- ✓ 当前网关是否把回执发到了 `cmd_ack/{device_id}`
- ✓ `device_id` 是否与平台设备身份一致
### 问题4: 编译错误
**检查**:
- ✓ 确保所有 `.c` 文件都在 `BUILD.gn` 的 `sources` 中
- ✓ 确保头文件路径正确（使用相对路径 `../../`）
- ✓ 确保配置宏定义正确（`config/app_config.h`）

---

## 技术特性总结

### 优势
1. **模块化**: 分层设计，职责清晰
2. **可维护**: 单一职责，易于定位问题
3. **可测试**: 独立模块，支持单元测试
4. **可扩展**: 新增功能不影响现有代码
5. **运行保护**: 统计信息、异常恢复和看门狗保护

### 性能指标
- **上传间隔**: 3-60秒（可配置）
- **链路 ACK 延迟**: 0.2-5.5秒（含重试）
- **缓冲容量**: 1024字节FIFO
- **成功率**: >95%（良好信号下）

---

## 相关文档

- `CHANGELOG.md` - 变更记录
- 中心节点 ACK 示例和 ACK 机制说明应以仓库内文档或示例代码为准。

---

## 维护信息

**版本**: v2.0  
**更新**: 2025-10-22  
**状态**: 固件工程具备模块化基础，但仍在向当前软件主线契约全面收口

**架构亮点**:
- 分层模块化设计
- 驱动层硬件抽象
- 配置集中管理
- 模块独立可测试
- 清晰的职责划分
