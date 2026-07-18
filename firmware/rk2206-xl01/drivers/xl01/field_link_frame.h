#ifndef DRIVERS_XL01_FIELD_LINK_FRAME_H
#define DRIVERS_XL01_FIELD_LINK_FRAME_H

#include "../../config/app_config.h"

// This wire format intentionally matches the field-gateway cobs-crc-v1 transport
// so the inner telemetry/command/ack JSON can stay aligned with the software layer.
#define FIELD_LINK_FRAME_VERSION 1

#define FIELD_LINK_FRAME_DELIMITER 0x00

#define FIELD_LINK_FRAME_HEADER_BYTES 12
#define FIELD_LINK_FRAME_CRC_BYTES    4
#define FIELD_LINK_FRAME_PACKET_BYTES (FIELD_LINK_FRAME_HEADER_BYTES + FIELD_LINK_MAX_PAYLOAD_BYTES + FIELD_LINK_FRAME_CRC_BYTES)
#define FIELD_LINK_FRAME_ENCODED_BYTES (FIELD_LINK_FRAME_PACKET_BYTES + (FIELD_LINK_FRAME_PACKET_BYTES / 254) + 4)

typedef enum {
    FIELD_LINK_FRAME_TYPE_INVALID = 0,
    FIELD_LINK_FRAME_TYPE_TELEMETRY = 1,
    FIELD_LINK_FRAME_TYPE_COMMAND = 2,
    FIELD_LINK_FRAME_TYPE_ACK = 3,
    FIELD_LINK_FRAME_TYPE_CONTROL = 4,
} FieldLinkFrameType;

typedef struct {
    unsigned char frame[FIELD_LINK_FRAME_ENCODED_BYTES];
    int frame_len;
} FieldLinkFrameDecoder;

typedef struct {
    FieldLinkFrameType type;
    unsigned int sequence;
    char payload[FIELD_LINK_MAX_PAYLOAD_BYTES + 1];
    int payload_len;
} FieldLinkFrameMessage;

void FieldLinkFrameDecoder_Init(FieldLinkFrameDecoder *decoder);

int FieldLinkFrame_Encode(
    FieldLinkFrameType type,
    unsigned int sequence,
    const char *payload,
    int payload_len,
    unsigned char *output,
    int output_size
);

int FieldLinkFrameDecoder_FeedByte(
    FieldLinkFrameDecoder *decoder,
    unsigned char value,
    FieldLinkFrameMessage *out
);

const char *FieldLinkFrameTypeName(FieldLinkFrameType type);

#endif // DRIVERS_XL01_FIELD_LINK_FRAME_H
