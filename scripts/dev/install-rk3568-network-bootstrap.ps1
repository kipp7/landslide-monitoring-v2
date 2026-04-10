[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$UnitName = "lsmv2-rk3568-network-bootstrap",
  [string]$EnvFile = "/etc/lsmv2/network-bootstrap.env",
  [string]$StateRoot = "/var/lib/lsmv2/network-bootstrap",
  [string]$GatewayServiceName = "lsmv2-field-gateway.service",
  [string]$WifiDevice = "",
  [string]$StaConnectionName = "lsmv2-uplink",
  [string]$StaSsid = "",
  [string]$StaPsk = "",
  [string]$ApConnectionName = "lsmv2-ap-fallback",
  [string]$ApSsid = "rk3568-1",
  [string]$ApPsk = "rk3568-setup-2026",
  [int]$LoopSeconds = 20,
  [int]$StaTimeoutSeconds = 45,
  [int]$StaRetrySeconds = 60,
  [switch]$SkipSourceSync,
  [switch]$OverwriteEnv,
  [switch]$NoEnable
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

function Sync-DeploySourceToRemote {
  param(
    [string]$LocalRepoRoot,
    [string]$RemoteRepoRoot,
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort
  )

  $deployDir = Join-Path $LocalRepoRoot "services/field-gateway/deploy"
  $files = @(
    Get-ChildItem -LiteralPath $deployDir -Recurse -File | ForEach-Object {
      (Get-NormalizedRelativePath -BasePath $LocalRepoRoot -TargetPath $_.FullName).Replace("\", "/")
    }
  ) | Sort-Object -Unique

  $payload = [PSCustomObject]@{
    localRepoRoot = [System.IO.Path]::GetFullPath($LocalRepoRoot)
    remoteRepoRoot = $RemoteRepoRoot
    files = $files
  }

  $tempManifestFile = [System.IO.Path]::GetTempFileName()
  $pythonSnippet = @'
import json
import posixpath
import stat
import sys
from pathlib import Path

import paramiko
'@ + $pythonConnectHelper + @'

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
host = sys.argv[2]
user = sys.argv[3]
password = sys.argv[4] or None
port = int(sys.argv[5])

local_root = Path(manifest["localRepoRoot"])
remote_root = manifest["remoteRepoRoot"]

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

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
connect_with_retry(
    client,
    hostname=host,
    username=user,
    password=password,
    port=port,
)
sftp = client.open_sftp()
ensure_remote_dir(sftp, remote_root)

for relative_file in manifest["files"]:
    local_file = local_root.joinpath(*relative_file.split("/"))
    remote_file = posixpath.join(remote_root, relative_file)
    ensure_remote_dir(sftp, posixpath.dirname(remote_file))
    sftp.put(str(local_file), remote_file)
    if relative_file.endswith(".sh") or relative_file.endswith(".py"):
        sftp.chmod(remote_file, 0o755)

sftp.close()
client.close()
print(json.dumps({"fileCount": len(manifest["files"]), "remoteRepoRoot": remote_root}, ensure_ascii=False))
'@

  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempManifestFile, ($payload | ConvertTo-Json -Depth 8 -Compress), $utf8NoBom)
    $null = $pythonSnippet | & python - $tempManifestFile $TargetHost $TargetUser $TargetPassword ([string]$TargetPort)
  } finally {
    Remove-Item $tempManifestFile -Force -ErrorAction SilentlyContinue
  }
}

$repoRootLocal = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $SkipSourceSync) {
  Sync-DeploySourceToRemote `
    -LocalRepoRoot $repoRootLocal `
    -RemoteRepoRoot $RepoRoot `
    -TargetHost $BoardHost `
    -TargetUser $User `
    -TargetPassword $Password `
    -TargetPort $SshPort
}

$argList = @(
  "--repo-root", $RepoRoot,
  "--unit-name", $UnitName,
  "--env-file", $EnvFile,
  "--state-root", $StateRoot,
  "--gateway-service-name", $GatewayServiceName,
  "--sta-connection-name", $StaConnectionName,
  "--ap-connection-name", $ApConnectionName,
  "--ap-ssid", $ApSsid,
  "--ap-psk", $ApPsk,
  "--loop-seconds", ([string]$LoopSeconds),
  "--sta-timeout-seconds", ([string]$StaTimeoutSeconds),
  "--sta-retry-seconds", ([string]$StaRetrySeconds)
)

if ($WifiDevice) { $argList += @("--wifi-device", $WifiDevice) }
if ($StaSsid) { $argList += @("--sta-ssid", $StaSsid) }
if ($StaPsk) { $argList += @("--sta-psk", $StaPsk) }
if ($OverwriteEnv) { $argList += "--overwrite-env" }
if ($NoEnable) { $argList += "--no-enable" }

$argJsonBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($argList | ConvertTo-Json -Compress)))
$passwordBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Password))
$repoRootBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RepoRoot))

$remoteScript = @'
set -euo pipefail

mapfile -t INSTALL_ARGS < <(
  python3 - <<'PY'
import base64
import json

for item in json.loads(base64.b64decode('__ARG_JSON_B64__').decode('utf-8')):
    print(item)
PY
)

SUDO_PASSWORD="$(printf '%s' '__PASSWORD_B64__' | base64 -d)"
REPO_ROOT="$(printf '%s' '__REPO_ROOT_B64__' | base64 -d)"
INSTALL_SCRIPT="$REPO_ROOT/services/field-gateway/deploy/install-rk3568-network-bootstrap.sh"
CHECK_SCRIPT="$REPO_ROOT/services/field-gateway/deploy/check-rk3568-network-bootstrap.sh"

if [ -n "$SUDO_PASSWORD" ]; then
  printf '%s\n' "$SUDO_PASSWORD" | sudo -S bash "$INSTALL_SCRIPT" "${INSTALL_ARGS[@]}"
  printf '%s\n' "$SUDO_PASSWORD" | sudo -S bash "$CHECK_SCRIPT"
else
  sudo bash "$INSTALL_SCRIPT" "${INSTALL_ARGS[@]}"
  sudo bash "$CHECK_SCRIPT"
fi
'@

$remoteScript = $remoteScript.
  Replace("__ARG_JSON_B64__", $argJsonBase64).
  Replace("__PASSWORD_B64__", $passwordBase64).
  Replace("__REPO_ROOT_B64__", $repoRootBase64)

$raw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$rawText = [string]::Join([Environment]::NewLine, @($raw))
$jsonStart = $rawText.IndexOf("{")
if ($jsonStart -lt 0) {
  throw "install-rk3568-network-bootstrap did not return JSON output"
}
$result = ($rawText.Substring($jsonStart) | ConvertFrom-Json)
$resultJson = $result | ConvertTo-Json -Depth 8
$resultJson
