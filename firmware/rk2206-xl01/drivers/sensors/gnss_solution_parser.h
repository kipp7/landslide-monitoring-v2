#ifndef DRIVERS_SENSORS_GNSS_SOLUTION_PARSER_H
#define DRIVERS_SENSORS_GNSS_SOLUTION_PARSER_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GNSS_COORDINATE_FRAME_UNKNOWN 0U
#define GNSS_COORDINATE_FRAME_CGCS2000 1U
#define GNSS_COORDINATE_FRAME_WGS84 2U

#define GNSS_FIX_NMEA_CHECKSUM_VALID (1U << 0)
#define GNSS_FIX_TRUSTED (1U << 1)
#define GNSS_FIX_TIME_VALID (1U << 2)
#define GNSS_FIX_GST_VALID (1U << 3)
#define GNSS_FIX_CORRECTION_AGE_VALID (1U << 5)
#define GNSS_FIX_HDOP_VALID (1U << 6)
#define GNSS_FIX_ALTITUDE_VALID (1U << 9)
#define GNSS_FIX_GEOID_VALID (1U << 10)
#define GNSS_FIX_STATION_VALID (1U << 11)
#define GNSS_FIX_POSITION_VALID (1U << 12)
#define GNSS_FIX_FIXED_STATS_VALID (1U << 13)
#define GNSS_FIX_COORDINATE_FRAME_VALID (1U << 14)

#define GNSS_FIXED_RATIO_WINDOW_SAMPLES 64U
#define GNSS_TRUST_MAX_SOLUTION_AGE_MS 2000U
#define GNSS_TRUST_MAX_CORRECTION_AGE_MS 5000U
#define GNSS_STATUS_STALE_TIMEOUT_MS 15000U

typedef struct {
    uint8_t coordinate_frame;
    uint8_t gga_quality;
    uint16_t fix_flags;
    uint16_t gnss_week;
    uint8_t satellites_used;
    uint32_t gnss_tow_ms;
    int64_t latitude_e9;
    int64_t longitude_e9;
    int32_t altitude_msl_mm;
    int32_t geoid_separation_mm;
    uint32_t correction_age_ms;
    uint32_t solution_age_ms;
    uint16_t hdop_x100;
    uint16_t gst_sigma_lat_mm;
    uint16_t gst_sigma_lon_mm;
    uint16_t gst_sigma_alt_mm;
    uint16_t fix_streak_s;
    uint16_t fixed_ratio_1m_permille;
    uint16_t fix_drop_count;
    uint16_t reference_station_id;
    uint8_t status_valid;
    uint8_t position_valid;
} GnssSolutionSnapshot;

typedef struct {
    GnssSolutionSnapshot solution;
    uint32_t last_gga_ms;
    uint32_t last_gst_ms;
    uint32_t last_rmc_ms;
    uint32_t fixed_streak_start_ms;
    uint8_t last_gga_was_fixed;
    uint16_t fix_drop_count;
    uint32_t ratio_sample_ms[GNSS_FIXED_RATIO_WINDOW_SAMPLES];
    uint8_t ratio_sample_fixed[GNSS_FIXED_RATIO_WINDOW_SAMPLES];
    uint8_t ratio_head;
    uint8_t ratio_count;
    uint16_t date_year;
    uint8_t date_month;
    uint8_t date_day;
    uint8_t date_valid;
} GnssSolutionParser;

void GnssSolutionParser_Init(GnssSolutionParser *parser, uint8_t coordinate_frame);

/* Returns 1 for a parsed sentence, 0 for an ignored sentence and -1 for invalid NMEA. */
int GnssSolutionParser_PushNmea(
    GnssSolutionParser *parser,
    const char *line,
    uint32_t monotonic_ms
);

/* Returns 0 while a checksum-valid, non-stale GGA status is available. */
int GnssSolutionParser_GetSnapshot(
    GnssSolutionParser *parser,
    uint32_t monotonic_ms,
    GnssSolutionSnapshot *output
);

#ifdef __cplusplus
}
#endif

#endif
