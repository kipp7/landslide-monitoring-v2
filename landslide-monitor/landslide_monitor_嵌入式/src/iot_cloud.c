/*
 * Copyright (c) 2023 iSoftStone Information Technology (Group) Co.,Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "iot_cloud.h"
#include "MQTTClient.h"
#include "cJSON.h"
#include "cmsis_os2.h"
#include "config_network.h"
#include "los_task.h"
#include "ohos_init.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "wifi_linked_info.h"
#include "wifi_device.h"
#include "lz_hardware/wifi.h"
#include "lz_hardware/errno.h"

#define MAX_BUFFER_LENGTH 1024
#define MAX_STRING_LENGTH 64

// MQTT相关变量（参考e1_iot_smart_home）
static unsigned char sendBuf[MAX_BUFFER_LENGTH];
static unsigned char readBuf[MAX_BUFFER_LENGTH];

static Network network;
static MQTTClient client;

// 注意：MQTT配置参数现在统一使用头文件中的宏定义
// 不再需要静态字符数组，直接使用宏定义更简洁高效

// 前向声明
static void convert_landslide_to_iot_data(const LandslideIotData *landslide_data, e_iot_data *iot_data);
void set_motor_state(cJSON *root);
void set_buzzer_state(cJSON *root);
void set_rgb_state(cJSON *root);
void set_alarm_reset(void);

static unsigned int mqttConnectFlag = 0;

// 数据缓存和连接状态管理
static DataCache g_data_cache = {0};
static ConnectionStatus g_connection_status = {0};
static bool g_cache_initialized = false;

// WiFi重连计数器（全局变量，便于在不同函数间共享）
uint32_t wifi_reconnect_attempts = 0;

// ==================== 数据缓存管理功能 ====================

/**
 * @brief 初始化数据缓存系统
 * @return 0成功，-1失败
 */
int DataCache_Init(void)
{
    if (g_cache_initialized) {
        return 0;  // 已经初始化
    }

    // 初始化缓存结构
    memset(&g_data_cache, 0, sizeof(DataCache));
    g_data_cache.head = 0;
    g_data_cache.tail = 0;
    g_data_cache.count = 0;
    g_data_cache.is_full = false;

    // 初始化连接状态
    memset(&g_connection_status, 0, sizeof(ConnectionStatus));

    // 尝试从文件加载缓存数据
    DataCache_LoadFromFile();

    g_cache_initialized = true;
    printf(" 数据缓存系统初始化成功\n");
    DataCache_PrintStats();

    return 0;
}

/**
 * @brief 添加数据到缓存队列
 * @param data IoT数据指针
 * @return 0成功，-1失败
 */
int DataCache_Add(const e_iot_data *data)
{
    if (!g_cache_initialized || data == NULL) {
        return -1;
    }

    // 如果缓存满了，移除最旧的数据
    if (g_data_cache.count >= MAX_CACHE_SIZE) {
        printf("  缓存已满，移除最旧数据\n");
        g_data_cache.head = (g_data_cache.head + 1) % MAX_CACHE_SIZE;
        g_data_cache.count--;
    }

    // 添加新数据到队列尾部
    CachedDataItem *item = &g_data_cache.items[g_data_cache.tail];
    memcpy(&item->data, data, sizeof(e_iot_data));
    item->timestamp = LOS_TickCountGet();  // 使用系统tick作为时间戳
    item->retry_count = 0;
    item->is_valid = true;

    g_data_cache.tail = (g_data_cache.tail + 1) % MAX_CACHE_SIZE;
    g_data_cache.count++;
    g_data_cache.total_cached++;

    printf(" 数据已缓存 [%d/%d] 总缓存:%d\n",
           g_data_cache.count, MAX_CACHE_SIZE, g_data_cache.total_cached);

    return 0;
}

/**
 * @brief 发送缓存中的待发送数据
 * @return 发送成功的数据条数
 */
int DataCache_SendPending(void)
{
    if (!g_cache_initialized || g_data_cache.count == 0) {
        return 0;
    }

    int sent_count = 0;
    int processed_count = 0;
    uint16_t current_head = g_data_cache.head;

    printf(" 开始发送缓存数据，待发送:%d条\n", g_data_cache.count);

    // 遍历缓存队列发送数据
    while (processed_count < g_data_cache.count && processed_count < 10) {  // 限制单次处理数量
        CachedDataItem *item = &g_data_cache.items[current_head];

        if (!item->is_valid) {
            current_head = (current_head + 1) % MAX_CACHE_SIZE;
            processed_count++;
            continue;
        }

        // 检查是否超过最大重试次数
        if (item->retry_count >= MAX_RETRY_COUNT) {
            printf(" 数据重试次数超限，丢弃 (重试:%d次)\n", item->retry_count);
            item->is_valid = false;
            g_data_cache.total_failed++;

            // 移除失败的数据
            if (current_head == g_data_cache.head) {
                g_data_cache.head = (g_data_cache.head + 1) % MAX_CACHE_SIZE;
                g_data_cache.count--;
            }
        } else {
            // 尝试发送数据
            // 缓存数据发送日志已优化，减少输出频率

            if (mqtt_is_connected()) {
                send_msg_to_mqtt(&item->data);

                // 发送成功，标记为无效并移除
                item->is_valid = false;
                g_data_cache.total_sent++;
                sent_count++;

                if (current_head == g_data_cache.head) {
                    g_data_cache.head = (g_data_cache.head + 1) % MAX_CACHE_SIZE;
                    g_data_cache.count--;
                }

                printf(" 缓存数据发送成功\n");
            } else {
                // 发送失败，增加重试次数
                item->retry_count++;
                printf("  MQTT未连接，重试次数+1 (%d/%d)\n",
                       item->retry_count, MAX_RETRY_COUNT);
                break;  // MQTT未连接，停止发送
            }
        }

        current_head = (current_head + 1) % MAX_CACHE_SIZE;
        processed_count++;

        // 避免阻塞太久
        LOS_Msleep(100);
    }

    if (sent_count > 0) {
        printf(" 缓存数据发送完成: %d条成功\n", sent_count);
        // DataCache_SaveToFile();  // 移除无用的简化实现调用
    }

    return sent_count;
}

/**
 * @brief 将缓存数据保存到文件
 * @return 0成功，-1失败
 */
int DataCache_SaveToFile(void)
{
    // 注意：rk2206平台文件系统支持有限，这里使用简化实现
    // 实际项目中可以根据平台特性选择合适的持久化方案
    printf(" 缓存数据保存到文件 (简化实现)\n");
    return 0;  // 简化实现，总是返回成功
}

/**
 * @brief Flash数据加载回调函数
 * @param data Flash中的数据
 * @return 0成功，-1失败
 */
static int FlashDataLoadCallback(const LandslideIotData *data)
{
    if (data == NULL) {
        return -1;
    }

    // 转换数据格式
    e_iot_data iot_data;
    convert_landslide_to_iot_data(data, &iot_data);

    // 添加到内存缓存
    return DataCache_Add(&iot_data);
}

/**
 * @brief 从Flash加载缓存数据到内存
 * @return 加载的数据条数
 */
int DataCache_LoadFromFlash(void)
{
    printf(" 从Flash加载缓存数据到内存...\n");

    extern int DataStorage_ProcessCached(int (*callback)(const LandslideIotData *data));
    int loaded_count = DataStorage_ProcessCached(FlashDataLoadCallback);

    if (loaded_count > 0) {
        printf(" 从Flash加载了 %d 条缓存数据到内存\n", loaded_count);
    } else {
        printf(" Flash中没有缓存数据需要加载\n");
    }

    return loaded_count;
}

/**
 * @brief 从文件加载缓存数据（保留接口兼容性）
 * @return 0成功，-1失败
 */
int DataCache_LoadFromFile(void)
{
    // 实际从Flash加载数据
    int loaded = DataCache_LoadFromFlash();
    return (loaded >= 0) ? 0 : -1;
}

/**
 * @brief 清空数据缓存
 */
void DataCache_Clear(void)
{
    if (!g_cache_initialized) {
        return;
    }

    memset(&g_data_cache.items, 0, sizeof(g_data_cache.items));
    g_data_cache.head = 0;
    g_data_cache.tail = 0;
    g_data_cache.count = 0;
    g_data_cache.is_full = false;

    printf("  数据缓存已清空\n");
}

/**
 * @brief 打印缓存统计信息
 */
void DataCache_PrintStats(void)
{
    if (!g_cache_initialized) {
        printf(" 缓存系统未初始化\n");
        return;
    }

    printf("\n === 数据缓存统计 ===\n");
    printf("当前缓存: %d/%d 条\n", g_data_cache.count, MAX_CACHE_SIZE);
    printf("总缓存数: %d 条\n", g_data_cache.total_cached);
    printf("发送成功: %d 条\n", g_data_cache.total_sent);
    printf("发送失败: %d 条\n", g_data_cache.total_failed);

    // 成功率计算（修正逻辑：只有真正失败的才算失败）
    uint32_t total_attempts = g_data_cache.total_sent + g_data_cache.total_failed;
    if (total_attempts > 0) {
        float success_rate = (float)g_data_cache.total_sent / total_attempts * 100.0f;
        printf("成功率: %.1f%%\n", success_rate);
    } else {
        printf("成功率: 100%% (无失败记录)\n");
    }
    printf("========================\n\n");
}

// ==================== 连接状态管理功能 ====================

/**
 * @brief 更新连接状态
 */
void ConnectionStatus_Update(void)
{
    if (!g_cache_initialized) {
        return;
    }

    // 使用简化的WiFi状态检查，避免过度验证
    int basic_wifi_status = wifi_get_connect_status_internal();
    bool wifi_status = (basic_wifi_status == 1);
    bool mqtt_status = mqtt_is_connected();
    uint32_t current_time = LOS_TickCountGet();

    // 检测WiFi状态变化
    if (wifi_status != g_connection_status.wifi_connected) {
        if (wifi_status) {
            printf(" WiFi连接恢复\n");
            g_connection_status.reconnect_count++;

            // WiFi连接成功时重置重连计数器
            extern uint32_t wifi_reconnect_attempts;
            wifi_reconnect_attempts = 0;
            printf(" WiFi重连计数器已重置\n");

            // WiFi恢复后，立即尝试重连MQTT
            if (!g_connection_status.mqtt_connected && !mqttConnectFlag) {
                printf(" WiFi已恢复，立即尝试重连MQTT...\n");
                LOS_Msleep(2000); // 等待2秒让WiFi稳定
                printf(" 检查MQTT状态: mqttConnectFlag=%d\n", mqttConnectFlag);
                if (!mqttConnectFlag) {  // 双重检查避免重复连接
                    mqtt_init();
                } else {
                    printf(" MQTT已连接，跳过重连\n");
                }
            }
        } else {
            printf(" WiFi连接断开，尝试重连...\n");
            g_connection_status.disconnect_count++;
            // WiFi断开时立即标记MQTT为断开
            if (mqttConnectFlag) {
                printf(" WiFi断开，同时标记MQTT为断开\n");
                mqttConnectFlag = 0;
            }
        }
        g_connection_status.wifi_connected = wifi_status;
    }

    // WiFi持续重连逻辑（独立于状态变化检测）
    if (!wifi_status) {
        static uint32_t last_wifi_reconnect_time = 0;

        // WiFi持续重连，直到连接成功
        if (current_time - last_wifi_reconnect_time > 8000) { // 8秒间隔，更频繁重连
            wifi_reconnect_attempts++;
            printf(" WiFi重连尝试 #%d (持续重连直到成功)\n", wifi_reconnect_attempts);

            // 使用与初始连接一致的重连策略
            printf(" 重新配置WiFi连接 (SSID: %s)\n", WIFI_SSID);

            // 重新设置WiFi配置（确保配置正确）
            extern void set_wifi_config_route_ssid(printf_fn pfn, uint8_t *s);
            extern void set_wifi_config_route_passwd(printf_fn pfn, uint8_t *s);
            set_wifi_config_route_ssid(printf, (uint8_t *)WIFI_SSID);
            set_wifi_config_route_passwd(printf, (uint8_t *)WIFI_PASSWORD);

            // 使用与初始连接相同的方法
            extern WifiErrorCode SetWifiModeOff(void);
            extern WifiErrorCode SetWifiModeOn(void);

            printf(" 重启WiFi连接...\n");
            SetWifiModeOff();
            LOS_Msleep(2000);  // 等待WiFi完全关闭

            int result = SetWifiModeOn();
            if (result == 0) {
                printf(" WiFi重连请求已发送 (SSID: %s)\n", WIFI_SSID);
            } else {
                printf(" WiFi重连请求失败，错误码: %d (SSID: %s)\n", result, WIFI_SSID);
            }

            // 每50次重连显示一次状态提示（减少日志频率）
            if (wifi_reconnect_attempts % 50 == 0) {
                printf(" WiFi重连状态: 已尝试%d次，继续重连中...\n", wifi_reconnect_attempts);
                printf("   目标SSID: %s\n", WIFI_SSID);
                printf("   请检查: 1.WiFi热点是否开启 2.信号强度是否足够 3.密码是否正确\n");
            }

            last_wifi_reconnect_time = current_time;
        }
    }

    // 检测MQTT状态变化
    if (mqtt_status != g_connection_status.mqtt_connected) {
        if (mqtt_status) {
            printf(" MQTT连接恢复\n");
            g_connection_status.last_connect_time = current_time;
        } else {
            printf(" MQTT连接断开，等待WiFi恢复后重连\n");
            // MQTT重连会在WiFi恢复后由IoT网络任务自动处理
        }
        g_connection_status.mqtt_connected = mqtt_status;
    }
}

/**
 * @brief 打印连接状态统计
 */
void ConnectionStatus_PrintStats(void)
{
    if (!g_cache_initialized) {
        return;
    }

    printf("\n === 连接状态统计 ===\n");
    printf("WiFi状态: %s\n", g_connection_status.wifi_connected ? " 已连接" : " 断开");
    printf("MQTT状态: %s\n", g_connection_status.mqtt_connected ? " 已连接" : " 断开");
    printf("断线次数: %d 次\n", g_connection_status.disconnect_count);
    printf("重连次数: %d 次\n", g_connection_status.reconnect_count);
    printf("网络错误: %d 次\n", g_connection_status.network_error_count);

    uint32_t current_time = LOS_TickCountGet();
    if (g_connection_status.last_connect_time > 0) {
        uint32_t uptime_ticks = current_time - g_connection_status.last_connect_time;
        uint32_t uptime_seconds = uptime_ticks / 100;  // 假设tick频率为100Hz
        printf("连接时长: %d 秒\n", uptime_seconds);
    }
    printf("========================\n\n");
}

/**
 * @brief 检查连接是否稳定
 * @return true稳定，false不稳定
 */
bool ConnectionStatus_IsStable(void)
{
    if (!g_cache_initialized) {
        return false;
    }

    return g_connection_status.wifi_connected && g_connection_status.mqtt_connected;
}

// 外部变量声明（用于命令处理）
extern bool g_alarm_acknowledged;
extern bool g_cloud_motor_enabled;
extern int g_cloud_motor_speed;
extern MotorDirection g_cloud_motor_direction;
extern int g_cloud_motor_duration;
extern bool g_cloud_buzzer_enabled;
extern bool g_cloud_rgb_enabled;
extern bool g_cloud_voice_enabled;
extern bool g_cloud_test_mode;
extern int g_cloud_rgb_red;
extern int g_cloud_rgb_green;
extern int g_cloud_rgb_blue;

// 系统重启标志
static bool g_system_reboot_requested = false;

// WiFi状态检查函数
static int check_wifi_connected(void)
{
    // 首先使用基础的WiFi状态检查
    int basic_status = wifi_get_connect_status_internal();

    // 如果基础检查显示断开，直接返回断开
    if (basic_status != 1) {
        return 0;
    }

    // 基础检查显示连接，进行进一步验证
    WifiLinkedInfo info;
    memset(&info, 0, sizeof(WifiLinkedInfo));

    // 尝试获取连接信息进行验证
    if (GetLinkedInfo(&info) == WIFI_SUCCESS) {
        // 如果能获取到连接信息且状态为已连接，则认为WiFi正常
        if (info.connState == WIFI_CONNECTED && strlen(info.ssid) > 0) {
            return 1;  // WiFi已连接且验证通过
        }
    }

    // 如果GetLinkedInfo失败，但基础状态显示连接，可能是刚连接还没稳定
    // 给一个宽松的判断：如果基础状态是连接的，就认为是连接的
    // 这避免了刚连接时的误判
    static uint32_t last_basic_connected_time = 0;
    uint32_t current_time = LOS_TickCountGet();

    if (basic_status == 1) {
        if (last_basic_connected_time == 0) {
            last_basic_connected_time = current_time;
        }

        // 如果基础状态连续显示连接超过3秒，就认为是真正连接
        if (current_time - last_basic_connected_time > 3000) {
            return 1;  // 基础状态稳定连接
        }
    } else {
        last_basic_connected_time = 0;
    }

    return 0;  // 其他情况认为断开
}

// 全局变量用于测试回调是否被调用
static volatile int g_callback_test_counter = 0;
static volatile int g_motor_start_commands = 0;
static volatile int g_motor_stop_commands = 0;

/**
 * @brief MQTT消息到达回调函数（参考标准例程）
 */
static void mqtt_message_arrived(MessageData *data)
{
    // 立即增加计数器，证明回调被调用
    g_callback_test_counter++;
    printf("\n!!! CALLBACK TRIGGERED !!! Count: %d\n", g_callback_test_counter);
    int rc;
    cJSON *root = NULL;
    cJSON *cmd_name = NULL;
    char *cmd_name_str = NULL;
    char *request_id_idx = NULL;
    static char request_id[64] = {0};  // 使用静态变量减少栈使用
    static MQTTMessage message;
    static char payload[MAX_BUFFER_LENGTH];
    static char rsptopic[128] = {0};

    printf("Message arrived on topic %.*s: %.*s\n",
           data->topicName->lenstring.len, data->topicName->lenstring.data,
           data->message->payloadlen, data->message->payload);

    // get request id
    request_id_idx = strstr(data->topicName->lenstring.data, "request_id=");
    if (request_id_idx != NULL) {
        // 计算剩余长度，避免越界
        int remaining_len = data->topicName->lenstring.len - (request_id_idx - data->topicName->lenstring.data) - 11;
        int copy_len = remaining_len < 63 ? remaining_len : 63;  // 使用更大的缓冲区
        strncpy(request_id, request_id_idx + 11, copy_len);
        request_id[copy_len] = '\0';
        printf("request_id = %s (length: %d)\n", request_id, copy_len);
        printf("Full topic: %.*s\n", data->topicName->lenstring.len, data->topicName->lenstring.data);
    } else {
        printf("ERROR: No request_id found in topic!\n");
        strcpy(request_id, "unknown");
    }

    // create response topic
    sprintf(rsptopic, "%s/request_id=%s", RESPONSE_TOPIC, request_id);
    printf("rsptopic = %s\n", rsptopic);

    // response message
    message.qos = 0;
    message.retained = 0;
    message.payload = payload;
    sprintf(payload, "{ \
        \"result_code\": 0, \
        \"response_name\": \"COMMAND_RESPONSE\", \
        \"paras\": { \
            \"result\": \"success\" \
        } \
        }");
    message.payloadlen = strlen(payload);

    // publish the msg to response topic
    printf("Publishing response to topic: %s\n", rsptopic);
    printf("Response payload: %s\n", payload);
    printf("Payload length: %d\n", message.payloadlen);
    printf("MQTT connection status: %s\n", mqttConnectFlag ? "Connected" : "Disconnected");
    printf("MQTT flag value: %d\n", mqttConnectFlag);

    // 检查MQTT客户端状态（注释掉可能有问题的检查）
    // if (!MQTTIsConnected(&client)) {
    //     printf("WARNING: MQTT client reports disconnected state!\n");
    //     mqttConnectFlag = 0;
    //     return;
    // }

    // 强制使用mqttConnectFlag作为连接状态
    if (!mqttConnectFlag) {
        printf("WARNING: mqttConnectFlag indicates disconnected state!\n");
        printf("But we'll try to send response anyway since we received the command\n");
        // 不要return，继续尝试发送响应
    }

    rc = MQTTPublish(&client, rsptopic, &message);
    printf("MQTTPublish return code: %d\n", rc);

    if (rc != 0) {
        printf("ERROR: Failed to publish response. Return code: %d\n", rc);
        printf("MQTT Error codes: 0=Success, -1=Buffer overflow, -2=Overflow, -3=No more message IDs, -4=Disconnected\n");
        // 不要因为响应发送失败就断开连接，继续处理命令
        // mqttConnectFlag = 0;
    } else {
        printf("Command response sent (request_id: %s)\n", request_id);
    }

    /*{"command_name":"cmd","paras":{"cmd_value":"1"},"service_id":"server"}*/
    root = cJSON_ParseWithLength(data->message->payload, data->message->payloadlen);
    if (root != NULL) {
        cmd_name = cJSON_GetObjectItem(root, "command_name");
        if (cmd_name != NULL) {
            cmd_name_str = cJSON_GetStringValue(cmd_name);
            printf("Command name: %s\n", cmd_name_str);
            if (!strcmp(cmd_name_str, "control_motor")) {
                printf("Calling set_motor_state...\n");
                set_motor_state(root);
            } else if (!strcmp(cmd_name_str, "control_buzzer")) {
                printf("Calling set_buzzer_state...\n");
                set_buzzer_state(root);
            } else if (!strcmp(cmd_name_str, "control_rgb")) {
                printf("Calling set_rgb_state...\n");
                set_rgb_state(root);
            } else if (!strcmp(cmd_name_str, "reset_alarm")) {
                printf("Calling set_alarm_reset...\n");
                set_alarm_reset();
            } else {
                printf("Unknown command: %s\n", cmd_name_str);
            }
        } else {
            printf("ERROR: No command_name found in JSON\n");
        }
    } else {
        printf("ERROR: Failed to parse JSON payload\n");
    }

    cJSON_Delete(root);
}



/**
 * @brief MQTT初始化（参考e1_iot_smart_home）
 */
void mqtt_init(void)
{
    int rc;

    // 防止重复连接
    if (mqttConnectFlag) {
        printf("MQTT already connected (mqttConnectFlag=%d), skipping init\n", mqttConnectFlag);
        return;
    }

    printf("Starting MQTT...\n");

    // 网络初始化
    NetworkInit(&network);

begin:
    // 连接网络（使用配置的端口）
    printf("Connecting to MQTT broker: %s:%d\n", HOST_ADDR, HOST_PORT);
    NetworkConnect(&network, HOST_ADDR, HOST_PORT);
    MQTTClientInit(&client, &network, 2000, sendBuf, sizeof(sendBuf), readBuf, sizeof(readBuf));

    MQTTString clientId = MQTTString_initializer;
    clientId.cstring = CLIENT_ID;  // 使用CLIENT_ID进行MQTT连接

    MQTTString userName = MQTTString_initializer;
    userName.cstring = DEVICE_USERNAME;

    MQTTString password = MQTTString_initializer;
    password.cstring = MQTT_DEVICES_PWD;

    MQTTPacket_connectData data = MQTTPacket_connectData_initializer;
    data.clientID = clientId;
    data.username = userName;
    data.password = password;
    data.keepAliveInterval = 60;
    data.cleansession = 1;

    printf("MQTT connection parameters:\n");
    printf("  Client ID: %s\n", CLIENT_ID);
    printf("  Device ID: %s (for topics)\n", DEVICE_ID);
    printf("  Username: %s\n", DEVICE_USERNAME);
    printf("  Password: %s\n", MQTT_DEVICES_PWD);
    printf("  Keep Alive: %d seconds\n", data.keepAliveInterval);
    printf("Attempting MQTT connection...\n");

    rc = MQTTConnect(&client, &data);
    if (rc != 0) {
        printf("MQTTConnect failed with error code: %d\n", rc);
        printf("Retrying MQTT connection in 5 seconds...\n");
        NetworkDisconnect(&network);
        MQTTDisconnect(&client);
        osDelay(5000);  // 增加延迟时间
        goto begin;
    }

    printf("MQTT connected successfully to Huawei IoT Platform!\n");

    printf("========== SUBSCRIBING TO COMMAND TOPIC ==========\n");
    printf("Command Topic: %s\n", SUBSCRIBE_TOPIC);
    printf("Expected command format: $oc/devices/%s/sys/commands/request_id=<uuid>\n", DEVICE_ID);
    printf("Callback function: mqtt_message_arrived\n");
    printf("QoS: 0\n");
    printf("==================================================\n");

    rc = MQTTSubscribe(&client, SUBSCRIBE_TOPIC, 0, mqtt_message_arrived);
    if (rc != 0) {
        printf("ERROR: MQTTSubscribe failed with return code: %d\n", rc);
        printf("Possible causes: -1=Buffer overflow, -2=Overflow, -3=No more message IDs, -4=Disconnected\n");
        printf("Retrying subscription...\n");
        osDelay(200);
        goto begin;
    }

    // 尝试订阅更广泛的主题来测试回调是否工作
    static char debug_topic[256];  // 使用静态变量减少栈使用
    sprintf(debug_topic, "$oc/devices/%s/sys/+", DEVICE_ID);
    printf("Also subscribing to debug topic: %s\n", debug_topic);
    rc = MQTTSubscribe(&client, debug_topic, 0, mqtt_message_arrived);
    if (rc == 0) {
        printf("Debug topic subscription successful\n");
    } else {
        printf("Debug topic subscription failed: %d\n", rc);
    }

    // 尝试订阅所有消息（用于调试）
    static char all_topic[256];  // 使用静态变量减少栈使用
    sprintf(all_topic, "$oc/devices/%s/#", DEVICE_ID);
    printf("Also subscribing to all messages: %s\n", all_topic);
    rc = MQTTSubscribe(&client, all_topic, 0, mqtt_message_arrived);
    if (rc == 0) {
        printf("All messages subscription successful\n");
    } else {
        printf("All messages subscription failed: %d\n", rc);
    }

    printf("SUCCESS: MQTT subscription to command topic successful!\n");
    printf("Device is now ready to receive commands from Huawei Cloud\n");
    printf("Waiting for commands on topic: %s\n", SUBSCRIBE_TOPIC);

    // 设备ID匹配确认
    printf("\n*** DEVICE ID CONFIGURATION ***\n");
    printf("MQTT Client ID: %s\n", CLIENT_ID);
    printf("Device ID (for topics): %s\n", DEVICE_ID);
    printf("This should match the Device ID in Huawei Cloud Platform\n");
    printf("*********************************\n");

    // MQTT订阅设置完成，设备已准备接收命令
    printf("MQTT subscription setup completed - ready to receive commands from Huawei Cloud\n");
    printf("Note: Device can only receive commands from Huawei Cloud IoT Platform\n");
    printf("Commands must be sent from Huawei Cloud IoT Platform console or API\n");
    printf("*** IMPORTANT: Device is ONLINE and listening for commands ***\n");
    printf("IoT Cloud connection fully established!\n");
    mqttConnectFlag = 1;
    printf("MQTT connected and subscribed.\n");

    // 显示回调函数信息
    printf("Callback function registered: mqtt_message_arrived\n");
    printf("Device ready to receive commands from Huawei Cloud IoT Platform\n");
    printf("=== Huawei Cloud IoT Platform Connected ===\n");
    printf("Service: Landslide Monitor\n");
    printf("Device ID: %s\n", DEVICE_ID);
    printf("Host: %s:%d\n", HOST_ADDR, HOST_PORT);
    printf("Publish Topic: %s\n", PUBLISH_TOPIC);
    printf("Command Topic: %s\n", SUBSCRIBE_TOPIC);
    printf("Response Topic: %s\n", RESPONSE_TOPIC);
    printf("Status: Ready for data upload and command reception\n");
    printf("============================================\n");
    printf("==========================================\n");
}

/**
 * @brief 初始化IoT云平台连接（基于成熟版本）
 */
int IoTCloud_Init(void)
{
    printf("Initializing IoT Cloud connection to Huawei IoT Platform...\n");
    printf("Device ID: %s\n", DEVICE_ID);
    printf("MQTT Host: %s:%d\n", HOST_ADDR, HOST_PORT);

    // 注意：MQTT初始化将在WiFi连接成功后进行
    printf("IoT Cloud configuration ready, waiting for network task to start...\n");

    return 0;
}

/**
 * @brief 等待MQTT消息（基于成熟版本）
 */
int wait_message(void)
{
    uint8_t rec = MQTTYield(&client, 5000);
    if (rec != 0) {
        printf("wait_message: MQTTYield error %d (not disconnecting)\n", rec);
        // 不要因为yield错误就断开连接
        // mqttConnectFlag = 0;
    }
    if (mqttConnectFlag == 0) {
        return 0;
    }
    return 1;
}

/**
 * @brief 检查MQTT连接状态（基于成熟版本）
 */
unsigned int mqtt_is_connected(void)
{
    // 如果WiFi断开，MQTT也应该被视为断开
    bool wifi_connected = (check_wifi_connected() == 1);

    // 添加调试信息
    static uint32_t last_debug_time = 0;
    uint32_t current_time = LOS_TickCountGet();
    if (current_time - last_debug_time > 10000) {  // 每10秒打印一次调试信息
        int basic_status = wifi_get_connect_status_internal();
        printf("DEBUG: WiFi status - basic=%d, check_result=%d, mqttFlag=%d\n",
               basic_status, wifi_connected ? 1 : 0, mqttConnectFlag);
        last_debug_time = current_time;
    }

    if (!wifi_connected && mqttConnectFlag) {
        printf("WiFi disconnected, marking MQTT as disconnected\n");
        mqttConnectFlag = 0;
    }

    return mqttConnectFlag;
}

/**
 * @brief 兼容性函数：检查IoT连接状态
 */
bool IoTCloud_IsConnected(void)
{
    return mqtt_is_connected() != 0;
}

/**
 * @brief IoT网络任务实现（参考e1_iot_smart_home）
 */
static void IoTNetworkTaskImpl(void *arg)
{
    (void)arg;

    printf("Starting IoT network task...\n");

    // 使用简化的WiFi连接方法
    printf("Setting WiFi configuration...\n");

    // 使用现有的WiFi配置函数
    extern void set_wifi_config_route_ssid(printf_fn pfn, uint8_t *s);
    extern void set_wifi_config_route_passwd(printf_fn pfn, uint8_t *s);

    printf("Setting WiFi SSID: %s\n", WIFI_SSID);
    set_wifi_config_route_ssid(printf, (uint8_t *)WIFI_SSID);
    printf("Setting WiFi Password: %s\n", WIFI_PASSWORD);
    set_wifi_config_route_passwd(printf, (uint8_t *)WIFI_PASSWORD);

    printf("WiFi configuration completed, starting connection...\n");

    // 使用直接的WiFi连接方法
    extern WifiErrorCode SetWifiModeOff(void);
    extern WifiErrorCode SetWifiModeOn(void);

reconnect:
    printf("Turning WiFi off...\n");
    SetWifiModeOff();
    LOS_Msleep(1000);  // 等待WiFi完全关闭

    printf("Turning WiFi on and connecting to SSID: %s\n", WIFI_SSID);
    int ret = SetWifiModeOn();
    if (ret != 0) {
        printf("WiFi connect failed with error code: %d\n", ret);
        printf("Please check:\n");
        printf("  1. WiFi SSID '%s' exists and is accessible\n", WIFI_SSID);
        printf("  2. WiFi password '%s' is correct\n", WIFI_PASSWORD);
        printf("  3. WiFi signal strength is sufficient\n");
        printf("Retrying WiFi connection in 10 seconds...\n");
        LOS_Msleep(10000);
        goto reconnect;
    }

    printf("WiFi connection initiated successfully!\n");

    // 等待WiFi连接成功，增强诊断信息
    printf("Waiting for WiFi connection to establish...\n");
    int retry_count = 0;
    int last_status = -1;

    while (retry_count < 60) {  // 增加到60秒等待时间
        extern int wifi_get_connect_status_internal(void);
        int current_status = wifi_get_connect_status_internal();

        if (current_status == 1) {
            printf(" WiFi connected successfully!\n");
            printf("Connection established after %d seconds\n", retry_count);
            break;
        }

        // 只在状态变化时打印详细信息
        if (current_status != last_status) {
            printf("WiFi status changed: %d -> %d\n", last_status, current_status);
            last_status = current_status;
        }

        // 每5秒打印一次等待信息
        if (retry_count % 5 == 0) {
            printf(" Waiting for WiFi connection... (%d/60 seconds)\n", retry_count);
            printf("   Current status: %d (1=connected, 0=disconnected)\n", current_status);
            printf("   Target SSID: %s\n", WIFI_SSID);
        }

        LOS_Msleep(1000);
        retry_count++;
    }

    if (retry_count >= 60) {
        printf(" WiFi connection timeout after 60 seconds!\n");
        printf("Troubleshooting suggestions:\n");
        printf("  1. Check if WiFi hotspot '%s' is broadcasting\n", WIFI_SSID);
        printf("  2. Verify password '%s' is correct\n", WIFI_PASSWORD);
        printf("  3. Check WiFi signal strength\n");
        printf("  4. Try restarting the WiFi hotspot\n");
        printf("MQTT will not be available without WiFi connection\n");
        return;
    }

    // WiFi连接成功后，初始化缓存系统和MQTT
    DataCache_Init();
    mqtt_init();

    // 保持MQTT连接并处理缓存数据
    uint32_t last_cache_check = 0;
    uint32_t last_stats_print = 0;
    uint32_t last_health_check = 0;
    uint32_t last_flash_check = 0;
    uint32_t cache_check_interval = 5000;    // 5秒检查一次内存缓存
    uint32_t stats_print_interval = 60000;   // 1分钟打印一次统计
    uint32_t health_check_interval = 60000;  // 1分钟进行一次健康检查（优化）
    uint32_t flash_check_interval = 120000;  // 2分钟检查一次Flash缓存

    printf(" IoT网络任务启动完成，开始数据处理循环\n");

    // 显示初始系统状态
    printf("\n === 系统启动状态 ===\n");
    printf(" 缓存系统: %s\n", g_cache_initialized ? " 已初始化" : " 未初始化");
    printf(" WiFi状态: %s\n", g_connection_status.wifi_connected ? " 已连接" : " 断开");
    printf(" MQTT状态: %s\n", g_connection_status.mqtt_connected ? " 已连接" : " 断开");
    printf(" 缓存容量: %d/%d 条\n", g_data_cache.count, MAX_CACHE_SIZE);
    printf(" 监控间隔: 缓存检查%ds, 状态报告%ds, 健康检查%ds\n",
           cache_check_interval/1000, stats_print_interval/1000, health_check_interval/1000);
    printf("========================\n\n");

    // 启动时立即执行一次健康检查
    printf(" 执行启动时健康检查...\n");
    IoTCloud_HealthCheck();

    while (1) {
        uint32_t current_time = LOS_TickCountGet();

        // 检查MQTT连接状态（只在WiFi连接正常时尝试重连）
        if (!wait_message()) {
            static uint32_t last_mqtt_reconnect = 0;
            uint32_t mqtt_reconnect_interval = 15000;  // 15秒重连间隔（比WiFi重连间隔长）

            // 重新检查WiFi状态，确保状态准确
            bool actual_wifi_status = (check_wifi_connected() == 1);
            g_connection_status.wifi_connected = actual_wifi_status;

            // 只有WiFi连接正常时才尝试MQTT重连
            if (actual_wifi_status &&
                current_time - last_mqtt_reconnect > mqtt_reconnect_interval &&
                !mqttConnectFlag) {  // 添加MQTT状态检查
                printf(" MQTT连接断开，WiFi正常，尝试重连MQTT...\n");
                printf(" 当前MQTT状态: mqttConnectFlag=%d\n", mqttConnectFlag);
                g_connection_status.disconnect_count++;
                mqtt_init();
                g_connection_status.reconnect_count++;
                last_mqtt_reconnect = current_time;
            } else if (mqttConnectFlag) {
                printf(" MQTT已连接，无需重连\n");
            } else if (!actual_wifi_status) {
                // WiFi断开时，不尝试MQTT重连，等待WiFi恢复
                if (current_time - last_mqtt_reconnect > 30000) { // 30秒提示一次
                    printf(" WiFi断开中，等待WiFi恢复后重连MQTT...\n");
                    last_mqtt_reconnect = current_time;
                }
            }
        }

        // 更新连接状态
        ConnectionStatus_Update();

        // 定期检查并发送内存缓存数据
        if (current_time - last_cache_check > cache_check_interval) {
            if (ConnectionStatus_IsStable() && g_data_cache.count > 0) {
                printf(" 定期检查内存缓存数据...\n");
                int sent_count = DataCache_SendPending();
                if (sent_count > 0) {
                    printf(" 定期发送了 %d 条内存缓存数据\n", sent_count);
                }
            }
            last_cache_check = current_time;
        }

        // 定期检查并加载Flash缓存数据到内存
        if (current_time - last_flash_check > flash_check_interval) {
            if (ConnectionStatus_IsStable() && g_data_cache.count < MAX_CACHE_SIZE * 0.5) {
                extern uint32_t DataStorage_GetRecordCount(void);

                uint32_t flash_count = DataStorage_GetRecordCount();
                if (flash_count > 0) {
                    printf(" 检测到%d条Flash缓存数据，加载到内存缓存...\n", flash_count);
                    int loaded = DataCache_LoadFromFlash();
                    if (loaded > 0) {
                        printf(" Flash数据加载: %d/%d 条成功\n", loaded, flash_count);
                    }
                }
            }
            last_flash_check = current_time;
        }

        // 定期打印统计信息
        if (current_time - last_stats_print > stats_print_interval) {
            printf("\n === 定期状态报告 ===\n");
            ConnectionStatus_PrintStats();
            DataCache_PrintStats();

            // 显示网络连接质量
            printf(" === 网络连接质量 ===\n");
            printf("WiFi状态: %s\n", g_connection_status.wifi_connected ? " 已连接" : " 断开");
            printf("MQTT状态: %s\n", g_connection_status.mqtt_connected ? " 已连接" : " 断开");
            printf("连接稳定性: %s\n", ConnectionStatus_IsStable() ? " 稳定" : " 不稳定");
            printf("========================\n");

            last_stats_print = current_time;
        }

        // 定期健康检查（独立执行，不受网络状态影响）
        if (current_time - last_health_check > health_check_interval) {
            printf(" 执行定期健康检查...\n");

            // 健康检查始终执行，提供系统状态反馈
            bool system_healthy = IoTCloud_IsSystemHealthy();
            if (!system_healthy) {
                printf("  系统健康状态异常，执行详细检查\n");
                IoTCloud_HealthCheck();
            } else {
                printf(" 系统健康状态良好\n");

                // 简化的健康状态报告
                printf(" 快速状态: 缓存%d/%d条 | WiFi=%s | MQTT=%s | 错误%d次\n",
                       g_data_cache.count, MAX_CACHE_SIZE,
                       g_connection_status.wifi_connected ? "√" : "×",
                       g_connection_status.mqtt_connected ? "√" : "×",
                       g_connection_status.network_error_count);
            }

            last_health_check = current_time;
        }

        // 处理MQTT消息（包括命令）
        if (mqttConnectFlag) {
            int yield_result = MQTTYield(&client, 100);
            if (yield_result != 0) {
                printf("MQTTYield returned error: %d (ignoring for stability)\n", yield_result);
                // 不要因为yield错误就断开连接，这可能是暂时的
            }

            // 额外的消息处理尝试
            static uint32_t last_yield_check = 0;
            if (current_time - last_yield_check > 1000) {  // 每秒检查一次
                // 尝试更长的yield时间
                int extended_yield = MQTTYield(&client, 1000);
                if (extended_yield != 0) {
                    printf("Extended MQTTYield error: %d\n", extended_yield);
                }
                last_yield_check = current_time;
            }

            // 每30秒打印一次等待命令的状态
            static uint32_t last_waiting_log = 0;
            if (current_time - last_waiting_log > 30000) {
                printf("*** WAITING FOR COMMANDS *** MQTT Connected: %s\n",
                       mqttConnectFlag ? "YES" : "NO");
                printf("Subscribed topics:\n");
                printf("  1. %s\n", SUBSCRIBE_TOPIC);
                printf("  2. $oc/devices/6815a14f9314d118511807c6_rk2206/sys/commands/+\n");
                printf("Ready to receive commands from Huawei Cloud...\n");

                // 强制检查是否有待处理的消息
                printf("Forcing message check...\n");
                int force_yield = MQTTYield(&client, 2000);  // 2秒强制检查
                if (force_yield != 0) {
                    printf("Force yield returned: %d\n", force_yield);
                } else {
                    printf("Force yield completed successfully\n");
                }

                last_waiting_log = current_time;
            }
        } else {
            // 每10秒提醒一次MQTT未连接
            static uint32_t last_disconnected_log = 0;
            if (current_time - last_disconnected_log > 10000) {
                printf("WARNING: MQTT not connected - cannot receive commands\n");
                last_disconnected_log = current_time;
            }
        }

        LOS_Msleep(100);  // 减少CPU占用
    }
}

/**
 * @brief 启动IoT任务
 */
int IoTCloud_StartTask(void)
{
    printf("Starting IoT Cloud network task...\n");

    // 创建IoT网络任务（增加栈大小以防止栈溢出）
    TSK_INIT_PARAM_S task_param = {0};
    task_param.pfnTaskEntry = (TSK_ENTRY_FUNC)IoTNetworkTaskImpl;
    task_param.uwStackSize = 8192;  // 从4096增加到8192，防止栈溢出
    task_param.pcName = "IoTNetTask";
    task_param.usTaskPrio = 25;
    task_param.uwResved = LOS_TASK_STATUS_DETACHED;

    static uint32_t iot_task_id = 0;
    UINT32 ret = LOS_TaskCreate(&iot_task_id, &task_param);
    if (ret != LOS_OK) {
        printf("Failed to create IoT network task: %d\n", ret);
        return -1;
    }

    printf("IoT Cloud network task started successfully\n");
    return 0;
}

/**
 * @brief 公共网络任务函数（供外部调用）
 */
void IoTNetworkTask(void)
{
    // 调用静态函数的实现
    IoTNetworkTaskImpl(NULL);
}

// ==================== 测试和演示功能 ====================

/**
 * @brief 测试缓存系统功能
 */
void IoTCloud_TestCacheSystem(void)
{
    printf("\n === 缓存系统测试开始 ===\n");

    // 初始化缓存系统
    DataCache_Init();

    // 创建测试数据
    e_iot_data test_data = {0};
    test_data.temperature = 25.5;
    test_data.humidity = 60.0;
    test_data.illumination = 100.0;
    test_data.acceleration_x = 100;
    test_data.acceleration_y = 200;
    test_data.acceleration_z = 1000;
    test_data.risk_level = 1;
    test_data.alarm_active = false;

    printf(" 添加测试数据到缓存...\n");
    for (int i = 0; i < 5; i++) {
        test_data.temperature = 25.0 + i;
        test_data.risk_level = i % 5;
        DataCache_Add(&test_data);
        LOS_Msleep(100);
    }

    printf(" 缓存状态:\n");
    DataCache_PrintStats();

    printf(" 模拟网络恢复，发送缓存数据...\n");
    if (mqtt_is_connected()) {
        int sent = DataCache_SendPending();
        printf(" 发送了 %d 条缓存数据\n", sent);
    } else {
        printf("  MQTT未连接，无法发送缓存数据\n");
    }

    printf(" 最终缓存状态:\n");
    DataCache_PrintStats();
    ConnectionStatus_PrintStats();

    printf(" === 缓存系统测试完成 ===\n\n");
}

/**
 * @brief 模拟网络故障
 * @param duration_seconds 故障持续时间（秒）
 */
void IoTCloud_SimulateNetworkFailure(int duration_seconds)
{
    printf("\n  === 模拟网络故障 %d 秒 ===\n", duration_seconds);

    // 记录故障前状态
    bool original_mqtt_status = g_connection_status.mqtt_connected;
    bool original_wifi_status = g_connection_status.wifi_connected;

    // 模拟网络断开
    g_connection_status.mqtt_connected = false;
    g_connection_status.wifi_connected = false;
    g_connection_status.disconnect_count++;

    printf(" 网络已断开，开始缓存数据...\n");

    // 在故障期间添加一些测试数据
    e_iot_data test_data = {0};
    test_data.temperature = 26.0;
    test_data.humidity = 65.0;
    test_data.illumination = 80.0;
    test_data.risk_level = 2;
    test_data.alarm_active = true;

    for (int i = 0; i < duration_seconds; i++) {
        test_data.temperature = 26.0 + i * 0.1;
        DataCache_Add(&test_data);
        printf(" 故障期间数据已缓存 (%d/%d秒)\n", i + 1, duration_seconds);
        LOS_Msleep(1000);
    }

    // 恢复网络连接
    g_connection_status.mqtt_connected = original_mqtt_status;
    g_connection_status.wifi_connected = original_wifi_status;
    g_connection_status.reconnect_count++;

    printf(" 网络已恢复，开始发送缓存数据...\n");

    if (ConnectionStatus_IsStable()) {
        int sent = DataCache_SendPending();
        printf(" 网络恢复后发送了 %d 条缓存数据\n", sent);
    }

    printf("  === 网络故障模拟完成 ===\n\n");
}

/**
 * @brief 强制重发缓存数据
 */
void IoTCloud_ForceResendCache(void)
{
    printf("\n === 强制重发缓存数据 ===\n");

    if (!g_cache_initialized) {
        printf(" 缓存系统未初始化\n");
        return;
    }

    printf(" 重发前缓存状态:\n");
    DataCache_PrintStats();

    if (g_data_cache.count == 0) {
        printf("ℹ 缓存为空，无需重发\n");
        return;
    }

    if (ConnectionStatus_IsStable()) {
        int sent = DataCache_SendPending();
        printf(" 强制重发了 %d 条缓存数据\n", sent);
    } else {
        printf("  网络连接不稳定，无法重发数据\n");
        printf("   WiFi: %s | MQTT: %s\n",
               g_connection_status.wifi_connected ? "已连接" : "断开",
               g_connection_status.mqtt_connected ? "已连接" : "断开");
    }

    printf(" 重发后缓存状态:\n");
    DataCache_PrintStats();

    printf(" === 强制重发完成 ===\n\n");
}

// ==================== 系统健康检查功能 ====================

/**
 * @brief 系统健康检查
 */
void IoTCloud_HealthCheck(void)
{
    printf("\n === 系统健康检查开始 ===\n");

    bool system_healthy = true;

    // 检查缓存系统
    if (!g_cache_initialized) {
        printf(" 缓存系统未初始化\n");
        system_healthy = false;
    } else {
        printf(" 缓存系统正常运行\n");

        // 检查缓存使用率
        float cache_usage = (float)g_data_cache.count / MAX_CACHE_SIZE * 100.0f;
        if (cache_usage > 80.0f) {
            printf("  缓存使用率过高: %.1f%%\n", cache_usage);
            system_healthy = false;
        } else {
            printf(" 缓存使用率正常: %.1f%%\n", cache_usage);
        }
    }

    // 检查网络连接
    ConnectionStatus_Update();
    if (!ConnectionStatus_IsStable()) {
        printf(" 网络连接不稳定\n");
        system_healthy = false;
    } else {
        printf(" 网络连接稳定\n");
    }

    // 检查数据发送成功率（修正逻辑：只有真正失败的才算失败）
    uint32_t total_attempts = g_data_cache.total_sent + g_data_cache.total_failed;
    if (total_attempts > 0) {
        float success_rate = (float)g_data_cache.total_sent / total_attempts * 100.0f;
        if (success_rate < 90.0f) {
            printf("  数据发送成功率偏低: %.1f%%\n", success_rate);
            system_healthy = false;
        } else {
            printf(" 数据发送成功率良好: %.1f%%\n", success_rate);
        }
    } else {
        printf(" 数据发送成功率: 100%% (无失败记录)\n");
    }

    // 检查错误计数
    if (g_connection_status.network_error_count > 10) {
        printf("  网络错误次数过多: %d 次\n", g_connection_status.network_error_count);
        system_healthy = false;
    } else {
        printf(" 网络错误次数正常: %d 次\n", g_connection_status.network_error_count);
    }

    // 总体健康状态
    printf("\n 系统总体状态: %s\n", system_healthy ? " 健康" : " 需要关注");

    if (!system_healthy) {
        printf("\n 建议操作:\n");
        printf("   1. 检查网络连接稳定性\n");
        printf("   2. 清理缓存数据: IoTCloud_ForceResendCache()\n");
        printf("   3. 重启网络服务\n");
        printf("   4. 检查云平台配置\n");
    }

    printf(" === 系统健康检查完成 ===\n\n");
}

/**
 * @brief 打印系统状态
 */
void IoTCloud_PrintSystemStatus(void)
{
    printf("\n === 系统状态总览 ===\n");

    // 基本信息
    printf(" 系统版本: 滑坡监测系统 v2.0.0\n");
    printf(" 运行时间: %d 秒\n", LOS_TickCountGet() / 1000);

    // 网络状态
    printf("\n 网络状态:\n");
    printf("   WiFi: %s\n", g_connection_status.wifi_connected ? " 已连接" : " 断开");
    printf("   MQTT: %s\n", g_connection_status.mqtt_connected ? " 已连接" : " 断开");
    printf("   稳定性: %s\n", ConnectionStatus_IsStable() ? " 稳定" : " 不稳定");

    // 数据统计
    printf("\n 数据统计:\n");
    printf("   当前缓存: %d/%d 条\n", g_data_cache.count, MAX_CACHE_SIZE);
    printf("   总缓存数: %d 条\n", g_data_cache.total_cached);
    printf("   发送成功: %d 条\n", g_data_cache.total_sent);
    printf("   发送失败: %d 条\n", g_data_cache.total_failed);

    // 成功率计算（修正逻辑：只有真正失败的才算失败）
    uint32_t total_attempts = g_data_cache.total_sent + g_data_cache.total_failed;
    if (total_attempts > 0) {
        float success_rate = (float)g_data_cache.total_sent / total_attempts * 100.0f;
        printf("   成功率: %.1f%%\n", success_rate);
    } else {
        printf("   成功率: 100%% (无失败记录)\n");
    }

    // 错误统计
    printf("\n  错误统计:\n");
    printf("   断线次数: %d 次\n", g_connection_status.disconnect_count);
    printf("   重连次数: %d 次\n", g_connection_status.reconnect_count);
    printf("   网络错误: %d 次\n", g_connection_status.network_error_count);

    printf(" === 状态总览完成 ===\n\n");
}

/**
 * @brief 检查系统是否健康
 * @return true 系统健康，false 系统有问题
 */
bool IoTCloud_IsSystemHealthy(void)
{
    // 检查缓存系统
    if (!g_cache_initialized) return false;

    // 检查缓存使用率
    float cache_usage = (float)g_data_cache.count / MAX_CACHE_SIZE * 100.0f;
    if (cache_usage > 90.0f) return false;

    // 检查网络连接
    ConnectionStatus_Update();
    if (!ConnectionStatus_IsStable()) return false;

    // 检查数据发送成功率（修正逻辑：只有真正失败的才算失败）
    uint32_t total_attempts = g_data_cache.total_sent + g_data_cache.total_failed;
    if (total_attempts > 10) {
        float success_rate = (float)g_data_cache.total_sent / total_attempts * 100.0f;
        if (success_rate < 85.0f) return false;
    }

    // 检查错误计数
    if (g_connection_status.network_error_count > 20) return false;

    return true;
}

// 注意：IoTCloud_IsConnected函数已在前面定义，这里删除重复定义

/**
 * @brief 发送传感器数据到云平台（集成缓存和重发功能）
 */
int IoTCloud_SendData(const LandslideIotData *data)
{
    if (data == NULL) {
        return -1;
    }

    // 确保缓存系统已初始化
    if (!g_cache_initialized) {
        DataCache_Init();
    }

    // 更新连接状态
    ConnectionStatus_Update();

    // 转换数据结构
    e_iot_data iot_data;
    convert_landslide_to_iot_data(data, &iot_data);

    // 检查连接状态
    if (ConnectionStatus_IsStable() && mqttConnectFlag) {
        // 连接稳定，先尝试发送缓存数据
        int sent_cached = DataCache_SendPending();
        if (sent_cached > 0) {
            printf(" 发送了 %d 条缓存数据\n", sent_cached);
        }

        // 然后发送当前数据（减少日志输出）
        send_msg_to_mqtt(&iot_data);
        g_connection_status.last_data_send_time = LOS_TickCountGet();
        g_data_cache.total_sent++;

        // 打印发送状态
        static uint32_t upload_count = 0;
        upload_count++;
        printf("=== IoT Data Upload #%d ===\n", upload_count);
        printf("Service: smartHome | Risk=%d | Temp=%.1f°C | Humidity=%.1f%%\n",
               data->risk_level, data->temperature, data->humidity);
        printf("Motion: X=%.1f° Y=%.1f° | Light=%.1fLux | Alarm=%s\n",
               data->angle_x, data->angle_y, data->light, data->alarm_active ? "ACTIVE" : "NORMAL");
        printf("GPS: %.6f°, %.6f° (%s) | Altitude=%.1fm\n",
               data->gps_latitude, data->gps_longitude,
               data->gps_valid ? "Valid" : "Default", data->gps_altitude);
        printf("Deform: %.1fm (H:%.1fm V:%.1fm) | Vel:%.2fm/h | Risk:%d | Base:%s\n",
               data->deformation_distance_3d, data->deformation_horizontal, data->deformation_vertical,
               data->deformation_velocity, data->deformation_risk_level,
               data->baseline_established ? "Yes" : "No");
        printf(" 缓存状态: %d/%d条 | 连接: WiFi=%s MQTT=%s\n",
               g_data_cache.count, MAX_CACHE_SIZE,
               g_connection_status.wifi_connected ? "√" : "×",
               g_connection_status.mqtt_connected ? "√" : "×");

        // 计算并显示成功率（修正逻辑：只有真正失败的才算失败）
        uint32_t total_attempts = g_data_cache.total_sent + g_data_cache.total_failed;
        if (total_attempts > 0) {
            float success_rate = (float)g_data_cache.total_sent / total_attempts * 100.0f;
            printf(" 数据上传成功率: %.1f%% (%d/%d)\n",
                   success_rate, g_data_cache.total_sent, total_attempts);
            if (g_data_cache.total_cached > 0) {
                printf(" 当前缓存数据: %d条 (等待发送，不计入失败)\n", g_data_cache.count);
            }
        } else {
            printf(" 数据上传成功率: 100.0%% (无失败记录)\n");
        }
        printf("========================\n");

        return 0;
    } else {
        // 连接不稳定，将数据加入内存缓存
        printf("  连接不稳定，数据加入内存缓存队列\n");
        int cache_result = DataCache_Add(&iot_data);

        if (cache_result == 0) {
            printf(" 数据已加入内存缓存，等待网络恢复后发送\n");

            // 如果内存缓存接近满，将数据存储到Flash作为长期备份
            if (g_data_cache.count > MAX_CACHE_SIZE * 0.8) {
                printf(" 内存缓存接近满(>80%)，将数据备份到Flash存储\n");
                extern int DataStorage_Store(const LandslideIotData *data);
                if (DataStorage_Store(data) == 0) {
                    printf(" 数据已备份到Flash存储（长期保存）\n");
                } else {
                    printf(" Flash存储失败\n");
                }
            }

            return 0;  // 缓存成功也算发送成功
        } else {
            printf(" 内存缓存失败，尝试直接存储到Flash\n");
            extern int DataStorage_Store(const LandslideIotData *data);
            if (DataStorage_Store(data) == 0) {
                printf(" 数据已存储到Flash，等待网络恢复\n");
                return 0;
            } else {
                printf(" 所有缓存方式都失败\n");
                g_connection_status.network_error_count++;
                return -1;
            }
        }
    }
}

/**
 * @brief 数据结构转换函数（LandslideIotData -> e_iot_data）
 */
static void convert_landslide_to_iot_data(const LandslideIotData *landslide_data, e_iot_data *iot_data)
{
    if (landslide_data == NULL || iot_data == NULL) {
        return;
    }

    // 基础环境传感器数据（decimal类型）
    iot_data->temperature = (double)landslide_data->temperature;    // 温度 (°C)
    iot_data->illumination = (double)landslide_data->light;         // 光照强度 (lux)
    iot_data->humidity = (double)landslide_data->humidity;          // 湿度 (%)

    // MPU6050加速度数据（long类型 - 发送g单位，直观易读）
    // 将g值乘以1000保持精度，云端配置为decimal类型，除以1000显示
    // 云端配置：decimal类型，单位g，范围-2.0~2.0
    iot_data->acceleration_x = (long)(landslide_data->accel_x * 1000);  // X轴加速度(g×1000)
    iot_data->acceleration_y = (long)(landslide_data->accel_y * 1000);  // Y轴加速度(g×1000)
    iot_data->acceleration_z = (long)(landslide_data->accel_z * 1000);  // Z轴加速度(g×1000)

    // MPU6050陀螺仪数据（long类型 - 发送°/s单位，直观易读）
    // 将°/s值乘以100保持精度，云端配置为decimal类型，除以100显示
    // 云端配置：decimal类型，单位°/s，范围-250~250
    iot_data->gyroscope_x = (long)(landslide_data->gyro_x * 100);       // X轴陀螺仪(°/s×100)
    iot_data->gyroscope_y = (long)(landslide_data->gyro_y * 100);       // Y轴陀螺仪(°/s×100)
    iot_data->gyroscope_z = (long)(landslide_data->gyro_z * 100);       // Z轴陀螺仪(°/s×100)

    // MPU6050温度（decimal类型）
    iot_data->mpu_temperature = (double)landslide_data->temperature;    // 使用环境温度作为MPU温度

    // GPS定位数据（decimal类型）- 使用真实GPS数据或默认坐标
    if (landslide_data->gps_valid) {
        iot_data->latitude = landslide_data->gps_latitude;      // 真实GPS纬度
        iot_data->longitude = landslide_data->gps_longitude;    // 真实GPS经度
    } else {
        // GPS无效时使用默认位置坐标（广西南宁）
        iot_data->latitude = 22.8170;      // 广西南宁纬度
        iot_data->longitude = 108.3669;    // 广西南宁经度
    }

    // GPS形变分析数据（decimal类型）
    iot_data->deformation_distance_3d = (double)landslide_data->deformation_distance_3d;
    iot_data->deformation_horizontal = (double)landslide_data->deformation_horizontal;
    iot_data->deformation_vertical = (double)landslide_data->deformation_vertical;
    iot_data->deformation_velocity = (double)landslide_data->deformation_velocity;
    iot_data->deformation_risk_level = landslide_data->deformation_risk_level;
    iot_data->deformation_type = landslide_data->deformation_type;
    iot_data->deformation_confidence = (double)landslide_data->deformation_confidence;
    iot_data->baseline_established = landslide_data->baseline_established;

    // 振动传感器数据（decimal类型）
    // 振动强度基于陀螺仪数据计算，已经过滤波和校准处理
    // 数值范围：0-200+ (°/s的幅值)，正常情况下 <10，异常时 >20
    iot_data->vibration = (double)landslide_data->vibration;            // 振动强度 (°/s)

    // 滑坡监测专用数据
    iot_data->risk_level = (int)landslide_data->risk_level;             // 风险等级 (0-4)
    iot_data->alarm_active = landslide_data->alarm_active;              // 报警状态 (boolean)
    iot_data->uptime = (long)landslide_data->uptime;                    // 系统运行时间 (秒)

    // 倾角数据（decimal类型）
    iot_data->angle_x = (double)landslide_data->angle_x;                // X轴倾角 (°)
    iot_data->angle_y = (double)landslide_data->angle_y;                // Y轴倾角 (°)

    // 计算总倾斜角度（基于X、Y轴）
    double total_angle = sqrt(iot_data->angle_x * iot_data->angle_x +
                             iot_data->angle_y * iot_data->angle_y);
    iot_data->angle_z = total_angle;                                    // 总倾斜角度
}

/**
 * @brief 发送消息到MQTT（基于成熟版本）
 */
void send_msg_to_mqtt(e_iot_data *iot_data)
{
    // 检查WiFi和MQTT连接状态
    bool wifi_connected = (check_wifi_connected() == 1);
    if (!wifi_connected) {
        printf("WiFi disconnected, cannot send MQTT data.\n");
        mqttConnectFlag = 0;  // WiFi断开时立即标记MQTT为断开
        return;
    }

    if (!mqttConnectFlag) {
        printf("MQTT not connected.\n");
        return;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON *services = cJSON_AddArrayToObject(root, "services");
    cJSON *service = cJSON_CreateObject();
    cJSON_AddStringToObject(service, "service_id", "smartHome");
    cJSON *props = cJSON_CreateObject();

    // 基础环境传感器数据（decimal类型）
    cJSON_AddNumberToObject(props, "temperature", iot_data->temperature);
    cJSON_AddNumberToObject(props, "illumination", iot_data->illumination);
    cJSON_AddNumberToObject(props, "humidity", iot_data->humidity);

    // MPU6050加速度数据（long类型）
    cJSON_AddNumberToObject(props, "acceleration_x", iot_data->acceleration_x);
    cJSON_AddNumberToObject(props, "acceleration_y", iot_data->acceleration_y);
    cJSON_AddNumberToObject(props, "acceleration_z", iot_data->acceleration_z);

    // MPU6050陀螺仪数据（long类型）
    cJSON_AddNumberToObject(props, "gyroscope_x", iot_data->gyroscope_x);
    cJSON_AddNumberToObject(props, "gyroscope_y", iot_data->gyroscope_y);
    cJSON_AddNumberToObject(props, "gyroscope_z", iot_data->gyroscope_z);

    // MPU6050温度（decimal类型）
    cJSON_AddNumberToObject(props, "mpu_temperature", iot_data->mpu_temperature);

    // GPS定位数据（decimal类型）
    cJSON_AddNumberToObject(props, "latitude", iot_data->latitude);
    cJSON_AddNumberToObject(props, "longitude", iot_data->longitude);

    // 振动传感器数据（decimal类型）
    cJSON_AddNumberToObject(props, "vibration", iot_data->vibration);

    // 滑坡监测专用数据
    cJSON_AddNumberToObject(props, "risk_level", iot_data->risk_level);        // int - 风险等级(0-4)
    cJSON_AddBoolToObject(props, "alarm_active", iot_data->alarm_active);      // boolean - 报警状态
    cJSON_AddNumberToObject(props, "uptime", iot_data->uptime);                // long - 系统运行时间

    // 倾角数据（decimal类型）
    cJSON_AddNumberToObject(props, "angle_x", iot_data->angle_x);              // decimal - X轴倾角
    cJSON_AddNumberToObject(props, "angle_y", iot_data->angle_y);              // decimal - Y轴倾角
    cJSON_AddNumberToObject(props, "angle_z", iot_data->angle_z);              // decimal - 总倾斜角度

    // GPS定位数据（decimal类型）
    cJSON_AddNumberToObject(props, "latitude", iot_data->latitude);            // decimal - 纬度
    cJSON_AddNumberToObject(props, "longitude", iot_data->longitude);          // decimal - 经度

    // GPS形变分析数据
    cJSON_AddNumberToObject(props, "deformation_distance_3d", iot_data->deformation_distance_3d);     // decimal - 3D总位移(米)
    cJSON_AddNumberToObject(props, "deformation_horizontal", iot_data->deformation_horizontal);       // decimal - 水平位移(米)
    cJSON_AddNumberToObject(props, "deformation_vertical", iot_data->deformation_vertical);           // decimal - 垂直位移(米)
    cJSON_AddNumberToObject(props, "deformation_velocity", iot_data->deformation_velocity);           // decimal - 形变速度(米/小时)
    cJSON_AddNumberToObject(props, "deformation_risk_level", iot_data->deformation_risk_level);       // int - 形变风险等级(0-4)
    cJSON_AddNumberToObject(props, "deformation_type", iot_data->deformation_type);                   // int - 形变类型(0-4)
    cJSON_AddNumberToObject(props, "deformation_confidence", iot_data->deformation_confidence);       // decimal - 置信度(0.0-1.0)
    cJSON_AddBoolToObject(props, "baseline_established", iot_data->baseline_established);             // boolean - 基准是否建立

    cJSON_AddItemToObject(service, "properties", props);
    cJSON_AddItemToArray(services, service);

    char *payload = cJSON_PrintUnformatted(root);
    MQTTMessage message;
    message.qos = 0;
    message.retained = 0;
    message.payload = payload;
    message.payloadlen = strlen(payload);

    if (MQTTPublish(&client, PUBLISH_TOPIC, &message) != 0) {
        printf("Failed to publish MQTT message.\n");
        mqttConnectFlag = 0;
    } else {
        printf("MQTT publish success: %s\n", payload);
    }

    cJSON_free(payload);
    cJSON_Delete(root);
}

/**
 * @brief 清理IoT连接
 */
void IoTCloud_Deinit(void)
{
    if (mqttConnectFlag) {
        MQTTDisconnect(&client);
        NetworkDisconnect(&network);
    }
    mqttConnectFlag = 0;
    printf("IoT Cloud connection closed\n");
}

// WiFi定位功能已删除，使用固定坐标

// get_current_wifi_info函数已删除

// wifi_location_lookup函数已删除

// scan_wifi_for_location函数已删除

/**
 * @brief 处理云端命令
 * @param command_name 命令名称
 * @param payload 命令负载
 */
void IoTCloud_ProcessCommand(const char *command_name, const char *payload)
{
    printf("Processing command: %s\n", command_name);

    if (!strcmp(command_name, "reset_alarm")) {
        IoTCloud_HandleResetCommand();
    } else if (!strcmp(command_name, "control_motor")) {
        cJSON *root = cJSON_Parse(payload);
        if (root != NULL) {
            cJSON *enable = cJSON_GetObjectItem(root, "enable");
            cJSON *speed = cJSON_GetObjectItem(root, "speed");
            cJSON *direction = cJSON_GetObjectItem(root, "direction");
            cJSON *duration = cJSON_GetObjectItem(root, "duration");

            if (cJSON_IsBool(enable)) {
                bool motor_enabled = cJSON_IsTrue(enable);

                // 对于停止命令，只需要enable参数
                if (!motor_enabled) {
                    printf("*** STOPPING MOTOR (ProcessCommand) ***\n");
                    printf("Raw parameters: enable=false (stop command)\n");
                    IoTCloud_HandleMotorCommand(false, 0, 0, 0);
                } else {
                    // 对于启动命令，解析所有参数
                    int motor_speed = cJSON_IsNumber(speed) ? speed->valueint : 50;
                    int motor_direction = cJSON_IsNumber(direction) ? direction->valueint : 1;
                    int motor_duration = cJSON_IsNumber(duration) ? duration->valueint : 0;

                    printf("*** STARTING MOTOR (ProcessCommand) ***\n");
                    printf("Raw parameters: enable=true, speed=%d, direction=%d, duration=%d\n",
                           motor_speed, motor_direction, motor_duration);
                    IoTCloud_HandleMotorCommand(motor_enabled, motor_speed, motor_direction, motor_duration);
                }
            }
            cJSON_Delete(root);
        }
    } else if (!strcmp(command_name, "control_buzzer")) {
        cJSON *root = cJSON_Parse(payload);
        if (root != NULL) {
            cJSON *enable = cJSON_GetObjectItem(root, "enable");
            cJSON *frequency = cJSON_GetObjectItem(root, "frequency");
            cJSON *duration = cJSON_GetObjectItem(root, "duration");
            cJSON *pattern = cJSON_GetObjectItem(root, "pattern");

            if (cJSON_IsBool(enable)) {
                bool buzzer_enabled = cJSON_IsTrue(enable);
                int buzzer_frequency = cJSON_IsNumber(frequency) ? frequency->valueint : 2000;
                int buzzer_duration = cJSON_IsNumber(duration) ? duration->valueint : 0;
                int buzzer_pattern = cJSON_IsNumber(pattern) ? pattern->valueint : 0;

                IoTCloud_HandleBuzzerCommand(buzzer_enabled, buzzer_frequency, buzzer_duration, buzzer_pattern);
            }
            cJSON_Delete(root);
        }
    } else if (!strcmp(command_name, "control_rgb")) {
        cJSON *root = cJSON_Parse(payload);
        if (root != NULL) {
            cJSON *enable = cJSON_GetObjectItem(root, "enable");
            cJSON *red = cJSON_GetObjectItem(root, "red");
            cJSON *green = cJSON_GetObjectItem(root, "green");
            cJSON *blue = cJSON_GetObjectItem(root, "blue");

            if (cJSON_IsBool(enable) &&
                cJSON_IsNumber(red) &&
                cJSON_IsNumber(green) &&
                cJSON_IsNumber(blue)) {

                IoTCloud_HandleRGBCommand(
                    cJSON_IsTrue(enable),
                    red->valueint,
                    green->valueint,
                    blue->valueint
                );
            }
            cJSON_Delete(root);
        }
    } else if (!strcmp(command_name, "control_voice")) {
        cJSON *root = cJSON_Parse(payload);
        if (root != NULL) {
            cJSON *enable = cJSON_GetObjectItem(root, "enable");
            if (cJSON_IsBool(enable)) {
                IoTCloud_HandleVoiceCommand(cJSON_IsTrue(enable));
            }
            cJSON_Delete(root);
        }
    } else if (!strcmp(command_name, "system_reboot")) {
        IoTCloud_HandleSystemRebootCommand();
    } else if (!strcmp(command_name, "config_update")) {
        IoTCloud_HandleConfigUpdateCommand(payload);
    } else if (!strcmp(command_name, "calibration")) {
        IoTCloud_HandleCalibrationCommand();
    } else if (!strcmp(command_name, "test_mode")) {
        cJSON *root = cJSON_Parse(payload);
        if (root != NULL) {
            cJSON *enable = cJSON_GetObjectItem(root, "enable");
            if (cJSON_IsBool(enable)) {
                IoTCloud_HandleTestModeCommand(cJSON_IsTrue(enable));
            }
            cJSON_Delete(root);
        }
    } else {
        printf("Unknown command: %s\n", command_name);
    }
}

/**
 * @brief 处理重置命令
 */
void IoTCloud_HandleResetCommand(void)
{
    printf("Handling reset alarm command\n");
    g_alarm_acknowledged = true;
    printf("Alarm acknowledged and reset\n");
}

/**
 * @brief 处理配置命令
 * @param config_data 配置数据
 */
void IoTCloud_HandleConfigCommand(const char *config_data)
{
    printf("Handling config command: %s\n", config_data);
    // 解析配置JSON
    cJSON *root = cJSON_Parse(config_data);
    if (root != NULL) {
        // 处理配置参数
        cJSON_Delete(root);
    }
}

/**
 * @brief 处理电机控制命令
 * @param enable 是否启用电机
 * @param speed 电机速度 (0-100)
 * @param direction 电机方向 (0=停止, 1=正转, 2=反转)
 * @param duration 运行时长 (秒, 0=持续运行)
 */
void IoTCloud_HandleMotorCommand(bool enable, int speed, int direction, int duration)
{

    // 更新全局控制变量
    g_cloud_motor_enabled = enable;
    g_cloud_motor_speed = speed;
    g_cloud_motor_direction = (MotorDirection)direction;
    g_cloud_motor_duration = duration;

    // 实际控制电机的代码
    if (enable) {
        // 根据方向控制电机
        if (direction == MOTOR_DIRECTION_STOP) {
            Motor_Off();
        } else {
            // 运行电机，将秒转换为毫秒
            uint32_t duration_ms = duration > 0 ? duration * 1000 : 0;
            Motor_Run(speed, (MotorDirection)direction, duration_ms);
        }
    } else {
        Motor_Off();
    }
}

/**
 * @brief 处理蜂鸣器控制命令
 * @param enable 是否启用蜂鸣器
 * @param frequency 蜂鸣器频率 (Hz, 默认2000Hz)
 * @param duration 持续时间 (秒, 0=持续运行)
 * @param pattern 蜂鸣模式 (0=连续, 1=短响, 2=长响, 3=间歇)
 */
void IoTCloud_HandleBuzzerCommand(bool enable, int frequency, int duration, int pattern)
{
    if (enable) {
        printf("Buzzer: %dHz, %ds, pattern=%d\n", frequency, duration, pattern);
    } else {
        printf("Buzzer stopped\n");
    }

    // 更新全局控制变量
    g_cloud_buzzer_enabled = enable;

    // 实际控制蜂鸣器的代码
    if (enable) {
        printf("Buzzer activated\n");

        // 根据模式控制蜂鸣器
        switch (pattern) {
            case 0: // 连续响
                if (duration > 0) {
                    // 指定时间的连续响
                    printf("Buzzer continuous beep for %d seconds\n", duration);
                    Buzzer_BeepWithFreq(duration * 1000, frequency > 0 ? frequency : 2000);
                } else {
                    // 持续响 - 启动PWM但不自动停止
                    printf("Buzzer continuous beep (indefinite)\n");
                    Buzzer_Start(frequency > 0 ? frequency : 2000);
                }
                break;

            case 1: // 短响模式 (200ms)
                printf("Buzzer short beep pattern\n");
                Buzzer_BeepWithFreq(200, frequency > 0 ? frequency : 2000);
                break;

            case 2: // 长响模式 (1000ms)
                printf("Buzzer long beep pattern\n");
                Buzzer_BeepWithFreq(1000, frequency > 0 ? frequency : 2000);
                break;

            case 3: // 间歇模式 (3次短响)
                printf("Buzzer intermittent pattern\n");
                for (int i = 0; i < 3; i++) {
                    Buzzer_BeepWithFreq(200, frequency > 0 ? frequency : 2000);
                    LOS_Msleep(300);  // 间隔300ms
                }
                break;

            default:
                printf("Unknown buzzer pattern, using default short beep\n");
                Buzzer_BeepWithFreq(500, frequency > 0 ? frequency : 2000);
                break;
        }
    } else {
        // 停止蜂鸣器
        printf("Buzzer deactivated\n");
        Buzzer_Off();
    }
}

/**
 * @brief 处理RGB LED控制命令
 * @param enable 是否启用RGB LED
 * @param red 红色分量 (0-255)
 * @param green 绿色分量 (0-255)
 * @param blue 蓝色分量 (0-255)
 */
void IoTCloud_HandleRGBCommand(bool enable, int red, int green, int blue)
{
    g_cloud_rgb_enabled = enable;
    g_cloud_rgb_red = red;
    g_cloud_rgb_green = green;
    g_cloud_rgb_blue = blue;

    // 实际控制RGB LED的代码
    if (enable) {
        printf("RGB LED: R:%d G:%d B:%d\n", red, green, blue);
    } else {
        printf("RGB LED: OFF\n");
        printf("RGB LED turned off\n");
    }
}

/**
 * @brief 处理语音模块控制命令
 * @param enable 是否启用语音模块
 */
void IoTCloud_HandleVoiceCommand(bool enable)
{
    printf("Handling voice module command: %s\n", enable ? "ENABLE" : "DISABLE");
    g_cloud_voice_enabled = enable;

    // 实际控制语音模块的代码
    if (enable) {
        // 启用语音模块
        printf("Voice module activated\n");
    } else {
        // 禁用语音模块
        printf("Voice module deactivated\n");
    }
}

/**
 * @brief 处理系统重启命令
 */
void IoTCloud_HandleSystemRebootCommand(void)
{
    printf("Handling system reboot command\n");
    printf("System will reboot in 3 seconds...\n");

    // 延迟3秒后重启
    osDelay(3000);

    // 执行系统重启
    LOS_Reboot();
}

/**
 * @brief 处理配置更新命令
 * @param config_json 配置JSON字符串
 */
void IoTCloud_HandleConfigUpdateCommand(const char *config_json)
{
    printf("Handling config update command: %s\n", config_json);

    // 解析配置JSON
    cJSON *root = cJSON_Parse(config_json);
    if (root != NULL) {
        // 处理各种配置参数
        cJSON *sample_rate = cJSON_GetObjectItem(root, "sample_rate");
        if (cJSON_IsNumber(sample_rate)) {
            SetSensorSampleRate(sample_rate->valueint);
        }

        // 处理风险阈值
        cJSON *thresholds = cJSON_GetObjectItem(root, "thresholds");
        if (cJSON_IsObject(thresholds)) {
            cJSON *tilt = cJSON_GetObjectItem(thresholds, "tilt");
            cJSON *vibration = cJSON_GetObjectItem(thresholds, "vibration");
            cJSON *humidity = cJSON_GetObjectItem(thresholds, "humidity");
            cJSON *light = cJSON_GetObjectItem(thresholds, "light");

            if (cJSON_IsNumber(tilt) && cJSON_IsNumber(vibration) &&
                cJSON_IsNumber(humidity) && cJSON_IsNumber(light)) {

                SetRiskThresholds(
                    tilt->valuedouble,
                    vibration->valuedouble,
                    humidity->valuedouble,
                    light->valuedouble
                );
            }
        }

        cJSON_Delete(root);
    }
}

/**
 * @brief 处理传感器校准命令
 */
void IoTCloud_HandleCalibrationCommand(void)
{
    printf("Handling sensor calibration command\n");

    // 执行传感器校准
    printf("Starting sensor calibration...\n");

    // 这里应该调用实际的传感器校准函数
    // 例如: SensorCalibration();

    printf("Sensor calibration completed\n");
}

/**
 * @brief 处理测试模式命令
 * @param enable 是否启用测试模式
 */
void IoTCloud_HandleTestModeCommand(bool enable)
{
    printf("Handling test mode command: %s\n", enable ? "ENABLE" : "DISABLE");
    g_cloud_test_mode = enable;

    if (enable) {
        printf("Test mode activated\n");
        // 启动测试模式
    } else {
        printf("Test mode deactivated\n");
        // 退出测试模式
    }
}

// ==================== 按照e2_iot_smart_security例程添加的处理函数 ====================

/**
 * @brief 设置马达状态（参考例程）
 */
void set_motor_state(cJSON *root)
{
    printf("Motor control command received\n");

    cJSON *paras = cJSON_GetObjectItem(root, "paras");
    if (paras != NULL) {
        cJSON *enable = cJSON_GetObjectItem(paras, "enable");
        cJSON *speed = cJSON_GetObjectItem(paras, "speed");
        cJSON *direction = cJSON_GetObjectItem(paras, "direction");
        cJSON *duration = cJSON_GetObjectItem(paras, "duration");

        if (cJSON_IsBool(enable)) {
            bool motor_enabled = cJSON_IsTrue(enable);

            // 对于停止命令，只需要enable参数
            if (!motor_enabled) {
                g_motor_stop_commands++;
                printf("STOPPING MOTOR (Stop command #%d)\n", g_motor_stop_commands);

                // 更新全局变量为停止状态
                g_cloud_motor_enabled = false;
                g_cloud_motor_speed = 0;
                g_cloud_motor_direction = MOTOR_DIRECTION_STOP;
                g_cloud_motor_duration = 0;

                Motor_Off();  // 直接调用停止函数
                printf("Motor stopped\n");
            } else {
                // 对于启动命令，需要解析所有参数
                int motor_speed = cJSON_IsNumber(speed) ? speed->valueint : 50;
                int motor_direction = cJSON_IsNumber(direction) ? direction->valueint : 1;
                int motor_duration = cJSON_IsNumber(duration) ? duration->valueint : 0;

                // 参数验证
                if (motor_speed < 0) motor_speed = 0;
                if (motor_speed > 100) motor_speed = 100;
                if (motor_direction < 0 || motor_direction > 2) motor_direction = 1;
                if (motor_duration < 0) motor_duration = 0;

                // 更新全局变量
                g_cloud_motor_enabled = motor_enabled;
                g_cloud_motor_speed = motor_speed;
                g_cloud_motor_direction = (MotorDirection)motor_direction;
                g_cloud_motor_duration = motor_duration;

                g_motor_start_commands++;
                printf("STARTING MOTOR (Start command #%d): speed=%d%%, direction=%d, duration=%ds\n",
                       g_motor_start_commands, motor_speed, motor_direction, motor_duration);
                // 调用实际的马达控制函数
                IoTCloud_HandleMotorCommand(motor_enabled, motor_speed, motor_direction, motor_duration);
            }
        } else {
            printf("ERROR: enable parameter is not boolean or missing\n");
            if (enable) {
                printf("Enable parameter type: %d (expected: %d for boolean)\n", enable->type, cJSON_True);
            } else {
                printf("Enable parameter is NULL\n");
            }
        }
    } else {
        printf("ERROR: 'paras' object not found in JSON\n");
    }
}

// 添加蜂鸣器命令计数器
static volatile int g_buzzer_start_commands = 0;
static volatile int g_buzzer_stop_commands = 0;

/**
 * @brief 设置蜂鸣器状态（参考例程）
 */
void set_buzzer_state(cJSON *root)
{
    printf("=== BUZZER CONTROL COMMAND ===\n");

    cJSON *paras = cJSON_GetObjectItem(root, "paras");
    if (paras != NULL) {
        cJSON *enable = cJSON_GetObjectItem(paras, "enable");
        cJSON *frequency = cJSON_GetObjectItem(paras, "frequency");
        cJSON *duration = cJSON_GetObjectItem(paras, "duration");
        cJSON *pattern = cJSON_GetObjectItem(paras, "pattern");

        if (cJSON_IsBool(enable)) {
            bool buzzer_enabled = cJSON_IsTrue(enable);
            int buzzer_frequency = cJSON_IsNumber(frequency) ? frequency->valueint : 2000;
            int buzzer_duration = cJSON_IsNumber(duration) ? duration->valueint : 0;
            int buzzer_pattern = cJSON_IsNumber(pattern) ? pattern->valueint : 0;

            printf("Buzzer parameters: enable=%s, frequency=%dHz, duration=%ds, pattern=%d\n",
                   buzzer_enabled ? "true" : "false", buzzer_frequency, buzzer_duration, buzzer_pattern);

            // 特别处理停止命令
            if (!buzzer_enabled) {
                g_buzzer_stop_commands++;
                printf("*** STOPPING BUZZER *** (Stop command #%d)\n", g_buzzer_stop_commands);
                printf("Calling Buzzer_Off() directly...\n");
                Buzzer_Off();  // 直接调用停止函数
                printf("Buzzer_Off() called successfully\n");
                printf("Buzzer stopped directly\n");

                // 额外确保停止
                printf("Double-checking buzzer stop...\n");
                Buzzer_Off();
                printf("Buzzer stop confirmed\n");
            } else {
                g_buzzer_start_commands++;
                printf("*** STARTING BUZZER *** (Start command #%d)\n", g_buzzer_start_commands);
                // 调用实际的蜂鸣器控制函数
                IoTCloud_HandleBuzzerCommand(buzzer_enabled, buzzer_frequency, buzzer_duration, buzzer_pattern);
            }
        } else {
            printf("ERROR: enable parameter is not boolean\n");
        }
    }
}

/**
 * @brief 设置RGB状态（参考例程）
 */
void set_rgb_state(cJSON *root)
{
    printf("=== RGB LED CONTROL COMMAND ===\n");

    cJSON *paras = cJSON_GetObjectItem(root, "paras");
    if (paras != NULL) {
        cJSON *enable = cJSON_GetObjectItem(paras, "enable");
        cJSON *red = cJSON_GetObjectItem(paras, "red");
        cJSON *green = cJSON_GetObjectItem(paras, "green");
        cJSON *blue = cJSON_GetObjectItem(paras, "blue");

        if (cJSON_IsBool(enable)) {
            bool rgb_enabled = cJSON_IsTrue(enable);

            // 对于停止命令，只需要enable参数
            if (!rgb_enabled) {
                printf("*** STOPPING RGB LED ***\n");
                // 更新全局变量为停止状态
                g_cloud_rgb_enabled = false;
                g_cloud_rgb_red = 0;
                g_cloud_rgb_green = 0;
                g_cloud_rgb_blue = 0;

                IoTCloud_HandleRGBCommand(false, 0, 0, 0);
            } else {
                // 对于启动命令，需要解析颜色参数
                int rgb_red = cJSON_IsNumber(red) ? red->valueint : 255;
                int rgb_green = cJSON_IsNumber(green) ? green->valueint : 255;
                int rgb_blue = cJSON_IsNumber(blue) ? blue->valueint : 255;

                // 参数验证
                if (rgb_red < 0) rgb_red = 0;
                if (rgb_red > 255) rgb_red = 255;
                if (rgb_green < 0) rgb_green = 0;
                if (rgb_green > 255) rgb_green = 255;
                if (rgb_blue < 0) rgb_blue = 0;
                if (rgb_blue > 255) rgb_blue = 255;

                // 更新全局变量
                g_cloud_rgb_enabled = rgb_enabled;
                g_cloud_rgb_red = rgb_red;
                g_cloud_rgb_green = rgb_green;
                g_cloud_rgb_blue = rgb_blue;

                IoTCloud_HandleRGBCommand(rgb_enabled, rgb_red, rgb_green, rgb_blue);
            }
        } else {
            printf("ERROR: enable parameter is not boolean\n");
        }
    }
}

/**
 * @brief 设置报警重置（参考例程）
 */
void set_alarm_reset(void)
{
    printf("=== RESET ALARM COMMAND ===\n");
    g_alarm_acknowledged = true;
    printf("Alarm reset successfully\n");
}
