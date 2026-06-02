---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-field-hardware-gateway-architecture/specs/field-edge-architecture/spec
---

## ADDED Requirements

### Requirement: Three-Layer Field Architecture
The system SHALL define the field deployment architecture as three distinct layers: field node, field gateway, and central platform.

#### Scenario: Architecture boundary review
- **WHEN** the project evaluates a new hardware integration path
- **THEN** it MUST identify whether the responsibility belongs to the field node, the field gateway, or the central platform
- **AND** it MUST avoid assigning gateway-only responsibilities directly to the central platform

### Requirement: Gateway-Owned Protocol Adaptation
The system SHALL require protocol adaptation from field packets to platform contracts to be performed by the field gateway or a dedicated edge adapter, not by the central platform core.

#### Scenario: Field node uses private packet format
- **WHEN** a field node reports telemetry using a private serial/radio JSON format
- **THEN** the field gateway MUST translate that format into the platform-standard telemetry contract before the data enters the central platform write chain

### Requirement: Deployment Topology Must Consider Terrain, Signal, and Maintenance
The system SHALL define gateway and node deployment by manageable coverage cells rather than by a single undifferentiated site-wide topology.

#### Scenario: Gateway placement planning
- **WHEN** a new slope or monitoring area is planned for deployment
- **THEN** the design MUST evaluate terrain shielding, line-of-sight, power availability, backhaul quality, and maintenance access before freezing gateway placement

### Requirement: Power and Reporting Strategy Must Be Layer-Aware
The system SHALL define separate power and reporting strategies for field nodes and gateways.

#### Scenario: Low-power field node design
- **WHEN** a field node is specified for long-term outdoor deployment
- **THEN** the design MUST separate sampling frequency from reporting frequency
- **AND** it MUST define at least one lower-power operating profile for normal monitoring conditions

### Requirement: Redundancy Must Be Explicitly Tiered
The system SHALL define redundancy strategy separately for the node layer, gateway layer, and platform layer, rather than applying a uniform redundancy rule everywhere.

#### Scenario: Critical site redundancy planning
- **WHEN** a monitoring site is classified as critical
- **THEN** the design MUST explicitly state the required redundancy level for node, gateway, and platform components
- **AND** it MUST explain why the chosen redundancy level is justified for that site

### Requirement: Ubuntu RK3568 Gateway Profile Must Be Explicitly Qualified
The system SHALL document the acceptable role, constraints, and deployment prerequisites for `Ubuntu + RK3568` when used as a field gateway.

#### Scenario: Selecting RK3568 as gateway hardware
- **WHEN** the project selects `Ubuntu + RK3568` as a gateway candidate
- **THEN** the design MUST treat it as a gateway-class device rather than a low-power field node
- **AND** it MUST define its required power, storage, startup recovery, and backhaul assumptions

### Requirement: Install Labels Must Not Compete With Device Identity
The system SHALL allow a human-readable field installation label, but it MUST keep `device_id` as the only platform machine identity.

#### Scenario: Field label assigned to a node
- **WHEN** a node is assigned a field-facing installation label
- **THEN** the label MAY be used for display, asset stickers, and maintenance workflows
- **AND** the label MUST NOT replace `device_id` in authentication, topics, command targeting, or database identity

### Requirement: Field Telemetry Must Use a Constrained Profile
The system SHALL define a field telemetry profile that preserves platform telemetry semantics while constraining high-frequency field payload cost.

#### Scenario: High-frequency telemetry design review
- **WHEN** the project defines the node uplink message for high-frequency monitoring
- **THEN** the message MUST preserve platform-standard telemetry semantics
- **AND** it MUST explicitly exclude nonessential low-frequency or display-only fields from the default high-frequency payload

### Requirement: Field Link Framing and Length Budget Must Be Explicit
The system SHALL define explicit framing rules and an explicit payload length budget for the field uplink profile.

#### Scenario: Transparent field transport is used
- **WHEN** the field link uses a transparent serial or radio transport
- **THEN** the design MUST define how message boundaries are preserved or reconstructed
- **AND** it MUST define how oversized payloads are handled before production deployment

### Requirement: High-Frequency and Low-Frequency Data Must Be Layered Separately
The system SHALL separate high-frequency telemetry from low-frequency metadata or diagnostic content in the field protocol design.

#### Scenario: Adding static or infrequently changing fields
- **WHEN** the project needs to expose labels, firmware metadata, or diagnostic snapshots
- **THEN** the design MUST avoid placing those fields in the default high-frequency payload unless explicitly justified
- **AND** it MUST define a lower-frequency synchronization path for such data

### Requirement: Phase-1 Delivery Shall Prioritize Uplink Closure
The system SHALL define phase 1 hardware-software integration around uplink data closure before command/ack closure.

#### Scenario: Phase-1 implementation planning
- **WHEN** the project schedules the first real hardware integration milestone
- **THEN** it MUST first validate field node to gateway to platform uplink telemetry closure
- **AND** command, ack, or remote configuration closure MAY be deferred to a later phase

### Requirement: Software-First Integration Must Be Supported
The system SHALL define a software-first integration path so that protocol and adapter debugging can be completed before full real-hardware rollout.

#### Scenario: Pre-hardware integration rehearsal
- **WHEN** the project has not yet frozen real hardware deployment or field conditions
- **THEN** it MUST still be able to rehearse node-to-gateway and gateway-to-platform integration using software simulators, replay tools, or adapter harnesses

### Requirement: Node-to-Gateway and Gateway-to-Platform Must Be Validated Separately
The system SHALL define node-to-gateway validation and gateway-to-platform validation as separate integration stages.

#### Scenario: Debugging an uplink issue
- **WHEN** an uplink defect is found during integration
- **THEN** the validation process MUST make it possible to determine whether the defect belongs to the node-to-gateway boundary or the gateway-to-platform boundary

### Requirement: Each Integration Stage Must Produce Evidence
The system SHALL require each software-first integration stage to produce structured evidence before the project relies on that stage as architecture truth.

#### Scenario: Stage completion review
- **WHEN** a software integration stage is declared complete
- **THEN** the stage MUST provide concrete evidence such as payload samples, reconstruction logs, adapter acceptance output, or platform visibility proof

### Requirement: Software-First Rehearsal Must Cover Node, Gateway, and Platform Boundaries
The system SHALL define software-first rehearsal artifacts for the node side, gateway side, and platform ingress side separately.

#### Scenario: Preparing a software-only integration rehearsal
- **WHEN** the project prepares a software-only debug run before full hardware rollout
- **THEN** it MUST define what the node simulator produces
- **AND** it MUST define what the gateway adapter validates or reconstructs
- **AND** it MUST define how platform acceptance is observed and recorded

### Requirement: High-Frequency Packets Must Exclude Display-Only Labels
The system SHALL keep installation labels or other display-only identifiers out of the default high-frequency field telemetry payload.

#### Scenario: Reviewing a high-frequency payload
- **WHEN** a high-frequency field telemetry payload is reviewed
- **THEN** the payload MUST NOT include `install_label` unless there is an explicit exceptional justification
- **AND** the payload MUST continue to use `device_id` as its machine identity

### Requirement: Node Simulator Packet Classes Must Be Explicit
The system SHALL define explicit packet classes for software-first node simulation so that replay, duplication, ordering, and length-budget behavior can be validated before full hardware rollout.

#### Scenario: Preparing node-side simulator inputs
- **WHEN** the project prepares software-only node-side test traffic
- **THEN** it MUST include at least normal, duplicate, out-of-order, oversized, and replay packet classes

### Requirement: Gateway Spool Records Must Be Observable
The system SHALL define an observable spool or cache record model for gateway-side rehearsal runs.

#### Scenario: Reviewing gateway replay behavior
- **WHEN** a rehearsal validates outage buffering or replay behavior
- **THEN** the gateway-side evidence MUST show which messages were pending, replayed, accepted, or rejected

### Requirement: Platform Acceptance Probes Must Cover Ingest and Visibility
The system SHALL define platform acceptance probes that cover both ingress acceptance and downstream visibility.

#### Scenario: Rehearsal message reaches platform
- **WHEN** a software-first rehearsal message is forwarded into the platform path
- **THEN** the acceptance process MUST verify both that the platform accepted the message and that the message effects are visible through platform-facing read paths