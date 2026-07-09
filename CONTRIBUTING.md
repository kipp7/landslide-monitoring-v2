# Contributing

[简体中文](CONTRIBUTING.zh-CN.md)

Thanks for helping improve Landslide Monitoring V2.

## Development Setup

Install the workspace dependencies from the repository root:

```powershell
npm install
```

Run the desktop UI:

```powershell
npm run dev
```

Launch the native Windows host against the dev server:

```powershell
npm run desktop:dev
```

## Before Opening A Pull Request

Run the checks that match your change:

```powershell
npm audit
npm run lint
npm run build
npm run edge:build
npm run edge:lint
```

For Windows packaging changes, also run:

```powershell
npm run desktop:publish
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\verify-windows-package.ps1
```

For firmware or hardware changes, update the package README and include the build, review, or fabrication context needed by maintainers.

## Pull Request Guidelines

- Keep pull requests focused on one feature, fix, or documentation topic.
- Include screenshots or short screen recordings for visible UI changes.
- Update both English and Chinese documentation when public setup, commands, scope, or behavior changes.
- Avoid committing generated outputs from `artifacts/`, `dist/`, `bin/`, `obj/`, local reports, or runtime state directories.
- Do not commit credentials, private endpoints, device passwords, site-specific configuration, local logs, or local environment files.

## Project Conventions

- Use public-facing directory names that describe product responsibility, such as `apps/desktop-ui`, `edge/rk3568-gateway`, `firmware/rk2206-xl01`, and `hardware/carrier-board`.
- Keep desktop automation under `scripts/desktop`.
- Keep generated package reports under `docs/reports`.
- Keep edge services buildable through root workspace scripts.
- Treat hardware files as reviewable engineering handoff assets, not unchecked manufacturing guarantees.
- Prefer clear operational docs over temporary notes.

## Commit Style

Use concise conventional-style prefixes when practical:

- `feat:` for user-visible features
- `fix:` for bug fixes
- `docs:` for documentation
- `chore:` for tooling and maintenance
- `ci:` for workflow changes
