## ADDED Requirements

### Requirement: UI-First HarmonyOS App Prototype

The system SHALL define the first milestone of the HarmonyOS app as a page-first, high-fidelity UI prototype before deeper runtime implementation.

#### Scenario: Product team starts the HarmonyOS app line

- **WHEN** the team begins the HarmonyOS app effort
- **THEN** it MUST first produce a visually complete core-page prototype
- **AND** the prototype MUST cover the defined first-wave pages rather than only isolated mood boards
- **AND** the prototype MUST be treated as the approved visual baseline for later HarmonyOS implementation

### Requirement: Event-Centered Information Architecture

The HarmonyOS app SHALL organize its primary navigation around `空间`, `事件`, `任务`, and `我的`.

#### Scenario: Operator navigates the app

- **WHEN** an operator uses the app
- **THEN** the top-level navigation MUST prioritize spatial awareness, incident response, and patrol execution
- **AND** the app MUST NOT default to a generic device-table-first information architecture

### Requirement: Spatial Home Screen

The app SHALL provide a spatial home screen as the primary identity-defining page.

#### Scenario: User opens the main workspace

- **WHEN** a signed-in user lands in the main app workspace
- **THEN** the app MUST present a spatial overview that combines status summary, terrain or scene context, and immediate action entry points
- **AND** the page MUST communicate where the risk is, how serious it is, and what the next action should be

### Requirement: Event Drill-Down And Playback

The app SHALL support event-driven drill-down and time-based risk playback concepts in the UI baseline.

#### Scenario: User inspects a hotspot or incident

- **WHEN** a user selects a risk hotspot or incident
- **THEN** the UI MUST provide a direct incident-focused detail view
- **AND** the baseline UI MUST reserve a time playback interaction for understanding how the event evolved

### Requirement: Task Closure Flow

The app SHALL provide a clear action flow from incident awareness to task execution and closure.

#### Scenario: Patrol or response action is needed

- **WHEN** a user needs to acknowledge, process, or finish a field task
- **THEN** the app MUST expose a coherent task flow for ack, assignment, arrival confirmation, notes, and closure-related actions
- **AND** the UI MUST avoid scattering these actions across unrelated pages

### Requirement: HarmonyOS-Native Ability Alignment

The app SHALL reserve product-level integration points for HarmonyOS-native abilities that matter to incident handling and field operations.

#### Scenario: Runtime implementation follows the approved UI

- **WHEN** the approved UI is later implemented on HarmonyOS
- **THEN** the product baseline MUST already account for push, location, scan, and linking style entry points where they improve the flow
- **AND** the approved UI MUST NOT depend on direct database access or generic web-only assumptions
