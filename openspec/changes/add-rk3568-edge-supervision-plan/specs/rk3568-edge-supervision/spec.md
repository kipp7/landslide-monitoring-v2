---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-rk3568-edge-supervision-plan/specs/rk3568-edge-supervision/spec
---

## ADDED Requirements

### Requirement: Edge Supervision Plan
The system SHALL expose a read-only RK3568 edge supervision plan derived from existing field link quality evidence.

#### Scenario: Supervision plan requested
- **WHEN** an operator, OpenClaw sidecar, Hermes sidecar, or local display requests the supervision plan
- **THEN** the system MUST return task-level recommendations derived from the latest gateway health, network status, and link quality dimensions
- **AND** it MUST NOT require direct SSH, serial, or MQTT control access in the request path

### Requirement: Gateway Core Protection
The edge supervision plan SHALL preserve the `field-gateway` core boundary.

#### Scenario: Main chain is degraded
- **WHEN** the supervision plan detects serial, MQTT, spool, or publish freshness problems
- **THEN** it MUST produce operator-visible tasks and evidence
- **AND** it MUST NOT instruct sidecars to automatically restart `field-gateway`, claim the serial device, switch Wi-Fi mode, or write gateway state

### Requirement: OpenClaw Hermes Sidecar Consumption
OpenClaw and Hermes SHALL consume RK3568 edge supervision as Layer 4 sidecars.

#### Scenario: Sidecar integrates edge quality status
- **WHEN** OpenClaw or Hermes integrates with RK3568 edge status
- **THEN** it MUST consume `/v1/automation` or `/v1/summary` as a read-only source
- **AND** it MAY render prompts, dispatch operator tasks, or collect its own logs
- **AND** it MUST NOT become a dependency for serial ingest, spool persistence, or northbound MQTT uplink

### Requirement: Hermes Edge Supervisor Sidecar
The system SHALL provide a Hermes-style RK3568 edge supervisor that turns the automation plan into an advisory-first supervision report.

#### Scenario: Hermes supervisor consumes the automation plan
- **WHEN** `hermes-edge-supervisor` is running on RK3568
- **THEN** it MUST fetch `field-link-monitor` automation data from localhost
- **AND** it MUST expose `/v1/supervision`
- **AND** it MUST write a local supervision JSON file
- **AND** its report MUST preserve gateway core protection flags for serial ingest, spool, and MQTT uplink

### Requirement: Lightweight Edge Diagnosis Model
The Hermes edge supervisor SHALL load a trained lightweight model for local edge diagnosis.

#### Scenario: Model-backed diagnosis is produced
- **WHEN** `/v1/supervision` is requested and the diagnosis model artifact is available
- **THEN** the response MUST include `aiDiagnosis`
- **AND** `aiDiagnosis.modelLoaded` MUST be true
- **AND** `aiDiagnosis.modelType` MUST identify a trained model type rather than a rule-only policy
- **AND** `aiDiagnosis` MUST include diagnosis type, confidence, feature vector, class probabilities, and recommended plan

### Requirement: Expanded Edge Diagnosis Features
The lightweight edge diagnosis model SHALL support multi-dimensional feature extraction so that later models can be added without replacing the Hermes sidecar contract.

#### Scenario: Expanded feature vector is emitted
- **WHEN** Hermes produces `aiDiagnosis`
- **THEN** the feature vector MUST include link status, network mode, node status, parser quality, task queue, and local resource features
- **AND** local resource features MUST include memory, disk, load, and temperature where the operating system exposes them
- **AND** the model output MUST remain a sidecar field under `/v1/supervision` so future models can be added without changing `field-gateway`

### Requirement: Hermes Safe Intent Actions
The Hermes edge supervisor SHALL provide a safe intent/action surface for local displays or natural-language agents without granting control of the gateway core.

#### Scenario: Display requests a link recheck
- **WHEN** a local display or natural-language agent requests a recheck through the Hermes action API
- **THEN** the system MUST refresh read-only supervision evidence and return the current model diagnosis
- **AND** the response MUST expose the action safety boundary
- **AND** the action MUST NOT open serial ports, restart `field-gateway`, switch Wi-Fi, or own MQTT uplink

### Requirement: Edge Model Registry Output
The Hermes edge supervisor SHALL expose model outputs through an additive model registry field.

#### Scenario: Future edge models are added
- **WHEN** `/v1/supervision` is requested
- **THEN** the response MUST include `aiModels[]` with model key, task, type, version, status, feature count, and output
- **AND** the existing primary `aiDiagnosis` field MUST remain available for backward compatibility
