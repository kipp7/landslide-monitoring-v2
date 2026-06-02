[CmdletBinding()]
param()

function Get-MempalaceProjectPaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $toolRoot = Join-Path $RepoRoot ".tools\mempalace"
  [ordered]@{
    repoRoot = $RepoRoot
    toolRoot = $toolRoot
    mempalaceExe = Join-Path $toolRoot ".venv\Scripts\mempalace.exe"
    venvPython = Join-Path $toolRoot ".venv\Scripts\python.exe"
    palacePath = Join-Path $toolRoot "palace"
    palaceDb = Join-Path $toolRoot "palace\chroma.sqlite3"
    lockPath = Join-Path $RepoRoot ".tmp\mempalace\refresh.lock.json"
    refreshScript = Join-Path $RepoRoot "scripts\dev\refresh-mempalace-project-memory.ps1"
    repoPsShim = Join-Path $RepoRoot "mempalace.ps1"
    repoShim = Join-Path $RepoRoot "mempalace.cmd"
  }
}

function Resolve-MempalaceRefreshLock {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Paths
  )

  $lockPath = $Paths.lockPath
  if (-not (Test-Path $lockPath)) {
    return [ordered]@{
      exists = $false
      running = $false
    }
  }

  try {
    $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
    $pid = [int]$lock.pid
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($null -eq $proc) {
      Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
      return [ordered]@{
        exists = $false
        running = $false
        staleLockRemoved = $true
      }
    }

    return [ordered]@{
      exists = $true
      running = $true
      pid = $pid
      processName = $proc.ProcessName
      startedAt = $lock.startedAt
      runner = $lock.runner
      stdout = $lock.stdout
      stderr = $lock.stderr
    }
  } catch {
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    return [ordered]@{
      exists = $false
      running = $false
    }
  }
}

function Get-MempalaceLatestRelevantSource {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $relativeRoots = @(
    "apps",
    "docs",
    "libs",
    "memory",
    "openspec",
    "scripts",
    "services"
  )
  $rootFiles = @(
    "AGENTS.md",
    "WORKSPACE.md",
    "WORKFLOWS.md",
    "mempalace.yaml",
    "entities.json"
  )

  $latest = $null
  foreach ($relative in $relativeRoots) {
    $full = Join-Path $RepoRoot $relative
    if (-not (Test-Path $full)) {
      continue
    }

    Get-ChildItem -Path $full -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
      if ($null -eq $latest -or $_.LastWriteTimeUtc -gt $latest.LastWriteTimeUtc) {
        $latest = $_
      }
    }
  }

  foreach ($relative in $rootFiles) {
    $full = Join-Path $RepoRoot $relative
    if (-not (Test-Path $full)) {
      continue
    }

    $item = Get-Item $full
    if ($null -eq $latest -or $item.LastWriteTimeUtc -gt $latest.LastWriteTimeUtc) {
      $latest = $item
    }
  }

  if ($null -eq $latest) {
    return $null
  }

  $relativePath = $latest.FullName
  if ($relativePath.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relativePath = $relativePath.Substring($RepoRoot.Length).TrimStart('\', '/')
  }

  return [ordered]@{
    path = $latest.FullName
    relativePath = $relativePath
    lastWriteTime = $latest.LastWriteTime.ToString("s")
    lastWriteTimeUtc = $latest.LastWriteTimeUtc.ToString("s")
  }
}

function Get-MempalaceFreshnessState {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Paths,
    [int]$SourceSkewSeconds = 5
  )

  $dbInfo = $null
  if (Test-Path $Paths.palaceDb) {
    $db = Get-Item $Paths.palaceDb
    $dbInfo = [ordered]@{
      exists = $true
      path = $db.FullName
      length = $db.Length
      lastWriteTime = $db.LastWriteTime.ToString("s")
      lastWriteTimeUtc = $db.LastWriteTimeUtc.ToString("s")
      ageMinutes = [math]::Round(((Get-Date).ToUniversalTime() - $db.LastWriteTimeUtc).TotalMinutes, 2)
    }
  } else {
    $dbInfo = [ordered]@{
      exists = $false
    }
  }

  $latestSource = Get-MempalaceLatestRelevantSource -RepoRoot $Paths.repoRoot
  $sourceNewerThanIndex = $false
  $lagMinutes = $null
  $reason = "up-to-date"

  if (-not $dbInfo.exists) {
    $reason = "palace-db-missing"
    $sourceNewerThanIndex = $true
  } elseif ($null -ne $latestSource) {
    $sourceUtc = [datetime]::Parse($latestSource.lastWriteTimeUtc)
    $dbUtc = [datetime]::Parse($dbInfo.lastWriteTimeUtc)
    if ($sourceUtc -gt $dbUtc.AddSeconds($SourceSkewSeconds)) {
      $sourceNewerThanIndex = $true
      $lagMinutes = [math]::Round(($sourceUtc - $dbUtc).TotalMinutes, 2)
      $reason = "source-newer-than-index"
    }
  }

  [ordered]@{
    palaceDb = $dbInfo
    latestRelevantSource = $latestSource
    sourceNewerThanIndex = $sourceNewerThanIndex
    lagMinutes = $lagMinutes
    reason = $reason
  }
}

function Start-MempalaceRefreshIfStale {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Paths,
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$State
  )

  if (-not $State.installed) {
    return [ordered]@{
      attempted = $false
      started = $false
      reason = "not-installed"
    }
  }

  if ($State.refresh.running) {
    return [ordered]@{
      attempted = $false
      started = $false
      reason = "already-running"
      pid = $State.refresh.pid
    }
  }

  if (-not $State.freshness.sourceNewerThanIndex) {
    return [ordered]@{
      attempted = $false
      started = $false
      reason = "up-to-date"
    }
  }

  $output = & $Paths.refreshScript -Background
  if ($LASTEXITCODE -ne 0) {
    return [ordered]@{
      attempted = $true
      started = $false
      reason = "refresh-start-failed"
      output = @($output)
    }
  }

  $payload = $null
  try {
    $payload = $output | ConvertFrom-Json
  } catch {
    $payload = $null
  }

  [ordered]@{
    attempted = $true
    started = $true
    reason = "stale-index-background-refresh-started"
    pid = if ($null -ne $payload) { $payload.pid } else { $null }
    stdout = if ($null -ne $payload) { $payload.stdout } else { $null }
    stderr = if ($null -ne $payload) { $payload.stderr } else { $null }
  }
}

function Get-MempalaceProjectState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $paths = Get-MempalaceProjectPaths -RepoRoot $RepoRoot
  $installed = (Test-Path $paths.mempalaceExe) -and (Test-Path $paths.venvPython) -and (Test-Path $paths.palacePath)
  $refresh = Resolve-MempalaceRefreshLock -Paths $paths
  $freshness = Get-MempalaceFreshnessState -Paths $paths

  [ordered]@{
    installed = $installed
    commandSurface = [ordered]@{
      globalPathAvailable = [bool](Get-Command mempalace -ErrorAction SilentlyContinue)
      repoPowerShellShimAvailable = Test-Path $paths.repoPsShim
      repoPowerShellShimCommand = ".\mempalace.ps1"
      repoShimAvailable = Test-Path $paths.repoShim
      repoShimCommand = ".\mempalace.cmd"
      localExe = $paths.mempalaceExe
    }
    refresh = $refresh
    freshness = $freshness
    paths = $paths
  }
}
