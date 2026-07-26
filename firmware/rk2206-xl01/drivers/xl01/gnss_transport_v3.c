#include "gnss_transport_v3.h"

#include <string.h>

#define GNSS_RTCM_V3_REASSEMBLY_TIMEOUT_MS 1500U
#define GNSS_RTCM_V3_MAX_FUTURE_SKEW_MS 2000U
#define GNSS_RTCM_V3_MAX_SEQUENCE_LAG 8U

static void WriteU16(uint8_t *output, uint16_t value)
{
    output[0] = (uint8_t)(value >> 8);
    output[1] = (uint8_t)value;
}

static void WriteU32(uint8_t *output, uint32_t value)
{
    output[0] = (uint8_t)(value >> 24);
    output[1] = (uint8_t)(value >> 16);
    output[2] = (uint8_t)(value >> 8);
    output[3] = (uint8_t)value;
}

static void WriteU64(uint8_t *output, uint64_t value)
{
    output[0] = (uint8_t)(value >> 56);
    output[1] = (uint8_t)(value >> 48);
    output[2] = (uint8_t)(value >> 40);
    output[3] = (uint8_t)(value >> 32);
    output[4] = (uint8_t)(value >> 24);
    output[5] = (uint8_t)(value >> 16);
    output[6] = (uint8_t)(value >> 8);
    output[7] = (uint8_t)value;
}

static uint16_t ReadU16(const uint8_t *input)
{
    return (uint16_t)(((uint16_t)input[0] << 8) | input[1]);
}

static uint32_t ReadU32(const uint8_t *input)
{
    return ((uint32_t)input[0] << 24) |
           ((uint32_t)input[1] << 16) |
           ((uint32_t)input[2] << 8) |
           input[3];
}

static uint64_t ReadU64(const uint8_t *input)
{
    return ((uint64_t)input[0] << 56) |
           ((uint64_t)input[1] << 48) |
           ((uint64_t)input[2] << 40) |
           ((uint64_t)input[3] << 32) |
           ((uint64_t)input[4] << 24) |
           ((uint64_t)input[5] << 16) |
           ((uint64_t)input[6] << 8) |
           input[7];
}

static int EncodeCommon(const GnssTransportHeaderV3 *header, uint8_t *output)
{
    if (header == NULL || output == NULL || header->source_node > 3U ||
        (header->target_mask & ~GNSS_V3_TARGET_ALL_NODES) != 0U ||
        header->session_epoch == 0U || header->ttl_ms == 0U) {
        return -1;
    }
    output[0] = 0x47U;
    output[1] = 0x33U;
    output[2] = GNSS_TRANSPORT_V3_VERSION;
    output[3] = GNSS_TRANSPORT_V3_COMMON_HEADER_BYTES;
    output[4] = header->flags;
    output[5] = header->source_node;
    output[6] = header->target_mask;
    output[7] = header->priority;
    WriteU32(output + 8, header->session_epoch);
    WriteU32(output + 12, header->sequence);
    WriteU64(output + 16, header->generated_unix_ms);
    WriteU32(output + 24, header->ttl_ms);
    return 0;
}

static int DecodeCommon(const uint8_t *input, uint16_t input_bytes, GnssTransportHeaderV3 *header)
{
    if (input == NULL || header == NULL || input_bytes < GNSS_TRANSPORT_V3_COMMON_HEADER_BYTES ||
        input[0] != 0x47U || input[1] != 0x33U ||
        input[2] != GNSS_TRANSPORT_V3_VERSION ||
        input[3] != GNSS_TRANSPORT_V3_COMMON_HEADER_BYTES ||
        input[5] > 3U || (input[6] & ~GNSS_V3_TARGET_ALL_NODES) != 0U) {
        return -1;
    }
    header->flags = input[4];
    header->source_node = input[5];
    header->target_mask = input[6];
    header->priority = input[7];
    header->session_epoch = ReadU32(input + 8);
    header->sequence = ReadU32(input + 12);
    header->generated_unix_ms = ReadU64(input + 16);
    header->ttl_ms = ReadU32(input + 24);
    return header->session_epoch != 0U && header->ttl_ms != 0U ? 0 : -1;
}

static uint8_t ClassifyRtcm(uint16_t message_type)
{
    if (message_type >= 1071U && message_type <= 1137U) {
        return GNSS_RTCM_CLASS_OBSERVATION;
    }
    if (message_type == 1005U || message_type == 1006U || message_type == 1007U ||
        message_type == 1008U || message_type == 1033U) {
        return GNSS_RTCM_CLASS_REFERENCE;
    }
    return GNSS_RTCM_CLASS_AUXILIARY;
}

static uint32_t MaxRtcmTtl(uint8_t message_class)
{
    if (message_class == GNSS_RTCM_CLASS_OBSERVATION) {
        return 5000U;
    }
    if (message_class == GNSS_RTCM_CLASS_REFERENCE) {
        return 3600000U;
    }
    return 120000U;
}

static int RtcmFrameCrcMatches(const uint8_t *frame, uint16_t frame_bytes)
{
    uint32_t expected_crc;

    if (frame == NULL || frame_bytes < 3U) {
        return 0;
    }
    expected_crc = ((uint32_t)frame[frame_bytes - 3U] << 16) |
                   ((uint32_t)frame[frame_bytes - 2U] << 8) |
                   frame[frame_bytes - 1U];
    return GnssTransportV3_Crc24q(frame, (uint16_t)(frame_bytes - 3U)) == expected_crc;
}

int GnssTransportV3_EncodeCore(const GnssCoreV3 *core, uint8_t *output, uint16_t output_bytes)
{
    if (core == NULL || output == NULL || output_bytes < GNSS_CORE_V3_PAYLOAD_BYTES ||
        core->transport.source_node < 1U || core->transport.source_node > 3U ||
        core->transport.target_mask != GNSS_V3_TARGET_GATEWAY ||
        core->transport.ttl_ms > 10000U ||
        (core->coordinate_frame != 1U && core->coordinate_frame != 2U) ||
        core->latitude_e9 < -90000000000LL || core->latitude_e9 > 90000000000LL ||
        core->longitude_e9 < -180000000000LL || core->longitude_e9 > 180000000000LL ||
        core->fixed_ratio_1m_permille > 1000U) {
        return -1;
    }
    memset(output, 0, GNSS_CORE_V3_PAYLOAD_BYTES);
    if (EncodeCommon(&core->transport, output) != 0) {
        return -1;
    }
    output[28] = core->coordinate_frame;
    output[29] = core->gga_quality;
    WriteU16(output + 30, core->fix_flags);
    WriteU16(output + 32, core->gnss_week);
    output[34] = core->satellites_used;
    output[35] = core->satellites_visible;
    WriteU32(output + 36, core->gnss_tow_ms);
    WriteU64(output + 40, (uint64_t)core->latitude_e9);
    WriteU64(output + 48, (uint64_t)core->longitude_e9);
    WriteU32(output + 56, (uint32_t)core->altitude_msl_mm);
    WriteU32(output + 60, (uint32_t)core->geoid_separation_mm);
    WriteU32(output + 64, core->correction_age_ms);
    WriteU32(output + 68, core->solution_age_ms);
    WriteU16(output + 72, core->hdop_x100);
    WriteU16(output + 74, core->pdop_x100);
    WriteU16(output + 76, core->vdop_x100);
    WriteU16(output + 78, core->gst_sigma_lat_mm);
    WriteU16(output + 80, core->gst_sigma_lon_mm);
    WriteU16(output + 82, core->gst_sigma_alt_mm);
    WriteU16(output + 84, core->cn0_mean_dbhz_x10);
    WriteU16(output + 86, core->cn0_median_dbhz_x10);
    WriteU16(output + 88, core->cn0_min_dbhz_x10);
    WriteU16(output + 90, core->fix_streak_s);
    WriteU16(output + 92, core->fixed_ratio_1m_permille);
    WriteU16(output + 94, core->fix_drop_count);
    WriteU16(output + 96, core->reference_station_id);
    return GNSS_CORE_V3_PAYLOAD_BYTES;
}

uint32_t GnssTransportV3_Crc24q(const uint8_t *data, uint16_t data_bytes)
{
    uint32_t crc = 0U;
    uint16_t index;
    uint8_t bit;
    if (data == NULL) {
        return 0U;
    }
    for (index = 0U; index < data_bytes; ++index) {
        crc ^= (uint32_t)data[index] << 16;
        for (bit = 0U; bit < 8U; ++bit) {
            crc <<= 1;
            if ((crc & 0x1000000U) != 0U) {
                crc ^= 0x1864CFBU;
            }
        }
    }
    return crc & 0xFFFFFFU;
}

int GnssTransportV3_InspectRtcm3(
    const uint8_t *frame,
    uint16_t frame_bytes,
    uint16_t *message_type,
    uint32_t *frame_crc24q
)
{
    uint16_t payload_bytes;
    uint32_t expected_crc;
    uint32_t actual_crc;
    if (frame == NULL || frame_bytes < 8U || frame[0] != 0xD3U || (frame[1] & 0xFCU) != 0U) {
        return -1;
    }
    payload_bytes = (uint16_t)(((uint16_t)(frame[1] & 0x03U) << 8) | frame[2]);
    if (payload_bytes < 2U || frame_bytes != (uint16_t)(payload_bytes + 6U)) {
        return -1;
    }
    expected_crc = ((uint32_t)frame[frame_bytes - 3U] << 16) |
                   ((uint32_t)frame[frame_bytes - 2U] << 8) |
                   frame[frame_bytes - 1U];
    actual_crc = GnssTransportV3_Crc24q(frame, (uint16_t)(frame_bytes - 3U));
    if (expected_crc != actual_crc) {
        return -1;
    }
    if (message_type != NULL) {
        *message_type = (uint16_t)(((uint16_t)frame[3] << 4) | (frame[4] >> 4));
    }
    if (frame_crc24q != NULL) {
        *frame_crc24q = actual_crc;
    }
    return 0;
}

int GnssTransportV3_DecodeRtcmFragment(
    const uint8_t *payload,
    uint16_t payload_bytes,
    GnssRtcmFragmentViewV3 *fragment
)
{
    uint32_t end_offset;
    if (payload == NULL || fragment == NULL || payload_bytes <= GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES ||
        DecodeCommon(payload, payload_bytes, &fragment->transport) != 0) {
        return -1;
    }
    memset((uint8_t *)fragment + sizeof(fragment->transport), 0,
           sizeof(*fragment) - sizeof(fragment->transport));
    fragment->message_type = ReadU16(payload + 28);
    fragment->message_class = payload[30];
    fragment->fragment_index = payload[31];
    fragment->fragment_count = payload[32];
    fragment->total_bytes = ReadU16(payload + 34);
    fragment->fragment_offset = ReadU16(payload + 36);
    fragment->frame_crc24q = ReadU32(payload + 38);
    fragment->data = payload + GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES;
    fragment->data_bytes = (uint16_t)(payload_bytes - GNSS_RTCM_V3_FRAGMENT_HEADER_BYTES);
    end_offset = (uint32_t)fragment->fragment_offset + fragment->data_bytes;
    if (fragment->transport.source_node != 0U || fragment->transport.target_mask == 0U ||
        fragment->message_type == 0U || fragment->message_type > 4095U ||
        fragment->message_class != ClassifyRtcm(fragment->message_type) ||
        fragment->transport.ttl_ms > MaxRtcmTtl(fragment->message_class) ||
        fragment->fragment_count == 0U || fragment->fragment_count > GNSS_RTCM_V3_MAX_FRAGMENTS ||
        fragment->fragment_index >= fragment->fragment_count || payload[33] != 0U ||
        fragment->total_bytes == 0U || fragment->total_bytes > GNSS_RTCM_V3_MAX_FRAME_BYTES ||
        end_offset > fragment->total_bytes || fragment->frame_crc24q > 0xFFFFFFU) {
        return -1;
    }
    return 0;
}

static int IsNewerU32(uint32_t candidate, uint32_t reference)
{
    uint32_t delta = candidate - reference;
    return delta != 0U && delta < 0x80000000U;
}

static int TargetIncludesNode(uint8_t target_mask, uint8_t local_node)
{
    return local_node >= 1U && local_node <= 3U &&
           (target_mask & (uint8_t)(1U << (local_node - 1U))) != 0U;
}

static int WasCompleted(const GnssRtcmReassemblerV3 *state, uint32_t sequence)
{
    uint8_t index;
    for (index = 0U; index < state->completed_sequence_count; ++index) {
        if (state->completed_sequences[index] == sequence) {
            return 1;
        }
    }
    return 0;
}

static void RememberCompleted(GnssRtcmReassemblerV3 *state, uint32_t sequence)
{
    state->completed_sequences[state->completed_sequence_cursor] = sequence;
    state->completed_sequence_cursor =
        (uint8_t)((state->completed_sequence_cursor + 1U) % GNSS_RTCM_V3_RECENT_COMPLETED);
    if (state->completed_sequence_count < GNSS_RTCM_V3_RECENT_COMPLETED) {
        state->completed_sequence_count++;
    }
}

static void ClearSlot(GnssRtcmReassemblySlotV3 *slot)
{
    if (slot != NULL) {
        memset(slot, 0, sizeof(*slot));
    }
}

void GnssRtcmReassemblerV3_Init(GnssRtcmReassemblerV3 *state, uint8_t local_node)
{
    if (state == NULL) {
        return;
    }
    memset(state, 0, sizeof(*state));
    state->local_node = local_node;
}

static void ExpireSlots(GnssRtcmReassemblerV3 *state, uint64_t now_unix_ms)
{
    uint8_t index;
    for (index = 0U; index < GNSS_RTCM_V3_MAX_INFLIGHT; ++index) {
        GnssRtcmReassemblySlotV3 *slot = &state->slots[index];
        if (slot->in_use != 0U && now_unix_ms >= slot->first_seen_unix_ms &&
            now_unix_ms - slot->first_seen_unix_ms > GNSS_RTCM_V3_REASSEMBLY_TIMEOUT_MS) {
            ClearSlot(slot);
            state->expired_assemblies++;
        }
    }
}

static GnssRtcmReassemblySlotV3 *FindOrAllocateSlot(
    GnssRtcmReassemblerV3 *state,
    const GnssRtcmFragmentViewV3 *fragment,
    uint64_t now_unix_ms
)
{
    GnssRtcmReassemblySlotV3 *free_slot = NULL;
    GnssRtcmReassemblySlotV3 *oldest_slot = NULL;
    uint8_t index;
    for (index = 0U; index < GNSS_RTCM_V3_MAX_INFLIGHT; ++index) {
        GnssRtcmReassemblySlotV3 *slot = &state->slots[index];
        if (slot->in_use != 0U && slot->first.transport.sequence == fragment->transport.sequence) {
            return slot;
        }
        if (slot->in_use == 0U && free_slot == NULL) {
            free_slot = slot;
        }
        if (slot->in_use != 0U &&
            (oldest_slot == NULL || slot->first_seen_unix_ms < oldest_slot->first_seen_unix_ms)) {
            oldest_slot = slot;
        }
    }
    if (free_slot == NULL) {
        free_slot = oldest_slot;
        state->capacity_evictions++;
    }
    ClearSlot(free_slot);
    free_slot->in_use = 1U;
    free_slot->first = *fragment;
    free_slot->first.data = NULL;
    free_slot->first.data_bytes = 0U;
    free_slot->first_seen_unix_ms = now_unix_ms;
    return free_slot;
}

static int MetadataMatches(const GnssRtcmFragmentViewV3 *left, const GnssRtcmFragmentViewV3 *right)
{
    return left->transport.session_epoch == right->transport.session_epoch &&
           left->transport.sequence == right->transport.sequence &&
           left->transport.flags == right->transport.flags &&
           left->transport.target_mask == right->transport.target_mask &&
           left->transport.generated_unix_ms == right->transport.generated_unix_ms &&
           left->transport.ttl_ms == right->transport.ttl_ms &&
           left->message_type == right->message_type &&
           left->message_class == right->message_class &&
           left->fragment_count == right->fragment_count &&
           left->total_bytes == right->total_bytes &&
           left->frame_crc24q == right->frame_crc24q;
}

static int CoverageBit(const uint8_t *coverage, uint16_t offset)
{
    return (coverage[offset >> 3] & (uint8_t)(1U << (offset & 7U))) != 0U;
}

static void SetCoverageBit(uint8_t *coverage, uint16_t offset)
{
    coverage[offset >> 3] |= (uint8_t)(1U << (offset & 7U));
}

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
)
{
    GnssRtcmFragmentViewV3 fragment;
    GnssRtcmReassemblySlotV3 *slot;
    uint32_t fragment_bit;
    uint32_t expected_mask;
    uint16_t index;
    uint16_t message_type;
    uint32_t frame_crc;
    if (completed_bytes != NULL) {
        *completed_bytes = 0U;
    }
    if (state == NULL || GnssTransportV3_DecodeRtcmFragment(payload, payload_bytes, &fragment) != 0 ||
        !TargetIncludesNode(fragment.transport.target_mask, state->local_node)) {
        if (state != NULL) {
            state->rejected_fragments++;
        }
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    ExpireSlots(state, now_unix_ms);
    if (absolute_time_valid != 0U) {
        if (fragment.transport.generated_unix_ms > now_unix_ms + GNSS_RTCM_V3_MAX_FUTURE_SKEW_MS ||
            (now_unix_ms > fragment.transport.generated_unix_ms &&
             now_unix_ms - fragment.transport.generated_unix_ms > fragment.transport.ttl_ms)) {
            state->rejected_fragments++;
            return GNSS_RTCM_REASSEMBLY_REJECTED;
        }
    } else {
        state->ttl_unverified_fragments++;
    }
    if (state->has_active_session == 0U) {
        state->active_session_epoch = fragment.transport.session_epoch;
        state->has_active_session = 1U;
    } else if (fragment.transport.session_epoch != state->active_session_epoch) {
        if (!IsNewerU32(fragment.transport.session_epoch, state->active_session_epoch)) {
            state->rejected_fragments++;
            return GNSS_RTCM_REASSEMBLY_REJECTED;
        }
        state->active_session_epoch = fragment.transport.session_epoch;
        state->has_highest_sequence = 0U;
        state->completed_sequence_count = 0U;
        state->completed_sequence_cursor = 0U;
        memset(state->completed_sequences, 0, sizeof(state->completed_sequences));
        memset(state->slots, 0, sizeof(state->slots));
    }
    if (state->has_highest_sequence == 0U || IsNewerU32(fragment.transport.sequence, state->highest_sequence)) {
        state->highest_sequence = fragment.transport.sequence;
        state->has_highest_sequence = 1U;
    } else if (fragment.transport.sequence != state->highest_sequence &&
               state->highest_sequence - fragment.transport.sequence > GNSS_RTCM_V3_MAX_SEQUENCE_LAG) {
        state->rejected_fragments++;
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    if (WasCompleted(state, fragment.transport.sequence)) {
        state->duplicate_fragments++;
        return GNSS_RTCM_REASSEMBLY_DUPLICATE;
    }

    slot = FindOrAllocateSlot(state, &fragment, now_unix_ms);
    if (slot == NULL || !MetadataMatches(&slot->first, &fragment)) {
        ClearSlot(slot);
        state->rejected_fragments++;
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    fragment_bit = 1U << fragment.fragment_index;
    if ((slot->received_mask & fragment_bit) != 0U) {
        uint16_t stored_offset = slot->fragment_offsets[fragment.fragment_index];
        uint16_t stored_length = slot->fragment_lengths[fragment.fragment_index];
        if (stored_offset == fragment.fragment_offset && stored_length == fragment.data_bytes &&
            memcmp(slot->frame + stored_offset, fragment.data, fragment.data_bytes) == 0) {
            state->duplicate_fragments++;
            return GNSS_RTCM_REASSEMBLY_DUPLICATE;
        }
        ClearSlot(slot);
        state->rejected_fragments++;
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    for (index = 0U; index < fragment.data_bytes; ++index) {
        if (CoverageBit(slot->coverage, (uint16_t)(fragment.fragment_offset + index))) {
            ClearSlot(slot);
            state->rejected_fragments++;
            return GNSS_RTCM_REASSEMBLY_REJECTED;
        }
    }
    memcpy(slot->frame + fragment.fragment_offset, fragment.data, fragment.data_bytes);
    for (index = 0U; index < fragment.data_bytes; ++index) {
        SetCoverageBit(slot->coverage, (uint16_t)(fragment.fragment_offset + index));
    }
    slot->fragment_offsets[fragment.fragment_index] = fragment.fragment_offset;
    slot->fragment_lengths[fragment.fragment_index] = fragment.data_bytes;
    slot->received_mask |= fragment_bit;
    state->accepted_fragments++;

    expected_mask = fragment.fragment_count == 32U ? 0xFFFFFFFFU : (1U << fragment.fragment_count) - 1U;
    if (slot->received_mask != expected_mask) {
        return GNSS_RTCM_REASSEMBLY_ACCEPTED;
    }
    for (index = 0U; index < fragment.total_bytes; ++index) {
        if (!CoverageBit(slot->coverage, index)) {
            ClearSlot(slot);
            state->rejected_fragments++;
            return GNSS_RTCM_REASSEMBLY_REJECTED;
        }
    }
    if (completed_frame == NULL || completed_bytes == NULL ||
        completed_capacity < fragment.total_bytes) {
        ClearSlot(slot);
        state->rejected_fragments++;
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    if (!RtcmFrameCrcMatches(slot->frame, fragment.total_bytes)) {
        ClearSlot(slot);
        state->rejected_fragments++;
        state->crc_errors++;
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    if (GnssTransportV3_InspectRtcm3(slot->frame, fragment.total_bytes, &message_type, &frame_crc) != 0 ||
        message_type != fragment.message_type || frame_crc != fragment.frame_crc24q) {
        ClearSlot(slot);
        state->rejected_fragments++;
        return GNSS_RTCM_REASSEMBLY_REJECTED;
    }
    memcpy(completed_frame, slot->frame, fragment.total_bytes);
    *completed_bytes = fragment.total_bytes;
    if (completed_message_type != NULL) {
        *completed_message_type = message_type;
    }
    ClearSlot(slot);
    RememberCompleted(state, fragment.transport.sequence);
    state->completed_frames++;
    return GNSS_RTCM_REASSEMBLY_COMPLETE;
}
