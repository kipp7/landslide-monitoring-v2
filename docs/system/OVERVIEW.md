# System Overview

Landslide Monitoring V2 is an end-to-end monitoring system composed of field sensing nodes, an edge gateway, a Windows operator console, and carrier-board hardware assets.

## Maintained Product Surfaces

| Surface | Path | Role |
| --- | --- | --- |
| Windows desktop client | `apps/desktop-ui`, `apps/windows-shell` | Operator-facing UI and native Windows host. |
| RK3568 edge gateway | `edge/rk3568-gateway` | Serial collection, MQTT uplink, local health files, field-link supervision, and alarm actuation. |
| RK2206 field firmware | `firmware/rk2206-xl01` | Sensor acquisition, GPS/deformation handling, command ACKs, and telemetry envelope generation. |
| Carrier-board hardware | `hardware/carrier-board` | PCB layout notes, manufacturing package, schematic preview, BOM, and pick-and-place package. |
| Shared packages | `packages` | Lightweight validation and observability helpers used by edge services. |

## Runtime Flow

```text
RS485/GPS/SHT30/MPU6050 sensors
  -> RK2206 field node firmware
  -> XL01 / southbound serial link
  -> RK3568 field gateway
  -> MQTT / compatible monitoring API
  -> Windows desktop operator console
```

## Repository Scope

This repository publishes the maintained application source, hardware handoff assets, and operational documentation. Vendor SDK trees, credentials, generated caches, local logs, and site-specific configuration stay outside the public tree.
