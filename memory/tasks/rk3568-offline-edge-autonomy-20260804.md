---
title: rk3568-offline-edge-autonomy-20260804
type: note
tags:
- task
- rk3568
- hermes
- offline
- safety
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/rk3568-offline-edge-autonomy-20260804
---

# Task: RK3568 Offline Edge Autonomy

## Goal

Keep validated A/B/C telemetry, statistical risk scoring, random-forest link
diagnosis, deterministic local alarm rules, and the three allowlisted Hermes
tasks operating on RK3568 while WAN connectivity is unavailable. Synchronize
edge events idempotently after recovery without changing the existing remote
MQTT/spool semantics or giving AI authority over serial, network, or alarms.

## Current State

- Baseline commit is `fb46ea3e932623537493689d3c53f3a14df8ab05`.
- Implementation branch is `feat/rk3568-offline-edge-autonomy-20260804`.
- Code implementation and local regression are complete; no commit or
  production deployment has been made.
- `field-gateway` publishes validated telemetry to a bounded non-blocking Unix
  Socket while preserving remote MQTT and spool behavior.
- Hermes consumes the local Socket for risk inference, retains the last valid
  expired model with reduced confidence, exposes RF OOD output, and limits
  local autonomy to `recheck`, `collect_logs`, and `generate_report`.
- The independent signed `edge-safety-controller` applies deterministic
  duration/hysteresis rules and drives persistent source-isolated alarm leases.
- Safety events use stable SHA-256 IDs and synchronize through MQTT, Kafka, and
  PostgreSQL with `ON CONFLICT DO NOTHING` idempotency.
- Windows and HarmonyOS expose the agreed Chinese status labels, distinguish
  cached server-offline state, and show model, inference, resource, autonomy,
  rule, lease, and pending-sync evidence.
- Corrupt alarm lease persistence now fails closed instead of silently clearing
  physical alarm ownership.
- HarmonyOS/API adaptation was revalidated after the RK3568 contract changes:
  mixed A/B/C freshness, stale snapshots, nullable resources, diagnosis OOD,
  local autonomy/safety evidence, and idempotent chat retry are now covered.
- The simulator project at `E:\landslide-monitoring-harmonyos` contains the
  complete current ArkTS source; CompileArkTS and direct unsigned HAP packaging
  pass. DevEco signing/local Java configuration is still pending.

## Constraints

- Preserve field-gateway serial parsing, remote MQTT QoS, spool/cache, server
  rule engine, alert executor compatibility, and the existing Hermes task API.
- Local telemetry is read-only, bounded, schema-validated, device-allowlisted,
  duplicate-filtered, and order-filtered. Failure must never block ingestion.
- Keep `robust_baseline_ensemble` for wire compatibility, but identify its
  method as statistical scoring and never call its score a landslide
  probability.
- Keep last valid models and signed rules across WAN loss and restart. Invalid
  replacements must not displace them.
- Do not add an App database or direct App-to-RK3568 connection.
- Do not deploy production changes before code regression and a real RK3568 WAN
  isolation acceptance pass.

## Plan

- Provision the production Ed25519 public key, signed rule artifact, actuator
  token, and server rule/event MQTT topics without placing secrets in Git.
- Restore live A/B/C serial telemetry, then deploy first to a non-production
  RK3568 acceptance environment.
- Perform a real WAN isolation test and capture A/B/C counters, model inference
  timestamps, Tongxiao actuation, process IDs/restart counts, CPU, memory,
  temperature, inference latency, alarm latency, and recovery synchronization.
- Verify exactly-once server persistence by stable event ID and confirm a server
  clear cannot remove an active local lease.
- Only after the hardware evidence passes, prepare a reviewed commit and staged
  production rollout.

## Open Questions

- Which production Ed25519 public key and server rule-distribution topic will be
  provisioned on RK3568? Code will require explicit configuration and fail
  closed until they are supplied.
- A/B/C were silent at the last production checkpoint. Hardware WAN-loss
  acceptance requires restored serial telemetry and cannot be claimed locally.

## Done When

- Automated tests prove that validated local telemetry drives both edge models
  and deterministic rules without remote MQTT connectivity.
- Active local leases survive server clears and service restarts.
- Offline events use stable IDs and synchronize without duplicate publication.
- Missing/invalid A/B/C data reports `waiting_for_valid_node_data`, never
  `normal`.
- API and clients separate reachable, available, stale, and offline states and
  use the agreed Chinese model/safety labels.
- A later RK3568 hardware run records WAN isolation, Tongxiao actuation,
  recovery synchronization, process stability, and resource/latency evidence.

## Verification

- Local telemetry: 3 tests passed.
- Risk model: 6 tests passed.
- Hermes supervisor/autonomy: 13 tests passed.
- Safety controller: 4 tests passed.
- Alarm lease manager: 2 tests passed, including corrupt-state fail-closed.
- Ingest and safety-event recorder: 1 test each passed.
- Edge AI API: 20 tests passed.
- Desktop production build/lint and 1440px/390px Playwright layout checks passed.
- HarmonyOS ArkTS compile and direct unsigned debug HAP packaging passed with
  DevEco JBR 21. Hvigor PackageHap currently resolves a broken system Java 8
  installation, and the DevEco debug signing certificate must be regenerated.
- Edge, rule-engine, AI-worker, and changed API lint/build checks passed.
