# Project Scope

This repository preserves the original `landslide-monitoring-v2` Git history, but the current public tree is intentionally scoped to the maintained Windows desktop client.

## Supported Public Surface

- `apps/desktop-ui/` - React + Vite desktop monitoring interface.
- `apps/windows-shell/` - WPF + WebView2 Windows host and installer resources.
- `scripts/desktop/` - desktop development, packaging, and verification scripts.
- `docs/` - public architecture, release, maintainer, and bilingual documentation.
- `.github/` - CI, issue templates, pull request template, and dependency automation.

## Historical Only

The following areas are not part of the supported public surface and have been removed from the current tree:

- Web dashboards.
- Mobile clients.
- Backend services.
- Deployment infrastructure.
- Hardware experiments and board bring-up notes.
- Internal journals, memory files, local evidence bundles, and private field configuration.

These materials may still exist in old commits for traceability. They should not be treated as maintained, supported, or ready for public reuse.

## Maintenance Rule

New work should keep the public tree desktop-focused unless maintainers explicitly decide to revive another product surface. If another surface is revived later, it should return as a deliberate, documented module with its own CI, docs, and security review.
