#include "tongxiao_alarm.h"

#include <stdio.h>
#include <string.h>

#include "alarm_config.h"

#if TONGXIAO_VOICE_ENABLED
#include "iot_errno.h"
#include "iot_uart.h"

#define VOICE_UART EUART2_M1

static bool g_voice_ready;

static uint8_t PhraseIndex(AlarmPhraseId phrase)
{
    switch (phrase) {
        case ALARM_PHRASE_PREPARE_01: return 1;
        case ALARM_PHRASE_EVACUATE_01: return 2;
        case ALARM_PHRASE_EVACUATE_REPEAT_01: return 3;
        case ALARM_PHRASE_ALL_CLEAR_01: return 4;
        case ALARM_PHRASE_SELF_TEST_01: return 5;
        default: return 0;
    }
}
#endif

void AlarmVoice_Init(void)
{
#if TONGXIAO_VOICE_ENABLED
    IotUartAttribute attr;
    memset(&attr, 0, sizeof(attr));
    attr.baudRate = 115200;
    attr.dataBits = IOT_UART_DATA_BIT_8;
    attr.pad = IOT_FLOW_CTRL_NONE;
    attr.parity = IOT_UART_PARITY_NONE;
    attr.rxBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK;
    attr.stopBits = IOT_UART_STOP_BIT_1;
    attr.txBlock = IOT_UART_BLOCK_STATE_NONE_BLOCK;
    IoTUartDeinit(VOICE_UART);
    g_voice_ready = IoTUartInit(VOICE_UART, &attr) == IOT_SUCCESS;
    if (!g_voice_ready) printf("SU03-T UART init failed\n");
    /* Deliberately no startup transmission and no playback call here. */
#else
    printf("SU03-T disabled: silent boot guaranteed by main firmware\n");
#endif
}

void AlarmVoice_Play(AlarmPhraseId phrase)
{
#if TONGXIAO_VOICE_ENABLED
    uint8_t frame[6];
    uint8_t index = PhraseIndex(phrase);
    if (!g_voice_ready || index == 0) return;
    frame[0] = 0xAA;
    frame[1] = 0x55;
    frame[2] = index;
    frame[3] = 0;
    frame[4] = 0x55;
    frame[5] = 0xAA;
    IoTUartWrite(VOICE_UART, frame, sizeof(frame));
#else
    (void)phrase;
#endif
}
