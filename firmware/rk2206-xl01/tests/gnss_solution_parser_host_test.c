#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "../drivers/sensors/gnss_solution_parser.h"

static void BuildNmea(const char *body, char *output, unsigned int output_bytes)
{
    unsigned char checksum = 0U;
    const char *cursor;
    for (cursor = body; *cursor != '\0'; ++cursor) checksum ^= (unsigned char)*cursor;
    snprintf(output, output_bytes, "$%s*%02X", body, checksum);
}

static int Push(GnssSolutionParser *parser, const char *body, unsigned int now_ms)
{
    char sentence[256];
    BuildNmea(body, sentence, sizeof(sentence));
    return GnssSolutionParser_PushNmea(parser, sentence, now_ms);
}

int main(void)
{
    GnssSolutionParser parser;
    GnssSolutionParser boundary_parser;
    GnssSolutionSnapshot solution;

    GnssSolutionParser_Init(&parser, GNSS_COORDINATE_FRAME_CGCS2000);
    assert(Push(&parser,
        "GNRMC,083559.00,A,2234.89234567,N,11356.12345678,E,0.0,0.0,020826,,,A", 900U) == 1);
    assert(Push(&parser,
        "GNGST,083559.00,0.012,0.010,0.008,0.0,0.006,0.007,0.015", 950U) == 1);
    assert(Push(&parser,
        "GNGGA,083559.00,2234.89234567,N,11356.12345678,E,4,31,0.52,12.345,M,-2.345,M,2.0,82", 1000U) == 1);
    assert(GnssSolutionParser_GetSnapshot(&parser, 1100U, &solution) == 0);
    assert(solution.status_valid == 1U && solution.position_valid == 1U);
    assert(solution.gga_quality == 4U && solution.satellites_used == 31U);
    assert(solution.latitude_e9 == 22581539095LL);
    assert(solution.longitude_e9 == 113935390946LL);
    assert(solution.altitude_msl_mm == 12345);
    assert(solution.geoid_separation_mm == -2345);
    assert(solution.correction_age_ms == 2000U);
    assert(solution.solution_age_ms == 100U);
    assert(solution.hdop_x100 == 52U);
    assert(solution.gst_sigma_lat_mm == 6U);
    assert(solution.gst_sigma_lon_mm == 7U);
    assert(solution.gst_sigma_alt_mm == 15U);
    assert(solution.reference_station_id == 82U);
    assert(solution.fix_streak_s == 1U);
    assert(solution.fixed_ratio_1m_permille == 1000U);
    assert((solution.fix_flags & GNSS_FIX_TRUSTED) != 0U);
    assert((solution.fix_flags & GNSS_FIX_TIME_VALID) != 0U);

    assert(Push(&parser,
        "GNGGA,083600.00,2234.89234567,N,11356.12345678,E,5,30,0.61,12.340,M,-2.345,M,2.1,82", 2000U) == 1);
    assert(GnssSolutionParser_GetSnapshot(&parser, 2050U, &solution) == 0);
    assert(solution.gga_quality == 5U);
    assert(solution.fix_streak_s == 0U);
    assert(solution.fixed_ratio_1m_permille == 500U);
    assert(solution.fix_drop_count == 1U);
    assert((solution.fix_flags & GNSS_FIX_TRUSTED) == 0U);

    /* Empty coordinate fields must not shift the GGA quality/satellite fields. */
    assert(Push(&parser, "GNGGA,083601.00,,,,,0,00,99.99,,,,,,", 3000U) == 1);
    assert(GnssSolutionParser_GetSnapshot(&parser, 3050U, &solution) == 0);
    assert(solution.gga_quality == 0U);
    assert(solution.position_valid == 0U);
    assert(solution.satellites_used == 0U);

    /* GST evidence expires independently while the current GGA remains fresh. */
    assert(GnssSolutionParser_GetSnapshot(&parser, 3600U, &solution) == 0);
    assert((solution.fix_flags & GNSS_FIX_GST_VALID) == 0U);

    /* A malformed current GGA time must not inherit the previous TIME_VALID bit. */
    assert(Push(&parser,
        "GNRMC,083603.00,A,2234.89234567,N,11356.12345678,E,0.0,0.0,020826,,,A", 3900U) == 1);
    assert(Push(&parser,
        "GNGGA,,2234.89234567,N,11356.12345678,E,4,31,0.52,12.345,M,-2.345,M,2.0,82", 4000U) == 1);
    assert(GnssSolutionParser_GetSnapshot(&parser, 4050U, &solution) == 0);
    assert((solution.fix_flags & GNSS_FIX_TIME_VALID) == 0U);
    assert(GnssSolutionParser_GetSnapshot(&parser, 19001U, &solution) == -1);

    /* The production displacement gate includes 6000 ms and rejects 6001 ms. */
    GnssSolutionParser_Init(&boundary_parser, GNSS_COORDINATE_FRAME_CGCS2000);
    assert(Push(&boundary_parser,
        "GNGGA,083602.00,2234.89234567,N,11356.12345678,E,4,31,0.52,12.345,M,-2.345,M,6.0,82", 5000U) == 1);
    assert(GnssSolutionParser_GetSnapshot(&boundary_parser, 5000U, &solution) == 0);
    assert(solution.correction_age_ms == 6000U);
    assert((solution.fix_flags & GNSS_FIX_TRUSTED) != 0U);
    assert(Push(&boundary_parser,
        "GNGGA,083603.00,2234.89234567,N,11356.12345678,E,4,31,0.52,12.345,M,-2.345,M,6.001,82", 6000U) == 1);
    assert(GnssSolutionParser_GetSnapshot(&boundary_parser, 6000U, &solution) == 0);
    assert(solution.correction_age_ms == 6001U);
    assert((solution.fix_flags & GNSS_FIX_TRUSTED) == 0U);

    assert(GnssSolutionParser_PushNmea(&parser,
        "$GNGGA,083602.00,2234.0,N,11356.0,E,4,20,0.8,1.0,M,0.0,M,1.0,1*00", 4000U) == -1);
    printf("gnss_solution_parser_host_test passed\n");
    return 0;
}
