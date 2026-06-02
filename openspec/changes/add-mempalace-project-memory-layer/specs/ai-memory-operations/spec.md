## ADDED Requirements

### Requirement: Local Parallel Memory Index

The repository SHALL provide a local-only MemPalace-based memory index for project knowledge retrieval without replacing the existing journal, unified reports, or repository memory notes.

#### Scenario: Project memory layer is initialized

- **WHEN** an operator initializes the project memory layer
- **THEN** the system SHALL create a project-local MemPalace runtime
- **AND** the runtime SHALL remain local to the machine
- **AND** the repository SHALL continue to treat `docs/journal/`, `docs/unified/`, and `memory/` as the source-of-truth layers

### Requirement: Repeatable Project Mining

The repository SHALL provide a repeatable way to mine project knowledge into the local memory index.

#### Scenario: Repository sources are mined

- **WHEN** an operator runs the refresh workflow
- **THEN** the system SHALL mine the current repository contents into the local palace
- **AND** the workflow SHALL be stable enough to rerun after major documentation or code changes
- **AND** the mining target SHALL include project documents, memory notes, and source files needed for technical recall

### Requirement: Stable Search And Wake-Up Entry Points

The repository SHALL provide stable local entry points for searching indexed knowledge and generating a condensed wake-up context.

#### Scenario: Operator searches prior project decisions

- **WHEN** an operator runs the search entry point with a query
- **THEN** the system SHALL return local MemPalace search results for the current project index

#### Scenario: Operator prepares context for a future AI session

- **WHEN** an operator runs the wake-up entry point
- **THEN** the system SHALL generate a reusable local context output from the current project palace

### Requirement: Runtime Isolation And Ignore Rules

The repository SHALL isolate MemPalace runtime artifacts from committed project sources.

#### Scenario: Local MemPalace data is created

- **WHEN** the MemPalace runtime writes local data, caches, or virtual-environment files
- **THEN** those artifacts SHALL live in designated local runtime directories
- **AND** the repository SHALL ignore those runtime artifacts from version control
