# Release Process

This document covers local packaging and release preparation for the Windows desktop client.

## Preflight

```powershell
npm install
npm audit
npm run lint
npm run build
dotnet build .\apps\windows-shell\LandslideDesk.Win\LandslideDesk.Win.csproj -c Release
```

## Portable Package

```powershell
npm run desktop:publish
```

Default output:

- `artifacts/windows/portable/`
- `docs/reports/windows-package-latest.json`

## Verify A Package

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

## GitHub Release Checklist

- CI is green on `main`.
- `npm audit` reports zero vulnerabilities.
- `npm run lint` and `npm run build` pass.
- Windows shell builds in Release mode.
- Portable package is generated and verified.
- `CHANGELOG.md` is updated.
- No generated artifacts, local environment files, or credentials are committed.
