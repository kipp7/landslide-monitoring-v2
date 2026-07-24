#!/usr/bin/env python3

from xls1_three_node_batch_poll import (
    command_tag,
    decode_compact_telemetry,
    decode_frame,
    encode_frame,
)


PAYLOAD_HEX = (
    "4c5301020103001f0102030410203040d02023fffb2e162e092411d00141"
    "ff8300fa0001015a17c2069172a00000"
)
COMMAND_ID = "123e4567-e89b-12d3-a456-426614174000"


def main() -> None:
    payload = bytes.fromhex(PAYLOAD_HEX)
    telemetry = decode_compact_telemetry(payload)
    frame = encode_frame(1, 7, payload)
    frame_type, sequence, decoded_payload = decode_frame(frame[:-1])

    assert len(payload) == 46
    assert len(frame) == 64
    assert frame_type == 1
    assert sequence == 7
    assert decoded_payload == payload
    assert command_tag(COMMAND_ID) == 0xD02023FF
    assert telemetry["device_id"] == "00000000-0000-0000-0000-000000000002"
    assert telemetry["seq"] == 0x01020304
    assert telemetry["meta"]["uptime_s"] == 0x10203040
    assert telemetry["meta"]["last_command_tag"] == 0xD02023FF
    assert telemetry["meta"]["upload_trigger"] == "scheduler_poll"
    assert telemetry["metrics"]["temperature_c"] == -12.34
    assert telemetry["metrics"]["humidity_pct"] == 56.78
    assert telemetry["metrics"]["soil_temperature_c"] == 23.4
    assert telemetry["metrics"]["soil_moisture_pct"] == 45.6
    assert telemetry["metrics"]["electrical_conductivity_us_cm"] == 321
    assert telemetry["metrics"]["tilt_x_deg"] == -1.25
    assert telemetry["metrics"]["tilt_y_deg"] == 2.5
    assert telemetry["metrics"]["tilt_z_deg"] == 0.01
    assert telemetry["metrics"]["gps_latitude"] == 22.681538
    assert telemetry["metrics"]["gps_longitude"] == 110.19536
    assert telemetry["metrics"]["warning_flag"] is True
    print("compact telemetry C/Python golden vector passed")


if __name__ == "__main__":
    main()
