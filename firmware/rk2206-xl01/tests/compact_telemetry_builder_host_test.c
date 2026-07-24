#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "../app/compact_telemetry_builder.h"
#include "../drivers/xl01/field_link_frame.h"

static unsigned int ReadUint32Be(const unsigned char *input)
{
    return ((unsigned int)input[0] << 24) |
           ((unsigned int)input[1] << 16) |
           ((unsigned int)input[2] << 8) |
           (unsigned int)input[3];
}

int main(void)
{
    const char *command_id = "123e4567-e89b-12d3-a456-426614174000";
    SensorData data;
    unsigned char payload[COMPACT_TELEMETRY_V1_PAYLOAD_BYTES];
    unsigned char frame[FIELD_LINK_FRAME_ENCODED_BYTES];
    FieldLinkFrameDecoder decoder;
    FieldLinkFrameMessage decoded;
    int payload_len;
    int frame_len;
    int result = 0;
    int index;

    memset(&data, 0, sizeof(data));
    data.seq = 0x01020304U;
    data.uptime = 0x10203040U;
    data.temperature = -12.34f;
    data.humidity = 56.78f;
    data.temp_valid = 1;
    data.soil_temperature = 23.4f;
    data.soil_moisture = 45.6f;
    data.soil_ec = 321.0f;
    data.soil_valid = 1;
    data.soil_ec_valid = 1;
    data.angle_x = -1.25f;
    data.angle_y = 2.5f;
    data.angle_z = 0.01f;
    data.tilt_valid = 1;
    data.latitude = 22.681538f;
    data.longitude = 110.195358f;
    data.gps_valid = 1;
    data.warning = 1;

    payload_len = BuildCompactTelemetryV1(
        &data,
        "B",
        command_id,
        "scheduler_poll",
        payload,
        sizeof(payload)
    );
    assert(payload_len == COMPACT_TELEMETRY_V1_PAYLOAD_BYTES);
    assert(payload[0] == 'L' && payload[1] == 'S' && payload[2] == 1U);
    assert(payload[3] == 2U);
    assert(payload[4] == 1U);
    assert(payload[5] == COMPACT_TELEMETRY_TRIGGER_SCHEDULER_POLL);
    assert(ReadUint32Be(payload + 8) == data.seq);
    assert(ReadUint32Be(payload + 12) == data.uptime);
    assert(ReadUint32Be(payload + 16) == CompactTelemetry_CommandTag(command_id));

    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY,
        7U,
        (const char *)payload,
        payload_len,
        frame,
        sizeof(frame)
    );
    assert(frame_len == 64);

    memset(&decoded, 0, sizeof(decoded));
    FieldLinkFrameDecoder_Init(&decoder);
    for (index = 0; index < frame_len; ++index) {
        result = FieldLinkFrameDecoder_FeedByte(&decoder, frame[index], &decoded);
    }
    assert(result == 1);
    assert(decoded.type == FIELD_LINK_FRAME_TYPE_TELEMETRY);
    assert(decoded.sequence == 7U);
    assert(decoded.payload_len == payload_len);
    assert(memcmp(decoded.payload, payload, (size_t)payload_len) == 0);

    printf("compact_payload_bytes=%d field_link_wire_bytes=%d command_tag=%08x\n",
           payload_len,
           frame_len,
           CompactTelemetry_CommandTag(command_id));
    printf("payload_hex=");
    for (index = 0; index < payload_len; ++index) {
        printf("%02x", payload[index]);
    }
    printf("\n");
    return 0;
}
