#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "../app/compact_telemetry_builder.h"
#include "../app/compact_poll_command.h"
#include "../drivers/sensors/simulated_field_sensors.h"
#include "../drivers/xl01/field_link_frame.h"

static unsigned int ReadUint16Be(const unsigned char *input)
{
    return ((unsigned int)input[0] << 8) |
           (unsigned int)input[1];
}

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
    unsigned char payload[COMPACT_TELEMETRY_PAYLOAD_BYTES];
    unsigned char frame[FIELD_LINK_FRAME_ENCODED_BYTES];
    FieldLinkFrameDecoder decoder;
    FieldLinkFrameMessage decoded;
    int payload_len;
    int frame_len;
    int telemetry_frame_len;
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
    assert((short)ReadUint16Be(payload + 20) == -1234);
    assert(ReadUint16Be(payload + 22) == 5678U);

    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY,
        7U,
        (const char *)payload,
        payload_len,
        frame,
        sizeof(frame)
    );
    assert(frame_len == 64);
    telemetry_frame_len = frame_len;

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

    memset(&data, 0, sizeof(data));
    data.seq = 77U;
    data.uptime = 900U;
    SimulatedFieldSensors_Read(&data, data.uptime, 'C');
    assert(data.soil_valid == 1);
    assert(data.soil_ec_valid == 1);
    assert(data.tilt_valid == 1);
    assert(data.temp_valid == 0);
    assert(data.gps_valid == 0);
    assert(data.battery_valid == 0);
    data.latitude = 24.612345f;
    data.longitude = 118.123456f;
    data.gps_valid = 1;
    data.battery_voltage_mv = 12123U;
    data.battery_level = 83;
    data.battery_estimate_quality = 2;
    data.battery_valid = 1;
    data.warning = 1;

    payload_len = BuildCompactTelemetryV2(
        &data,
        "C",
        "P112345678",
        "scheduler_poll",
        payload,
        sizeof(payload)
    );
    assert(payload_len == COMPACT_TELEMETRY_V2_PAYLOAD_BYTES);
    assert(payload[0] == 'L' && payload[1] == 'S' && payload[2] == 2U);
    assert(payload[3] == 3U);
    assert(payload[4] == (COMPACT_TELEMETRY_STATUS_WARNING |
                          COMPACT_TELEMETRY_STATUS_FIELD_SENSORS_SIMULATED));
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_VALID_BATTERY) != 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_VALID_SOIL) != 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_VALID_TILT) != 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_VALID_GPS) != 0U);
    assert((ReadUint16Be(payload + 6) & COMPACT_TELEMETRY_VALID_TEMP) == 0U);
    assert(ReadUint16Be(payload + 20) == 12123U);
    assert(payload[22] == 83U);
    assert(payload[23] == 2U);

    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_TELEMETRY,
        9U,
        (const char *)payload,
        payload_len,
        frame,
        sizeof(frame)
    );
    assert(frame_len == telemetry_frame_len);
    assert(frame_len == 64);

    assert(CompactPollCommand_IsValid("P112345678", COMPACT_POLL_COMMAND_BYTES));
    assert(!CompactPollCommand_IsValid("P11234567Z", COMPACT_POLL_COMMAND_BYTES));
    assert(CompactPollCommand_NodeDelayMs("A") == 0U);
    assert(CompactPollCommand_NodeDelayMs("B") == 340U);
    assert(CompactPollCommand_NodeDelayMs("C") == 680U);
    frame_len = FieldLinkFrame_Encode(
        FIELD_LINK_FRAME_TYPE_COMMAND,
        8U,
        "P112345678",
        COMPACT_POLL_COMMAND_BYTES,
        frame,
        sizeof(frame)
    );
    assert(frame_len == 28);

    printf("compact_payload_bytes=%d field_link_wire_bytes=%d command_tag=%08x\n",
           payload_len,
           telemetry_frame_len,
           CompactTelemetry_CommandTag(command_id));
    printf("payload_hex=");
    for (index = 0; index < payload_len; ++index) {
        printf("%02x", payload[index]);
    }
    printf("\n");
    return 0;
}
