[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$UnitName = "lsmv2-hermes-edge-supervisor.service",
  [string]$EnvFile = "/etc/lsmv2/hermes-edge-supervisor.env",
  [string]$SupervisionFile = "/var/lib/lsmv2/hermes-edge-supervisor/status/supervision.json",
  [string]$HttpUrl = "http://127.0.0.1:18082/v1/supervision",
  [string]$IntentCatalogUrl = "http://127.0.0.1:18082/v1/intent-catalog",
  [string]$RecheckUrl = "http://127.0.0.1:18082/v1/actions/recheck",
  [switch]$Recheck,
  [string]$OutFile = "docs/unified/reports/rk3568-hermes-edge-supervisor-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-RepoRoot() {
  $dir = (Get-Location).Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Resolve-RepoPath {
  param(
    [string]$RootPath,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return Join-Path $RootPath $CandidatePath
}

function Invoke-RemoteBash {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$ScriptText
  )

  if ($TargetPassword) {
    $tempScriptFile = [System.IO.Path]::GetTempFileName()
    $pythonSnippet = @'
import sys
import paramiko
from pathlib import Path

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = Path(sys.argv[5]).read_text(encoding="utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    hostname=host,
    username=user,
    password=password,
    port=port,
    timeout=15,
    banner_timeout=15,
    auth_timeout=15,
    look_for_keys=False,
    allow_agent=False,
)
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=180)
stdin.write(script)
stdin.flush()
stdin.channel.shutdown_write()
sys.stdout.write(stdout.read().decode("utf-8", errors="replace"))
sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
code = stdout.channel.recv_exit_status()
client.close()
raise SystemExit(code)
'@

    try {
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText($tempScriptFile, $ScriptText, $utf8NoBom)
      $pythonSnippet | & python - $TargetHost $TargetUser $TargetPassword ([string]$TargetPort) $tempScriptFile
    } finally {
      Remove-Item $tempScriptFile -Force -ErrorAction SilentlyContinue
    }
    return
  }

  $sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
  $sshArgs = @(
    "-p"
    ([string]$TargetPort)
    "-o"
    "StrictHostKeyChecking=accept-new"
    "-o"
    "ServerAliveInterval=15"
    "-o"
    "ServerAliveCountMax=3"
    ("{0}@{1}" -f $TargetUser, $TargetHost)
    "bash"
    "-s"
    "--"
  )

  $ScriptText | & $sshExe @sshArgs
}

function Convert-TextToJsonObject {
  param(
    [string]$Text,
    [string]$Label
  )

  $trimmed = $Text.Trim()
  if (-not $trimmed) {
    throw "$Label returned empty output"
  }

  $jsonStart = $trimmed.IndexOf("{")
  $jsonEnd = $trimmed.LastIndexOf("}")
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    throw "$Label did not return JSON output"
  }

  return ($trimmed.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)
}

function ConvertTo-Hashtable {
  param($Value)

  if ($null -eq $Value) {
    return $null
  }
  if (
    $Value -is [string] -or
    $Value -is [bool] -or
    $Value -is [byte] -or
    $Value -is [int16] -or
    $Value -is [int] -or
    $Value -is [int64] -or
    $Value -is [single] -or
    $Value -is [double] -or
    $Value -is [decimal]
  ) {
    return $Value
  }
  if ($Value -is [System.Collections.IDictionary]) {
    $map = [ordered]@{}
    foreach ($key in $Value.Keys) {
      $map[$key] = ConvertTo-Hashtable -Value $Value[$key]
    }
    return $map
  }
  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    return @($Value | ForEach-Object { ConvertTo-Hashtable $_ })
  }
  if ($Value -is [pscustomobject]) {
    $map = [ordered]@{}
    foreach ($property in $Value.PSObject.Properties) {
      $map[$property.Name] = ConvertTo-Hashtable -Value $property.Value
    }
    return $map
  }
  return $Value
}

function Get-PropertyValue {
  param(
    $Object,
    [string]$Name
  )

  if ($null -eq $Object) {
    return $null
  }

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }

  return $property.Value
}

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile

$unitNameBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($UnitName))
$envFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($EnvFile))
$supervisionFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($SupervisionFile))
$httpUrlBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($HttpUrl))
$intentCatalogUrlBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($IntentCatalogUrl))
$recheckUrlBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RecheckUrl))
$recheckFlag = if ($Recheck.IsPresent) { "1" } else { "0" }

$remoteScript = @'
set -euo pipefail

export UNIT_NAME="$(printf '%s' '__UNIT_B64__' | base64 -d)"
export ENV_FILE_PATH="$(printf '%s' '__ENV_B64__' | base64 -d)"
export SUPERVISION_FILE_PATH="$(printf '%s' '__SUPERVISION_B64__' | base64 -d)"
export HTTP_URL="$(printf '%s' '__HTTP_B64__' | base64 -d)"
export INTENT_CATALOG_URL="$(printf '%s' '__INTENT_B64__' | base64 -d)"
export RECHECK_URL="$(printf '%s' '__RECHECK_B64__' | base64 -d)"
export DO_RECHECK="__DO_RECHECK__"

python3 - <<'PY'
import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone

unit_name = os.environ["UNIT_NAME"]
env_path = pathlib.Path(os.environ["ENV_FILE_PATH"])
supervision_path = pathlib.Path(os.environ["SUPERVISION_FILE_PATH"])
http_url = os.environ["HTTP_URL"]
intent_catalog_url = os.environ["INTENT_CATALOG_URL"]
recheck_url = os.environ["RECHECK_URL"]
do_recheck = os.environ["DO_RECHECK"] == "1"

def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def run(command: list[str]) -> dict[str, object]:
    proc = subprocess.run(command, capture_output=True, text=True)
    return {
        "command": command,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }

def read_json(path: pathlib.Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

def read_env(path: pathlib.Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key] = value
    return values

def fetch_http(url: str, method: str = "GET", body: bytes | None = None):
    try:
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = response.read().decode("utf-8", errors="replace")
        return json.loads(payload)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}

recheck_result = None
if do_recheck:
    recheck_result = fetch_http(
        recheck_url,
        method="POST",
        body=b'{"intent":"refresh Hermes supervisor evidence","requestedBy":"center-refresh-script"}',
    )

http_supervision = fetch_http(http_url)
intent_catalog = fetch_http(intent_catalog_url)

result = {
    "generatedAt": iso_now(),
    "mode": "rk3568-hermes-edge-supervisor-runtime-check",
    "unitName": unit_name,
    "envFile": str(env_path),
    "supervisionFile": str(supervision_path),
    "httpUrl": http_url,
    "intentCatalogUrl": intent_catalog_url,
    "serviceState": {
        "isActive": run(["systemctl", "is-active", unit_name]),
        "isEnabled": run(["systemctl", "is-enabled", unit_name]),
        "show": run(["systemctl", "show", unit_name, "--property=ActiveState,SubState,MainPID,ExecMainStartTimestamp,FragmentPath"]),
    },
    "configuredEnv": read_env(env_path),
    "supervisionFileJson": read_json(supervision_path),
    "httpSupervision": http_supervision,
    "intentCatalog": intent_catalog,
    "actionRecheck": recheck_result,
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PY
'@

$remoteScript = $remoteScript.
  Replace("__UNIT_B64__", $unitNameBase64).
  Replace("__ENV_B64__", $envFileBase64).
  Replace("__SUPERVISION_B64__", $supervisionFileBase64).
  Replace("__HTTP_B64__", $httpUrlBase64).
  Replace("__INTENT_B64__", $intentCatalogUrlBase64).
  Replace("__RECHECK_B64__", $recheckUrlBase64).
  Replace("__DO_RECHECK__", $recheckFlag)

$raw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$rawText = [string]::Join([Environment]::NewLine, @($raw))
$remoteReport = Convert-TextToJsonObject -Text $rawText -Label "refresh-rk3568-hermes-edge-supervisor"

$httpSupervision = Get-PropertyValue $remoteReport "httpSupervision"
$aiDiagnosis = Get-PropertyValue $httpSupervision "aiDiagnosis"
$actionInterface = Get-PropertyValue $httpSupervision "actionInterface"
$aiModels = @(Get-PropertyValue $httpSupervision "aiModels")
$firstModel = if ($aiModels.Count -gt 0) { $aiModels[0] } else { $null }
$intentCatalog = Get-PropertyValue $remoteReport "intentCatalog"
$intents = @(Get-PropertyValue $intentCatalog "intents")
$actionRecheck = Get-PropertyValue $remoteReport "actionRecheck"
$recheckAction = Get-PropertyValue $actionRecheck "action"
$safetyBoundary = Get-PropertyValue $actionRecheck "safetyBoundary"

$modelLoaded = [bool](Get-PropertyValue $aiDiagnosis "modelLoaded")
$modelVersion = [string](Get-PropertyValue $aiDiagnosis "modelVersion")
$featureVector = Get-PropertyValue $aiDiagnosis "featureVector"
$featureCount = if ($featureVector) { @($featureVector.PSObject.Properties).Count } else { [int](Get-PropertyValue $firstModel "featureCount") }
$accepted = ((Get-PropertyValue $httpSupervision "accepted") -eq $true) -and -not (Get-PropertyValue $httpSupervision "error")

$finalReport = [ordered]@{
  generatedAt = [string](Get-PropertyValue $remoteReport "generatedAt")
  accepted = $accepted
  mode = [string](Get-PropertyValue $remoteReport "mode")
  currentBoundary = if ($accepted) { "rk3568-hermes-edge-supervisor-agent-model-registry-ready" } else { "rk3568-hermes-edge-supervisor-needs-review" }
  boardHost = $BoardHost
  unitName = [string](Get-PropertyValue $remoteReport "unitName")
  envFile = [string](Get-PropertyValue $remoteReport "envFile")
  supervisionFile = [string](Get-PropertyValue $remoteReport "supervisionFile")
  httpUrl = [string](Get-PropertyValue $remoteReport "httpUrl")
  intentCatalogUrl = [string](Get-PropertyValue $remoteReport "intentCatalogUrl")
  serviceState = ConvertTo-Hashtable (Get-PropertyValue $remoteReport "serviceState")
  configuredEnv = ConvertTo-Hashtable (Get-PropertyValue $remoteReport "configuredEnv")
  supervisionFileJson = ConvertTo-Hashtable (Get-PropertyValue $remoteReport "supervisionFileJson")
  httpSupervision = ConvertTo-Hashtable $httpSupervision
  intentCatalog = ConvertTo-Hashtable $intentCatalog
  actionRecheck = ConvertTo-Hashtable $actionRecheck
  derived = [ordered]@{
    diagnosisType = [string](Get-PropertyValue $aiDiagnosis "diagnosisType")
    confidence = [double](Get-PropertyValue $aiDiagnosis "confidence")
    modelLoaded = $modelLoaded
    modelVersion = $modelVersion
    featureCount = [int]$featureCount
    aiModelCount = @($aiModels | Where-Object { $null -ne $_ }).Count
    naturalLanguageReady = (Get-PropertyValue $actionInterface "naturalLanguageReady") -eq $true
    intentCount = @($intents | Where-Object { $null -ne $_ }).Count
    actionRecheckAccepted = (Get-PropertyValue $actionRecheck "accepted") -eq $true
    actionRecheckStatus = [string](Get-PropertyValue $recheckAction "status")
    actionSafetyGatewayCoreTouched = (Get-PropertyValue $safetyBoundary "gatewayCoreTouched") -eq $true
    actionSafetySerialTouched = (Get-PropertyValue $safetyBoundary "serialTouched") -eq $true
    actionSafetyMqttTouched = (Get-PropertyValue $safetyBoundary "mqttTouched") -eq $true
  }
}

$outDir = Split-Path -Parent $resolvedOutFile
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$json = $finalReport | ConvertTo-Json -Depth 80
$utf8NoBomOut = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($resolvedOutFile, $json + [Environment]::NewLine, $utf8NoBomOut)

$finalReport | ConvertTo-Json -Depth 20
