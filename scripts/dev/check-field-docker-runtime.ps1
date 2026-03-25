[CmdletBinding()]
param(
  [string]$OutFile = "docs/unified/reports/field-docker-runtime-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Run-DockerExec([string]$container, [string[]]$command) {
  $output = & docker exec $container @command 2>&1 | Out-String
  [pscustomobject]@{
    container = $container
    command = ($command -join " ")
    output = $output.Trim()
    exitCode = $LASTEXITCODE
    ok = ($LASTEXITCODE -eq 0)
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  containers = [ordered]@{
    api = (Run-DockerExec "lsmv2_api" @("node", "-e", "fetch('http://127.0.0.1:8080/health').then(async r=>{console.log(JSON.stringify({ok:r.ok,status:r.status,text:await r.text()}))}).catch(e=>{console.error(e.message);process.exit(1)})"))
    web = (Run-DockerExec "lsmv2_web" @("node", "-e", "fetch('http://127.0.0.1:3000').then(async r=>{console.log(JSON.stringify({ok:r.ok,status:r.status}))}).catch(e=>{console.error(e.message);process.exit(1)})"))
    postgres = (Run-DockerExec "lsmv2_postgres" @("psql", "-U", "landslide", "-d", "landslide_monitor", "-At", "-c", "SELECT 1"))
    clickhouse = (Run-DockerExec "lsmv2_clickhouse" @("clickhouse-client", "--user", "landslide", "--password", "15dbRblPH7nPkZy4HUtFssokQoBFo4Tu", "--database", "landslide", "--query", "SELECT 1"))
    kafka = (Run-DockerExec "lsmv2_kafka" @("/opt/kafka/bin/kafka-topics.sh", "--bootstrap-server", "kafka:9092", "--list"))
    emqx = (Run-DockerExec "lsmv2_emqx" @("sh", "-lc", "ps | head"))
  }
}

$json = $result | ConvertTo-Json -Depth 8
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
