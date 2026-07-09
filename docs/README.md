# Documentation

English | [简体中文](zh-CN/README.md)

This documentation set is intentionally compact and practical. It explains the desktop product architecture, supported repository surface, Windows packaging flow, and contribution expectations.

## Start Here

| Document | Purpose |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Runtime boundary, application responsibilities, and packaging flow. |
| [Project Scope](PROJECT_SCOPE.md) | Supported repository surface, maintenance rules, and non-goals. |
| [Release Process](RELEASE.md) | Local build, packaging, verification, and GitHub release checklist. |
| [Desktop UI](../apps/desktop-ui/README.md) | React/Vite UI package responsibilities and commands. |
| [Windows Shell](../apps/windows-shell/README.md) | WPF/WebView2 host responsibilities and packaging behavior. |
| [Contributing](../CONTRIBUTING.md) | Contribution workflow, checks, and project conventions. |
| [Maintainers Guide](../MAINTAINERS.md) | Review policy, dependency update cadence, and release readiness checks. |
| [Security](../SECURITY.md) | Vulnerability reporting and secret-handling policy. |

## Repository Conventions

- Directory names describe product responsibility and runtime ownership.
- Generated artifacts belong under `artifacts/` and stay out of Git.
- Local reports belong under `docs/reports/` and should be regenerated as needed.
- Public-facing behavior changes should update both English and Chinese documentation.
- Pull requests that change visible UI should include screenshots or recordings.

## Maintained Surface

The current public repository maintains:

- Desktop UI source
- Windows shell source
- Installer resources
- Desktop packaging and verification scripts
- Public documentation and project governance files

The following areas are outside the current maintenance scope:

- Backend services
- Mobile apps
- Web dashboards
- Production infrastructure
- Private field configuration
- Internal journals, work logs, and local environment files
