## ADDED Requirements

### Requirement: Trainable Regional Model Artifacts

The system SHALL support versioned model artifacts for landslide prediction and warning so online inference can use trained regional baselines instead of only heuristic rules.

#### Scenario: Offline training emits a regional artifact

- **WHEN** an operator runs the baseline training workflow on structured samples
- **THEN** the system SHALL generate a versioned model artifact
- **AND** the artifact SHALL identify the target region or default scope
- **AND** the artifact SHALL contain enough metadata for online loading and traceability

### Requirement: Regional Model Selection With Safe Fallback

The online prediction worker SHALL choose a regional model when available and safely fall back when a trained artifact is missing or invalid.

#### Scenario: Matching regional model exists

- **WHEN** the worker receives telemetry for a device whose region matches a trained artifact
- **THEN** the worker SHALL use that trained regional artifact for inference

#### Scenario: Matching regional model does not exist

- **WHEN** the worker receives telemetry for a device whose region has no trained artifact
- **THEN** the worker SHALL fall back to the configured default model or heuristic path
- **AND** the emitted prediction payload SHALL record that fallback state

### Requirement: Two-Stage Baseline Prediction Output

The prediction pipeline SHALL produce both displacement-oriented intermediate outputs and a final warning-oriented risk result.

#### Scenario: Worker performs online inference

- **WHEN** the worker processes valid telemetry input
- **THEN** it SHALL compute intermediate trend or displacement-related features
- **AND** it SHALL output a final risk score and risk level
- **AND** the prediction payload SHALL preserve the intermediate model evidence needed for replay and explanation

### Requirement: Stable External Prediction Contract

The repository SHALL keep the existing top-level prediction event and query contract stable while allowing internal model implementations to evolve.

#### Scenario: Model implementation is upgraded

- **WHEN** the baseline model artifact or internal inference logic changes
- **THEN** the top-level `ai.predictions.v1` event fields SHALL remain compatible with existing consumers
- **AND** new model-specific details SHALL be added under `payload` rather than breaking the existing external contract
