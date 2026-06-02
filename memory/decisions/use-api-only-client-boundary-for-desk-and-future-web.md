---
title: use-api-only-client-boundary-for-desk-and-future-web
type: note
tags:
- decision
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/use-api-only-client-boundary-for-desk-and-future-web
---

# Decision: use-api-only-client-boundary-for-desk-and-future-web

## Context

The current delivery phase is frozen as:

- current formal client: `desk-win`
- current server foundation: `Docker + API`
- future second client: `Web`

If `apps/desk` or `apps/desk-win` starts reading PostgreSQL / ClickHouse directly, the current desk-only delivery phase will leak server implementation details into the client and make the later Web adaptation expensive and fragile.

## Decision

Adopt an API-only client boundary:

- `apps/desk` may access business data only through the desk API layer
- `apps/desk-win` remains a native host shell only
- PostgreSQL / ClickHouse stay server-side only
- future `Web` must reuse the same API boundary rather than reading database tables directly

## Rationale

- It preserves a stable client contract while allowing the server storage model to evolve.
- It keeps auth, audit, data shaping, and compatibility logic in one place: the API.
- It lets the current `desk-win` delivery path and the future `Web` client share the same backend boundary.

## Consequences

- Any new desk feature must land as API contract + desk UI, not desk SQL.
- Delivery validation should fail if desk or desk-win introduces database drivers, connection strings, or direct datastore references.
- Web is not cancelled; it is deferred to a later phase on the same API boundary.

## Follow-up

- keep `scripts/dev/check-desk-api-boundary.ps1` green in every desk-win delivery cycle
- keep documenting new client-facing fields in API contract docs before adding them to desk or future Web
