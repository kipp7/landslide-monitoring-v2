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

## Public Boundary

The repository intentionally includes:

- Project-owned source code.
- Public examples and deployment templates.
- Firmware package files that can be integrated into a compatible vendor build tree.
- Hardware handoff files selected for public review.
- Build, lint, packaging, and verification scripts.
- Public governance documents.

The repository intentionally excludes:

- Production backend services and deployment infrastructure.
- Mobile applications and web dashboard application code.
- Full vendor SDK checkouts.
- Generated release artifacts and local build outputs.
- Real credentials, private endpoints, field passwords, and local environment files.
- Customer-specific site configuration, local evidence bundles, and operational logs.
- Internal journals, work notes, and local runtime state directories.

## Maintenance Rule

New work should keep each product surface explicit. If a new module is added, it should include a public README, ownership boundary, validation command, security review, and CI coverage when practical. Historical files should not be treated as maintained APIs, supported modules, or release-ready assets unless they are reintroduced under a documented public path.
