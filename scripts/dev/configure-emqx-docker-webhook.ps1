[CmdletBinding()]
param(
  [string]$EmqxContainer = "lsmv2_emqx",
  [string]$ApiContainerHost = "lsmv2_api",
  [int]$ApiPort = 8080,
  [string]$ApiEnvFile = "services/api/.env"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-EnvValue([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return $null }
  $lines = Get-Content -Encoding UTF8 $path
  $last = $null
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.StartsWith("#")) { continue }
    if ($t.StartsWith("$key=")) {
      $v = $t.Substring($key.Length + 1).Trim()
      if ($v.Length -gt 0) { $last = $v }
    }
  }
  return $last
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullApiEnv = Join-Path $repoRoot $ApiEnvFile
$webhookToken = Read-EnvValue $fullApiEnv "EMQX_WEBHOOK_TOKEN"
if (-not $webhookToken) {
  throw "EMQX_WEBHOOK_TOKEN missing in $ApiEnvFile"
}

$authnUrl = "http://$ApiContainerHost`:$ApiPort/emqx/authn"
$authzUrl = "http://$ApiContainerHost`:$ApiPort/emqx/acl"

$scriptContent = @'
#!/bin/sh
set -eu

TOKEN=$(curl -s -X POST http://127.0.0.1:18083/api/v5/login \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$EMQX_DASHBOARD__DEFAULT_USERNAME\",\"password\":\"$EMQX_DASHBOARD__DEFAULT_PASSWORD\"}" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  echo "failed to get EMQX dashboard token" >&2
  exit 1
fi

curl -s -X PUT http://127.0.0.1:18083/api/v5/authentication/password_based:http \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"mechanism":"password_based","backend":"http","enable":true,"method":"post","url":"__AUTHN_URL__","headers":{"x-emqx-token":"__WEBHOOK_TOKEN__","content-type":"application/json"},"body":{"username":"${username}","password":"${password}","clientid":"${clientid}"}}' >/dev/null

curl -s -X PUT http://127.0.0.1:18083/api/v5/authorization/sources/http \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"type":"http","enable":true,"method":"post","url":"__AUTHZ_URL__","headers":{"x-emqx-token":"__WEBHOOK_TOKEN__","content-type":"application/json"},"body":{"username":"${username}","topic":"${topic}","action":"${action}"}}' >/dev/null

echo ok
'@

$scriptContent = $scriptContent.Replace("__AUTHN_URL__", $authnUrl).Replace("__AUTHZ_URL__", $authzUrl).Replace("__WEBHOOK_TOKEN__", $webhookToken)

$tempFile = [System.IO.Path]::GetTempFileName()
$containerScript = "/tmp/configure-emqx-webhook.sh"
try {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tempFile, $scriptContent, $utf8NoBom)
  & docker cp $tempFile "${EmqxContainer}:$containerScript" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "docker cp failed (exit=$LASTEXITCODE)"
  }

  $result = & docker exec $EmqxContainer sh $containerScript 2>&1 | Out-String
  $result

  if ($LASTEXITCODE -ne 0) {
    throw "configure-emqx-docker-webhook failed (exit=$LASTEXITCODE)"
  }
} finally {
  Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}
