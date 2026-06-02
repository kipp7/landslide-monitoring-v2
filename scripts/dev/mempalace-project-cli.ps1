[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArgsList
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Invoke-RepoScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativeScript,
    [string[]]$PassthroughArgs = @()
  )

  $scriptPath = Join-Path $repoRoot $RelativeScript
  & $scriptPath @PassthroughArgs
  exit $LASTEXITCODE
}

if (-not $ArgsList -or $ArgsList.Count -eq 0) {
  Write-Host "Usage: mempalace <status|refresh|search|wake-up|native> [args]" -ForegroundColor Yellow
  exit 1
}

$command = $ArgsList[0].ToLowerInvariant()
$rest = @()
if ($ArgsList.Count -gt 1) {
  $rest = @($ArgsList[1..($ArgsList.Count - 1)])
}

switch ($command) {
  "status" {
    Invoke-RepoScript -RelativeScript "scripts\dev\check-mempalace-project-memory.ps1"
  }
  "refresh" {
    Invoke-RepoScript -RelativeScript "scripts\dev\refresh-mempalace-project-memory.ps1" -PassthroughArgs $rest
  }
  "search" {
    $scriptPath = Join-Path $repoRoot "scripts\dev\search-mempalace-project-memory.ps1"
    if ($rest.Count -gt 0 -and -not $rest[0].StartsWith("-")) {
      $query = $rest[0]
      $passthrough = @()
      if ($rest.Count -gt 1) {
        $passthrough += @($rest[1..($rest.Count - 1)])
      }
      & $scriptPath -Query $query @passthrough
    } else {
      & $scriptPath @rest
    }
    exit $LASTEXITCODE
  }
  "wake-up" {
    Invoke-RepoScript -RelativeScript "scripts\dev\wake-up-mempalace-project-memory.ps1" -PassthroughArgs $rest
  }
  "wakeup" {
    Invoke-RepoScript -RelativeScript "scripts\dev\wake-up-mempalace-project-memory.ps1" -PassthroughArgs $rest
  }
  "native" {
    $mempalaceExe = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\mempalace.exe"
    $palacePath = Join-Path $repoRoot ".tools\mempalace\palace"
    if (-not (Test-Path $mempalaceExe)) {
      throw "MemPalace is not installed. Run .\scripts\dev\install-mempalace-project-memory.ps1 first."
    }
    & $mempalaceExe --palace $palacePath @($rest)
    exit $LASTEXITCODE
  }
  default {
    $mempalaceExe = Join-Path $repoRoot ".tools\mempalace\.venv\Scripts\mempalace.exe"
    $palacePath = Join-Path $repoRoot ".tools\mempalace\palace"
    if (-not (Test-Path $mempalaceExe)) {
      throw "MemPalace is not installed. Run .\scripts\dev\install-mempalace-project-memory.ps1 first."
    }
    & $mempalaceExe --palace $palacePath @($ArgsList)
    exit $LASTEXITCODE
  }
}
