# Project Scope

This repository is maintained as the public source tree for Landslide Monitoring V2, an end-to-end landslide monitoring system. The current `main` branch includes the actively maintained desktop client, RK3568 edge gateway services, RK2206 field firmware package, carrier-board hardware handoff assets, packaging scripts, and public documentation.

## Maintained Surface

- `apps/desktop-ui/` - React + Vite monitoring interface.
- `apps/windows-shell/` - WPF + WebView2 Windows host and installer resources.
- `edge/rk3568-gateway/` - RK3568 edge services and deployment templates.
- `firmware/rk2206-xl01/` - RK2206 XL01 field-node firmware package.
- `hardware/carrier-board/` - carrier-board design and fabrication handoff assets.
- `packages/` - shared TypeScript packages used by the edge services.
- `scripts/desktop/` - desktop development, packaging, and verification scripts.
- `docs/` - public architecture, release, system, maintainer, and bilingual documentation.
- `.github/` - CI, issue templates, pull request template, and dependency automation.

## Repository Contents

The public tree includes:

- Application source for the maintained desktop, edge, and firmware packages.
- Public examples and deployment templates.
- Firmware package files for integration with a compatible vendor build tree.
- Carrier-board design and fabrication handoff files.
- Build, lint, packaging, and verification scripts.
- Public documentation, issue templates, and pull request templates.

The following areas are outside the current public tree:

- Production backend services and deployment infrastructure.
- Mobile applications and web dashboard application code.
- Vendor SDK trees.
- Generated release artifacts and local build outputs.
- Credentials, private endpoints, device passwords, and local environment files.
- Site-specific configuration, local logs, and runtime state.

## Maintenance Rule

New modules should include a README, local validation command, and CI coverage when practical. Areas that are not listed as maintained should be reintroduced through a documented public path before being treated as supported.
