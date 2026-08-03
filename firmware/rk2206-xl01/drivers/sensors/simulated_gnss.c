#include "simulated_gnss.h"

#include <string.h>

void SimulatedGnss_Read(
    SensorData *data,
    unsigned int uptime_seconds,
    char node_label
)
{
    int node_offset;
    int32_t position_step;

    if (data == NULL) {
        return;
    }

    node_offset = node_label >= 'A' && node_label <= 'C' ? (int)(node_label - 'A') : 0;
    position_step = (int32_t)(uptime_seconds % 20U) - 10;
    memset(&data->gnss, 0, sizeof(data->gnss));

    // Deliberately synthetic, non-site coordinates. Single-fix quality and the
    // explicit source flag prevent this payload from becoming RTK evidence.
    data->gnss.coordinate_frame = GNSS_COORDINATE_FRAME_CGCS2000;
    data->gnss.gga_quality = 1U;
    data->gnss.fix_flags = GNSS_FIX_POSITION_VALID |
        GNSS_FIX_ALTITUDE_VALID |
        GNSS_FIX_GEOID_VALID |
        GNSS_FIX_HDOP_VALID |
        GNSS_FIX_COORDINATE_FRAME_VALID;
    data->gnss.satellites_used = (uint8_t)(12 + node_offset);
    data->gnss.latitude_e9 = 10000000000LL + (int64_t)node_offset * 100000LL + position_step;
    data->gnss.longitude_e9 = 20000000000LL + (int64_t)node_offset * 100000LL - position_step;
    data->gnss.altitude_msl_mm = 10000 + node_offset * 250;
    data->gnss.geoid_separation_mm = 0;
    data->gnss.solution_age_ms = 0U;
    data->gnss.hdop_x100 = (uint16_t)(85 + node_offset * 5);
    data->gnss.status_valid = 1U;
    data->gnss.position_valid = 1U;
    data->gnss_status_valid = 1;
    data->simulated_gnss_data = 1;
}
