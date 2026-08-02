#include "gnss_solution_parser.h"

#include <limits.h>
#include <stddef.h>
#include <string.h>

#define NMEA_COPY_BYTES 256U
#define NMEA_MAX_FIELDS 32U
#define GPS_EPOCH_UNIX_SECONDS 315964800ULL
#define GPS_UTC_LEAP_SECONDS 18ULL
#define GPS_WEEK_SECONDS 604800ULL
#define FIX_RATIO_WINDOW_MS 60000U
#define FIX_STREAK_GAP_MAX_MS 2500U
#define GNSS_AUX_STALE_TIMEOUT_MS 2500U

static int HexValue(char value)
{
    if (value >= '0' && value <= '9') return value - '0';
    if (value >= 'A' && value <= 'F') return value - 'A' + 10;
    if (value >= 'a' && value <= 'f') return value - 'a' + 10;
    return -1;
}

static int ChecksumValid(const char *line)
{
    const char *star;
    const char *cursor;
    unsigned char actual = 0U;
    int high;
    int low;

    if (line == NULL || line[0] != '$') return 0;
    star = strchr(line, '*');
    if (star == NULL || star <= line + 1 || star[1] == '\0' || star[2] == '\0') return 0;
    for (cursor = line + 1; cursor < star; ++cursor) actual ^= (unsigned char)*cursor;
    high = HexValue(star[1]);
    low = HexValue(star[2]);
    return high >= 0 && low >= 0 && actual == (unsigned char)((high << 4) | low);
}

static unsigned int SplitFields(char *line, char **fields, unsigned int capacity)
{
    unsigned int count = 0U;
    char *cursor = line;

    while (count < capacity) {
        char *comma;
        fields[count++] = cursor;
        comma = strchr(cursor, ',');
        if (comma == NULL) break;
        *comma = '\0';
        cursor = comma + 1;
    }
    return count;
}

static int SentenceTypeIs(const char *field, const char *type)
{
    return field != NULL && strlen(field) >= 6U &&
           field[0] == '$' && strncmp(field + 3, type, 3U) == 0;
}

static int ParseUnsigned(const char *text, uint32_t maximum, uint32_t *output)
{
    uint32_t value = 0U;
    const char *cursor = text;

    if (text == NULL || text[0] == '\0' || output == NULL) return -1;
    while (*cursor != '\0') {
        unsigned int digit;
        if (*cursor < '0' || *cursor > '9') return -1;
        digit = (unsigned int)(*cursor - '0');
        if (value > (maximum - digit) / 10U) return -1;
        value = value * 10U + digit;
        cursor++;
    }
    *output = value;
    return 0;
}

static uint32_t Pow10(unsigned int digits)
{
    uint32_t value = 1U;
    while (digits-- > 0U) value *= 10U;
    return value;
}

static int ParseDecimalScaled(const char *text, unsigned int decimals, int64_t *output)
{
    const char *cursor = text;
    uint64_t whole = 0U;
    uint64_t fraction = 0U;
    unsigned int fraction_digits = 0U;
    int negative = 0;
    int saw_digit = 0;
    uint64_t scale;
    uint64_t scaled;

    if (text == NULL || text[0] == '\0' || output == NULL || decimals > 9U) return -1;
    if (*cursor == '-' || *cursor == '+') {
        negative = *cursor == '-';
        cursor++;
    }
    while (*cursor >= '0' && *cursor <= '9') {
        saw_digit = 1;
        if (whole > 1000000000ULL) return -1;
        whole = whole * 10U + (uint64_t)(*cursor - '0');
        cursor++;
    }
    if (*cursor == '.') {
        cursor++;
        while (*cursor >= '0' && *cursor <= '9') {
            saw_digit = 1;
            if (fraction_digits < decimals) {
                fraction = fraction * 10U + (uint64_t)(*cursor - '0');
                fraction_digits++;
            } else if (fraction_digits == decimals) {
                if (*cursor >= '5') fraction++;
                fraction_digits++;
            }
            cursor++;
        }
    }
    if (!saw_digit || *cursor != '\0') return -1;
    scale = Pow10(decimals);
    while (fraction_digits < decimals) {
        fraction *= 10U;
        fraction_digits++;
    }
    if (fraction >= scale) {
        whole++;
        fraction -= scale;
    }
    scaled = whole * scale + fraction;
    if (scaled > (uint64_t)INT64_MAX) return -1;
    *output = negative ? -(int64_t)scaled : (int64_t)scaled;
    return 0;
}

static int ParseCoordinateE9(const char *text, char hemisphere, int64_t *output)
{
    const char *dot;
    const char *cursor;
    uint32_t integer_part = 0U;
    uint32_t fraction = 0U;
    unsigned int fraction_digits = 0U;
    uint32_t degrees;
    uint32_t minutes;
    uint64_t minute_e9;
    int64_t result;

    if (text == NULL || text[0] == '\0' || output == NULL) return -1;
    dot = strchr(text, '.');
    cursor = text;
    while (*cursor != '\0' && cursor != dot) {
        if (*cursor < '0' || *cursor > '9') return -1;
        if (integer_part > 99999U) return -1;
        integer_part = integer_part * 10U + (uint32_t)(*cursor - '0');
        cursor++;
    }
    if (dot != NULL) {
        cursor = dot + 1;
        while (*cursor != '\0') {
            if (*cursor < '0' || *cursor > '9') return -1;
            if (fraction_digits < 9U) {
                fraction = fraction * 10U + (uint32_t)(*cursor - '0');
                fraction_digits++;
            }
            cursor++;
        }
    }
    while (fraction_digits < 9U) {
        fraction *= 10U;
        fraction_digits++;
    }
    degrees = integer_part / 100U;
    minutes = integer_part % 100U;
    if (minutes >= 60U || degrees > 180U) return -1;
    minute_e9 = (uint64_t)minutes * 1000000000ULL + fraction;
    result = (int64_t)degrees * 1000000000LL + (int64_t)((minute_e9 + 30U) / 60U);
    if (hemisphere == 'S' || hemisphere == 's' || hemisphere == 'W' || hemisphere == 'w') result = -result;
    else if (hemisphere != 'N' && hemisphere != 'n' && hemisphere != 'E' && hemisphere != 'e') return -1;
    *output = result;
    return 0;
}

static int IsLeapYear(unsigned int year)
{
    return (year % 4U == 0U && year % 100U != 0U) || year % 400U == 0U;
}

static unsigned int DaysInMonth(unsigned int year, unsigned int month)
{
    static const unsigned char days[] = { 31U, 28U, 31U, 30U, 31U, 30U, 31U, 31U, 30U, 31U, 30U, 31U };
    if (month == 0U || month > 12U) return 0U;
    return month == 2U && IsLeapYear(year) ? 29U : days[month - 1U];
}

static int DateTimeToGps(
    unsigned int year,
    unsigned int month,
    unsigned int day,
    const char *utc,
    uint16_t *week,
    uint32_t *tow_ms
)
{
    uint64_t days = 0U;
    uint64_t unix_seconds;
    uint64_t gps_seconds;
    uint32_t hour;
    uint32_t minute;
    uint32_t second;
    uint32_t millis = 0U;
    unsigned int current;
    const char *dot;

    if (year < 1980U || year > 2099U || month == 0U || month > 12U ||
        day == 0U || day > DaysInMonth(year, month) || utc == NULL || strlen(utc) < 6U) return -1;
    if (utc[0] < '0' || utc[0] > '9' || utc[1] < '0' || utc[1] > '9' ||
        utc[2] < '0' || utc[2] > '9' || utc[3] < '0' || utc[3] > '9' ||
        utc[4] < '0' || utc[4] > '9' || utc[5] < '0' || utc[5] > '9') return -1;
    hour = (uint32_t)(utc[0] - '0') * 10U + (uint32_t)(utc[1] - '0');
    minute = (uint32_t)(utc[2] - '0') * 10U + (uint32_t)(utc[3] - '0');
    second = (uint32_t)(utc[4] - '0') * 10U + (uint32_t)(utc[5] - '0');
    if (hour > 23U || minute > 59U || second > 60U) return -1;
    dot = strchr(utc, '.');
    if (dot != NULL) {
        unsigned int digits = 0U;
        const char *fraction = dot + 1;
        while (*fraction >= '0' && *fraction <= '9' && digits < 3U) {
            millis = millis * 10U + (uint32_t)(*fraction - '0');
            fraction++;
            digits++;
        }
        while (digits++ < 3U) millis *= 10U;
    }
    for (current = 1970U; current < year; ++current) days += IsLeapYear(current) ? 366U : 365U;
    for (current = 1U; current < month; ++current) days += DaysInMonth(year, current);
    days += day - 1U;
    unix_seconds = days * 86400ULL + hour * 3600ULL + minute * 60ULL + second;
    if (unix_seconds < GPS_EPOCH_UNIX_SECONDS) return -1;
    gps_seconds = unix_seconds - GPS_EPOCH_UNIX_SECONDS + GPS_UTC_LEAP_SECONDS;
    if (gps_seconds / GPS_WEEK_SECONDS > 65535ULL) return -1;
    *week = (uint16_t)(gps_seconds / GPS_WEEK_SECONDS);
    *tow_ms = (uint32_t)((gps_seconds % GPS_WEEK_SECONDS) * 1000ULL + millis);
    return 0;
}

static uint16_t ClampUint16(uint32_t value)
{
    return value > 65535U ? 65535U : (uint16_t)value;
}

static void AddRatioSample(GnssSolutionParser *parser, uint32_t now_ms, int fixed)
{
    unsigned int index;
    if (parser->ratio_count == GNSS_FIXED_RATIO_WINDOW_SAMPLES) {
        parser->ratio_head = (uint8_t)((parser->ratio_head + 1U) % GNSS_FIXED_RATIO_WINDOW_SAMPLES);
        parser->ratio_count--;
    }
    index = (parser->ratio_head + parser->ratio_count) % GNSS_FIXED_RATIO_WINDOW_SAMPLES;
    parser->ratio_sample_ms[index] = now_ms;
    parser->ratio_sample_fixed[index] = fixed ? 1U : 0U;
    parser->ratio_count++;
}

static void UpdateRatio(GnssSolutionParser *parser, uint32_t now_ms, GnssSolutionSnapshot *solution)
{
    unsigned int fixed_count = 0U;
    unsigned int index;
    while (parser->ratio_count > 0U &&
           now_ms - parser->ratio_sample_ms[parser->ratio_head] > FIX_RATIO_WINDOW_MS) {
        parser->ratio_head = (uint8_t)((parser->ratio_head + 1U) % GNSS_FIXED_RATIO_WINDOW_SAMPLES);
        parser->ratio_count--;
    }
    for (index = 0U; index < parser->ratio_count; ++index) {
        unsigned int slot = (parser->ratio_head + index) % GNSS_FIXED_RATIO_WINDOW_SAMPLES;
        fixed_count += parser->ratio_sample_fixed[slot] != 0U ? 1U : 0U;
    }
    if (parser->ratio_count > 0U) {
        solution->fixed_ratio_1m_permille = (uint16_t)((fixed_count * 1000U + parser->ratio_count / 2U) / parser->ratio_count);
        solution->fix_flags |= GNSS_FIX_FIXED_STATS_VALID;
    }
}

static void ParseGga(GnssSolutionParser *parser, char **fields, unsigned int count, uint32_t now_ms)
{
    GnssSolutionSnapshot *solution = &parser->solution;
    uint32_t previous_gga_ms = parser->last_gga_ms;
    uint32_t quality = 0U;
    uint32_t satellites = 0U;
    uint32_t station = 0U;
    int64_t scaled;
    int position_valid = 0;

    solution->fix_flags &= (GNSS_FIX_COORDINATE_FRAME_VALID |
        (((solution->fix_flags & GNSS_FIX_GST_VALID) != 0U &&
          now_ms - parser->last_gst_ms <= GNSS_AUX_STALE_TIMEOUT_MS)
            ? GNSS_FIX_GST_VALID : 0U));
    solution->fix_flags |= GNSS_FIX_NMEA_CHECKSUM_VALID;
    solution->status_valid = 1U;
    solution->position_valid = 0U;
    parser->last_gga_ms = now_ms;
    if (count > 6U && ParseUnsigned(fields[6], 255U, &quality) == 0) solution->gga_quality = (uint8_t)quality;
    else solution->gga_quality = 0U;
    if (count > 7U && ParseUnsigned(fields[7], 255U, &satellites) == 0) solution->satellites_used = (uint8_t)satellites;
    else solution->satellites_used = 0U;
    if (count > 5U && ParseCoordinateE9(fields[2], fields[3][0], &solution->latitude_e9) == 0 &&
        ParseCoordinateE9(fields[4], fields[5][0], &solution->longitude_e9) == 0 &&
        solution->latitude_e9 >= -90000000000LL && solution->latitude_e9 <= 90000000000LL &&
        solution->longitude_e9 >= -180000000000LL && solution->longitude_e9 <= 180000000000LL) {
        position_valid = quality == 1U || quality == 2U || quality == 4U || quality == 5U;
    }
    if (position_valid) {
        solution->position_valid = 1U;
        solution->fix_flags |= GNSS_FIX_POSITION_VALID;
    }
    if (count > 8U && ParseDecimalScaled(fields[8], 2U, &scaled) == 0 && scaled >= 0 && scaled <= 65535) {
        solution->hdop_x100 = (uint16_t)scaled;
        solution->fix_flags |= GNSS_FIX_HDOP_VALID;
    }
    if (count > 9U && ParseDecimalScaled(fields[9], 3U, &scaled) == 0 && scaled >= INT32_MIN && scaled <= INT32_MAX) {
        solution->altitude_msl_mm = (int32_t)scaled;
        solution->fix_flags |= GNSS_FIX_ALTITUDE_VALID;
    }
    if (count > 11U && ParseDecimalScaled(fields[11], 3U, &scaled) == 0 && scaled >= INT32_MIN && scaled <= INT32_MAX) {
        solution->geoid_separation_mm = (int32_t)scaled;
        solution->fix_flags |= GNSS_FIX_GEOID_VALID;
    }
    if (count > 13U && ParseDecimalScaled(fields[13], 3U, &scaled) == 0 && scaled >= 0 && scaled <= UINT32_MAX) {
        solution->correction_age_ms = (uint32_t)scaled;
        solution->fix_flags |= GNSS_FIX_CORRECTION_AGE_VALID;
    }
    if (count > 14U && ParseUnsigned(fields[14], 65535U, &station) == 0) {
        solution->reference_station_id = (uint16_t)station;
        solution->fix_flags |= GNSS_FIX_STATION_VALID;
    }
    if (parser->date_valid && now_ms - parser->last_rmc_ms <= GNSS_AUX_STALE_TIMEOUT_MS &&
        count > 1U &&
        DateTimeToGps(parser->date_year, parser->date_month, parser->date_day, fields[1],
                      &solution->gnss_week, &solution->gnss_tow_ms) == 0) {
        solution->fix_flags |= GNSS_FIX_TIME_VALID;
    }

    AddRatioSample(parser, now_ms, quality == 4U && position_valid);
    if (quality == 4U && position_valid) {
        if (!parser->last_gga_was_fixed || previous_gga_ms == 0U ||
            now_ms - previous_gga_ms > FIX_STREAK_GAP_MAX_MS) {
            parser->fixed_streak_start_ms = now_ms;
        }
        parser->last_gga_was_fixed = 1U;
        solution->fix_streak_s = ClampUint16((now_ms - parser->fixed_streak_start_ms) / 1000U + 1U);
    } else {
        if (parser->last_gga_was_fixed && parser->fix_drop_count < 65535U) parser->fix_drop_count++;
        parser->last_gga_was_fixed = 0U;
        parser->fixed_streak_start_ms = 0U;
        solution->fix_streak_s = 0U;
    }
    solution->fix_drop_count = parser->fix_drop_count;
    UpdateRatio(parser, now_ms, solution);
}

static void ParseGst(GnssSolutionParser *parser, char **fields, unsigned int count, uint32_t now_ms)
{
    int64_t lat;
    int64_t lon;
    int64_t alt;
    if (count <= 8U || ParseDecimalScaled(fields[6], 3U, &lat) != 0 ||
        ParseDecimalScaled(fields[7], 3U, &lon) != 0 ||
        ParseDecimalScaled(fields[8], 3U, &alt) != 0 ||
        lat < 0 || lon < 0 || alt < 0) return;
    parser->solution.gst_sigma_lat_mm = ClampUint16((uint32_t)(lat > 65535 ? 65535 : lat));
    parser->solution.gst_sigma_lon_mm = ClampUint16((uint32_t)(lon > 65535 ? 65535 : lon));
    parser->solution.gst_sigma_alt_mm = ClampUint16((uint32_t)(alt > 65535 ? 65535 : alt));
    parser->solution.fix_flags |= GNSS_FIX_GST_VALID;
    parser->last_gst_ms = now_ms;
}

static void ParseRmc(GnssSolutionParser *parser, char **fields, unsigned int count, uint32_t now_ms)
{
    uint32_t day;
    uint32_t month;
    uint32_t year;
    const char *date;
    if (count <= 9U || strlen(fields[9]) != 6U) return;
    date = fields[9];
    if (date[0] < '0' || date[0] > '9' || date[1] < '0' || date[1] > '9' ||
        date[2] < '0' || date[2] > '9' || date[3] < '0' || date[3] > '9' ||
        date[4] < '0' || date[4] > '9' || date[5] < '0' || date[5] > '9') return;
    day = (uint32_t)(date[0] - '0') * 10U + (uint32_t)(date[1] - '0');
    month = (uint32_t)(date[2] - '0') * 10U + (uint32_t)(date[3] - '0');
    year = (uint32_t)(date[4] - '0') * 10U + (uint32_t)(date[5] - '0');
    year += year >= 80U ? 1900U : 2000U;
    if (day == 0U || day > DaysInMonth(year, month)) return;
    parser->date_year = (uint16_t)year;
    parser->date_month = (uint8_t)month;
    parser->date_day = (uint8_t)day;
    parser->date_valid = 1U;
    parser->last_rmc_ms = now_ms;
    if (count > 1U && DateTimeToGps(year, month, day, fields[1],
                                    &parser->solution.gnss_week, &parser->solution.gnss_tow_ms) == 0) {
        parser->solution.fix_flags |= GNSS_FIX_TIME_VALID;
    }
}

void GnssSolutionParser_Init(GnssSolutionParser *parser, uint8_t coordinate_frame)
{
    if (parser == NULL) return;
    memset(parser, 0, sizeof(*parser));
    parser->solution.coordinate_frame = coordinate_frame;
    if (coordinate_frame == GNSS_COORDINATE_FRAME_CGCS2000 ||
        coordinate_frame == GNSS_COORDINATE_FRAME_WGS84) {
        parser->solution.fix_flags |= GNSS_FIX_COORDINATE_FRAME_VALID;
    }
}

int GnssSolutionParser_PushNmea(GnssSolutionParser *parser, const char *line, uint32_t monotonic_ms)
{
    char copy[NMEA_COPY_BYTES];
    char *fields[NMEA_MAX_FIELDS];
    char *star;
    unsigned int count;

    if (parser == NULL || line == NULL || !ChecksumValid(line) || strlen(line) >= sizeof(copy)) return -1;
    strcpy(copy, line);
    star = strchr(copy, '*');
    if (star == NULL) return -1;
    *star = '\0';
    count = SplitFields(copy, fields, NMEA_MAX_FIELDS);
    if (count == 0U) return -1;
    if (SentenceTypeIs(fields[0], "GGA")) {
        ParseGga(parser, fields, count, monotonic_ms);
        return 1;
    }
    if (SentenceTypeIs(fields[0], "GST")) {
        ParseGst(parser, fields, count, monotonic_ms);
        return 1;
    }
    if (SentenceTypeIs(fields[0], "RMC")) {
        ParseRmc(parser, fields, count, monotonic_ms);
        return 1;
    }
    return 0;
}

int GnssSolutionParser_GetSnapshot(
    GnssSolutionParser *parser,
    uint32_t monotonic_ms,
    GnssSolutionSnapshot *output
)
{
    uint32_t age;
    if (parser == NULL || output == NULL) return -1;
    *output = parser->solution;
    if (!output->status_valid) return -1;
    age = monotonic_ms - parser->last_gga_ms;
    output->solution_age_ms = age;
    UpdateRatio(parser, monotonic_ms, output);
    if ((output->fix_flags & GNSS_FIX_GST_VALID) == 0U ||
        monotonic_ms - parser->last_gst_ms > GNSS_AUX_STALE_TIMEOUT_MS) {
        output->fix_flags &= (uint16_t)~GNSS_FIX_GST_VALID;
    }
    if (age > GNSS_STATUS_STALE_TIMEOUT_MS) {
        output->status_valid = 0U;
        output->position_valid = 0U;
        output->fix_flags &= (uint16_t)~(GNSS_FIX_TRUSTED | GNSS_FIX_POSITION_VALID);
        return -1;
    }
    output->fix_flags &= (uint16_t)~GNSS_FIX_TRUSTED;
    if (output->gga_quality == 4U && output->position_valid &&
        (output->fix_flags & GNSS_FIX_COORDINATE_FRAME_VALID) != 0U &&
        (output->fix_flags & GNSS_FIX_CORRECTION_AGE_VALID) != 0U &&
        output->correction_age_ms <= GNSS_TRUST_MAX_CORRECTION_AGE_MS &&
        age <= GNSS_TRUST_MAX_SOLUTION_AGE_MS) {
        output->fix_flags |= GNSS_FIX_TRUSTED;
    }
    return 0;
}
