## ADDED Requirements

### Requirement: Regional SMS Contact Library
The system SHALL provide a contact library for alert SMS recipients that can bind active contacts to station, device, or global alert scopes without hardcoding phone numbers in worker code.

#### Scenario: Station alert matches station contacts
- **WHEN** an `ALERT_TRIGGER` event contains a `station_id`
- **THEN** active SMS contacts bound to that station and severity threshold SHALL be selected as SMS recipients

#### Scenario: Device alert matches device contacts
- **WHEN** an `ALERT_TRIGGER` event contains a `device_id`
- **THEN** active SMS contacts bound to that device and severity threshold SHALL be selected as SMS recipients

### Requirement: SMS Delivery Jobs
The system SHALL create SMS delivery job records for contact-library recipients with a phone snapshot, provider name, content, status, and provider message metadata.

#### Scenario: Mock provider sends delivery job
- **WHEN** the SMS provider is configured as `mock`
- **THEN** each selected contact SHALL produce a delivery job marked `sent` with a mock provider message id

#### Scenario: Real provider is not configured
- **WHEN** a real SMS provider is selected without required credentials or template configuration
- **THEN** the worker SHALL fail fast during startup rather than silently dropping alert messages
