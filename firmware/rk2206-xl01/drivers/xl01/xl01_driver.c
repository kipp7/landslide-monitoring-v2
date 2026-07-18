/*
 * XL01 Wireless Module Driver Implementation
 */

#include "xl01_driver.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "los_task.h"
#include "cmsis_os2.h"
#include "iot_uart.h"
#include "iot_errno.h"
#include "lz_hardware.h"
#include "../../config/app_config.h"
#include "../../utils/fifo.h"
#include "field_link_frame.h"

#ifndef PLATFORM_COMMAND_RX_LOG_MODE
#define PLATFORM_COMMAND_RX_LOG_MODE 0
#endif

// ==================== Private State ====================

static Fifo g_rx_fifo = {0};
static volatile int g_link_ack_received = 0;  // Link-level ACK/OK for wireless transport only
#define PLATFORM_COMMAND_QUEUE_DEPTH 4
static char g_platform_command_queue[PLATFORM_COMMAND_QUEUE_DEPTH][FIELD_LINK_MAX_PAYLOAD_BYTES + 1] = {{0}};
static unsigned int g_platform_command_queue_head = 0;
static unsigned int g_platform_command_queue_tail = 0;
static unsigned int g_platform_command_queue_count = 0;
static char g_platform_command_assembly_buffer[FIELD_LINK_MAX_PAYLOAD_BYTES + 1] = {0};
// Reuse one decoded field-link message buffer so ProcessTask does not burn ~1KB per RX chunk on stack.
static FieldLinkFrameMessage g_field_link_rx_message = {0};
static int g_platform_command_assembly_len = 0;
static int g_platform_command_brace_depth = 0;
static int g_platform_command_in_string = 0;
static int g_platform_command_escape = 0;
static int g_last_uart_read_status = 0;
static int g_last_rx_fifo_write_status = 0;
static osMutexId_t g_uart_tx_mutex = NULL;
static FieldLinkFrameDecoder g_field_link_decoder = {0};
static unsigned int g_field_link_tx_sequence = 0;

static unsigned int XL01_GetHardwareUartId(void)
{
#if XL01_UART_ID == EUART2_M1
    return 2;
#elif XL01_UART_ID == EUART0_M0
    return 0;
#elif XL01_UART_ID == EUART1_M0
    return 1;
#elif XL01_UART_ID == EUART0_M1
    return 0;
#elif XL01_UART_ID == EUART1_M1
    return 1;
#else
    return 0xFFFFFFFFU;
#endif
}

static int XL01_WriteChunked(const unsigned char *data, int len)
{
    int total_written = 0;

    if (data == NULL || len <= 0) {
        return -1;
    }

    if (g_uart_tx_mutex != NULL) {
        osMutexAcquire(g_uart_tx_mutex, osWaitForever);
    }

#if XL01_UART_TX_CHUNK_SIZE > 0
    while (total_written < len) {
        int remaining = len - total_written;
        int chunk_len = remaining > XL01_UART_TX_CHUNK_SIZE ? XL01_UART_TX_CHUNK_SIZE : remaining;
        int write_ret = IoTUartWrite(XL01_UART_ID, (unsigned char *)(data + total_written), (unsigned int)chunk_len);
        if (write_ret != chunk_len) {
            printf("\n[UART TX ERROR] ret=%d len=%d offset=%d", write_ret, chunk_len, total_written);
            if (g_uart_tx_mutex != NULL) {
                osMutexRelease(g_uart_tx_mutex);
            }
            return total_written > 0 ? total_written : -1;
        }
        total_written += chunk_len;
#if XL01_UART_TX_CHUNK_DELAY_MS > 0
        if (total_written < len) {
            LOS_Msleep(XL01_UART_TX_CHUNK_DELAY_MS);
        }
#endif
    }
    if (g_uart_tx_mutex != NULL) {
        osMutexRelease(g_uart_tx_mutex);
    }
    return total_written;
#else
    total_written = IoTUartWrite(XL01_UART_ID, (unsigned char *)data, (unsigned int)len);
    if (g_uart_tx_mutex != NULL) {
        osMutexRelease(g_uart_tx_mutex);
    }
    return total_written;
#endif
}

static unsigned int XL01_NextFieldLinkTxSequence(void)
{
    g_field_link_tx_sequence++;
    if (g_field_link_tx_sequence == 0U) {
        g_field_link_tx_sequence = 1U;
    }
    return g_field_link_tx_sequence;
}

static void PrintFieldLinkHexPreview(
    const char *label,
    const unsigned char *data,
    int start,
    int len,
    int max_preview
)
{
    int preview_len;
    int i;

    if (label == NULL || data == NULL || len <= 0 || start < 0 || start >= len || max_preview <= 0) {
        return;
    }

    preview_len = len - start;
    if (preview_len > max_preview) {
        preview_len = max_preview;
    }

    printf("\n[%s] range=%d..%d bytes=", label, start, start + preview_len - 1);
    for (i = 0; i < preview_len; ++i) {
        printf("%02X", data[start + i]);
        if (i + 1 < preview_len) {
            printf(" ");
        }
    }
}

static void PrintFieldLinkPayloadPreview(
    const char *label,
    const char *payload,
    int payload_len
)
{
    int preview_len;
    int i;
    char ascii_preview[97];
    const char *needle;
    int start;
    int end;
    int window_len;

    if (label == NULL || payload == NULL || payload_len <= 0) {
        return;
    }

    preview_len = payload_len < (int)(sizeof(ascii_preview) - 1) ? payload_len : (int)(sizeof(ascii_preview) - 1);
    for (i = 0; i < preview_len; ++i) {
        unsigned char value = (unsigned char)payload[i];
        ascii_preview[i] = isprint(value) ? (char)value : '.';
    }
    ascii_preview[preview_len] = '\0';

    printf("\n[%s] len=%d ascii=\"%s\"", label, payload_len, ascii_preview);

    needle = strstr(payload, "\"tilt_x_deg\"");
    if (needle == NULL) {
        return;
    }

    start = (int)(needle - payload) - 16;
    if (start < 0) {
        start = 0;
    }

    end = (int)(needle - payload) + 48;
    if (end > payload_len) {
        end = payload_len;
    }

    window_len = end - start;
    PrintFieldLinkHexPreview(label, (const unsigned char *)payload, start, payload_len, window_len);
}

static int FindFirstPayloadMismatch(
    const char *expected,
    int expected_len,
    const char *actual,
    int actual_len
)
{
    int min_len;
    int i;

    if (expected == NULL || actual == NULL) {
        return -1;
    }

    min_len = expected_len < actual_len ? expected_len : actual_len;
    for (i = 0; i < min_len; ++i) {
        if ((unsigned char)expected[i] != (unsigned char)actual[i]) {
            return i;
        }
    }

    if (expected_len != actual_len) {
        return min_len;
    }

    return -1;
}

static void PrintFieldLinkLoopbackDiagnostic(
    FieldLinkFrameType type,
    unsigned int sequence,
    const char *payload,
    int payload_len,
    const unsigned char *encoded,
    int encoded_len
)
{
    FieldLinkFrameDecoder decoder;
    FieldLinkFrameMessage decoded;
    int decode_ret;
    int i;
    int mismatch_index;
    int mismatch_start;
    int mismatch_window;

    if (payload == NULL || encoded == NULL || payload_len < 0 || encoded_len <= 0) {
        return;
    }

    printf(
        "\n[FIELD LINK TX FRAME] type=%s seq=%u payload_len=%d encoded_len=%d",
        FieldLinkFrameTypeName(type),
        sequence,
        payload_len,
        encoded_len
    );
    PrintFieldLinkHexPreview("FIELD LINK TX FRAME HEX", encoded, 0, encoded_len, 96);

    FieldLinkFrameDecoder_Init(&decoder);
    memset(&decoded, 0, sizeof(decoded));
    decode_ret = 0;
    for (i = 0; i < encoded_len; ++i) {
        decode_ret = FieldLinkFrameDecoder_FeedByte(&decoder, encoded[i], &decoded);
        if (decode_ret != 0) {
            break;
        }
    }

    if (decode_ret != 1) {
        printf(
            "\n[FIELD LINK TX LOOPBACK FAIL] type=%s seq=%u ret=%d",
            FieldLinkFrameTypeName(type),
            sequence,
            decode_ret
        );
        return;
    }

    printf(
        "\n[FIELD LINK TX LOOPBACK OK] type=%s seq=%u decoded_type=%s decoded_seq=%u payload_len=%d",
        FieldLinkFrameTypeName(type),
        sequence,
        FieldLinkFrameTypeName(decoded.type),
        decoded.sequence,
        decoded.payload_len
    );

    PrintFieldLinkPayloadPreview("FIELD LINK TX PAYLOAD ORIG", payload, payload_len);
    PrintFieldLinkPayloadPreview("FIELD LINK TX PAYLOAD LOOPBACK", decoded.payload, decoded.payload_len);

    mismatch_index = FindFirstPayloadMismatch(payload, payload_len, decoded.payload, decoded.payload_len);
    if (mismatch_index < 0 && decoded.type == type && decoded.sequence == sequence) {
        printf("\n[FIELD LINK TX LOOPBACK MATCH] bytes=%d", payload_len);
        return;
    }

    printf(
        "\n[FIELD LINK TX LOOPBACK MISMATCH] type=%s seq=%u decoded_type=%s decoded_seq=%u mismatch_index=%d",
        FieldLinkFrameTypeName(type),
        sequence,
        FieldLinkFrameTypeName(decoded.type),
        decoded.sequence,
        mismatch_index
    );

    if (mismatch_index >= 0) {
        mismatch_start = mismatch_index - 16;
        if (mismatch_start < 0) {
            mismatch_start = 0;
        }

        mismatch_window = payload_len - mismatch_start;
        if (mismatch_window > 48) {
            mismatch_window = 48;
        }
        if (mismatch_window > 0) {
            PrintFieldLinkHexPreview(
                "FIELD LINK TX PAYLOAD ORIG MISMATCH WINDOW",
                (const unsigned char *)payload,
                mismatch_start,
                payload_len,
                mismatch_window
            );
        }

        mismatch_window = decoded.payload_len - mismatch_start;
        if (mismatch_window > 48) {
            mismatch_window = 48;
        }
        if (mismatch_window > 0) {
            PrintFieldLinkHexPreview(
                "FIELD LINK TX PAYLOAD LOOPBACK MISMATCH WINDOW",
                (const unsigned char *)decoded.payload,
                mismatch_start,
                decoded.payload_len,
                mismatch_window
            );
        }
    }
}

static int XL01_SendTypedPayload(FieldLinkFrameType type, const char *data, int len)
{
#if FIELD_LINK_WIRE_MODE == FIELD_LINK_WIRE_MODE_COBS_CRC_V1
    unsigned char encoded[FIELD_LINK_FRAME_ENCODED_BYTES];
    unsigned int sequence;
    int encoded_len;
    int written_len;

    sequence = XL01_NextFieldLinkTxSequence();
    encoded_len = FieldLinkFrame_Encode(type, sequence, data, len, encoded, sizeof(encoded));
    if (encoded_len <= 0) {
        printf("\n[FIELD LINK ENCODE FAIL] type=%s len=%d", FieldLinkFrameTypeName(type), len);
        return -1;
    }

#if FIELD_LINK_POSTTX_DIAG_MODE
    PrintFieldLinkLoopbackDiagnostic(type, sequence, data, len, encoded, encoded_len);
#endif

    written_len = XL01_WriteChunked(encoded, encoded_len);
    if (written_len != encoded_len) {
        return written_len;
    }
    return len;
#else
    (void)type;
    return XL01_WriteChunked((const unsigned char *)data, len);
#endif
}

static void PrintRxChunkPreview(const char *label, const char *chunk, int len)
{
    int preview_len;
    int i;
    char ascii_preview[33];

    if (label == NULL || chunk == NULL || len <= 0) {
        return;
    }

    preview_len = len < 32 ? len : 32;
    for (i = 0; i < preview_len; ++i) {
        unsigned char value = (unsigned char)chunk[i];
        ascii_preview[i] = isprint(value) ? (char)value : '.';
    }
    ascii_preview[preview_len] = '\0';

    printf("\n[%s] len=%d ascii=\"%s\" hex=", label, len, ascii_preview);
    for (i = 0; i < preview_len; ++i) {
        printf("%02X", (unsigned char)chunk[i]);
        if (i + 1 < preview_len) {
            printf(" ");
        }
    }
    if (len > preview_len) {
        printf(" ...");
    }
}

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
    const char *issued_ts = NULL;

    if (payload == NULL) {
        return 0;
    }

    schema_version = FindJsonValueStart(payload, "schema_version");
    command_id = FindJsonValueStart(payload, "command_id");
    command_type = FindJsonValueStart(payload, "command_type");
    command_payload = FindJsonValueStart(payload, "payload");
    issued_ts = FindJsonValueStart(payload, "issued_ts");

    return schema_version != NULL &&
           strtol(schema_version, NULL, 10) == 1 &&
           command_id != NULL && *command_id == '"' &&
           command_type != NULL && *command_type == '"' &&
           command_payload != NULL && *command_payload == '{' &&
           issued_ts != NULL && *issued_ts == '"';
}

static void ResetPlatformCommandQueue(void)
{
    unsigned int i;

    for (i = 0; i < PLATFORM_COMMAND_QUEUE_DEPTH; ++i) {
        g_platform_command_queue[i][0] = '\0';
    }
    g_platform_command_queue_head = 0;
    g_platform_command_queue_tail = 0;
    g_platform_command_queue_count = 0;
}

static int EnqueuePlatformCommandPayload(const char *payload, int payload_len, Statistics *stats)
{
    unsigned int slot_index;
    int copy_len;

#if !PLATFORM_COMMAND_RX_LOG_MODE
    (void)stats;
#endif

    if (payload == NULL || payload_len <= 0) {
        return -1;
    }

    if (g_platform_command_queue_count >= PLATFORM_COMMAND_QUEUE_DEPTH) {
        printf("\n[CMD DROP] queue full pending=%u len=%d", g_platform_command_queue_count, payload_len);
        PrintRxChunkPreview("CMD QUEUE FULL PREVIEW", payload, payload_len);
        return -1;
    }

    copy_len = payload_len;
    if (copy_len > FIELD_LINK_MAX_PAYLOAD_BYTES) {
        copy_len = FIELD_LINK_MAX_PAYLOAD_BYTES;
    }

    slot_index = g_platform_command_queue_tail;
    memcpy(g_platform_command_queue[slot_index], payload, (size_t)copy_len);
    g_platform_command_queue[slot_index][copy_len] = '\0';

    g_platform_command_queue_tail = (g_platform_command_queue_tail + 1U) % PLATFORM_COMMAND_QUEUE_DEPTH;
    g_platform_command_queue_count++;

#if PLATFORM_COMMAND_RX_LOG_MODE
    printf("\n[CMD QUEUE] pending=%u len=%d", g_platform_command_queue_count, copy_len);
    if (stats != NULL) {
        printf(" rx_packets=%u", stats->rx_packets);
    }
#endif

    return copy_len;
}

static void HandleFieldLinkMessage(const FieldLinkFrameMessage *message, Statistics *stats)
{
    if (message == NULL) {
        return;
    }

#if PLATFORM_COMMAND_RX_LOG_MODE
    printf(
        "\n[FIELD LINK RX] type=%s seq=%u payload_len=%d",
        FieldLinkFrameTypeName(message->type),
        message->sequence,
        message->payload_len
    );
#endif

    if (message->type == FIELD_LINK_FRAME_TYPE_COMMAND) {
        if (IsPlatformCommandPayload(message->payload)) {
            if (EnqueuePlatformCommandPayload(message->payload, message->payload_len, stats) > 0) {
#if PLATFORM_COMMAND_RX_LOG_MODE
                if (stats != NULL) {
                    printf("\n[CMD RECV #%u] %s", stats->rx_packets, message->payload);
                }
#endif
            }
        } else {
            printf("\n[CMD DROP] invalid field-link command payload");
            PrintRxChunkPreview("CMD DROP PREVIEW", message->payload, message->payload_len);
        }
        return;
    }

    if ((message->type == FIELD_LINK_FRAME_TYPE_ACK || message->type == FIELD_LINK_FRAME_TYPE_CONTROL) &&
        (strcmp(message->payload, "ACK") == 0 || strcmp(message->payload, "OK") == 0)) {
        g_link_ack_received = 1;
#if PLATFORM_COMMAND_RX_LOG_MODE
        printf("\n[RX LINK ACK] type=%s seq=%u token=%s", FieldLinkFrameTypeName(message->type), message->sequence, message->payload);
#endif
    }
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
        if (EnqueuePlatformCommandPayload(g_platform_command_assembly_buffer, g_platform_command_assembly_len, stats) > 0) {
#if PLATFORM_COMMAND_RX_LOG_MODE
            printf("\n[CMD FRAME READY] len=%d", g_platform_command_assembly_len);
#endif
#if PLATFORM_COMMAND_RX_LOG_MODE
            if (stats != NULL) {
                printf("\n[CMD RECV #%u] %s", stats->rx_packets, g_platform_command_assembly_buffer);
            }
#endif
        }
    } else {
        printf("\n[CMD DROP] invalid json frame len=%d", g_platform_command_assembly_len);
        PrintRxChunkPreview("CMD DROP PREVIEW", g_platform_command_assembly_buffer, g_platform_command_assembly_len);
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
        printf("\n[CMD ASM START] first_byte=0x%02X", (unsigned char)ch);
        return;
    }

    if (g_platform_command_assembly_len >= (int)sizeof(g_platform_command_assembly_buffer) - 1) {
        printf("\n[CMD DROP] command frame overflow len=%d", g_platform_command_assembly_len);
        PrintRxChunkPreview("CMD OVERFLOW PREVIEW", g_platform_command_assembly_buffer, g_platform_command_assembly_len);
        ResetPlatformCommandAssembly();
        if (ch == '{') {
            g_platform_command_brace_depth = 1;
            g_platform_command_assembly_buffer[g_platform_command_assembly_len++] = ch;
            printf("\n[CMD ASM RESTART] first_byte=0x%02X", (unsigned char)ch);
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

#if FIELD_LINK_WIRE_MODE == FIELD_LINK_WIRE_MODE_COBS_CRC_V1
    for (i = 0; i < len; ++i) {
        int decode_ret = FieldLinkFrameDecoder_FeedByte(
            &g_field_link_decoder,
            (unsigned char)chunk[i],
            &g_field_link_rx_message
        );
        if (decode_ret > 0) {
            HandleFieldLinkMessage(&g_field_link_rx_message, stats);
        } else if (decode_ret < 0) {
            printf("\n[FIELD LINK DROP] decode failure offset=%d", i);
        }
    }
#else
    PrintRxChunkPreview("RX CHUNK", chunk, len);
    for (i = 0; i < len; ++i) {
        if (g_platform_command_assembly_len <= 0) {
            if ((len - i) >= 3 && strncmp(chunk + i, "ACK", 3) == 0) {
                g_link_ack_received = 1;
                printf("\n[RX LINK ACK] token=ACK offset=%d", i);
                i += 2;
                continue;
            }
            if ((len - i) >= 2 && strncmp(chunk + i, "OK", 2) == 0) {
                g_link_ack_received = 1;
                printf("\n[RX LINK ACK] token=OK offset=%d", i);
                i += 1;
                continue;
            }
        }

        AppendPlatformCommandByte(chunk[i], stats);
    }
#endif
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
    if (!Fifo_IsReady(&g_rx_fifo)) {
        printf("[ERROR] XL01 RX FIFO init failed\n");
        return;
    }
    g_link_ack_received = 0;
    ResetPlatformCommandQueue();
    ResetPlatformCommandAssembly();
    FieldLinkFrameDecoder_Init(&g_field_link_decoder);
    g_field_link_tx_sequence = 0;
    g_last_uart_read_status = 0;
    if (g_uart_tx_mutex == NULL) {
        g_uart_tx_mutex = osMutexNew(NULL);
        if (g_uart_tx_mutex == NULL) {
            printf("[WARN] XL01 TX mutex unavailable\n");
        }
    }
    
    IoTUartDeinit(XL01_UART_ID);
    LOS_Msleep(500);

    unsigned int ret = IoTUartInit(XL01_UART_ID, &uart_attr);
    if (ret == IOT_SUCCESS) {
        if (IoTUartSetFlowCtrl(XL01_UART_ID, IOT_FLOW_CTRL_NONE) != IOT_SUCCESS) {
            printf("[ERROR] XL01 flow control setup failed\n");
            IoTUartDeinit(XL01_UART_ID);
            return;
        }
        printf("[OK] XL01 initialized (Baudrate: %d)\n", XL01_BAUDRATE);
    } else {
        printf("[ERROR] XL01 init failed: %d\n", ret);
    }
}

int XL01_SendWithRetry(const char *data, int len, Statistics *stats)
{
    int retry = 0;
    int write_ret = 0;
    
#if ENABLE_ACK_CHECK
    // Link-level ACK mechanism between node and gateway.
    // This is NOT the platform command receipt contract.
    while (retry < MAX_RETRY_COUNT) {
        // Clear ACK flag
        g_link_ack_received = 0;
        
        // Send data
        write_ret = XL01_SendTypedPayload(FIELD_LINK_FRAME_TYPE_TELEMETRY, data, len);
        if (write_ret != len) {
            printf("\n[UART TX ERROR] ret=%d len=%d", write_ret, len);
            retry++;
            if (retry < MAX_RETRY_COUNT) {
                printf("  [RETRY] UART write failed, retry %d/%d...\n", retry, MAX_RETRY_COUNT);
                LOS_Msleep(RETRY_DELAY_MS);
            }
            continue;
        }
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
    write_ret = XL01_SendTypedPayload(FIELD_LINK_FRAME_TYPE_TELEMETRY, data, len);
    if (write_ret != len) {
        printf("\n[UART TX ERROR] ret=%d len=%d", write_ret, len);
        stats->failed_count++;
        return -1;
    }
    LOS_Msleep(300);  // Wait for async send
    
    // Fire-and-forget mode still requires the local UART write to succeed.
    stats->success_count++;
    return 0;
#endif
}

int XL01_SendRaw(const char *data, int len)
{
    int ret;

    if (data == NULL || len <= 0) {
        return -1;
    }

    ret = XL01_WriteChunked((const unsigned char*)data, len);
    LOS_Msleep(100);
    if (ret != len) {
        printf("\n[UART TX ERROR] ret=%d len=%d", ret, len);
        return -1;
    }
    return len;
}

int XL01_SendPlatformCommandAck(const char *data, int len)
{
    int ret = XL01_SendTypedPayload(FIELD_LINK_FRAME_TYPE_ACK, data, len);

    if (ret == len) {
        // Give the last ACK bytes time to clear the local UART path before any
        // follow-up action such as watchdog-backed reboot starts tearing down runtime.
        LOS_Msleep(100);
    }

    return ret;
}

int XL01_SendPlatformCommand(const char *data, int len)
{
    return XL01_SendTypedPayload(FIELD_LINK_FRAME_TYPE_COMMAND, data, len);
}

void XL01_PollReceive(void)
{
    unsigned char rx_buffer[256];
    int len = IoTUartRead(XL01_UART_ID, rx_buffer, sizeof(rx_buffer));
    if (len > 0) {
        g_last_uart_read_status = 1;
#if XL01_RAW_UART_DIAG_MODE
        PrintRxChunkPreview("UART RAW READ", (const char *)rx_buffer, len);
#endif
#if XL01_RAW_UART_DIAG_MODE && XL01_UART_DIAG_RX_ECHO
        {
            int echo_ret = IoTUartWrite(XL01_UART_ID, rx_buffer, len);
            if (echo_ret == len) {
                printf("\n[UART RAW ECHO] len=%d", len);
            } else {
                printf("\n[UART ECHO ERROR] ret=%d len=%d", echo_ret, len);
            }
        }
#endif
        {
            int written = Fifo_Write(&g_rx_fifo, rx_buffer, (unsigned int)len);
            if (written < 0) {
                if (g_last_rx_fifo_write_status != written) {
                    g_last_rx_fifo_write_status = written;
                    printf("\n[UART RX FIFO ERROR] write unavailable len=%d", len);
                }
            } else if (written < len) {
                g_last_rx_fifo_write_status = 0;
                printf("\n[UART RX FIFO DROP] wrote=%d/%d dropped_bytes=%u dropped_events=%u",
                       written,
                       len,
                       Fifo_DroppedBytes(&g_rx_fifo),
                       Fifo_DroppedEvents(&g_rx_fifo));
            } else {
                g_last_rx_fifo_write_status = 0;
            }
        }
    } else if (len < 0) {
        if (g_last_uart_read_status != len) {
            g_last_uart_read_status = len;
            printf("\n[UART READ ERROR] ret=%d", len);
        }
    } else {
        g_last_uart_read_status = 0;
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

        ProcessReceivedChunk((char*)rx_buffer, len, stats);
#if FIELD_LINK_WIRE_MODE == FIELD_LINK_WIRE_MODE_LEGACY_JSON
        if (!g_link_ack_received && g_platform_command_assembly_len <= 0 && g_platform_command_queue_count == 0U) {
            printf("\n[RECV #%u] %s", stats->rx_packets, rx_buffer);
        }
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
    unsigned int slot_index;
    int len;

    if (g_platform_command_queue_count == 0U || buffer == NULL || buffer_size <= 1) {
        return 0;
    }

    slot_index = g_platform_command_queue_head;
    len = (int)strlen(g_platform_command_queue[slot_index]);
    if (len >= buffer_size) {
        len = buffer_size - 1;
    }
    memcpy(buffer, g_platform_command_queue[slot_index], (size_t)len);
    buffer[len] = '\0';
    g_platform_command_queue[slot_index][0] = '\0';
    g_platform_command_queue_head = (g_platform_command_queue_head + 1U) % PLATFORM_COMMAND_QUEUE_DEPTH;
    g_platform_command_queue_count--;
    return len;
}

void XL01_ClearLinkAck(void)
{
    g_link_ack_received = 0;
}

unsigned int XL01_DebugReadAny(void)
{
    unsigned int uart_id = XL01_GetHardwareUartId();
    if (uart_id == 0xFFFFFFFFU) {
        return 0xFFFFFFFFU;
    }
    return LzUartReadAny(uart_id);
}
