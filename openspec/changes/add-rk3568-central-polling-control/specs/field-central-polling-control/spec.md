## ADDED Requirements

### Requirement: RK3568 Shall Own Shared-Link Poll Scheduling
The system SHALL assign `RK3568 field-gateway` as the sole owner of polling/token scheduling for the shared southbound link between the center XL01 and the field nodes.

#### Scenario: Multiple edge nodes share one center uplink
- **WHEN** multiple edge nodes communicate through one center XL01 uplink into `RK3568 /dev/ttyS3`
- **THEN** the gateway MUST release at most one internal poll command at a time on that shared control path
- **AND** it MUST NOT rely on the center XL01 itself to hold global queue or scheduling state

### Requirement: Edge Nodes Shall Support Polling Uplink Mode
The system SHALL support an edge-node polling uplink mode where local sampling continues but shared-link telemetry is released only on explicit trigger.

#### Scenario: Polling mode is enabled on an edge node
- **WHEN** the node is in polling uplink mode
- **THEN** it MUST continue maintaining the latest local telemetry snapshot
- **AND** it MUST NOT free-run periodic telemetry onto the shared uplink
- **AND** it MUST send telemetry when an explicit poll or manual collection trigger is accepted

### Requirement: Poll Session Shall Remain Exclusive Until Target Telemetry Or Timeout
The system SHALL treat an internal poll as an exclusive shared-link session that remains active after ACK until the targeted node telemetry is observed or the poll session times out.

#### Scenario: Poll ACK arrives before telemetry
- **WHEN** the gateway receives an ACK for an internal poll command
- **THEN** the poll session MUST remain active for the targeted node
- **AND** the gateway MUST withhold the next internal poll until the targeted telemetry arrives or the poll timeout is reached

### Requirement: Operator Commands Shall Preempt Internal Polling
The system SHALL give operator-issued commands higher priority than internal polling while still serializing both flows through one southbound control window.

#### Scenario: Operator command arrives during polling mode
- **WHEN** the gateway is running internal polling and an operator command is received
- **THEN** the gateway MUST serialize the operator command through the same southbound control path
- **AND** it MUST pause issuing subsequent internal polls until the operator command window and any required follow-up session are closed
