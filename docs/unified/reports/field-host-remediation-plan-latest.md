---
title: field-host-remediation-plan-latest
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-host-remediation-plan-latest
---

﻿# Field Host Remediation Plan

- GeneratedAt: 2026-03-24T10:45:36Z
- DeltaConclusion: host-path-recovered
- DockerRuntimeHealthy: True
- DockerAcceptanceHealthy: True
- HostPathHasFailures: False
- LocalAppProbeHasFailures: False

## Current Reading

- Host-to-docker relay currently looks recovered in this environment.
- Local runtime probes are also green in the current session, so this environment no longer shows a host relay blocker.

## Evidence Inputs

- Delta report: docs/unified/reports/field-runtime-delta-latest.json
- Host context report: docs/unified/reports/field-host-path-context-latest.json

## Environment Snapshot

- Docker Desktop: Docker Desktop 4.55.0 (213807)
- Docker client: 29.1.3
- Docker server: 29.1.3
- Docker context: desktop-linux
- Docker kernel: 6.6.87.2-microsoft-standard-WSL2
- WSL status hints: none
- WSL version hints: 2.6.3.0, 6.6.87.2, 1.0.71, 1.2.6353, 1.611.1, 10.0.26100.1, 10.0.22631.2861

## Relay Indicators

- wslrelay.exe observed on ports: 1883, 3000, 5432, 6379, 8080, 8123, 9000, 9094
- com.docker.backend.exe observed on ports: 1883, 3000, 5432, 6379, 8080, 8123, 9000, 9094
- Host HTTP failures currently observed on: none

## Recommended Order

1. Keep the current Docker Desktop state as the working baseline; do not repeat environment reset unless the relay regression returns.
2. Continue using the Docker-network MQTT workflow as the main functional baseline.
3. Keep host relay governance closed and move attention to the next non-relay rehearsal goal.
4. If host-path regressions return, re-run the low-risk recovery block and re-check field-host-path-context.

## Low-Risk Recovery Steps

- Already exercised in the current session and relay recovery succeeded.
- Reuse this block only if 127.0.0.1 / ::1 host-path failures reappear.

## Configuration Review Steps

1. Check Docker Desktop WSL integration is enabled for the active distro.
2. Check Docker Desktop networking settings related to localhost forwarding / host networking.
3. Check whether a VPN, local proxy, or endpoint security product is interfering with Docker port forwarding.
4. Re-run the host-path triage bundle after any setting change.

## Advanced Experiment Steps

1. Evaluate Docker Desktop host networking if your version and policy allow it.
2. Evaluate WSL mirrored networking / hostAddressLoopback if you explicitly want to troubleshoot WSL localhost behavior.
3. Treat both as environment experiments, not as architecture changes.

## Safe Fallback

- Host-path relay currently works again and local runtime probes are green.
- Keep scripts/dev/run-field-rehearsal-docker.ps1 as the safest rehearsal baseline while moving on to the next non-relay blocker.

## Exit Criteria

- Host-path can return a non-empty, protocol-correct response on published ports; or
- The team explicitly accepts host-path as an environment blocker and keeps Docker-network workflow as the supported route for the current phase.