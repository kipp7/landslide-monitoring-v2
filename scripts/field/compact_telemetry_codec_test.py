#!/usr/bin/env python3

from xls1_three_node_batch_poll import (
    analyze_batch_completeness,
    command_tag,
    decode_compact_telemetry,
    decode_frame,
    encode_frame,
    evaluate_stability_gate,
    classify_repeated_broadcast_telemetry,
    should_retry_broadcast_poll,
    telemetry_profile_errors,
)


PAYLOAD_HEX = (
    "4c5301020103001f0102030410203040d02023fffb2e162e092411d00141"
    "ff8300fa0001015a17c2069172a00000"
)
COMMAND_ID = "123e4567-e89b-12d3-a456-426614174000"
PAYLOAD_V2_HEX = (
    "4c5302030303009e0000004d000003849664c12a2f5b5302092e12eb02a1008c"
    "ffe0000301778df8070a6bc00000"
)


def main() -> None:
    assert should_retry_broadcast_poll(0, 3, 0, 1) is False
    assert should_retry_broadcast_poll(2, 3, 0, 1) is True
    assert should_retry_broadcast_poll(2, 3, 1, 1) is False
    assert classify_repeated_broadcast_telemetry(2, False) == "redundant-retry"
    assert classify_repeated_broadcast_telemetry(2, True) == "duplicate"

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
    telemetry_v2 = decode_compact_telemetry(bytes.fromhex(PAYLOAD_V2_HEX))
    assert telemetry_v2["device_id"] == "00000000-0000-0000-0000-000000000003"
    assert telemetry_v2["meta"]["compact_payload_version"] == 2
    assert telemetry_v2["meta"]["field_sensor_source"] == "simulated"
    assert telemetry_v2["meta"]["battery_estimate_quality"] == "field-calibrated"
    assert telemetry_v2["metrics"]["battery_v"] == 12.123
    assert telemetry_v2["metrics"]["battery_pct"] == 83
    assert telemetry_v2["metrics"]["soil_temperature_c"] == 23.5
    assert telemetry_v2["metrics"]["soil_moisture_pct"] == 48.43
    assert telemetry_v2["metrics"]["electrical_conductivity_us_cm"] == 673
    assert telemetry_profile_errors(
        telemetry_v2,
        required_compact_version=2,
        required_field_sensor_source="simulated",
        require_battery_valid=True,
        require_field_sensors_valid=True,
    ) == []
    assert "field-source-simulated-expected-hardware" in telemetry_profile_errors(
        telemetry_v2,
        required_compact_version=2,
        required_field_sensor_source="hardware",
    )
    healthy_nodes = {
        label: {
            "expected": 60,
            "matched": 60,
            "sequence": {"nonUnitGaps": 0},
            "arrivalIntervalMs": {"p95": 1002.0},
            "commandToTelemetryLatencyMs": {"max": 730.0},
            "logicalCommandToTelemetryLatencyMs": {"max": 730.0},
        }
        for label in ("A", "B", "C")
    }
    gate_args = {
        "matched_rate": 1.0,
        "required_match_rate": 1.0,
        "decode_error_count": 0,
        "unmatched_telemetry": 0,
        "duplicate_telemetry": 0,
        "profile_violation_count": 0,
        "trailing_undelimited_bytes": 0,
        "node_results": healthy_nodes,
        "max_p95_interval_ms": 1500.0,
        "max_command_latency_ms": 950.0,
        "broadcast_retry_rate": 0.01,
        "max_broadcast_retry_rate": 0.02,
        "max_logical_response_latency_ms": 3000.0,
    }
    assert evaluate_stability_gate(**gate_args) is True
    legacy_nodes = {
        label: {
            key: value
            for key, value in result.items()
            if key != "logicalCommandToTelemetryLatencyMs"
        }
        for label, result in healthy_nodes.items()
    }
    assert evaluate_stability_gate(**{**gate_args, "node_results": legacy_nodes}) is True
    assert evaluate_stability_gate(**{**gate_args, "matched_rate": 0.999}) is False
    assert evaluate_stability_gate(**{**gate_args, "duplicate_telemetry": 1}) is False
    assert evaluate_stability_gate(**{**gate_args, "profile_violation_count": 1}) is False
    assert evaluate_stability_gate(**{**gate_args, "broadcast_retry_rate": 0.021}) is False
    slow_response_nodes = {label: dict(value) for label, value in healthy_nodes.items()}
    slow_response_nodes["A"] = {
        **slow_response_nodes["A"],
        "logicalCommandToTelemetryLatencyMs": {"max": 3000.1},
    }
    assert evaluate_stability_gate(**{**gate_args, "node_results": slow_response_nodes}) is False
    broken_nodes = {label: dict(value) for label, value in healthy_nodes.items()}
    broken_nodes["B"] = {**broken_nodes["B"], "sequence": {"nonUnitGaps": 1}}
    assert evaluate_stability_gate(**{**gate_args, "node_results": broken_nodes}) is False

    def batch_records(batch_count: int) -> dict[str, dict[str, int | str]]:
        return {
            f"{batch}:{node}": {"batch": batch, "node": node}
            for batch in range(1, batch_count + 1)
            for node in ("A", "B", "C")
        }

    all_records = batch_records(5)
    all_received = set(all_records)
    complete_summary = analyze_batch_completeness(all_records, all_received)
    assert complete_summary == {
        "completeBatches": 5,
        "partialBatches": 0,
        "emptyBatches": 0,
        "longestConsecutiveEmptyBatches": 0,
        "trailingConsecutiveEmptyBatches": 0,
        "lastCompleteBatch": 5,
        "lastMatchedBatch": 5,
        "simultaneousSilenceAfterHealthyTraffic": False,
    }

    partial_received = all_received - {"2:C", "4:B"}
    partial_summary = analyze_batch_completeness(all_records, partial_received)
    assert partial_summary["completeBatches"] == 3
    assert partial_summary["partialBatches"] == 2
    assert partial_summary["emptyBatches"] == 0
    assert partial_summary["simultaneousSilenceAfterHealthyTraffic"] is False

    outage_records = batch_records(15)
    outage_received = {
        command_id
        for command_id, record in outage_records.items()
        if int(record["batch"]) <= 8
    }
    outage_summary = analyze_batch_completeness(outage_records, outage_received)
    assert outage_summary["completeBatches"] == 8
    assert outage_summary["emptyBatches"] == 7
    assert outage_summary["longestConsecutiveEmptyBatches"] == 7
    assert outage_summary["trailingConsecutiveEmptyBatches"] == 7
    assert outage_summary["lastCompleteBatch"] == 8
    assert outage_summary["lastMatchedBatch"] == 8
    assert outage_summary["simultaneousSilenceAfterHealthyTraffic"] is True

    poll_command = b"P112345678"
    poll_frame = encode_frame(2, 8, poll_command)
    assert len(poll_command) == 10
    assert len(poll_frame) == 28
    assert command_tag(poll_command.decode("ascii")) == 0x9664C12A
    print("compact telemetry C/Python golden vector passed")


if __name__ == "__main__":
    main()
