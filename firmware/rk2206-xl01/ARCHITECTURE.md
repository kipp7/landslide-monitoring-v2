# XL01 滑坡监测系统 - 架构设计文档

## 1. 架构概述

### 1.1 设计原则

本项目采用**工业级模块化分层架构**，遵循以下设计原则：

- **SOLID原则**：单一职责、开放封闭、里氏替换、接口隔离、依赖倒置
- **关注点分离**：配置、驱动、工具、应用、业务逻辑各层独立
- **低耦合高内聚**：模块间依赖最小化，相关功能组织在一起
- **DRY原则**：Don't Repeat Yourself，避免代码重复
- **KISS原则**：Keep It Simple, Stupid，保持简单

### 1.2 分层架构

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

---

## 2. 模块详解

### 2.1 配置层 (config/)

**职责**：集中管理所有系统参数，提供统一的配置接口。

**文件**：
- `app_config.h` - 全局配置头文件

**配置类别**：
1. **节点配置**：节点ID
2. **上传配置**：上传间隔、重试次数、ACK超时
3. **传感器开关**：各传感器启用标志
4. **硬件配置**：UART ID、I2C地址、波特率
5. **系统配置**：看门狗、低功耗模式

**优势**：
- ✅ 所有参数集中管理，易于查找和修改
- ✅ 避免魔法数字（Magic Number）
- ✅ 便于不同硬件平台的移植

---

### 2.2 工具层 (utils/)

**职责**：提供可复用的通用功能模块。

#### 2.2.1 FIFO缓冲区 (`fifo.h/.c`)

**功能**：环形缓冲区实现，用于UART接收数据缓存。

**接口**：
```c
void Fifo_Init(Fifo *fifo);                          // 初始化
int Fifo_Write(Fifo *fifo, unsigned char *data, unsigned int len);  // 写入
int Fifo_Read(Fifo *fifo, unsigned char *data, unsigned int len);   // 读取
int Fifo_Available(Fifo *fifo);                      // 可用字节数
```

**特点**：
- ✅ 线程安全（单读单写场景）
- ✅ 防止数据丢失
- ✅ 高效环形缓冲

#### 2.2.2 看门狗管理 (`watchdog_mgr.h/.c`)

**功能**：系统看门狗封装，提供统一的看门狗接口。

**接口**：
```c
void Watchdog_Init(void);    // 初始化看门狗
void Watchdog_Feed(void);    // 喂狗
```

**特点**：
- ✅ 支持编译时开关（`ENABLE_WATCHDOG`）
- ✅ 禁用时自动变为空操作，无性能损失
- ✅ 统一接口，易于测试

---

### 2.3 驱动层 (drivers/)

**职责**：硬件抽象层，封装传感器和通信模块的底层操作。

#### 2.3.1 XL01无线驱动 (`drivers/xl01/`)

**功能**：XL01无线通信模块驱动。

**接口**：
```c
void XL01_Init(void);                                 // 初始化
int XL01_SendWithRetry(const char *data, int len, Statistics *stats);  // 发送（带重试）
void XL01_PollReceive(void);                          // 轮询接收
int XL01_ProcessReceivedData(Statistics *stats);     // 处理接收数据
```

**特点**：
- ✅ 透传模式实现
- ✅ ACK机制（可选）
- ✅ 重试机制
- ✅ FIFO缓冲

#### 2.3.2 传感器驱动 (`drivers/sensors/`)

**SHT30温湿度传感器** (`sht30_driver.h/.c`)
```c
int SHT30_Init(void);
int SHT30_Read(float *temp, float *humi);
```

**MPU6050 IMU传感器** (`mpu6050_driver.h/.c`)
```c
int MPU6050_Init(void);
int MPU6050_Read(float *ax, float *ay, float *az, float *gx, float *gy, float *gz);
```

**GPS定位模块** (`gps_driver.h/.c`)
```c
int GPS_Init(void);
int GPS_Read(float *lat, float *lon);
```

**驱动设计原则**：
- ✅ 统一接口：`XXX_Init()` + `XXX_Read()`
- ✅ 返回值：0 = 成功，负数 = 错误码
- ✅ 独立性：每个驱动可独立编译和测试
- ✅ 自包含：驱动内部定义必要的常量，避免外部依赖

---

### 2.4 应用层 (app/)

**职责**：定义应用级数据结构。

**文件**：
- `sensor_data.h` - 传感器数据结构和统计结构

**数据结构**：

```c
typedef struct {
    // 系统信息
    unsigned int seq;
    unsigned int uptime;
    
    // 温湿度
    float temperature;
    float humidity;
    int temp_valid;
    
    // GPS
    float latitude;
    float longitude;
    int gps_valid;
    
    // 加速度/陀螺仪
    float accel_x, accel_y, accel_z;
    float gyro_x, gyro_y, gyro_z;
    float angle_x, angle_y;
    int imu_valid;
    
    // 状态
    int warning;
    int battery_level;
} SensorData;

typedef struct {
    unsigned int total_sent;
    unsigned int success_count;
    unsigned int retry_count;
    unsigned int failed_count;
    unsigned int total_bytes;
    unsigned int rx_packets;
    unsigned int uptime_sec;
} Statistics;
```

**特点**：
- ✅ 清晰的数据结构定义
- ✅ 各层共享，避免重复定义
- ✅ 易于扩展新字段

---

### 2.5 主程序层 (main/)

**职责**：业务逻辑编排，协调各层模块工作。

**文件**：
- `landslide_main.c` - 主程序入口

**任务架构**：

```
┌────────────────────────────────────┐
│  UartRxTask (高优先级, 1ms)       │ ← UART接收
├────────────────────────────────────┤
│  DataProcessTask (普通优先级, 10ms)│ ← 数据处理
├────────────────────────────────────┤
│  SensorCollectionTask (普通, 1s)  │ ← 传感器采集
├────────────────────────────────────┤
│  DataUploadTask (低优先级, 5s)    │ ← 数据上传
└────────────────────────────────────┘
```

**主要函数**：
1. `App_SystemInit()` - 系统初始化
2. `SensorCollectionTask()` - 传感器采集任务
3. `UartRxTask()` - UART接收任务
4. `DataProcessTask()` - 数据处理任务
5. `DataUploadTask()` - 数据上传任务
6. `MainEntry()` - 主入口函数

**流程图**：

```
启动
  ↓
系统初始化
  ├─ 初始化看门狗
  ├─ 初始化XL01
  ├─ 初始化I2C
  ├─ 初始化传感器（按配置）
  └─ 打印配置摘要
  ↓
创建任务
  ├─ UartRxTask（高优先级）
  ├─ DataProcessTask（普通）
  ├─ SensorCollectionTask（普通）
  └─ DataUploadTask（低优先级）
  ↓
任务调度器启动
  ↓
各任务并发运行
```

---

## 3. 编译配置

### 3.1 BUILD.gn

```gn
static_library("xl01_landslide_monitor") {
    sources = [
        # 主程序
        "main/landslide_main.c",
        
        # 工具
        "utils/fifo.c",
        "utils/watchdog_mgr.c",
        
        # 驱动 - XL01
        "drivers/xl01/xl01_driver.c",
        
        # 驱动 - 传感器
        "drivers/sensors/sht30_driver.c",
        "drivers/sensors/mpu6050_driver.c",
        "drivers/sensors/gps_driver.c",
    ]

    include_dirs = [
        "//utils/native/lite/include",
        "//kernel/liteos_m/kal/cmsis",
        "//base/iot_hardware/peripheral/interfaces/kits",
    ]
}
```

**说明**：
- ✅ 所有模块文件都在 `sources` 中列出
- ✅ 使用统一的 `include_dirs`
- ✅ 编译为静态库

---

## 4. 依赖关系

### 4.1 模块依赖图

```
main/landslide_main.c
  ├─ config/app_config.h
  ├─ utils/fifo.h
  ├─ utils/watchdog_mgr.h
  ├─ drivers/xl01/xl01_driver.h
  ├─ drivers/sensors/sht30_driver.h
  ├─ drivers/sensors/mpu6050_driver.h
  ├─ drivers/sensors/gps_driver.h
  └─ app/sensor_data.h

drivers/xl01/xl01_driver.c
  ├─ config/app_config.h
  ├─ utils/fifo.h
  └─ app/sensor_data.h

drivers/sensors/*.c
  └─ (最小依赖，自包含常量定义)

utils/*.c
  └─ (无外部依赖，纯工具函数)
```

### 4.2 依赖原则

- ✅ **单向依赖**：上层依赖下层，下层不依赖上层
- ✅ **最小依赖**：只引入必要的头文件
- ✅ **驱动独立**：传感器驱动尽量自包含，减少对配置层的依赖

---

## 5. 扩展指南

### 5.1 添加新传感器

**步骤**：

1. **创建驱动文件**
   ```bash
   drivers/sensors/
   ├── xxx_driver.h
   └── xxx_driver.c
   ```

2. **实现驱动接口**
   ```c
   int XXX_Init(void);
   int XXX_Read(float *value);
   ```

3. **更新配置**
   ```c
   // config/app_config.h
   #define ENABLE_XXX  1
   ```

4. **更新数据结构**
   ```c
   // app/sensor_data.h
   typedef struct {
       // ...
       float xxx_value;
       int xxx_valid;
   } SensorData;
   ```

5. **集成主程序**
   ```c
   // main/landslide_main.c
   #if ENABLE_XXX
   #include "../drivers/sensors/xxx_driver.h"
   #endif
   
   // 初始化
   #if ENABLE_XXX
   XXX_Init();
   #endif
   
   // 读取
   #if ENABLE_XXX
   if (XXX_Read(&g_sensor_data.xxx_value) == 0) {
       g_sensor_data.xxx_valid = 1;
   }
   #endif
   ```

6. **更新构建配置**
   ```gn
   // BUILD.gn
   sources = [
       // ...
       "drivers/sensors/xxx_driver.c",
   ]
   ```

### 5.2 添加新通信模块

参考 `drivers/xl01/` 的实现，创建新的驱动模块。

---

## 6. 测试策略

### 6.1 单元测试

**可测试模块**：
- ✅ `utils/fifo.c` - 缓冲区逻辑
- ✅ `utils/watchdog_mgr.c` - 看门狗封装
- ✅ `drivers/sensors/*.c` - 传感器驱动（Mock I2C）
- ✅ `drivers/xl01/xl01_driver.c` - 通信驱动（Mock UART）

**测试框架建议**：
- Unity（轻量级C测试框架）
- CMock（Mock生成工具）

### 6.2 集成测试

**测试场景**：
1. 虚拟数据通信测试
2. 单传感器集成测试
3. 多传感器集成测试
4. ACK机制测试
5. 丢包恢复测试
6. 长时间稳定性测试

---

## 7. 最佳实践

### 7.1 代码规范

- ✅ 使用有意义的命名
- ✅ 函数长度不超过50行
- ✅ 文件长度不超过500行
- ✅ 添加必要的注释
- ✅ 使用 `#define` 定义常量，避免魔法数字

### 7.2 错误处理

- ✅ 返回值约定：0 = 成功，负数 = 错误
- ✅ 打印错误信息，便于调试
- ✅ 关键操作添加重试机制

### 7.3 资源管理

- ✅ 在 `Init()` 函数中申请资源
- ✅ 定期喂看门狗
- ✅ 使用 `LOS_Msleep()` 让出CPU

---

## 8. 性能优化

### 8.1 内存优化

- ✅ 使用固定大小缓冲区（1024字节FIFO）
- ✅ 避免动态内存分配
- ✅ 复用缓冲区

### 8.2 CPU优化

- ✅ 任务优先级合理分配
- ✅ UART轮询间隔优化（1ms）
- ✅ 上传间隔可配置（5秒默认）

### 8.3 功耗优化

- ✅ 可配置上传间隔
- ✅ 预留低功耗休眠接口
- ✅ GPS可选关闭（高功耗）

---

## 9. 故障排查

### 9.1 编译错误

**常见问题**：
- ❌ 头文件路径错误
- ❌ 宏定义缺失
- ❌ 函数名冲突

**解决方法**：
- ✅ 检查 `BUILD.gn` 中的 `sources` 列表
- ✅ 确保相对路径正确 (`../../config/`)
- ✅ 检查函数命名（如 `SystemInit` → `App_SystemInit`）

### 9.2 运行时错误

**常见问题**：
- ❌ 看门狗超时重启
- ❌ UART收不到数据
- ❌ ACK超时

**解决方法**：
- ✅ 调试时禁用看门狗
- ✅ 检查UART引脚连接
- ✅ 增加ACK超时时间

---

## 10. 总结

### 10.1 架构优势

| 方面 | 单体架构 | 模块化架构 |
|-----|---------|-----------|
| **可维护性** | 低 | ✅ 高 |
| **可测试性** | 低 | ✅ 高 |
| **可扩展性** | 低 | ✅ 高 |
| **代码复用** | 低 | ✅ 高 |
| **团队协作** | 困难 | ✅ 容易 |
| **Bug定位** | 困难 | ✅ 容易 |

### 10.2 技术亮点

1. **SOLID原则**：遵循工业级设计原则
2. **分层架构**：清晰的职责划分
3. **驱动抽象**：统一的接口设计
4. **配置集中**：易于管理和移植
5. **可测试性**：模块可独立测试

### 10.3 适用场景

- ✅ IoT传感器节点
- ✅ 无线数据采集
- ✅ 嵌入式系统开发
- ✅ 多传感器集成
- ✅ 团队协作开发

---

**版本**: v2.0  
**更新**: 2025-10-22  
**作者**: AI Assistant + 用户协作

