# RK3568 Edge Gateway

This directory contains the RK3568 edge services that bridge field nodes and the monitoring platform.

## Services

| Service | Role |
| --- | --- |
| `field-gateway` | Main serial-to-MQTT gateway with spool/cache, health file output, polling, command ACK handling, and RK3568 deployment scripts. |
| `field-link-monitor` | Read-only local sidecar that summarizes field-link health and exposes local supervision endpoints. |
| `hermes-edge-supervisor` | Local edge supervision service that consumes health evidence and produces automation guidance. |
| `rk3568-alarm-actuator` | Local actuator service for RK3568-driven field alarm control. |

## Deployment

Each service keeps its own `deploy/` directory when deployment assets exist. Environment examples use placeholders and must be copied to local `.env` or systemd environment files before real deployment.

## Public Safety

Runtime data, real credentials, local field logs, and machine-specific service files should remain outside Git. Use `.env.example` and `deploy/*.example` files as templates only.
