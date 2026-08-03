#include <assert.h>
#include <stdint.h>
#include <string.h>

#include "../drivers/xl01/gnss_rtcm_injection.h"

int main(void)
{
    GnssRtcmInjectionStats stats;
    GnssRtcmRuntimeStatus runtime;

    memset(&stats, 0xA5, sizeof(stats));
    memset(&runtime, 0xA5, sizeof(runtime));
    assert(GnssRtcmInjection_Init(1U) == 0);

    GnssRtcmInjection_GetStats(&stats);
    GnssRtcmInjection_GetRuntimeStatus(1234U, &runtime);

    assert(stats.accepted_fragments == 0U);
    assert(stats.completed_frames == 0U);
    assert(stats.injected_frames == 0U);
    assert(runtime.mode == GNSS_RTCM_INJECTION_DISABLED);
    assert(runtime.state_flags == 0U);
    assert(runtime.session_epoch == 0U);
    assert(runtime.lease_remaining_ms == 0U);
    assert(runtime.last_fragment_age_ms == GNSS_RTCM_AGE_UNAVAILABLE);
    assert(runtime.last_completed_frame_age_ms == GNSS_RTCM_AGE_UNAVAILABLE);
    assert(runtime.last_action_age_ms == GNSS_RTCM_AGE_UNAVAILABLE);
    return 0;
}
