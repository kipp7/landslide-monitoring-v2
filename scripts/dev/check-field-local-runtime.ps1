[CmdletBinding()]
param(
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$OutFile = "docs/unified/reports/field-local-runtime-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Test-Tcp([int]$Port) {
  $r = Test-NetConnection 127.0.0.1 -Port $Port -WarningAction SilentlyContinue
  [pscustomobject]@{
    port = $Port
    tcpReachable = [bool]$r.TcpTestSucceeded
  }
}

function Test-Http([string]$Url, [hashtable]$Headers = @{}) {
  try {
    $resp = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 5 -Headers $Headers
    [pscustomobject]@{
      url = $Url
      ok = $true
      statusCode = $resp.StatusCode
      body = ($resp.Content | Out-String).Trim()
    }
  } catch {
    [pscustomobject]@{
      url = $Url
      ok = $false
      statusCode = $null
      error = $_.Exception.Message
    }
  }
}

function Invoke-ApiLogin([string]$BaseUrl, [string]$User, [string]$Pass) {
  try {
    $payload = @{ username = $User; password = $Pass } | ConvertTo-Json -Compress
    $resp = Invoke-RestMethod "$BaseUrl/api/v1/auth/login" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5
    $data = $resp.data
    [pscustomobject]@{
      ok = $true
      hasToken = [string]::IsNullOrWhiteSpace([string]$data.token) -eq $false
      token = [string]$data.token
      user = [string]$data.user.username
    }
  } catch {
    [pscustomobject]@{
      ok = $false
      hasToken = $false
      token = $null
      error = $_.Exception.Message
    }
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $login = Invoke-ApiLogin "http://127.0.0.1:8080" $Username $Password
  $systemHeaders = @{ Accept = "application/json" }
  if ($login.hasToken) {
    $systemHeaders.Authorization = "Bearer $($login.token)"
  }

  $result = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    login = [ordered]@{
      ok = $login.ok
      hasToken = $login.hasToken
      user = if ($login.ok) { $login.user } else { $null }
      error = if ($login.ok) { $null } else { $login.error }
    }
    tcp = @(
      (Test-Tcp 1883),
      (Test-Tcp 9094),
      (Test-Tcp 8080),
      (Test-Tcp 3000)
    )
    http = @(
      (Test-Http "http://127.0.0.1:8080/health"),
      (Test-Http "http://127.0.0.1:3000"),
      (Test-Http "http://127.0.0.1:8080/api/v1/system/status" $systemHeaders)
    )
  }

  $json = $result | ConvertTo-Json -Depth 6
  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
