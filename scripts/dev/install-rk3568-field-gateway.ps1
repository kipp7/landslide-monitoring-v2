[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$MqttUrl = "mqtt://192.168.124.17:1883",
  [string]$MqttUsername = "",
  [string]$MqttPassword = "",
  [string]$MqttEnvFile = "services/api/.env",
  [string]$RunUser = "linaro",
  [string]$RunGroup = "linaro",
  [string]$EnvFile = "/etc/lsmv2/field-gateway.env",
  [string]$StateRoot = "/var/lib/lsmv2/field-gateway",
  [string]$SerialDevice = "/dev/ttyS3",
  [int]$SerialBaudRate = 115200,
  [ValidateSet("raw-json", "cobs-crc-v1")]
  [string]$FieldLinkMode = "cobs-crc-v1",
  [string]$SouthboundNodesJson = '[{"fieldNodeId":"A","deviceId":"00000000-0000-0000-0000-000000000001","installLabel":"FIELD-NODE-A","southboundPort":"/dev/ttyS3","enabled":true},{"fieldNodeId":"B","deviceId":"00000000-0000-0000-0000-000000000002","installLabel":"FIELD-NODE-B","southboundPort":"/dev/ttyS3","enabled":true},{"fieldNodeId":"C","deviceId":"00000000-0000-0000-0000-000000000003","installLabel":"FIELD-NODE-C","southboundPort":"/dev/ttyS3","enabled":true}]',
  [int]$CommandAckQuietWindowMs = 10000,
  [int]$CommandPrewriteQuietMs = 400,
  [int]$CommandPrewriteMaxWaitMs = 4000,
  [ValidateSet("true", "false")]
  [string]$SouthboundPollingEnabled = "true",
  [string]$SouthboundPollingCommandType = "poll_latest_telemetry",
  [int]$SouthboundPollingIntervalMs = 500,
  [int]$SouthboundPollingSessionTimeoutMs = 6000,
  [ValidateSet("true", "false")]
  [string]$SouthboundPollingSuppressAckPublish = "true",
  [switch]$SkipSourceSync,
  [switch]$SkipBuild,
  [switch]$OverwriteEnv,
  [switch]$NoEnable
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Fallback = ""
  )

  if (-not (Test-Path -LiteralPath $Path)) { return $Fallback }

  $last = $null
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#")) { continue }
    if ($trimmed.StartsWith("$Key=")) {
      $value = $trimmed.Substring($Key.Length + 1).Trim()
      if ($value.Length -gt 0) {
        $last = $value
      }
    }
  }

  if ($last) { return $last }
  return $Fallback
}

$pythonConnectHelper = @'

import time

def connect_with_retry(client, **kwargs):
    last_error = None
    for attempt in range(1, 6):
        try:
            client.connect(
                timeout=15,
                banner_timeout=15,
                auth_timeout=15,
                look_for_keys=False,
                allow_agent=False,
                **kwargs,
            )
            return
        except Exception as exc:
            last_error = exc
            if attempt >= 5:
                raise
            time.sleep(3)
    raise last_error
'@

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
'@ + $pythonConnectHelper + @'

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = Path(sys.argv[5]).read_text(encoding="utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
connect_with_retry(client, hostname=host, username=user, password=password, port=port)
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=900)
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

function Get-NormalizedRelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $baseFullPath = [System.IO.Path]::GetFullPath($BasePath)
  if (-not $baseFullPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $baseFullPath = $baseFullPath + [System.IO.Path]::DirectorySeparatorChar
  }

  $targetFullPath = [System.IO.Path]::GetFullPath($TargetPath)
  $baseUri = New-Object System.Uri($baseFullPath)
  $targetUri = New-Object System.Uri($targetFullPath)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
}

function Get-FieldGatewaySourceSyncManifest {
  param(
    [string]$LocalRepoRoot
  )

  $exactRelativeFiles = @(
    "package.json",
    "package-lock.json",
    "tsconfig.base.json",
    "services/field-gateway/.env.example",
    "services/field-gateway/package.json",
    "services/field-gateway/README.md",
    "services/field-gateway/tsconfig.json",
    "libs/observability/package.json",
    "libs/observability/tsconfig.json",
    "libs/validation/package.json",
    "libs/validation/tsconfig.json"
  )
  $recursiveRelativeDirs = @(
    "services/field-gateway/src",
    "services/field-gateway/deploy",
    "libs/observability/src",
    "libs/validation/src",
    "docs/integrations/mqtt/schemas"
  )

  $files = New-Object System.Collections.Generic.List[string]
  foreach ($relativePath in $exactRelativeFiles) {
    $absolutePath = Join-Path $LocalRepoRoot $relativePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
      throw "source sync file not found: $absolutePath"
    }
    $files.Add($relativePath.Replace("\", "/"))
  }

  foreach ($relativeDir in $recursiveRelativeDirs) {
    $absoluteDir = Join-Path $LocalRepoRoot $relativeDir
    if (-not (Test-Path -LiteralPath $absoluteDir -PathType Container)) {
      throw "source sync directory not found: $absoluteDir"
    }

    Get-ChildItem -LiteralPath $absoluteDir -Recurse -File | ForEach-Object {
      $relativeFile = Get-NormalizedRelativePath -BasePath $LocalRepoRoot -TargetPath $_.FullName
      $files.Add($relativeFile.Replace("\", "/"))
    }
  }

  [PSCustomObject]@{
    localRepoRoot = [System.IO.Path]::GetFullPath($LocalRepoRoot)
    files = @($files | Sort-Object -Unique)
    resetDirs = @($recursiveRelativeDirs | ForEach-Object { $_.Replace("\", "/") })
  }
}

function Sync-FieldGatewaySourceToRemote {
  param(
    [string]$LocalRepoRoot,
    [string]$RemoteRepoRoot,
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort
  )

  $manifest = Get-FieldGatewaySourceSyncManifest -LocalRepoRoot $LocalRepoRoot
  $syncPayload = [PSCustomObject]@{
    localRepoRoot = $manifest.localRepoRoot
    remoteRepoRoot = $RemoteRepoRoot
    files = $manifest.files
    resetDirs = $manifest.resetDirs
  }

  $tempManifestFile = [System.IO.Path]::GetTempFileName()
  $pythonSnippet = @'
import json
import os
import posixpath
import stat
import sys
from pathlib import Path

import paramiko
'@ + $pythonConnectHelper + @'


def ensure_remote_dir(sftp, remote_path):
    normalized = posixpath.normpath(remote_path)
    parts = []
    while normalized not in ("", "/"):
        parts.append(posixpath.basename(normalized))
        normalized = posixpath.dirname(normalized)

    current = "/"
    for part in reversed(parts):
        current = posixpath.join(current, part)
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def remove_remote_tree(sftp, remote_path):
    try:
        attrs = sftp.lstat(remote_path)
    except FileNotFoundError:
        return

    if stat.S_ISDIR(attrs.st_mode):
        for entry in sftp.listdir_attr(remote_path):
            remove_remote_tree(sftp, posixpath.join(remote_path, entry.filename))
        sftp.rmdir(remote_path)
        return

    sftp.remove(remote_path)


manifest_path = Path(sys.argv[1])
host = sys.argv[2]
user = sys.argv[3]
password = sys.argv[4] or None
port = int(sys.argv[5])
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
local_root = Path(manifest["localRepoRoot"])
remote_root = manifest["remoteRepoRoot"]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
connect_with_retry(client, hostname=host, username=user, password=password, port=port)
sftp = client.open_sftp()

ensure_remote_dir(sftp, remote_root)

for relative_dir in manifest["resetDirs"]:
    remote_dir = posixpath.join(remote_root, relative_dir.replace("\\", "/"))
    remove_remote_tree(sftp, remote_dir)
    ensure_remote_dir(sftp, remote_dir)

for relative_file in manifest["files"]:
    normalized_relative = relative_file.replace("\\", "/")
    local_file = local_root.joinpath(*normalized_relative.split("/"))
    if not local_file.is_file():
        raise SystemExit(f"local sync file missing: {local_file}")

    remote_file = posixpath.join(remote_root, normalized_relative)
    ensure_remote_dir(sftp, posixpath.dirname(remote_file))
    sftp.put(str(local_file), remote_file)
    if normalized_relative.endswith(".sh"):
        sftp.chmod(remote_file, 0o755)

sftp.close()
client.close()
print(json.dumps({
    "remoteRepoRoot": remote_root,
    "fileCount": len(manifest["files"]),
    "resetDirs": manifest["resetDirs"],
}, ensure_ascii=False))
'@

  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText(
      $tempManifestFile,
      ($syncPayload | ConvertTo-Json -Depth 8 -Compress),
      $utf8NoBom
    )
    $pythonRaw = $pythonSnippet | & python - $tempManifestFile $TargetHost $TargetUser $TargetPassword ([string]$TargetPort)
  } finally {
    Remove-Item $tempManifestFile -Force -ErrorAction SilentlyContinue
  }

  $pythonText = [string]::Join([Environment]::NewLine, @($pythonRaw))
  $jsonStart = $pythonText.IndexOf("{")
  if ($jsonStart -lt 0) {
    throw "rk3568 source sync did not return JSON summary"
  }

  return ($pythonText.Substring($jsonStart) | ConvertFrom-Json)
}

$repoRootLocal = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$mqttEnvPath = Join-Path $repoRootLocal $MqttEnvFile
$resolvedMqttUsername = if ($MqttUsername) { $MqttUsername } else { Read-EnvValue -Path $mqttEnvPath -Key "MQTT_INTERNAL_USERNAME" -Fallback "ingest-service" }
$resolvedMqttPassword = if ($MqttPassword) { $MqttPassword } else { Read-EnvValue -Path $mqttEnvPath -Key "MQTT_INTERNAL_PASSWORD" -Fallback "" }
if (-not $SkipSourceSync) {
  $null = Sync-FieldGatewaySourceToRemote `
    -LocalRepoRoot $repoRootLocal `
    -RemoteRepoRoot $RepoRoot `
    -TargetHost $BoardHost `
    -TargetUser $User `
    -TargetPassword $Password `
    -TargetPort $SshPort
}

$installScriptPath = Join-Path $repoRootLocal "services/field-gateway/deploy/install-rk3568.sh"
$checkScriptPath = Join-Path $repoRootLocal "services/field-gateway/deploy/check-rk3568-runtime.sh"
$serviceTemplatePath = Join-Path $repoRootLocal "services/field-gateway/deploy/field-gateway.service.template"
$installScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $installScriptPath -Raw -Encoding UTF8)))
$checkScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $checkScriptPath -Raw -Encoding UTF8)))
$serviceTemplateBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $serviceTemplatePath -Raw -Encoding UTF8)))

$argList = @(
  "--repo-root", $RepoRoot,
  "--run-user", $RunUser,
  "--run-group", $RunGroup,
  "--env-file", $EnvFile,
  "--state-root", $StateRoot,
  "--mqtt-url", $MqttUrl,
  "--mqtt-username", $resolvedMqttUsername,
  "--mqtt-password", $resolvedMqttPassword,
  "--serial-device", $SerialDevice,
  "--serial-baud-rate", ([string]$SerialBaudRate),
  "--field-link-mode", $FieldLinkMode,
  "--southbound-nodes-json", $SouthboundNodesJson,
  "--command-ack-quiet-window-ms", ([string]$CommandAckQuietWindowMs),
  "--command-prewrite-quiet-ms", ([string]$CommandPrewriteQuietMs),
  "--command-prewrite-max-wait-ms", ([string]$CommandPrewriteMaxWaitMs),
  "--southbound-polling-enabled", $SouthboundPollingEnabled,
  "--southbound-polling-command-type", $SouthboundPollingCommandType,
  "--southbound-polling-interval-ms", ([string]$SouthboundPollingIntervalMs),
  "--southbound-polling-session-timeout-ms", ([string]$SouthboundPollingSessionTimeoutMs),
  "--southbound-polling-suppress-ack-publish", $SouthboundPollingSuppressAckPublish
)
if ($SkipBuild) { $argList += "--skip-build" }
if ($OverwriteEnv) { $argList += "--overwrite-env" }
if ($NoEnable) { $argList += "--no-enable" }

$argJsonBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($argList | ConvertTo-Json -Compress)))
$repoRootBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RepoRoot))
$envFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($EnvFile))
$healthFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("$StateRoot/health/runtime-health.json"))
$passwordBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Password))

$remoteScript = @'
set -euo pipefail

tmp_dir="$(mktemp -d)"
tmp_install="$tmp_dir/install-rk3568.sh"
tmp_check="$tmp_dir/check-rk3568-runtime.sh"
tmp_template="$tmp_dir/field-gateway.service.template"
trap 'rm -rf "$tmp_dir"' EXIT

printf '%s' '__INSTALL_SCRIPT_B64__' | base64 -d > "$tmp_install"
printf '%s' '__CHECK_SCRIPT_B64__' | base64 -d > "$tmp_check"
printf '%s' '__SERVICE_TEMPLATE_B64__' | base64 -d > "$tmp_template"
chmod +x "$tmp_install" "$tmp_check"

mapfile -t INSTALL_ARGS < <(
  python3 - <<'PY'
import base64
import json

for item in json.loads(base64.b64decode('__ARG_JSON_B64__').decode('utf-8')):
    print(item)
PY
)

SUDO_PASSWORD="$(printf '%s' '__PASSWORD_B64__' | base64 -d)"
if [ -n "$SUDO_PASSWORD" ]; then
  printf '%s\n' "$SUDO_PASSWORD" | sudo -S bash "$tmp_install" "${INSTALL_ARGS[@]}"
else
  sudo bash "$tmp_install" "${INSTALL_ARGS[@]}"
fi

for _ in $(seq 1 20); do
  service_state="$(systemctl is-active lsmv2-field-gateway.service 2>/dev/null || true)"
  if [ "$service_state" = "active" ]; then
    break
  fi
  sleep 1
done

export REPO_ROOT="$(printf '%s' '__REPO_ROOT_B64__' | base64 -d)"
export SYSTEMD_UNIT_NAME='lsmv2-field-gateway'
export ENV_FILE_PATH="$(printf '%s' '__ENV_FILE_B64__' | base64 -d)"
export HEALTH_FILE_PATH="$(printf '%s' '__HEALTH_FILE_B64__' | base64 -d)"
export JOURNAL_LINES='40'

bash "$tmp_check"
'@

$remoteScript = $remoteScript.
  Replace("__INSTALL_SCRIPT_B64__", $installScriptBase64).
  Replace("__CHECK_SCRIPT_B64__", $checkScriptBase64).
  Replace("__SERVICE_TEMPLATE_B64__", $serviceTemplateBase64).
  Replace("__ARG_JSON_B64__", $argJsonBase64).
  Replace("__PASSWORD_B64__", $passwordBase64).
  Replace("__REPO_ROOT_B64__", $repoRootBase64).
  Replace("__ENV_FILE_B64__", $envFileBase64).
  Replace("__HEALTH_FILE_B64__", $healthFileBase64)

$raw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$rawText = [string]::Join([Environment]::NewLine, @($raw))
$jsonStart = $rawText.IndexOf("{")
if ($jsonStart -lt 0) {
  throw "install-rk3568-field-gateway did not return JSON runtime snapshot"
}
$jsonText = $rawText.Substring($jsonStart)
$result = $jsonText | ConvertFrom-Json
$activeState = $result.serviceState.isActive.stdout
if ($activeState -ne "active") {
  throw ("install-rk3568-field-gateway completed but service is not active (state={0})" -f $activeState)
}
$resultJson = $result | ConvertTo-Json -Depth 8
$resultJson
