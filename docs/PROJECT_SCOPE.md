# Project Scope

This repository is maintained as the public Windows desktop client for Landslide Monitoring V2. The current `main` branch is scoped to the desktop UI, native Windows host, packaging scripts, and public documentation.

## Maintained Surface

- `apps/desktop-ui/` - React + Vite desktop monitoring interface.
- `apps/windows-shell/` - WPF + WebView2 Windows host and installer resources.
- `scripts/desktop/` - desktop development, packaging, and verification scripts.
- `docs/` - public architecture, release, maintainer, and bilingual documentation.
- `.github/` - CI, issue templates, pull request template, and dependency automation.

## Current Non-Goals

The following areas are outside the current maintenance scope:

- Web dashboards.
- Mobile clients.
- Backend services.
- Deployment infrastructure.
- Hardware experiments and board bring-up notes.
- Internal journals, work logs, local evidence bundles, and private field configuration.

The repository preserves historical commits for project traceability. Historical files should not be treated as maintained APIs, supported modules, or release-ready assets.

## Maintenance Rule

New work should keep the public tree desktop-focused unless maintainers explicitly decide to revive another product surface. If another surface is revived later, it should return as a documented module with its own CI coverage, user-facing docs, ownership, and security review.
