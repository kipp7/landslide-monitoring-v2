## ADDED Requirements

### Requirement: Onboarding Workbench Placement

The desk client SHALL provide a dedicated onboarding workbench under `设备管理`, rather than adding a new top-level left-navigation module.

#### Scenario: Operator enters onboarding

- **WHEN** an operator needs to handle device onboarding or commissioning
- **THEN** the system MUST provide an entry under the existing `设备管理` area
- **AND** the left navigation structure MUST remain unchanged at the top level

### Requirement: Pending Observation Queue

The system SHALL surface uploaded-but-not-yet-formal device observations in a pending queue for operator review.

#### Scenario: Unknown device is observed

- **WHEN** runtime ingestion receives data from a device that is not yet confirmed as a formal production device
- **THEN** the onboarding workbench MUST show it in a pending queue
- **AND** the queue MUST include enough evidence for review, including source gateway, first seen, last seen, and identity/sample data
- **AND** the device MUST NOT be auto-promoted into formal product views solely because telemetry was observed

### Requirement: Binding And Naming Workflow

The system SHALL allow operators to bind a pending device to formal registry truth and assign canonical field identity.

#### Scenario: Operator binds a pending device

- **WHEN** an operator selects a pending device in the onboarding workbench
- **THEN** the system MUST allow binding it to an existing station or a newly created formal station
- **AND** the bind workflow MUST capture canonical identity fields and display labels required by the current field identity standard
- **AND** the resulting formal identity MUST remain consistent with the existing `gateway_preprovisioned` field path

### Requirement: Commissioning Validation

The system SHALL provide a commissioning checklist before a device is marked as fully commissioned.

#### Scenario: Operator validates commissioning readiness

- **WHEN** a device has been bound but not yet confirmed for production use
- **THEN** the onboarding workbench MUST show commissioning evidence, including telemetry freshness and current runtime proof
- **AND** the workbench SHOULD show command/ACK closure and GPS baseline readiness when those signals are applicable
- **AND** the operator MUST explicitly confirm the commissioning step before the device is considered commissioned

### Requirement: API-Only Onboarding Actions

The desk client SHALL perform onboarding reads and writes through backend APIs only.

#### Scenario: Operator performs onboarding actions

- **WHEN** the operator lists pending devices, binds identity, or confirms commissioning
- **THEN** the desk client MUST call backend APIs
- **AND** it MUST NOT read or write onboarding truth by directly accessing the database

### Requirement: Auditability Of Onboarding

The system SHALL retain operator-visible audit history for onboarding actions.

#### Scenario: Operator reviews onboarding history

- **WHEN** an operator opens the onboarding workbench for a device or station
- **THEN** the system MUST show bind, naming, commissioning, replacement, or revoke history relevant to that onboarding flow
- **AND** the history MUST identify who performed the action and when it occurred
