# Maintainers Guide

This project keeps the public repository focused on maintained, buildable system surfaces: the Windows desktop client, RK3568 edge services, RK2206 field firmware package, carrier-board hardware handoff assets, packaging scripts, and public documentation.

## Review Principles

- Keep changes scoped to a documented product area and add a public README plus validation path when reintroducing older modules.
- Prefer small pull requests with clear screenshots for UI work and clear review notes for firmware, edge, or hardware changes.
- Do not merge generated artifacts such as `dist/`, `bin/`, `obj/`, `artifacts/`, local reports, runtime state, or package output directories.
- Do not publish credentials, production endpoints, site-specific configuration, or local environment values.
- Require the CI workflow to pass before merging.

## Dependency Updates

Dependabot is configured to open low-noise weekly updates:

- npm updates are grouped by runtime and tooling dependencies.
- GitHub Actions updates are grouped separately.
- Semver-major upgrades are ignored automatically and should be handled manually when the project is ready for a compatibility review.

When reviewing dependency changes, run:

```powershell
npm audit
npm run lint
npm run build
npm run edge:build
npm run edge:lint
dotnet build .\apps\windows-shell\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release
```

For packaging-related changes, also run:

```powershell
npm run desktop:publish
```

## Release Readiness

Before creating a release, confirm:

- README and `docs/` match the current end-to-end public scope.
- `CHANGELOG.md` has a dated entry.
- The Windows package includes `web/index.html`.
- Edge services build and lint from the root workspace.
- Firmware and hardware README files match the published package contents.
- The working tree is clean after removing generated outputs.
- Main branch CI is green.
