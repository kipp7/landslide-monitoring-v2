#include "tongxiao_alarm.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "alarm_config.h"
#include "lcd.h"

static bool g_lcd_ready;

static void ShowAscii(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    lcd_show_string(x, y, (const uint8_t *)text, fg, bg, size, 0);
}

static void ShowChinese(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    lcd_show_chinese(x, y, (uint8_t *)text, fg, bg, size, 0);
}

static void ShowChineseCentered(uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    size_t characters = strlen(text) / 3U;
    uint16_t width = (uint16_t)(characters * size);
    uint16_t x = width < LCD_W ? (uint16_t)((LCD_W - width) / 2U) : 0;
    ShowChinese(x, y, text, fg, bg, size);
}

static const char *SeverityChinese(AlarmSeverity severity)
{
    switch (severity) {
        case ALARM_SEVERITY_LOW: return "低";
        case ALARM_SEVERITY_MEDIUM: return "中";
        case ALARM_SEVERITY_HIGH: return "高";
        case ALARM_SEVERITY_CRITICAL: return "极高";
        default: return "正常";
    }
}

static const char *StateChinese(const AlarmSnapshot *snapshot)
{
    if (snapshot->self_test_active) return "自检";
    if (snapshot->locally_silenced || snapshot->desired.state == ALARM_STATE_SILENCED) return "关闭";
    if (snapshot->desired.state == ALARM_STATE_ACTIVE) return "告警";
    return "正常";
}

static bool IsSupportedChinese24(const unsigned char *glyph)
{
    static const unsigned char supported[] =
        "℃安板备闭变标表不测查察常撤程持传窗当灯等低电定动度短发分风幅感高告估关观光果乎滑化环机"
        "级即极急几继加间监检建键降角结紧近警境据开靠可口离立烈明评坡期启器前强轻倾趋全弱上设升"
        "湿时势数态通图危微温稳无析下显险晓斜信行续要议意因预长照振正值指置中主注状准自子最";
    size_t offset;

    for (offset = 0; offset + 2U < sizeof(supported) - 1U; offset += 3U) {
        if (memcmp(supported + offset, glyph, 3U) == 0) return true;
    }
    return false;
}

static void SafeShortId(char *target, size_t target_size, const char *source)
{
    size_t length;
    size_t i;

    if (target_size == 0) return;
    target[0] = '\0';
    if (source == NULL || source[0] == '\0') return;
    length = strlen(source);
    if (length <= 20U) {
        for (i = 0; i + 1 < target_size && i < length; ++i) {
            unsigned char ch = (unsigned char)source[i];
            target[i] = isprint(ch) && ch < 0x80 ? (char)ch : '?';
        }
        target[i] = '\0';
        return;
    }
    if (target_size < 20U) return;
    snprintf(target, target_size, "%.8s...%.8s", source, source + length - 8U);
}

static void ShowMixedText(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg,
    uint8_t size, uint16_t max_width)
{
    const unsigned char *cursor = (const unsigned char *)text;
    uint16_t used = 0;

    if (text == NULL || text[0] == '\0') {
        ShowAscii(x, y, "--", fg, bg, size);
        return;
    }
    while (*cursor != '\0') {
        if (*cursor < 0x80U) {
            char ascii[2] = { (char)*cursor, '\0' };
            uint16_t width = (uint16_t)(size / 2U);
            if (used + width > max_width) break;
            if (isprint(*cursor)) ShowAscii((uint16_t)(x + used), y, ascii, fg, bg, size);
            used = (uint16_t)(used + width);
            ++cursor;
        } else if ((cursor[0] & 0xF0U) == 0xE0U && cursor[1] != '\0' && cursor[2] != '\0') {
            char glyph[4] = { (char)cursor[0], (char)cursor[1], (char)cursor[2], '\0' };
            uint16_t width = size == 24U && !IsSupportedChinese24(cursor) ? (uint16_t)(size / 2U) : size;
            if (used + width > max_width) break;
            if (width == size) ShowChinese((uint16_t)(x + used), y, glyph, fg, bg, size);
            else ShowAscii((uint16_t)(x + used), y, "?", fg, bg, size);
            used = (uint16_t)(used + width);
            cursor += 3;
        } else {
            ++cursor;
        }
    }
}

static bool HasAlertContext(const AlarmSnapshot *snapshot)
{
    return snapshot->desired.title[0] != '\0' || snapshot->desired.message[0] != '\0' ||
        snapshot->desired.station_id[0] != '\0' || snapshot->desired.alert_id[0] != '\0';
}

static void ShowProtocolStatus(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    uint16_t wifi_color = bg == LCD_WHITE ? (snapshot->wifi_connected ? LCD_GREEN : LCD_RED) : fg;
    uint16_t mqtt_color = bg == LCD_WHITE ? (snapshot->mqtt_connected ? LCD_GREEN : LCD_RED) : fg;

    ShowAscii(40, 216, "WIFI", fg, bg, 24);
    ShowChinese(96, 216, snapshot->wifi_connected ? "正常" : "关闭", wifi_color, bg, 24);
    ShowAscii(176, 216, "MQTT", fg, bg, 24);
    ShowChinese(232, 216, snapshot->mqtt_connected ? "正常" : "关闭", mqtt_color, bg, 24);
}

static void ShowAlertContext(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    char station[24];
    char alert[24];

    SafeShortId(station, sizeof(station), snapshot->desired.station_id);
    SafeShortId(alert, sizeof(alert), snapshot->desired.alert_id);
    ShowChinese(8, 112, "告警", fg, bg, 24);
    ShowMixedText(64, 112, snapshot->desired.title, fg, bg, 24, 240);
    ShowChinese(8, 138, "建议", fg, bg, 24);
    ShowMixedText(64, 138, snapshot->desired.message, fg, bg, 24, 240);
    ShowChinese(8, 164, "监测", fg, bg, 24);
    ShowAscii(64, 168, station[0] ? station : "--", fg, bg, 16);
    ShowAscii(8, 194, "ID", fg, bg, 16);
    ShowAscii(64, 194, alert[0] ? alert : "--", fg, bg, 16);
}

static void ShowDeviceContext(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    char device[24];
    char line[48];

    SafeShortId(device, sizeof(device), TONGXIAO_DEVICE_ID);
    ShowChinese(8, 112, "设备", fg, bg, 24);
    ShowAscii(64, 116, device, fg, bg, 16);
    ShowAscii(8, 142, "FW", fg, bg, 16);
    ShowAscii(64, 142, TONGXIAO_FIRMWARE_VERSION, fg, bg, 16);
    ShowAscii(8, 168, "REV", fg, bg, 16);
    snprintf(line, sizeof(line), "%llu", (unsigned long long)snapshot->desired.revision);
    ShowAscii(64, 168, line, fg, bg, 16);
    ShowChinese(8, 190, "状态", fg, bg, 24);
    ShowChinese(64, 190, StateChinese(snapshot), fg, bg, 24);
}

void AlarmDisplay_Init(void)
{
    g_lcd_ready = lcd_init() == 0;
    if (!g_lcd_ready) printf("lcd_init failed\n");
}

void AlarmDisplay_Render(const AlarmSnapshot *snapshot)
{
    uint16_t background;
    uint16_t foreground;

    if (!g_lcd_ready || snapshot == NULL) return;
    if (snapshot->self_test_active || snapshot->desired.display == ALARM_DISPLAY_SELF_TEST) {
        background = LCD_BLUE;
        foreground = LCD_WHITE;
    } else if (snapshot->desired.state == ALARM_STATE_ACTIVE && !snapshot->locally_silenced) {
        background = LCD_RED;
        foreground = LCD_WHITE;
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED || snapshot->locally_silenced) {
        background = LCD_YELLOW;
        foreground = LCD_BLACK;
    } else {
        background = LCD_WHITE;
        foreground = LCD_DARKBLUE;
    }

    lcd_fill(0, 0, LCD_W, LCD_H, background);
    ShowChineseCentered(6, "滑坡风险告警", foreground, background, 24);
    lcd_draw_line(12, 38, 307, 38, foreground);

    if (snapshot->self_test_active || snapshot->desired.display == ALARM_DISPLAY_SELF_TEST) {
        ShowChineseCentered(46, "设备自检", foreground, background, 24);
        ShowChineseCentered(76, "振动灯光检测", foreground, background, 24);
    } else if (snapshot->desired.state == ALARM_STATE_ACTIVE) {
        ShowChinese(80, 46, "风险等级", foreground, background, 24);
        ShowChinese(192, 46, SeverityChinese(snapshot->desired.severity), foreground, background, 24);
        if (snapshot->locally_silenced) {
            ShowChineseCentered(76, "告警关闭", foreground, background, 24);
        } else {
            ShowChineseCentered(76,
                snapshot->desired.severity == ALARM_SEVERITY_CRITICAL ? "紧急撤离" : "准备撤离",
                foreground, background, 24);
        }
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED) {
        ShowChineseCentered(46, "告警关闭", foreground, background, 24);
        ShowChineseCentered(76, "风险继续观察", foreground, background, 24);
    } else if (snapshot->desired.display == ALARM_DISPLAY_ALL_CLEAR) {
        ShowChineseCentered(46, "风险正常", LCD_GREEN, background, 24);
        ShowChineseCentered(76, "继续观察", foreground, background, 24);
    } else {
        ShowChineseCentered(46, "设备正常", LCD_GREEN, background, 24);
        ShowChinese(80, 76, "风险等级", foreground, background, 24);
        ShowChinese(192, 76, "正常", LCD_GREEN, background, 24);
    }

    lcd_draw_line(12, 106, 307, 106, foreground);
    if (HasAlertContext(snapshot)) ShowAlertContext(snapshot, foreground, background);
    else ShowDeviceContext(snapshot, foreground, background);
    ShowProtocolStatus(snapshot, foreground, background);
}
