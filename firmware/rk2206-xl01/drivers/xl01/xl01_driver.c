/*
 * XL01 Wireless Module Driver Implementation
 */

#include "xl01_driver.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "los_task.h"
#include "iot_uart.h"
#include "iot_errno.h"
#include "../../config/app_config.h"
#include "../../utils/fifo.h"

// ==================== Private State ====================

static Fifo g_rx_fifo = {0};
static volatile int g_link_ack_received = 0;  // Link-level ACK/OK for wireless transport only
static char g_platform_command_buffer[512] = {0};
static volatile int g_platform_command_ready = 0;
static char g_platform_command_assembly_buffer[512] = {0};
static int g_platform_command_assembly_len = 0;
static int g_platform_command_brace_depth = 0;
static int g_platform_command_in_string = 0;
static int g_platform_command_escape = 0;

static const char *SkipJsonWhitespace(const char *input)
{
    while (input != NULL && *input != '\0' && isspace((unsigned char)*input)) {
        input++;
    }
    return input;
}

static const char *FindJsonValueStart(const char *json, const char *key)
{
    if (json == NULL || key == NULL) {
        return NULL;
    }

    char pattern[96];
    if (snprintf(pattern, sizeof(pattern), "\"%s\"", key) < 0) {
        return NULL;
    }

    const char *cursor = strstr(json, pattern);
    if (cursor == NULL) {
        return NULL;
    }

    cursor += strlen(pattern);
    cursor = SkipJsonWhitespace(cursor);
    if (cursor == NULL || *cursor != ':') {
        return NULL;
    }

    cursor++;
    cursor = SkipJsonWhitespace(cursor);
    return cursor;
}

static int IsPlatformCommandPayload(const char *payload)
{
    const char *schema_version = NULL;
    const char *command_id = NULL;
    const char *command_type = NULL;
    const char *command_payload = NULL;

    if (payload == NULL) {
        return 0;
    }

    schema_version = FindJsonValueStart(payload, "schema_version");
    command_id = FindJsonValueStart(payload, "command_id");
    command_type = FindJsonValueStart(payload, "command_type");
    command_payload = FindJsonValueStart(payload, "payload");

    return schema_version != NULL &&
           strtol(schema_version, NULL, 10) == 1 &&
           command_id != NULL && *command_id == '"' &&
           command_type != NULL && *command_type == '"' &&
           command_payload != NULL && *command_payload == '{';
}

static void ResetPlatformCommandAssembly(void)
{
    g_platform_command_assembly_buffer[0] = '\0';
    g_platform_command_assembly_len = 0;
    g_platform_command_brace_depth = 0;
    g_platform_command_in_string = 0;
    g_platform_command_escape = 0;
}

static void FinalizePlatformCommandAssembly(Statistics *stats)
{
    if (g_platform_command_assembly_len <= 0) {
        ResetPlatformCommandAssembly();
        return;
    }

    g_platform_command_assembly_buffer[g_platform_command_assembly_len] = '\0';

    if (IsPlatformCommandPayload(g_platform_command_assembly_buffer)) {
        strncpy(g_platform_command_buffer, g_platform_command_assembly_buffer, sizeof(g_platform_command_buffer) - 1);
        g_platform_command_buffer[sizeof(g_platform_command_buffer) - 1] = '\0';
        g_platform_command_ready = 1;
        if (stats != NULL) {
            printf("\n[CMD RECV #%u] %s", stats->rx_packets, g_platform_command_buffer);
        }
    } else {
        printf("\n[CMD DROP] invalid json frame: %s", g_platform_command_assembly_buffer);
    }

    ResetPlatformCommandAssembly();
}

static void AppendPlatformCommandByte(char ch, Statistics *stats)
{
    if (g_platform_command_assembly_len <= 0) {
        if (ch != '{') {
            return;
        }
        ResetPlatformCommandAssembly();
        g_platform_command_brace_depth = 1;
        g_platform_command_assembly_buffer[g_platform_command_assembly_len++] = ch;
        return;
    }

    if (g_platform_command_assembly_len >= (int)sizeof(g_platform_command_assembly_buffer) - 1) {
        printf("\n[CMD DROP] command frame overflow");
        ResetPlatformCommandAssembly();
        if (ch == '{') {
            g_platform_command_brace_depth = 1;
            g_platform_command_assembly_buffer[g_platform_command_assembly_len++] = ch;
        }
        return;
    }

    g_platform_command_assembly_buffer[g_platform_command_assembly_len++] = ch;

    if (g_platform_command_escape) {
        g_platform_command_escape = 0;
        return;
    }

    if (ch == '\\' && g_platform_command_in_string) {
        g_platform_command_escape = 1;
        return;
    }

    if (ch == '"') {
        g_platform_command_in_string = !g_platform_command_in_string;
        return;
    }

    if (g_platform_command_in_string) {
        return;
    }

    if (ch == '{') {
        g_platform_command_brace_depth++;
        return;
    }

    if (ch == '}') {
        g_platform_command_brace_depth--;
        if (g_platform_command_brace_depth <= 0) {
            FinalizePlatformCommandAssembly(stats);
        }
    }
}

static void ProcessReceivedChunk(const char *chunk, int len, Statistics *stats)
{
    int i;

    if (chunk == NULL || len <= 0) {
        return;
    }

    for (i = 0; i < len; ++i) {
        if (g_platform_command_assembly_len <= 0) {
            if ((len - i) >= 3 && strncmp(chunk + i, "ACK", 3) == 0) {
                g_link_ack_received = 1;
                i += 2;
                continue;
            }
            if ((len - i) >= 2 && strncmp(chunk + i, "OK", 2) == 0) {
                g_link_ack_received = 1;
                i += 1;
                continue;
            }
        }

        AppendPlatformCommandByte(chunk[i], stats);
    }
}

// ==================== Public Functions ====================

void XL01_Init(void)
{
    IotUartAttribute uart_attr = {
        .baudRate = XL01_BAUDRATE,
        .dataBits = IOT_UART_DATA_BIT_8,
        .stopBits = IOT_UART_STOP_BIT_1,
        .parity = IOT_UART_PARITY_NONE,
        .rxBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .txBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK,
        .pad = IOT_FLOW_CTRL_NONE,
    };

    Fifo_Init(&g_rx_fifo);
    g_link_ack_received = 0;
    g_platform_command_buffer[0] = '\0';
    g_platform_command_ready = 0;
    ResetPlatformCommandAssembly();
    
    IoTUartDeinit(XL01_UART_ID);
    LOS_Msleep(500);

    unsigned int ret = IoTUartInit(XL01_UART_ID, &uart_attr);
    if (ret == IOT_SUCCESS) {
        printf("[OK] XL01 initialized (Baudrate: %d)\n", XL01_BAUDRATE);
    } else {
        printf("[ERROR] XL01 init failed: %d\n", ret);
    }
}

int XL01_SendWithRetry(const char *data, int len, Statistics *stats)
{
    int retry = 0;
    
#if ENABLE_ACK_CHECK
    // Link-level ACK mechanism between node and gateway.
    // This is NOT the platform command receipt contract.
    while (retry < MAX_RETRY_COUNT) {
        // Clear ACK flag
        g_link_ack_received = 0;
        
        // Send data
        IoTUartWrite(XL01_UART_ID, (unsigned char*)data, len);
        LOS_Msleep(100);  // Wait for async send to complete
        
        // Wait for ACK from gateway
        unsigned int wait_time = 0;
        while (wait_time < ACK_TIMEOUT_MS) {
            if (g_link_ack_received) {
                // ACK received, success!
                stats->success_count++;
                if (retry > 0) {
                    stats->retry_count++;
                    printf("  [ACK] Received after %d retries\n", retry);
                }
                return 0;  // Success
            }
            LOS_Msleep(10);
            wait_time += 10;
        }
        
        // Timeout, retry
        retry++;
        if (retry < MAX_RETRY_COUNT) {
            printf("  [RETRY] No ACK, retry %d/%d...\n", retry, MAX_RETRY_COUNT);
            LOS_Msleep(RETRY_DELAY_MS);
        }
    }
    
    // All retries failed
    printf("  [FAIL] No ACK after %d retries\n", MAX_RETRY_COUNT);
    stats->failed_count++;
    return -1;
    
#else
    // Fire-and-forget mode (no ACK)
    IoTUartWrite(XL01_UART_ID, (unsigned char*)data, len);
    LOS_Msleep(300);  // Wait for async send
    
    // Assume success (no way to verify in transparent mode)
    stats->success_count++;
    return 0;
#endif
}

int XL01_SendPlatformCommandAck(const char *data, int len)
{
    if (data == NULL || len <= 0) {
        return -1;
    }

    IoTUartWrite(XL01_UART_ID, (unsigned char*)data, len);
    LOS_Msleep(100);
    return 0;
}

void XL01_PollReceive(void)
{
    unsigned char rx_buffer[256];
    int len = IoTUartRead(XL01_UART_ID, rx_buffer, sizeof(rx_buffer));
    if (len > 0) {
        Fifo_Write(&g_rx_fifo, rx_buffer, len);
    }
}

int XL01_ProcessReceivedData(Statistics *stats)
{
    if (Fifo_Available(&g_rx_fifo) <= 0) {
        return 0;  // No data
    }
    
    unsigned char rx_buffer[512];
    int len = Fifo_Read(&g_rx_fifo, rx_buffer, sizeof(rx_buffer) - 1);
    if (len > 0) {
        rx_buffer[len] = '\0';
        stats->rx_packets++;
        
#if ENABLE_ACK_CHECK
        ProcessReceivedChunk((char*)rx_buffer, len, stats);
        if (!g_link_ack_received && g_platform_command_assembly_len <= 0 && !g_platform_command_ready) {
            printf("\n[RECV #%u] %s", stats->rx_packets, rx_buffer);
        }
#else
        // Print all received data
        printf("\n[RECV #%u] %s", stats->rx_packets, rx_buffer);
#endif
    }
    
    return len;
}

int XL01_HasLinkAck(void)
{
    return g_link_ack_received;
}

int XL01_TryDequeuePlatformCommand(char *buffer, int buffer_size)
{
    if (!g_platform_command_ready || buffer == NULL || buffer_size <= 1) {
        return 0;
    }

    int len = (int)strlen(g_platform_command_buffer);
    if (len >= buffer_size) {
        len = buffer_size - 1;
    }
    memcpy(buffer, g_platform_command_buffer, (size_t)len);
    buffer[len] = '\0';
    g_platform_command_buffer[0] = '\0';
    g_platform_command_ready = 0;
    return len;
}

void XL01_ClearLinkAck(void)
{
    g_link_ack_received = 0;
}
