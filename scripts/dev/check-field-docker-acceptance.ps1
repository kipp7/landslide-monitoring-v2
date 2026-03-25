[CmdletBinding()]
param(
  [string]$Container = "lsmv2_api",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$OutFile = "docs/unified/reports/field-docker-acceptance-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$nodeScript = @"
(async () => {
  const result = { generatedAt: new Date().toISOString(), login: null, checks: [] };
  const loginResp = await fetch('http://127.0.0.1:8080/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '$Username', password: '$Password' })
  });
  const loginText = await loginResp.text();
  result.login = { status: loginResp.status, body: loginText };
  let token = null;
  try { token = JSON.parse(loginText)?.data?.token || null; } catch {}
  const targets = [
    'http://127.0.0.1:8080/health',
    'http://127.0.0.1:8080/api/v1/system/status',
    'http://127.0.0.1:8080/api/v1/stations?page=1&pageSize=5',
    'http://127.0.0.1:8080/api/v1/devices?page=1&pageSize=5'
  ];
  for (const url of targets) {
    const headers = { Accept: 'application/json' };
    if (url.includes('/api/') && token) headers.Authorization = 'Bearer ' + token;
    try {
      const resp = await fetch(url, { headers });
      const text = await resp.text();
      result.checks.push({ url, status: resp.status, ok: resp.ok, body: text });
    } catch (err) {
      result.checks.push({ url, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  console.log(JSON.stringify(result, null, 2));
  if (!token || result.checks.some(x => x.ok !== true)) process.exit(1);
})();
"@

$output = & docker exec $Container node -e $nodeScript 2>&1 | Out-String

$raw = $output.Trim()
if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) { $raw = $raw.Substring(1) }
try {
  $json = $raw | ConvertFrom-Json
  if ($json.login -and $json.login.body) {
    $bodyObj = $json.login.body | ConvertFrom-Json
    if ($bodyObj.data) {
      if ($bodyObj.data.token) { $bodyObj.data.token = "***REDACTED***" }
      if ($bodyObj.data.refreshToken) { $bodyObj.data.refreshToken = "***REDACTED***" }
    }
    $json.login.body = $bodyObj | ConvertTo-Json -Depth 8 -Compress
  }
  $output = $json | ConvertTo-Json -Depth 8
} catch {
  # keep raw output if not parseable
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $output -Encoding UTF8
$output
if ($LASTEXITCODE -ne 0) {
  throw "docker acceptance probe failed (exit=$LASTEXITCODE)"
}
