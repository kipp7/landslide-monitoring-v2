@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\dev\mempalace-project-cli.ps1" %*
exit /b %ERRORLEVEL%
