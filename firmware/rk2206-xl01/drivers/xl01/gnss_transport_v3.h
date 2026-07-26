#ifndef DRIVERS_XL01_GNSS_TRANSPORT_V3_H
#define DRIVERS_XL01_GNSS_TRANSPORT_V3_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GNSS_TRANSPORT_V3_VERSION 3U
#define GNSS_TRANSPORT_V3_COMMON_HEADER_BYTES 28U
#define GNSS_CORE_V3_PAYLOAD_BYTES 98U
#define GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES 42U
#define GNSS_RTCM_V3_MAX_FRAME_BYTES 1029U
#define GNSS_RTCM_V3_MAX_FRAGMENTS 32U
#define GNSS_RTCM_V3_MAX_INFLIGHT 4U
#define GNSS_RTCM_V3_RECENT_COMPLETED 16U
#define GNSS_RTCM_V3_COVERAGE_BYTES ((GNSS_RTCM_V3_MAX_FRAME_BYTES + 7U) / 8U)

#define GNSS_V3_TARGET_GATEWAY 0U
#define GNSS_V3_TARGET_NODE_A (1U << 0)
#define GNSS_V3_TARGET_NODE_B (1U << 1)
#define GNSS_V3_TARGET_NODE_C (1U << 2)
#define GNSS_V3_TARGET_ALL_NODES 0x07U

#define GNSS_V3_FLAG_CACHED_REFERENCE (1U << 0)

#define GNSS_CORE_FIX_NMEA_CHECKSUM_VALID (1U << 0)
#define GNSS_CORE_FIX_TRUSTED (1U << 1)
#define GNSS_CORE_FIX_TIME_VALID (1U << 2)
#define GNSS_CORE_FIX_GST_VALID (1U << 3)
#define GNSS_CORE_FIX_CN0_VALID (1U << 4)
#define GNSS_CORE_FIX_CORRECTION_AGE_VALID (1U << 5)

typedef enum {
    GNSS_RTCM_CLASS_OBSERVATION = 1,
    GNSS_RTCM_CLASS_REFERENCE = 2,
    GNSS_RTCM_CLASS_AUXILIARY = 3
} GnssRtcmMessageClassV3;

typedef struct {
    uint8_t flags;
    uint8_t source_node;
    uint8_t target_mask;
    uint8_t priority;
    uint32_t session_epoch;
    uint32_t sequence;
    uint64_t generated_unix_ms;
    uint32_t ttl_ms;
} GnssTransportHeaderV3;

typedef struct {
    GnssTransportHeaderV3 transport;
    uint8_t coordinate_frame;
    uint8_t gga_quality;
    uint16_t fix_flags;
    uint16_t gnss_week;
    uint8_t satellites_used;
    uint8_t satellites_visible;
    uint32_t gnss_tow_ms;
    int64_t latitude_e9;
    int64_t longitude_e9;
    int32_t altitude_msl_mm;
    int32_t geoid_separation_mm;
    uint32_t correction_age_ms;
    uint32_t solution_age_ms;
    uint16_t hdop_x100;
    uint16_t pdop_x100;
    uint16_t vdop_x100;
    uint16_t gst_sigma_lat_mm;
    uint16_t gst_sigma_lon_mm;
    uint16_t gst_sigma_alt_mm;
    uint16_t cn0_mean_dbhz_x10;
    uint16_t cn0_median_dbhz_x10;
    uint16_t cn0_min_dbhz_x10;
    uint16_t fix_streak_s;
    uint16_t fixed_ratio_1m_permille;
    uint16_t fix_drop_count;
    uint16_t reference_station_id;
} GnssCoreV3;

typedef struct {
    GnssTransportHeaderV3 transport;
    uint16_t message_type;
    uint8_t message_class;
    uint8_t fragment_index;
    uint8_t fragment_count;
    uint16_t total_bytes;
    uint16_t fragment_offset;
    uint32_t frame_crc24q;
    const uint8_t *data;
    uint16_t data_bytes;
} GnssRtcmFragmentViewV3;

typedef struct {
    uint8_t in_use;
    GnssRtcmFragmentViewV3 first;
    uint64_t first_seen_unix_ms;
    uint32_t received_mask;
    uint16_t fragment_offsets[GNSS_RTCM_V3_MAX_FRAGMENTS];
    uint16_t fragment_lengths[GNSS_RTCM_V3_MAX_FRAGMENTS];
    uint8_t coverage[GNSS_RTCM_V3_COVERAGE_BYTES];
    uint8_t frame[GNSS_RTCM_V3_MAX_FRAME_BYTES];
} GnssRtcmReassemblySlotV3;

typedef struct {
    uint8_t local_node;
    uint8_t has_active_session;
    uint8_t has_highest_sequence;
    uint32_t active_session_epoch;
    uint32_t highest_sequence;
    uint32_t completed_sequences[GNSS_RTCM_V3_RECENT_COMPLETED];
    uint8_t completed_sequence_count;
    uint8_t completed_sequence_cursor;
    GnssRtcmReassemblySlotV3 slots[GNSS_RTCM_V3_MAX_INFLIGHT];
    uint32_t accepted_fragments;
    uint32_t duplicate_fragments;
    uint32_t completed_frames;
    uint32_t rejected_fragments;
    uint32_t crc_errors;
    uint32_t ttl_unverified_fragments;
    uint32_t expired_assemblies;
    uint32_t capacity_evictions;
} GnssRtcmReassemblerV3;

typedef enum {
    GNSS_RTCM_REASSEMBLY_REJECTED = -1,
    GNSS_RTCM_REASSEMBLY_ACCEPTED = 0,
    GNSS_RTCM_REASSEMBLY_DUPLICATE = 1,
    GNSS_RTCM_REASSEMBLY_COMPLETE = 2
} GnssRtcmReassemblyStatusV3;

int GnssTransportV3_EncodeCore(
    const GnssCoreV3 *core,
    uint8_t *output,
    uint16_t output_bytes
);

uint32_t GnssTransportV3_Crc24q(const uint8_t *data, uint16_t data_bytes);

int GnssTransportV3_InspectRtcm3(
    const uint8_t *frame,
    uint16_t frame_bytes,
    uint16_t *message_type,
    uint32_t *frame_crc24q
);

int GnssTransportV3_DecodeRtcmFragment(
    const uint8_t *payload,
    uint16_t payload_bytes,
    GnssRtcmFragmentViewV3 *fragment
);

void GnssRtcmReassemblerV3_Init(GnssRtcmReassemblerV3 *state, uint8_t local_node);

GnssRtcmReassemblyStatusV3 GnssRtcmReassemblerV3_Push(
    GnssRtcmReassemblerV3 *state,
    const uint8_t *payload,
    uint16_t payload_bytes,
    uint64_t now_unix_ms,
    uint8_t absolute_time_valid,
    uint8_t *completed_frame,
    uint16_t completed_capacity,
    uint16_t *completed_bytes,
    uint16_t *completed_message_type
);

#ifdef __cplusplus
}
#endif

#endif // DRIVERS_XL01_GNSS_TRANSPORT_V3_H
