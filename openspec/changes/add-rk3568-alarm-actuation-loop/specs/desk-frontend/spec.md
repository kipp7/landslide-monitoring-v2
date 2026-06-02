## ADDED Requirements

### Requirement: Physical Alarm Event State

The desktop monitoring experience SHALL show a prominent critical event state when the platform reports an active unsilenced physical alarm.

#### Scenario: Active physical alarm turns monitoring UI red

- **WHEN** the API reports an active unsilenced physical alarm
- **THEN** the monitoring/dashboard UI presents a red critical state with the affected region/device identity and latest evidence

#### Scenario: Operator acknowledgement silences but does not hide review

- **WHEN** an operator acknowledges the active alarm
- **THEN** the UI shows the alarm as silenced or under review
- **AND** it keeps the event visible until it is resolved

#### Scenario: Resolve clears critical state

- **WHEN** the alert is resolved
- **THEN** the UI removes the red critical state for that alert
- **AND** it retains the resolved event in alert history
