# Release Process

This document covers local validation and release preparation for the public repository. The current releaseable artifact is the Windows desktop package; edge services, firmware, and hardware assets are validated as source and handoff packages.

## Preflight

```powershell
npm install
npm audit
npm run lint
npm run build
npm run edge:build
npm run edge:lint
dotnet build .\apps\windows-shell\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release
```

## Desktop Portable Package

```powershell
npm run desktop:publish
```

Default output:

- `artifacts/windows/portable/`
- `docs/reports/windows-package-latest.json`

## Verify A Desktop Package

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\verify-windows-package.ps1
```

## Optional Self-Contained Package

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\package-windows-self-contained.ps1
```

Default output:

- `artifacts/windows/self-contained/`
- `docs/reports/windows-self-contained-package-latest.json`

## Optional Installer

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desktop\build-windows-installer.ps1
```

Installer generation requires Inno Setup 6. The script can download the WebView2 bootstrapper when needed.

## Edge Source Validation

The RK3568 edge services are validated as workspace packages:

```powershell
npm run edge:build
npm run edge:lint
```

Deployment to a physical RK3568 board requires local environment files and site-specific values that stay outside Git.

## Firmware And Hardware Review

- Confirm `firmware/rk2206-xl01/README.md`, `PINOUT.md`, and build metadata match the intended firmware package.
- Confirm `hardware/carrier-board/README.md` lists the current public handoff assets.
- Review schematic, BOM, pick-and-place orientation, and Gerber package before any fabrication order.

## GitHub Release Checklist

- CI is green on `main`.
- `npm audit` reports zero vulnerabilities.
- Desktop lint/build pass.
- Edge build/lint pass.
- Windows shell builds in Release mode.
- Desktop portable package is generated and verified.
- Firmware and hardware README files match the published package.
- `CHANGELOG.md` is updated.
- No generated artifacts, local environment files, credentials, private endpoints, or local field logs are committed.
