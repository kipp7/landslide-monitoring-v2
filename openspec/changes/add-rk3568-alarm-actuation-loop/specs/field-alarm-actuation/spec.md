## ADDED Requirements

### Requirement: RK3568 Physical Alarm Actuation

The system SHALL actuate a YX75R sound-light alarm from the RK3568 gateway when configured alert lifecycle state requires field escalation.

#### Scenario: Critical alert activates alarm

- **WHEN** a high or critical alert becomes active for a configured field region or device
- **THEN** the RK3568 alarm actuator sends the configured YX75R alarm-on Modbus command over the configured RS485 port
- **AND** the actuator records the actuation result for API and desktop visibility

#### Scenario: Manual acknowledgement silences alarm

- **WHEN** an operator acknowledges an active alarm alert for review
- **THEN** the RK3568 alarm actuator sends the configured YX75R alarm-off or silence command
- **AND** the platform keeps the alert visible as requiring human review unless it is resolved

#### Scenario: Manual resolve clears alarm

- **WHEN** an operator resolves the alert after confirming the field condition is normal
- **THEN** the RK3568 alarm actuator sends the configured YX75R alarm-off command
- **AND** the platform clears the active physical alarm state for that alert

### Requirement: Safe RK3568 Serial Boundary

The alarm actuator SHALL use a configurable RK3568 serial device and SHALL NOT use the XL01 field gateway serial device.

#### Scenario: YX75R uses dedicated RS485 port

- **WHEN** the actuator starts with default production configuration
- **THEN** it uses `/dev/ttyS7` for YX75R Modbus RTU commands
- **AND** it does not open `/dev/ttyS3`

#### Scenario: Dry run avoids hardware side effects

- **WHEN** the actuator starts in dry-run mode
- **THEN** it records the command it would send
- **AND** it does not open any serial device

### Requirement: Configurable Alarm Policy

The system SHALL make alarm actuation thresholds and device parameters configurable outside desktop UI source code.

#### Scenario: Demo volume initialized

- **WHEN** the actuator starts or sends the first alarm-on command
- **THEN** it initializes the YX75R software volume to the configured safe value before playback

#### Scenario: Shared RS485 bus is serialized

- **WHEN** multiple Modbus devices share the RK3568 RS485 bus
- **THEN** only one process or bus owner sends frames at a time
- **AND** each device uses configured address and baud settings
