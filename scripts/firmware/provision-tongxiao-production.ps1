[CmdletBinding()]
param(
  [string]$Server = "",
  [string]$SshUser = "ubuntu",
  [string]$KeyFile = "",
  [string]$CredentialFile = "",
  [string]$WifiSsid = "",
  [string]$WifiPassword = ""
)

$ErrorActionPreference = "Stop"
$deviceId = "00000000-0000-4000-8000-000000022206"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

if ([string]::IsNullOrWhiteSpace($Server)) {
  $Server = [Environment]::GetEnvironmentVariable("LSMV2_TONGXIAO_SERVER")
}
if ([string]::IsNullOrWhiteSpace($WifiSsid)) {
  $WifiSsid = [Environment]::GetEnvironmentVariable("TONGXIAO_WIFI_SSID")
}
if ([string]::IsNullOrWhiteSpace($WifiPassword)) {
  $WifiPassword = [Environment]::GetEnvironmentVariable("TONGXIAO_WIFI_PASSWORD")
}
if ([string]::IsNullOrWhiteSpace($Server) -or [string]::IsNullOrWhiteSpace($WifiSsid) -or [string]::IsNullOrWhiteSpace($WifiPassword)) {
  throw "Pass -Server, -WifiSsid and -WifiPassword (or set their local environment variables); values stay outside Git."
}

function Resolve-ProductionKey {
  param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

  $projectsRoot = Split-Path -Parent (Split-Path -Parent $RepositoryRoot)
  $cpaRoot = Join-Path $projectsRoot "98 其他小项目\17_cpa"
  $candidates = @(
    [Environment]::GetEnvironmentVariable("LSMV2_QRS_KEY_FILE"),
    (Join-Path $cpaRoot ".tmp\qrs-key\QRS.pem"),
    (Join-Path $cpaRoot "QRS.pem")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }

  if (Test-Path -LiteralPath $cpaRoot -PathType Container) {
    $discovered = Get-ChildItem -LiteralPath $cpaRoot -Recurse -File -Filter "QRS.pem" -ErrorAction SilentlyContinue |
      Sort-Object { if ($_.FullName -match '[\\/]\.tmp[\\/]qrs-key[\\/]') { 0 } else { 1 } } |
      Select-Object -ExpandProperty FullName -First 1
    if ($discovered) {
      return [IO.Path]::GetFullPath($discovered)
    }
  }

  return $null
}

if ([string]::IsNullOrWhiteSpace($KeyFile)) {
  $KeyFile = Resolve-ProductionKey -RepositoryRoot $repoRoot
}
if ([string]::IsNullOrWhiteSpace($KeyFile) -or -not (Test-Path -LiteralPath $KeyFile -PathType Leaf)) {
  throw "Nanjing production SSH key was not found. Pass -KeyFile explicitly."
}

if ([string]::IsNullOrWhiteSpace($CredentialFile)) {
  $CredentialFile = Join-Path $repoRoot ".tmp\tongxiao-alarm.credentials.env"
}
$credentialFileFull = [IO.Path]::GetFullPath($CredentialFile)

$remoteScript = @'
set -euo pipefail
env_file=/opt/lsmv2-production/.env
token=$(sudo awk -F= '$1=="ADMIN_API_TOKEN" { print substr($0, index($0, "=") + 1) }' "$env_file")
if [ -z "$token" ]; then
  echo '{"provision_error":"ADMIN_API_TOKEN is empty"}'
  exit 2
fi
curl -sS -X POST http://127.0.0.1:8080/api/v1/devices \
  -H "authorization: Bearer $token" \
  -H 'content-type: application/json' \
  --data '{"deviceId":"__DEVICE_ID__","deviceName":"Tongxiao RK2206 alarm terminal","deviceType":"alarm_terminal","metadata":{"role":"tongxiao_alarm_terminal","transport":"wifi_mqtt","sensors":false}}'
'@.Replace("__DEVICE_ID__", $deviceId)

$encodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
$responseText = & ssh -i $KeyFile -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes "$SshUser@$Server" "echo $encodedScript | base64 -d | bash"
if ($LASTEXITCODE -ne 0) {
  throw "Production device provisioning request failed over SSH."
}

try {
  $response = ($responseText | Out-String) | ConvertFrom-Json
} catch {
  throw "Production API returned an invalid provisioning response."
}
if ($response.success -ne $true -or -not $response.data.deviceSecret) {
  throw "Production API did not create the Tongxiao device. It may already exist; device secrets cannot be retrieved twice."
}

$secret = [string]$response.data.deviceSecret
if ($secret -notmatch '^[0-9a-fA-F]{64}$') {
  throw "Production API returned an unexpected device secret format."
}

New-Item -ItemType Directory -Path (Split-Path -Parent $credentialFileFull) -Force | Out-Null
$lines = @(
  "# Generated from the Nanjing production API. Never commit this file.",
  "TONGXIAO_DEVICE_ID=$deviceId",
  "TONGXIAO_MQTT_HOST=$Server",
  "TONGXIAO_MQTT_PORT=1883",
  "TONGXIAO_MQTT_USERNAME=$deviceId",
  "TONGXIAO_MQTT_PASSWORD=$secret",
  "TONGXIAO_WIFI_SSID=$WifiSsid",
  "TONGXIAO_WIFI_PASSWORD=$WifiPassword"
)
[IO.File]::WriteAllLines($credentialFileFull, $lines, (New-Object Text.UTF8Encoding($false)))

Write-Host "Tongxiao production device created: $deviceId"
Write-Host "Credential saved locally (secret not printed): $credentialFileFull"
Write-Host "Next: run build-tongxiao-rk2206.ps1 -CheckOnly, then -ConfirmNoActiveXl01Flash."
