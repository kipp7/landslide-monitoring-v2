---
title: spec
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-field-identity-and-naming-standard/specs/field-device-identity/spec
---

## ADDED Requirements

### Requirement: Device Machine Identity Must Remain UUID-Based
The system SHALL keep `device_id(UUID)` as the only machine identity used for authentication, transport topics, command targeting, database identity, and audit correlation.

#### Scenario: A device is registered for field deployment
- **WHEN** a new physical device is created in the platform
- **THEN** it MUST receive a `device_id(UUID)`
- **AND** no human-readable label may replace that `device_id` in the machine control path

### Requirement: Field Business Hierarchy Must Be Explicit
The system SHALL define an explicit field business hierarchy using `region_code`, `slope_code`, `station_code`, `node_code`, and `gateway_code`.

#### Scenario: A new slope monitoring rollout is planned
- **WHEN** a deployment team prepares a new monitored slope
- **THEN** it MUST assign the monitored area to a `region_code`
- **AND** it MUST assign a stable `slope_code`
- **AND** each fixed monitoring point MUST receive a `station_code`
- **AND** each node role or gateway role MUST receive its own canonical code

### Requirement: Fixed Monitoring Points Must Survive Hardware Replacement
The system SHALL preserve `station_code` and `node_code` continuity across hardware replacement events.

#### Scenario: A field node board is replaced
- **WHEN** a board attached to an existing monitoring point is replaced
- **THEN** the new hardware MAY receive a new `device_id`
- **AND** the existing `station_code` MUST remain unchanged
- **AND** the existing `node_code` SHOULD remain unchanged unless the node role itself changes

### Requirement: Current Station Entities Must Map To Fixed Monitoring Points
The system SHALL treat the current `station` business entity as the fixed monitoring point during the near-term rollout, while `slope_code` remains a higher-level grouping above `station_code`.

#### Scenario: A team creates a new monitored point under an existing slope
- **WHEN** a new fixed monitoring point is registered under a known slope
- **THEN** the created `station` record MUST represent that fixed monitoring point
- **AND** its `station_code` MUST identify the point itself rather than the whole slope
- **AND** the related `slope_code` MAY be carried in metadata during the first rollout stage

### Requirement: Human-Readable Labels Must Be Secondary
The system SHALL allow `display_name` and `install_label` for human-facing operations, but neither may replace machine identity.

#### Scenario: An operator prints a field device sticker
- **WHEN** a device needs a field-facing sticker or a UI display label
- **THEN** the system MAY use `install_label` or `display_name`
- **AND** those labels MUST NOT be used as the machine authentication identity
- **AND** those labels MUST NOT replace `device_id` in command routing or audit records

### Requirement: Product Views Must Distinguish Formal and Non-Formal Devices
The system SHALL classify devices by `identity_class` so that formal product views can exclude non-formal devices by default.

#### Scenario: Product dashboard reads device totals
- **WHEN** a product-facing dashboard, device list, or station summary is rendered
- **THEN** it MUST exclude devices whose `identity_class` is not `formal` unless an explicit debug or administrative mode is requested

### Requirement: Compatibility Device Names Must Not Become Formal Naming Truth
The system SHALL keep legacy names such as `device_1..N` or `legacy_device_id` as compatibility aids only, not as the formal field naming standard.

#### Scenario: A legacy seed dataset still exists
- **WHEN** the system reads compatibility data containing `device_1..N`
- **THEN** it MAY map those records into current read paths for compatibility
- **AND** it MUST NOT treat those legacy names as the long-term formal naming convention for new field deployments

### Requirement: Near-Term Rollout Must Support Metadata-Based Adoption
The system SHALL allow the field business hierarchy and identity classification to be adopted first through device and station metadata before a mandatory schema normalization step.

#### Scenario: The team starts naming real A/B/C field nodes
- **WHEN** the project begins assigning formal region, slope, station, node, and gateway identity to real field hardware
- **THEN** the system MAY store those values in metadata during the first rollout stage
- **AND** the naming semantics MUST remain stable even if later promoted to first-class schema fields

### Requirement: Canonical Identity Layers Must Stay Separated In Read Models
The system SHALL keep machine identity, business identity, human-readable labels, and compatibility fields as distinct layers in APIs and read models once canonical field naming is introduced.

#### Scenario: A product-facing API returns device details
- **WHEN** a device detail, device list item, or station-linked device summary is returned
- **THEN** machine identifiers such as `deviceId` and `stationId` MUST remain distinct from business identifiers such as `stationCode`, `nodeCode`, and `gatewayCode`
- **AND** human-readable labels such as `displayName` and `installLabel` MUST remain distinct from both machine and business identity
- **AND** compatibility fields such as `deviceName` or `legacyDeviceId` MUST NOT become the canonical business identity source
