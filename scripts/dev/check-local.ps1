param(
  [string]$WebBaseUrl = "http://localhost:3000",
  [string]$ApiBaseUrl = "http://localhost:8080",
  [string]$Bearer = "dev"
)

$ErrorActionPreference = "Stop"

# Note: if you're in a conda-enabled PowerShell, prefer running with -NoProfile to avoid conda profile noise:
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-local.ps1

function Call([string]$method, [string]$url, [hashtable]$headers = @{}, [string]$body = "") {
  try {
    $params = @{
      Uri            = $url
      Method         = $method
      UseBasicParsing = $true
      Headers        = $headers
      TimeoutSec     = 10
    }
    if ($body -and $method -ne "GET") {
      $params["Body"] = $body
      if (-not $headers.ContainsKey("Content-Type")) { $params["ContentType"] = "application/json" }
    }

    $resp = Invoke-WebRequest @params
    return @{
      Ok = $true
      Status = $resp.StatusCode
      Body = ($resp.Content | Out-String).Trim()
      Headers = $resp.Headers
    }
  } catch {
    $r = $_.Exception.Response
    if ($r) {
      $sr = New-Object IO.StreamReader($r.GetResponseStream())
      $text = $sr.ReadToEnd()
      return @{
        Ok = $false
        Status = $r.StatusCode.value__
        Body = ($text | Out-String).Trim()
        Headers = $r.Headers
      }
    }
    return @{
      Ok = $false
      Status = -1
      Body = $_.Exception.Message
      Headers = @{}
    }
  }
}

$authHeaders = @{ Authorization = "Bearer $Bearer"; Accept = "application/json" }

Write-Host "=== Local smoke check ===" -ForegroundColor Cyan
Write-Host "Web: $WebBaseUrl" -ForegroundColor DarkGray
Write-Host "API: $ApiBaseUrl" -ForegroundColor DarkGray
Write-Host ""

$checks = @(
  @{ Name = "api health"; Url = "$ApiBaseUrl/health"; Method = "GET"; Headers = @{} },
  @{ Name = "api inspect-db"; Url = "$ApiBaseUrl/api/inspect-db"; Method = "GET"; Headers = $authHeaders },
  @{ Name = "api anomaly-assessment"; Url = "$ApiBaseUrl/api/anomaly-assessment?timeWindow=24"; Method = "GET"; Headers = $authHeaders },
  @{ Name = "api iot mappings"; Url = "$ApiBaseUrl/api/iot/devices/mappings"; Method = "GET"; Headers = $authHeaders },
  @{ Name = "web proxy anomaly-assessment"; Url = "$WebBaseUrl/api/anomaly-assessment?timeWindow=24"; Method = "GET"; Headers = @{ Accept="application/json" } },
  @{ Name = "web proxy iot mappings"; Url = "$WebBaseUrl/api/iot/devices/mappings"; Method = "GET"; Headers = @{ Accept="application/json" } },
  @{ Name = "web proxy baselines"; Url = "$WebBaseUrl/api/baselines"; Method = "GET"; Headers = @{ Accept="application/json" } },
  @{ Name = "web proxy gps deformation device_1"; Url = "$WebBaseUrl/api/gps-deformation/device_1?days=7"; Method = "GET"; Headers = @{ Accept="application/json" } }
)

foreach ($c in $checks) {
  $res = Call $c.Method $c.Url $c.Headers
  $status = $res.Status
  $tag = if ($res.Ok -and $status -ge 200 -and $status -lt 400) { "OK" } else { "FAIL" }
  $color = if ($tag -eq "OK") { "Green" } else { "Red" }
  Write-Host ("[{0}] {1} -> {2}" -f $tag, $c.Name, $status) -ForegroundColor $color
  if ($res.Headers -and $res.Headers["x-lsmv2-proxy-target"]) {
    Write-Host ("  proxyTarget: {0}" -f $res.Headers["x-lsmv2-proxy-target"]) -ForegroundColor DarkGray
  }
}
