# Documentation

English | [简体中文](zh-CN/README.md)

This documentation set keeps the public repository small, clear, and buildable. It explains the maintained system areas, runtime boundaries, local validation commands, release process, and contribution workflow.

## Start Here

| Document | Purpose |
| --- | --- |
| [System Overview](system/OVERVIEW.md) | End-to-end product surfaces and data flow. |
| [Architecture](ARCHITECTURE.md) | Runtime boundary, module responsibilities, and packaging flow. |
| [Project Scope](PROJECT_SCOPE.md) | Repository contents, maintained areas, and current non-goals. |
| [Release Process](RELEASE.md) | Local build, validation, packaging, and GitHub release checklist. |
| [Desktop UI](../apps/desktop-ui/README.md) | React/Vite UI package responsibilities and commands. |
| [Windows Shell](../apps/windows-shell/README.md) | WPF/WebView2 host responsibilities and packaging behavior. |
| [RK3568 Edge Gateway](../edge/rk3568-gateway/README.md) | Edge service responsibilities, deployment notes, and local configuration. |
| [RK2206 Firmware](../firmware/rk2206-xl01/README.md) | Field-node firmware package and build context. |
| [Carrier Board](../hardware/carrier-board/README.md) | Hardware design and fabrication handoff package. |
| [Contributing](../CONTRIBUTING.md) | Contribution workflow, checks, and project conventions. |
| [Maintainers Guide](../MAINTAINERS.md) | Review policy, dependency update cadence, and release readiness checks. |
| [Security](../SECURITY.md) | Vulnerability reporting and secret-handling policy. |

## Repository Conventions

- Directory names describe product responsibility and runtime role.
- Generated artifacts belong under `artifacts/` and stay out of Git.
- Local reports belong under `docs/reports/` and should be regenerated as needed.
- Public-facing behavior changes should update both English and Chinese documentation.
- Pull requests that change visible UI should include screenshots or recordings.
- Hardware files are treated as handoff assets and should be reviewed before fabrication.

## Maintained Surface

The current public repository maintains:

- Windows desktop UI and native shell source.
- RK3568 edge gateway services and deployment templates.
- RK2206 XL01 field firmware package.
- Carrier-board hardware design and fabrication handoff assets.
- Desktop packaging and verification scripts.
- Public documentation, issue templates, and pull request templates.

The following areas are outside the current public scope:

- Production backend services.
- Mobile applications.
- Web dashboard application code.
- Production deployment infrastructure.
- Site-specific configuration and environment files.
- Credentials, generated outputs, local logs, and runtime state.
