#!/usr/bin/env python3

import struct
from argparse import Namespace
from pathlib import Path
from tempfile import TemporaryDirectory

from xls1_three_node_batch_poll import (
    COMPACT_STATUS_GNSS_SIMULATED,
    analyze_batch_completeness,
    build_targeted_compact_poll,
    command_tag,
    decode_compact_telemetry,
    decode_frame,
    encode_frame,
    evaluate_stability_gate,
    classify_repeated_broadcast_telemetry,
    polling_node_order,
    should_retry_broadcast_poll,
    telemetry_profile_errors,
)
from xls1_compact_v4_acceptance import (
    minimum_session_timeout_ms,
    require_ntrip_disabled,
    stage_arguments,
)
from xls1_compact_v6_layered_acceptance import (
    acceptance_extension_scope,
    build_layered_poll,
    evaluate_layered_gate,
    layered_extension_scope,
    sequence_summary,
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
PAYLOAD_V3_HEX = (
    "4c53030303031fff0000004d000003849664c12a2f5b5302092e12eb02a1008cffe0"
    "000300000005bb02974e0000001b80b4e91500003039fffff6d7000007d00000007f"
    "075bcd15097e04017e6f1f003400060007000f004703d700020052"
)
PAYLOAD_V4_HEX = (
    "4c53040303031fff0000004d000003849664c12a2f5b5302092e12eb02a1008cffe0"
    "000300000005bb02974e0000001b80b4e91500003039fffff6d7000007d00000007f"
    "075bcd15097e04017e6f1f003400060007000f004703d700020052023f0104123456"
    "780000e6f30000007b000000ea00000159000004d2000001c8000001c20002000100"
    "0c0006"
)
PAYLOAD_V5_HEX = (
    "4c53050303031fff0000004d000003849664c12a2f5b5302092e12eb02a1008cffe0"
    "000300000005bb02974e0000001b80b4e91500003039fffff6d7000007d00000007f"
    "075bcd15097e04017e6f1f003400060007000f004703d700020052023f0104123456"
    "780250001701c20f"
)


def main() -> None:
    assert build_layered_poll("core").startswith("P1")
    assert build_layered_poll("core", "B").startswith("P2B")
    assert build_layered_poll("environment", "A").startswith("P3A")
    assert build_layered_poll("audit", "C").startswith("P4C")
    assert layered_extension_scope(3, 3, 15) == "environment"
    assert layered_extension_scope(15, 3, 15) == "audit"
    assert layered_extension_scope(16, 3, 15) is None
    assert acceptance_extension_scope(1, 30, 60, set()) == "environment"
    assert acceptance_extension_scope(2, 30, 60, {"environment"}) == "audit"
    assert acceptance_extension_scope(3, 30, 60, {"environment", "audit"}) is None
    assert acceptance_extension_scope(30, 30, 60, {"environment", "audit"}) == "environment"
    assert acceptance_extension_scope(60, 30, 60, {"environment", "audit"}) == "audit"
    assert sequence_summary([0xFFFFFFFE, 0xFFFFFFFF, 0, 1])["nonUnitGaps"] == 0
    assert sequence_summary([1, 3])["nonUnitGaps"] == 1

    healthy_node = {
        "coreExpected": 10,
        "coreMatched": 10,
        "allScopeSequence": {"nonUnitGaps": 0, "nonForward": 0},
        "coreArrivalIntervalMs": {"p95": 2400.0},
        "commandToTelemetryLatencyMs": {"p95": 2300.0, "max": 6000.0},
    }
    layered_report = {
        "result": {
            "coreRoundsSent": 10,
            "completeCoreRounds": 10,
            "decodeErrors": 0,
            "wireLengthViolations": 0,
            "unmatchedTelemetry": 0,
            "duplicateTelemetry": 0,
            "recoveryRedundantTelemetry": 0,
            "scopeMismatches": 0,
            "extensionEpochMismatches": 0,
            "profileViolations": 0,
            "trailingUndelimitedBytes": 0,
        },
        "nodes": {label: dict(healthy_node) for label in ("A", "B", "C")},
        "extensions": {
            "environment": {"expected": 1, "matched": 1},
            "audit": {"expected": 1, "matched": 1},
        },
    }
    assert evaluate_layered_gate(layered_report, 2500.0, 2500.0, 6500.0)
    layered_report["result"]["recoveryRedundantTelemetry"] = 1
    assert not evaluate_layered_gate(layered_report, 2500.0, 2500.0, 6500.0)

    assert minimum_session_timeout_ms(1500, 0) == 1500
    assert minimum_session_timeout_ms(1500, 1) == 3000
    try:
        minimum_session_timeout_ms(0, 0)
    except ValueError:
        pass
    else:
        raise AssertionError("acceptance gate accepted a non-positive response window")

    stage = stage_arguments(
        Namespace(
            serial_device="/dev/ttyS3",
            baud=115200,
            batch_interval_ms=250,
            response_window_ms=3000,
            session_timeout_ms=3000,
            settle_timeout_ms=30000,
            settle_quiet_ms=5000,
            max_command_latency_ms=1500.0,
            max_retry_rate=0.0,
            max_p95_interval_ms=2500.0,
            required_compact_version=5,
            required_gnss_source="simulated",
            service="lsmv2-field-gateway.service",
        ),
        60.0,
    )
    assert stage.response_wait_ms == 3000
    assert stage.max_logical_response_latency_ms == 3000
    assert stage.max_command_latency_ms == 1500.0

    with TemporaryDirectory() as temporary_directory:
        environment_file = Path(temporary_directory) / "field-gateway.env"
        environment_file.write_text("NTRIP_ENABLED=false\n", encoding="ascii")
        require_ntrip_disabled(environment_file)
        environment_file.write_text("NTRIP_ENABLED=true\n", encoding="ascii")
        try:
            require_ntrip_disabled(environment_file)
        except RuntimeError as exc:
            assert "requires NTRIP_ENABLED=false" in str(exc)
        else:
            raise AssertionError("pure telemetry gate accepted enabled NTRIP")

    assert should_retry_broadcast_poll(0, 3, 0, 1) is False
    assert should_retry_broadcast_poll(2, 3, 0, 1) is True
    assert should_retry_broadcast_poll(2, 3, 1, 1) is False
    assert classify_repeated_broadcast_telemetry(2, False) == "redundant-retry"
    assert classify_repeated_broadcast_telemetry(2, True) == "duplicate"
    targeted_poll = build_targeted_compact_poll("B")
    assert len(targeted_poll) == 11
    assert targeted_poll.startswith("P2B")
    assert [label for label, _ in polling_node_order(0, True)] == ["A", "B", "C"]
    assert [label for label, _ in polling_node_order(1, True)] == ["A", "B", "C"]
    assert [label for label, _ in polling_node_order(1, False)] == ["B", "C", "A"]

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
    legacy_rtcm_errors = telemetry_profile_errors(
        telemetry_v2,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
    )
    assert legacy_rtcm_errors == [
        "rtcm-mode-unavailable-expected-disabled",
        "rtcm-evidence-requires-compact-v4-or-v5",
    ]

    telemetry_v3 = decode_compact_telemetry(bytes.fromhex(PAYLOAD_V3_HEX))
    assert telemetry_v3["meta"]["compact_payload_version"] == 3
    assert telemetry_v3["meta"]["gnss_source"] == "hardware"
    assert telemetry_v3["metrics"]["rtk_latitude_deg"] == 24.612345678
    assert telemetry_v3["metrics"]["rtk_longitude_deg"] == 118.123456789
    assert telemetry_v3["metrics"]["rtk_trusted"] is True
    assert telemetry_v3["metrics"]["rtk_fixed_ratio_1m_pct"] == 98.3

    telemetry_v4_live = decode_compact_telemetry(bytes.fromhex(PAYLOAD_V4_HEX))
    assert telemetry_v4_live["meta"]["compact_payload_version"] == 4
    assert telemetry_v4_live["meta"]["rtcm_injection_mode"] == "live"
    assert telemetry_v4_live["metrics"]["rtcm_session_epoch"] == 0x12345678
    assert telemetry_v4_live["metrics"]["rtcm_lease_remaining_ms"] == 59123
    assert telemetry_v4_live["metrics"]["rtcm_crc_errors_total"] == 1

    telemetry_v5_live = decode_compact_telemetry(bytes.fromhex(PAYLOAD_V5_HEX))
    v5_frame = encode_frame(1, 11, bytes.fromhex(PAYLOAD_V5_HEX))
    assert len(bytes.fromhex(PAYLOAD_V5_HEX)) == 110
    assert len(v5_frame) == 128
    assert telemetry_v5_live["meta"]["compact_payload_version"] == 5
    assert telemetry_v5_live["meta"]["rtcm_injection_mode"] == "live"
    assert telemetry_v5_live["meta"]["rtcm_lease_resolution_ms"] == 100
    assert telemetry_v5_live["meta"]["rtcm_completion_age_resolution_ms"] == 10
    assert telemetry_v5_live["meta"]["rtcm_injected_frames_counter_saturated"] is False
    assert telemetry_v5_live["metrics"]["rtcm_session_epoch"] == 0x12345678
    assert telemetry_v5_live["metrics"]["rtcm_lease_remaining_ms"] == 59200
    assert telemetry_v5_live["metrics"]["rtcm_last_completed_frame_age_ms"] == 230
    assert telemetry_v5_live["metrics"]["rtcm_injected_frames_total"] == 450
    assert telemetry_v5_live["metrics"]["rtcm_error_summary_flags"] == 0x0F
    assert telemetry_v5_live["metrics"]["rtcm_rejected_fragment_error"] is True
    assert telemetry_v5_live["metrics"]["rtcm_crc_error"] is True
    assert telemetry_v5_live["metrics"]["rtcm_queue_drop_error"] is True
    assert telemetry_v5_live["metrics"]["rtcm_uart_error"] is True

    saturated_v5 = bytearray.fromhex(PAYLOAD_V5_HEX)
    saturated_v5[107:109] = bytes.fromhex("ffff")
    saturated_v5[109] |= 0x10
    telemetry_v5_saturated = decode_compact_telemetry(bytes(saturated_v5))
    assert telemetry_v5_saturated["metrics"]["rtcm_error_summary_flags"] == 0x0F
    assert telemetry_v5_saturated["meta"]["rtcm_injected_frames_counter_saturated"] is True

    disabled_v5 = bytearray.fromhex(PAYLOAD_V5_HEX)
    disabled_v5[4] &= ~0x02
    disabled_v5[95] = 0
    disabled_v5[96] = 0x01
    disabled_v5[97:105] = bytes(8)
    disabled_v5[105:107] = bytes.fromhex("ffff")
    disabled_v5[107:110] = bytes(3)
    telemetry_v5_disabled = decode_compact_telemetry(bytes(disabled_v5))
    assert telemetry_v5_disabled["meta"]["rtcm_injection_mode"] == "disabled"
    assert telemetry_v5_disabled["metrics"]["rtcm_session_epoch"] == 0
    assert "rtcm_last_completed_frame_age_ms" not in telemetry_v5_disabled["metrics"]
    assert telemetry_profile_errors(
        telemetry_v5_disabled,
        required_compact_version=5,
        required_field_sensor_source="hardware",
        required_gnss_source="hardware",
        require_battery_valid=True,
        require_field_sensors_valid=True,
        require_field_calibrated_battery=True,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
    ) == []

    dirty_disabled_v5 = bytearray(disabled_v5)
    dirty_disabled_v5[102] = 1
    try:
        decode_compact_telemetry(bytes(dirty_disabled_v5))
    except ValueError as exc:
        assert "disabled RTCM state is not fail-closed" in str(exc)
    else:
        raise AssertionError("dirty disabled V5 state was accepted")

    malformed_v5 = bytearray.fromhex(PAYLOAD_V5_HEX)
    malformed_v5[109] = 0x80
    try:
        decode_compact_telemetry(bytes(malformed_v5))
    except ValueError as exc:
        assert "runtime summary is malformed" in str(exc)
    else:
        raise AssertionError("V5 reserved error flag was accepted")

    disabled_v4 = bytearray.fromhex(PAYLOAD_V4_HEX)
    disabled_v4[4] &= ~0x02
    disabled_v4[95] = 0
    disabled_v4[96] = 0x01
    disabled_v4[97] = 0
    disabled_v4[98] = 0
    disabled_v4[99:107] = bytes(8)
    disabled_v4[107:119] = bytes.fromhex("ffffffffffffffffffffffff")
    disabled_v4[119:139] = bytes(20)
    telemetry_v4_disabled = decode_compact_telemetry(bytes(disabled_v4))
    disabled_frame = encode_frame(1, 10, bytes(disabled_v4))
    assert len(disabled_v4) == 139
    assert len(disabled_frame) == 157
    assert telemetry_v4_disabled["meta"]["field_sensor_source"] == "hardware"
    assert telemetry_v4_disabled["meta"]["rtcm_injection_mode"] == "disabled"
    assert telemetry_v4_disabled["metrics"]["rtcm_session_epoch"] == 0
    assert telemetry_profile_errors(
        telemetry_v4_disabled,
        required_compact_version=4,
        required_field_sensor_source="hardware",
        required_gnss_source="hardware",
        require_battery_valid=True,
        require_field_sensors_valid=True,
        require_field_calibrated_battery=True,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
    ) == []

    hybrid_v4 = bytearray(disabled_v4)
    hybrid_v4[4] = (hybrid_v4[4] & ~0x02) | 0x04
    hybrid_v4[76:78] = struct.pack(">H", struct.unpack(">H", hybrid_v4[76:78])[0] & ~(1 << 1))
    hybrid_telemetry = decode_compact_telemetry(bytes(hybrid_v4))
    assert hybrid_telemetry["meta"]["field_sensor_source"] == "hardware"
    assert hybrid_telemetry["meta"]["gnss_source"] == "simulated"
    assert hybrid_telemetry["metrics"]["rtk_trusted"] is False
    assert hybrid_telemetry["meta"]["rtk_displacement_eligible"] is False
    assert telemetry_profile_errors(
        hybrid_telemetry,
        required_compact_version=4,
        required_field_sensor_source="hardware",
        required_gnss_source="simulated",
        require_battery_valid=True,
        require_field_sensors_valid=True,
        require_field_calibrated_battery=True,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
    ) == []
    contradictory_hybrid_v4 = bytearray(hybrid_v4)
    contradictory_hybrid_v4[76:78] = struct.pack(
        ">H", struct.unpack(">H", contradictory_hybrid_v4[76:78])[0] | (1 << 1)
    )
    try:
        decode_compact_telemetry(bytes(contradictory_hybrid_v4))
    except ValueError as exc:
        assert "simulated GNSS cannot be trusted" in str(exc)
    else:
        raise AssertionError("simulated GNSS with trusted RTK evidence was accepted")

    dirty_disabled_v4 = bytearray(disabled_v4)
    dirty_disabled_v4[102] = 1
    try:
        decode_compact_telemetry(bytes(dirty_disabled_v4))
    except ValueError as exc:
        assert "disabled RTCM state is not fail-closed" in str(exc)
    else:
        raise AssertionError("dirty disabled V4 state was accepted")

    dirty_counter_v4 = bytearray(disabled_v4)
    dirty_counter_v4[134] = 1
    dirty_counter_telemetry = decode_compact_telemetry(bytes(dirty_counter_v4))
    assert "rtcm_crc_errors_total-not-zero" in telemetry_profile_errors(
        dirty_counter_telemetry,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
    )

    prior_rtcm_activity_v4 = bytearray(disabled_v4)
    prior_rtcm_activity_v4[122] = 1
    prior_rtcm_telemetry = decode_compact_telemetry(bytes(prior_rtcm_activity_v4))
    assert "rtcm_accepted_fragments_total-not-zero" in telemetry_profile_errors(
        prior_rtcm_telemetry,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
    )

    prior_rtcm_age_v4 = bytearray(disabled_v4)
    prior_rtcm_age_v4[107:111] = bytes.fromhex("00000001")
    prior_rtcm_age_telemetry = decode_compact_telemetry(bytes(prior_rtcm_age_v4))
    assert "rtcm_last_fragment_age_ms-unexpected" in telemetry_profile_errors(
        prior_rtcm_age_telemetry,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
    )

    active_without_lease = bytearray.fromhex(PAYLOAD_V4_HEX)
    active_without_lease[103:107] = bytes(4)
    try:
        decode_compact_telemetry(bytes(active_without_lease))
    except ValueError as exc:
        assert "lacks a valid session lease" in str(exc)
    else:
        raise AssertionError("active V4 state without a lease was accepted")

    v6_payloads = {
        "core": bytes.fromhex(
            "4c5306030b0101ff0000004d000000299664c12a008cffe0000305bb02974e1b80b4e9150030390c1f0b14070607"
        ),
        "environment": bytes.fromhex(
            "4c5306030b02003f0000004d000000293026889d000003842f5b5302092e12eb02a1fff6d7097e075bcd15000f00"
        ),
        "audit": bytes.fromhex(
            "4c5306030b03001f0000004d00000029e8b69a76023f140f123456780250001701c27e6f047f5c02005200060007"
        ),
    }
    decoded_v6 = {scope: decode_compact_telemetry(value) for scope, value in v6_payloads.items()}
    assert all(len(value) == 46 and len(encode_frame(1, 20, value)) == 64 for value in v6_payloads.values())
    assert decoded_v6["core"]["meta"]["compact_scope"] == "core"
    assert decoded_v6["core"]["meta"]["sample_epoch"] == 41
    assert decoded_v6["core"]["metrics"]["rtk_latitude_deg"] == 24.612345678
    assert decoded_v6["core"]["metrics"]["rtk_solution_age_ms"] == 140
    assert decoded_v6["environment"]["metrics"]["battery_v"] == 12.123
    assert decoded_v6["environment"]["metrics"]["soil_moisture_pct"] == 48.43
    assert decoded_v6["audit"]["metrics"]["rtk_fixed_ratio_1m_pct"] == 98.3
    assert decoded_v6["audit"]["metrics"]["rtcm_lease_remaining_ms"] == 59200

    bad_v6 = bytearray(v6_payloads["core"])
    bad_v6[4] |= COMPACT_STATUS_GNSS_SIMULATED
    try:
        decode_compact_telemetry(bytes(bad_v6))
    except ValueError as exc:
        assert "simulated GNSS cannot be trusted" in str(exc)
    else:
        raise AssertionError("trusted simulated V6 core was accepted")

    zero_seq_v6 = bytearray(v6_payloads["core"])
    zero_seq_v6[8:12] = b"\x00\x00\x00\x00"
    try:
        decode_compact_telemetry(bytes(zero_seq_v6))
    except ValueError as exc:
        assert "common header is malformed" in str(exc)
    else:
        raise AssertionError("reserved V6 sequence zero was accepted")

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
