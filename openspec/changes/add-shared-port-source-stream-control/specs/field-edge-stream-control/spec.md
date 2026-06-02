---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/specs/field-edge-stream-control/spec
---

## ADDED Requirements

### Requirement: Shared Southbound Ports Must Use Single-Writer Serialization
The system SHALL require any center node or gateway path that multiplexes multiple field-node payloads onto one shared southbound serial transport to serialize one complete logical message at a time.

#### Scenario: Multiple node payloads are ready on one shared UART
- **WHEN** more than one node payload is pending for the same shared southbound serial port
- **THEN** the source-side control point MUST ensure only one logical message owns the write window at a time
- **AND** it MUST NOT allow a second message to inject bytes before the first message has been completely written

### Requirement: Shared Southbound Links Must Preserve Command ACK Windows
The system SHALL reserve a command ACK quiet window on shared southbound serial links so command closure is not polluted by unrelated telemetry bytes.

#### Scenario: A command is forwarded to one node on a shared serial path
- **WHEN** the source-side control point forwards a command over a shared southbound serial link
- **THEN** it MUST hold or gate unrelated payload injection until an ACK is observed, the ACK window times out, or the command is classified as failed
- **AND** it MUST treat that quiet window as part of the command closure contract rather than as optional best effort

### Requirement: Cadence Staggering Must Not Be Treated As Primary Closure
The system SHALL treat node reporting cadence staggering as an optional mitigation, not as the primary production closure for shared-port stability.

#### Scenario: A stagger profile reduces collision probability
- **WHEN** the project tests a stagger profile such as `5/7/11`
- **THEN** that profile MAY be kept as a secondary optimization
- **AND** it MUST NOT be accepted as the primary production fix if shared-port interleaving evidence continues to grow during the observation window

### Requirement: Shared-Port Readiness Must Use Interleaving Evidence
The system SHALL require shared-port production readiness to be judged by structured interleaving and node-status evidence, not only by process liveness.

#### Scenario: Shared-port readiness review is performed
- **WHEN** the project evaluates whether a shared southbound serial path is production-ready
- **THEN** it MUST review `interleavingSuspected`, `interleavingWithMultipleSchemas`, `interleavingWithMultipleDeviceIds`, `schemaRejected`, and node runtime status
- **AND** it MUST NOT accept the path as stable based only on service activity, MQTT connectivity, or serial-open state

### Requirement: Source-Side Control Boundary Must Be Explicit
The system SHALL explicitly define where source-side stream control is implemented for a shared field serial path.

#### Scenario: Center XL01 and RK3568 both participate in the southbound path
- **WHEN** the field design uses a center XL01 and an RK3568 gateway on the same end-to-end southbound path
- **THEN** the project MUST define which layer owns serialization, quiet-window gating, and queue release decisions
- **AND** runtime observation on RK3568 MUST remain aligned with that control contract
