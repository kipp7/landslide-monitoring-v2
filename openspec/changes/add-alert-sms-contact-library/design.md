## Context

The current worker writes `alert_notifications` for platform users. Regional SMS warning needs a contact library that can include duty contacts who are not necessarily login users.

## Goals / Non-Goals

- Goal: support station/region warning recipient matching without hardcoded numbers.
- Goal: keep existing user notification flow intact.
- Goal: allow first real SMS provider integration by environment configuration.
- Non-goal: replace the existing alert notification API in this change.
- Non-goal: commit real phone numbers or SMS credentials into the repository.

## Decisions

- Decision: introduce additive contact tables instead of changing `alert_notifications.user_id` nullability.
- Decision: store provider-facing SMS work in `alert_sms_delivery_jobs`.
- Decision: use `mock` as the default provider and require explicit env vars for real providers.
- Decision: contact matching order is device-specific, station-specific, then global; all active matching contacts can receive SMS.

## Risks / Trade-offs

- Real SMS providers require approved sign names/templates, so code readiness does not guarantee immediate delivery.
- Phone numbers are PII; proof scripts must accept numbers as parameters and clean local seed data after the run.
- Provider callbacks/receipts are not implemented in this first cut; jobs can be marked `sent` by the provider call, with later work for delivery receipts.

## Migration Plan

Run the additive `CREATE TABLE IF NOT EXISTS` schema against existing Postgres. Existing installations can continue using `user_alert_subscriptions` until contact groups are configured.
