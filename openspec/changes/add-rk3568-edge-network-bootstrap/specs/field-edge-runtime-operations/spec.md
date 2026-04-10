---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-network-bootstrap/specs/field-edge-runtime-operations/spec
---

## ADDED Requirements

### Requirement: RK3568 Startup Network Order Must Be Explicit
The system SHALL define an explicit RK3568 startup order for network bootstrap and gateway readiness.

#### Scenario: RK3568 cold boot
- **WHEN** an RK3568 field gateway boots from power-off or reboot
- **THEN** it MUST start local system prerequisites first
- **AND** it MUST attempt Wi-Fi station connectivity before enabling maintenance hotspot fallback

### Requirement: RK3568 Must Use STA First AP Fallback
The system SHALL require `STA first, AP fallback` as the only accepted default startup networking policy for RK3568 field gateways.

#### Scenario: Preferred network is available
- **WHEN** a configured Wi-Fi network is reachable during the startup connection window
- **THEN** the RK3568 MUST enter station-connected mode
- **AND** it MUST keep maintenance hotspot fallback disabled

#### Scenario: Preferred network is unavailable
- **WHEN** no configured Wi-Fi network can be joined during the startup connection window
- **THEN** the RK3568 MUST enter maintenance hotspot fallback mode
- **AND** it MUST continue exposing a local maintenance path without blocking gateway recovery

### Requirement: RK3568 Maintenance Hotspot Identity Must Be Fixed
The system SHALL use a fixed maintenance hotspot identity for RK3568 fallback mode.

#### Scenario: AP fallback becomes active
- **WHEN** the RK3568 enters maintenance hotspot fallback mode
- **THEN** the hotspot SSID MUST be `rk3568-1`
- **AND** the hotspot MUST be treated as a maintenance-only network rather than a primary production backhaul

### Requirement: Gateway Core and Network Bootstrap Must Be Separated
The system SHALL separate RK3568 network/bootstrap responsibilities from the field gateway core process.

#### Scenario: Reviewing process ownership
- **WHEN** the RK3568 runtime is reviewed for production startup behavior
- **THEN** network/bootstrap logic MUST be owned by a dedicated bootstrap or device-management process
- **AND** the field gateway core MUST remain focused on serial, validation, spool, and MQTT responsibilities

### Requirement: Sidecars Must Not Block Gateway Availability
The system SHALL define sidecar startup and isolation rules so that optional local UI or model workloads cannot block gateway availability.

#### Scenario: Optional sidecar is installed
- **WHEN** a display, local UI, or model sidecar is enabled on RK3568
- **THEN** that sidecar MUST start only after bootstrap and gateway readiness conditions are met
- **AND** it MUST NOT own the southbound serial device or delay gateway recovery

### Requirement: OpenClaw Quality Monitoring Must Be Introduced as Read-Only
The system SHALL reserve future `OpenClaw` data-link quality monitoring on RK3568 as a read-only sidecar capability on first introduction.

#### Scenario: Planning a future OpenClaw deployment on RK3568
- **WHEN** the project prepares for a future RK3568-side `OpenClaw` quality monitor
- **THEN** the initial integration boundary MUST consume board/runtime/bootstrap facts as inputs
- **AND** it MUST NOT directly take ownership of southbound serial, MQTT primary uplink, or command routing

### Requirement: Software-Side RK3568 Group Monitoring Must Use Stable Runtime Facts
The system SHALL reserve a software-side RK3568 group status monitoring path that is based on stable board/runtime facts rather than ad hoc debug outputs.

#### Scenario: Planning a future RK3568 group monitor in software
- **WHEN** the software layer prepares a future `RK3568` group status monitor
- **THEN** it MUST be able to consume stable facts such as network mode, gateway health, publish activity, spool state, and southbound node summary
- **AND** it MUST avoid depending on transient debug-only logs as its primary contract

### Requirement: RK3568 Startup Health Evidence Must Be Observable
The system SHALL define observable evidence for RK3568 startup networking and gateway readiness.

#### Scenario: Production startup line is reviewed
- **WHEN** operators verify the RK3568 production startup line
- **THEN** evidence MUST show whether the board entered station-connected mode or AP fallback mode
- **AND** it MUST also show whether `lsmv2-field-gateway.service` reached a healthy running state
