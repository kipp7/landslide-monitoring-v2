[CmdletBinding()]
param(
  [string]$Container = "lsmv2_api",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$OutFile = "docs/unified/reports/field-rehearsal-device-latest.json",
  [string]$SecretOutFile = "backups/evidence/field-rehearsal-device-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$nodeScript = @"
(async () => {
  const loginResp = await fetch('http://127.0.0.1:8080/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '$Username', password: '$Password' })
  });
  const loginText = await loginResp.text();
  const loginJson = JSON.parse(loginText);
  const token = loginJson?.data?.token;
  if (!token) {
    console.error(JSON.stringify({ ok: false, step: 'login', body: loginText }, null, 2));
    process.exit(1);
  }

  const createResp = await fetch('http://127.0.0.1:8080/api/v1/devices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({
      deviceName: 'field-rehearsal-device',
      deviceType: 'multi_sensor',
      metadata: {
        note: 'field_rehearsal',
        install_label: 'REHEARSAL-01'
      }
    })
  });

  const createText = await createResp.text();
  console.log(createText);
  if (!createResp.ok) process.exit(1);
})();
"@

$output = & docker exec $Container node -e $nodeScript 2>&1 | Out-String

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullOutFile = Join-Path $repoRoot $OutFile
$fullSecretOutFile = Join-Path $repoRoot $SecretOutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$secretOutDir = Split-Path -Parent $fullSecretOutFile
if ($secretOutDir -and -not (Test-Path $secretOutDir)) {
  New-Item -ItemType Directory -Path $secretOutDir -Force | Out-Null
}

$raw = $output.Trim()
if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) { $raw = $raw.Substring(1) }
$json = $raw | ConvertFrom-Json

$output | Set-Content -Path $fullSecretOutFile -Encoding UTF8

$public = $json | ConvertTo-Json -Depth 8 | ConvertFrom-Json
if ($public.data -and $public.data.deviceSecret) {
  $public.data.deviceSecret = "***REDACTED***"
}
$public | Add-Member -NotePropertyName secretFile -NotePropertyValue $SecretOutFile -Force
$publicJson = $public | ConvertTo-Json -Depth 8
Set-Content -Path $fullOutFile -Value $publicJson -Encoding UTF8
$publicJson

if ($LASTEXITCODE -ne 0) {
  throw "create-field-rehearsal-device failed (exit=$LASTEXITCODE)"
}
