#include "field_link_frame.h"

#include <stdio.h>
#include <string.h>

static void FieldLink_WriteUint32Be(unsigned char *output, unsigned int value)
{
    if (output == NULL) {
        return;
    }

    output[0] = (unsigned char)((value >> 24) & 0xFFU);
    output[1] = (unsigned char)((value >> 16) & 0xFFU);
    output[2] = (unsigned char)((value >> 8) & 0xFFU);
    output[3] = (unsigned char)(value & 0xFFU);
}

static unsigned int FieldLink_ReadUint32Be(const unsigned char *input)
{
    if (input == NULL) {
        return 0U;
    }

    return ((unsigned int)input[0] << 24) |
           ((unsigned int)input[1] << 16) |
           ((unsigned int)input[2] << 8) |
           (unsigned int)input[3];
}

static unsigned int FieldLink_Crc32(const unsigned char *data, int len)
{
    unsigned int crc = 0xFFFFFFFFU;
    int index;
    int bit;

    if (data == NULL || len < 0) {
        return 0U;
    }

    for (index = 0; index < len; ++index) {
        crc ^= (unsigned int)data[index];
        for (bit = 0; bit < 8; ++bit) {
            if ((crc & 1U) != 0U) {
                crc = (crc >> 1) ^ 0xEDB88320U;
            } else {
                crc >>= 1;
            }
        }
    }

    return crc ^ 0xFFFFFFFFU;
}

static int FieldLink_CobsEncode(
    const unsigned char *input,
    int input_len,
    unsigned char *output,
    int output_size
)
{
    int read_index = 0;
    int write_index = 1;
    int code_index = 0;
    unsigned char code = 1;

    if (input == NULL || output == NULL || input_len < 0 || output_size <= 1) {
        return -1;
    }

    output[0] = 0;
    while (read_index < input_len) {
        unsigned char value = input[read_index++];
        if (value == 0U) {
            output[code_index] = code;
            if (write_index >= output_size) {
                return -1;
            }
            code_index = write_index++;
            code = 1;
            continue;
        }

        if (write_index >= output_size) {
            return -1;
        }
        output[write_index++] = value;
        code++;

        if (code == 0xFFU) {
            output[code_index] = code;
            if (write_index >= output_size) {
                return -1;
            }
            code_index = write_index++;
            code = 1;
        }
    }

    output[code_index] = code;
    if (write_index >= output_size) {
        return -1;
    }
    output[write_index++] = FIELD_LINK_FRAME_DELIMITER;
    return write_index;
}

static int FieldLink_CobsDecode(
    const unsigned char *input,
    int input_len,
    unsigned char *output,
    int output_size
)
{
    int read_index = 0;
    int write_index = 0;

    if (input == NULL || output == NULL || input_len <= 0 || output_size <= 0) {
        return -1;
    }

    while (read_index < input_len) {
        int i;
        unsigned char code = input[read_index++];
        if (code == 0U) {
            return -1;
        }

        for (i = 1; i < (int)code; ++i) {
            if (read_index >= input_len || write_index >= output_size) {
                return -1;
            }
            output[write_index++] = input[read_index++];
        }

        if (code < 0xFFU && read_index < input_len) {
            if (write_index >= output_size) {
                return -1;
            }
            output[write_index++] = 0;
        }
    }

    return write_index;
}

static int FieldLink_DecodeFrame(const unsigned char *frame, int frame_len, FieldLinkFrameMessage *out)
{
    unsigned char packet[FIELD_LINK_FRAME_PACKET_BYTES];
    FieldLinkFrameType frame_type;
    unsigned int payload_len;
    unsigned int expected_crc;
    unsigned int actual_crc;
    int packet_len;

    if (frame == NULL || out == NULL) {
        return -1;
    }

    packet_len = FieldLink_CobsDecode(frame, frame_len, packet, sizeof(packet));
    if (packet_len < (FIELD_LINK_FRAME_HEADER_BYTES + FIELD_LINK_FRAME_CRC_BYTES)) {
        return -1;
    }

    if (packet[0] != FIELD_LINK_FRAME_VERSION) {
        return -1;
    }

    payload_len = FieldLink_ReadUint32Be(packet + 8);
    if (payload_len > FIELD_LINK_MAX_PAYLOAD_BYTES) {
        return -1;
    }

    if (packet_len != (FIELD_LINK_FRAME_HEADER_BYTES + (int)payload_len + FIELD_LINK_FRAME_CRC_BYTES)) {
        return -1;
    }

    expected_crc = FieldLink_ReadUint32Be(packet + packet_len - FIELD_LINK_FRAME_CRC_BYTES);
    actual_crc = FieldLink_Crc32(packet, packet_len - FIELD_LINK_FRAME_CRC_BYTES);
    if (expected_crc != actual_crc) {
        return -1;
    }

    frame_type = (FieldLinkFrameType)packet[1];
    if (frame_type != FIELD_LINK_FRAME_TYPE_TELEMETRY &&
        frame_type != FIELD_LINK_FRAME_TYPE_COMMAND &&
        frame_type != FIELD_LINK_FRAME_TYPE_ACK &&
        frame_type != FIELD_LINK_FRAME_TYPE_CONTROL) {
        return -1;
    }

    memset(out, 0, sizeof(*out));
    out->type = frame_type;
    out->sequence = FieldLink_ReadUint32Be(packet + 4);
    out->payload_len = (int)payload_len;
    if (payload_len > 0U) {
        memcpy(out->payload, packet + FIELD_LINK_FRAME_HEADER_BYTES, payload_len);
    }
    out->payload[payload_len] = '\0';
    return 1;
}

void FieldLinkFrameDecoder_Init(FieldLinkFrameDecoder *decoder)
{
    if (decoder == NULL) {
        return;
    }

    memset(decoder, 0, sizeof(*decoder));
}

int FieldLinkFrame_Encode(
    FieldLinkFrameType type,
    unsigned int sequence,
    const char *payload,
    int payload_len,
    unsigned char *output,
    int output_size
)
{
    unsigned char packet[FIELD_LINK_FRAME_PACKET_BYTES];
    int packet_len;
    unsigned int crc;

    if (output == NULL || payload_len < 0 || payload_len > FIELD_LINK_MAX_PAYLOAD_BYTES) {
        return -1;
    }

    if (payload_len > 0 && payload == NULL) {
        return -1;
    }

    if (type != FIELD_LINK_FRAME_TYPE_TELEMETRY &&
        type != FIELD_LINK_FRAME_TYPE_COMMAND &&
        type != FIELD_LINK_FRAME_TYPE_ACK &&
        type != FIELD_LINK_FRAME_TYPE_CONTROL) {
        return -1;
    }

    memset(packet, 0, sizeof(packet));
    packet[0] = FIELD_LINK_FRAME_VERSION;
    packet[1] = (unsigned char)type;
    packet[2] = 0;
    packet[3] = 0;
    FieldLink_WriteUint32Be(packet + 4, sequence);
    FieldLink_WriteUint32Be(packet + 8, (unsigned int)payload_len);
    if (payload_len > 0) {
        memcpy(packet + FIELD_LINK_FRAME_HEADER_BYTES, payload, (size_t)payload_len);
    }

    packet_len = FIELD_LINK_FRAME_HEADER_BYTES + payload_len;
    crc = FieldLink_Crc32(packet, packet_len);
    FieldLink_WriteUint32Be(packet + packet_len, crc);
    packet_len += FIELD_LINK_FRAME_CRC_BYTES;

    return FieldLink_CobsEncode(packet, packet_len, output, output_size);
}

int FieldLinkFrameDecoder_FeedByte(
    FieldLinkFrameDecoder *decoder,
    unsigned char value,
    FieldLinkFrameMessage *out
)
{
    if (decoder == NULL || out == NULL) {
        return -1;
    }

    if (value == FIELD_LINK_FRAME_DELIMITER) {
        if (decoder->frame_len <= 0) {
            return 0;
        }

        {
            int ret = FieldLink_DecodeFrame(decoder->frame, decoder->frame_len, out);
            decoder->frame_len = 0;
            return ret;
        }
    }

    if (decoder->frame_len >= FIELD_LINK_FRAME_ENCODED_BYTES) {
        decoder->frame_len = 0;
        return -1;
    }

    decoder->frame[decoder->frame_len++] = value;
    return 0;
}

const char *FieldLinkFrameTypeName(FieldLinkFrameType type)
{
    switch (type) {
        case FIELD_LINK_FRAME_TYPE_TELEMETRY:
            return "telemetry";
        case FIELD_LINK_FRAME_TYPE_COMMAND:
            return "command";
        case FIELD_LINK_FRAME_TYPE_ACK:
            return "ack";
        case FIELD_LINK_FRAME_TYPE_CONTROL:
            return "control";
        default:
            return "invalid";
    }
}
