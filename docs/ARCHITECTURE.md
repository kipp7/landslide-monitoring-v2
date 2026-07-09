# Architecture

Landslide Monitoring V2 is organized as a public end-to-end monitoring workspace. The repository keeps the desktop client, edge gateway, field firmware, and carrier-board handoff files together in one buildable tree.

## System Boundary

```text
Field layer
  RK2206 XL01 firmware
    -> sensor acquisition, telemetry envelope, command acknowledgement

Edge layer
  RK3568 gateway services
    -> serial link, MQTT forwarding, health summaries, supervision, alarm actuation

Operator layer
  Windows desktop client
    -> React monitoring UI hosted by WPF + WebView2
```

The public tree contains source, documentation, examples, deployment templates, and hardware handoff assets. Runtime secrets, generated builds, local logs, and site-specific configuration stay outside Git.

## Applications And Packages

| Path | Responsibility |
| --- | --- |
| `apps/desktop-ui` | React + Vite monitoring interface, routes, stores, charts, maps, and mock data. |
| `apps/windows-shell` | WPF/WebView2 native host, startup preflight checks, tray behavior, installer assets. |
| `edge/rk3568-gateway/field-gateway` | Serial-to-MQTT gateway with local spool/cache, health output, command ACK handling, and deployment templates. |
| `edge/rk3568-gateway/field-link-monitor` | Read-only local sidecar that summarizes field-link health. |
| `edge/rk3568-gateway/hermes-edge-supervisor` | Local supervision service that consumes health signals and produces operator-facing guidance. |
| `edge/rk3568-gateway/rk3568-alarm-actuator` | RK3568 alarm actuator service for field sound/light alarm control. |
| `firmware/rk2206-xl01` | RK2206 XL01 firmware package intended for an OpenHarmony/RK2206 vendor build tree. |
| `hardware/carrier-board` | Public carrier-board schematic, board preview, Gerber, BOM, pick-and-place, and LCEDA handoff package. |
| `packages/observability` | Shared logging helpers for edge services. |
| `packages/validation` | Shared validation helpers for edge payloads and configuration. |

## Desktop Client

The desktop client owns the operator-facing workflows:

- Dashboard and key monitoring site overview.
- Device management and command-oriented screens.
- GPS deformation and monitoring views.
- Analysis pages with charts, maps, and domain mock data.
- Account, settings, and system state pages.

The UI can run independently in development with:

```powershell
npm run dev
```

The native shell loads the UI in two modes:

- Development: reads `DESK_DEV_SERVER_URL`, usually `http://localhost:5174/`.
- Packaged: loads static files from the published `web/` directory.

## Edge Gateway

The RK3568 layer bridges field devices and upstream monitoring services. Its public services are split by responsibility:

- `field-gateway` owns serial ingestion, message reconstruction, MQTT publishing, spool/cache behavior, command windows, and health files.
- `field-link-monitor` reads local status files and exposes read-only supervision summaries.
- `hermes-edge-supervisor` turns local health signals into diagnostic and operator guidance output.
- `rk3568-alarm-actuator` controls field alarm hardware without taking over telemetry or gateway responsibilities.

Edge services are TypeScript packages and are validated from the root workspace:

```powershell
npm run edge:build
npm run edge:lint
```

## Field Firmware

The RK2206 XL01 firmware package contains application code, configuration, drivers, pinout notes, and build metadata. It is designed for integration with a compatible OpenHarmony/RK2206 vendor tree and uses the standard OpenHarmony/RK2206 build flow.

## Hardware Handoff

The carrier-board directory contains public design and fabrication handoff files. These files are useful for review, reproduction, and documentation, but fabrication still requires schematic review, BOM verification, footprint checks, and supplier substitution review.

## Packaging Flow

1. Build `apps/desktop-ui` into `apps/desktop-ui/dist`.
2. Publish `apps/windows-shell` with .NET.
3. Copy the static UI build into the desktop package under `web/`.
4. Write local package metadata under `docs/reports/`.
5. Keep generated outputs out of Git.

## Design Principles

- Keep public modules tied to clear product responsibilities.
- Prefer readable directory names over internal abbreviations.
- Keep generated artifacts, local reports, and machine state out of Git.
- Allow desktop UI work without backend deployment through mock data.
- Keep RK3568 services independently buildable and lintable.
- Treat hardware deliverables as reviewable handoff assets and check them against the selected vendor's requirements.
