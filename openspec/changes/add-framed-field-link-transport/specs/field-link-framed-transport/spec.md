---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-framed-field-link-transport/specs/field-link-framed-transport/spec
---

## ADDED Requirements

### Requirement: Shared Field Links Must Support Explicit Frame Types
The system SHALL define explicit frame types for shared field-link packets.

#### Scenario: Framed southbound transport is enabled
- **WHEN** the shared southbound link runs in framed mode
- **THEN** each frame MUST declare whether it carries telemetry, command, ack, or control content
- **AND** the receiver MUST reject payloads whose decoded content does not match the declared frame type

### Requirement: Framed Field Links Must Provide Sequence and Integrity Checks
The system SHALL require link-level sequence and integrity verification for framed field-link packets.

#### Scenario: Framed packet arrives at the gateway
- **WHEN** a packet is decoded from the framed field link
- **THEN** the receiver MUST validate the packet CRC before accepting the payload
- **AND** the receiver MUST expose the packet sequence for runtime observation

### Requirement: Shared Command Closure Must Use Stop-And-Wait
The system SHALL require stop-and-wait command closure on shared southbound links.

#### Scenario: Command is sent on a shared southbound port
- **WHEN** a command is written into a shared field link
- **THEN** the sender MUST keep the port in a pending command state until a matching ack or timeout closes the window
- **AND** it MUST NOT inject another command into the same shared port before that closure

### Requirement: Source-Adjacent Telemetry Buffering Must Protect ACK Closure
The system SHALL require source-adjacent telemetry buffering during command closure windows on shared field links.

#### Scenario: Shared link enters command closure window
- **WHEN** a source-adjacent controller has accepted a command and is awaiting its ack
- **THEN** it MUST temporarily buffer unrelated telemetry for that shared link
- **AND** it MUST replay the buffered telemetry only after the command closure window ends
