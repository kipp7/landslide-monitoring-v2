[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DeviceId,
  [ValidateSet("manual-collect", "set-report-5", "set-report-300", "set-report-custom")]
  [string]$Action = "manual-collect",
  [int]$ReportIntervalSeconds = 0,
  [ValidateSet("raw-json", "cobs-crc-v1")]
  [string]$FieldLinkMode = "cobs-crc-v1",
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$SerialDevice = "/dev/ttyS3",
  [int]$BaudRate = 115200,
  [int]$PrewriteQuietMs = 400,
  [int]$PrewriteMaxWaitMs = 5000,
  [uint32]$TxSequence = 0,
  [int]$CaptureSeconds = 20,
  [string]$ServiceName = "lsmv2-field-gateway.service",
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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
    $tempPythonFile = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), ".py")
    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()
    $pythonSnippet = @'
import sys
import warnings
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

warnings.filterwarnings("ignore")

import paramiko

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = Path(sys.argv[5]).read_text(encoding="utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=host, username=user, password=password, port=port, timeout=15, banner_timeout=15, auth_timeout=30)
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
      $normalizedScriptText = $ScriptText -replace "`r`n", "`n"
      [System.IO.File]::WriteAllText($tempScriptFile, $normalizedScriptText, $utf8NoBom)
      [System.IO.File]::WriteAllText($tempPythonFile, $pythonSnippet, $utf8NoBom)
      $pythonExe = (Get-Command python -ErrorAction Stop).Source
      $process = Start-Process -FilePath $pythonExe `
        -ArgumentList @($tempPythonFile, $TargetHost, $TargetUser, $TargetPassword, ([string]$TargetPort), $tempScriptFile) `
        -RedirectStandardOutput $stdoutFile `
        -RedirectStandardError $stderrFile `
        -NoNewWindow `
        -PassThru `
        -Wait

      $stdoutText = if (Test-Path $stdoutFile) { [string](Get-Content $stdoutFile -Raw -Encoding UTF8) } else { "" }
      $stderrText = if (Test-Path $stderrFile) { [string](Get-Content $stderrFile -Raw -Encoding UTF8) } else { "" }
      if ($stderrText) {
        Write-Verbose $stderrText
      }

      if ($process.ExitCode -ne 0) {
        $combined = (@($stdoutText, $stderrText) | Where-Object { $_ } | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique) -join "`n"
        throw ("remote bash failed via paramiko (exit={0})`n{1}" -f $process.ExitCode, $combined.Trim())
      }
      return $stdoutText
    } finally {
      Remove-Item $tempScriptFile -Force -ErrorAction SilentlyContinue
      Remove-Item $tempPythonFile -Force -ErrorAction SilentlyContinue
      Remove-Item $stdoutFile -Force -ErrorAction SilentlyContinue
      Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue
    }
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

  $output = $ScriptText | & $sshExe @sshArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ("remote bash failed via ssh (exit={0})`n{1}" -f $LASTEXITCODE, ($output | Out-String).Trim())
  }
  return $output
}

function Get-ActionSpec {
  param([string]$ActionName)

  switch ($ActionName) {
    "manual-collect" {
      return [ordered]@{
        commandType = "manual_collect"
        payload = [ordered]@{
          source = "rk3568-raw-serial-capture"
        }
      }
    }
    "set-report-5" {
      return [ordered]@{
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 5
        }
      }
    }
    "set-report-300" {
      return [ordered]@{
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 300
        }
      }
    }
    "set-report-custom" {
      if ($ReportIntervalSeconds -le 0) {
        throw "set-report-custom requires -ReportIntervalSeconds > 0"
      }
      return [ordered]@{
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = $ReportIntervalSeconds
        }
      }
    }
    default {
      throw "Unsupported action: $ActionName"
    }
  }
}

[guid]::Parse($DeviceId) | Out-Null
$actionSpec = Get-ActionSpec -ActionName $Action
$commandId = [guid]::NewGuid().ToString()
$issuedTs = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$payloadDoc = [ordered]@{
  schema_version = 1
  command_id = $commandId
  device_id = $DeviceId
  command_type = $actionSpec.commandType
  payload = $actionSpec.payload
  issued_ts = $issuedTs
}
$payloadJson = ($payloadDoc | ConvertTo-Json -Depth 8 -Compress) + "`n"
$payloadB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($payloadJson))
$passwordB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Password))

$remoteScript = @"
set -euo pipefail
export SERVICE_NAME='$ServiceName'
export SERIAL_DEVICE='$SerialDevice'
export BAUD_RATE='$BaudRate'
export PREWRITE_QUIET_MS='$PrewriteQuietMs'
export PREWRITE_MAX_WAIT_MS='$PrewriteMaxWaitMs'
export TX_SEQUENCE='$TxSequence'
export CAPTURE_SECONDS='$CaptureSeconds'
export PAYLOAD_B64='$payloadB64'
export SUDO_PASSWORD_B64='$passwordB64'
export TARGET_DEVICE_ID='$DeviceId'
export TARGET_COMMAND_ID='$commandId'
export FIELD_LINK_MODE='$FieldLinkMode'

python3 - <<'PY'
import base64
import json
import os
import select
import subprocess
import termios
import time
import traceback
import zlib

service_name = os.environ["SERVICE_NAME"]
serial_device = os.environ["SERIAL_DEVICE"]
baud_rate = int(os.environ["BAUD_RATE"])
prewrite_quiet_ms = int(os.environ["PREWRITE_QUIET_MS"])
prewrite_max_wait_ms = int(os.environ["PREWRITE_MAX_WAIT_MS"])
tx_sequence = int(os.environ["TX_SEQUENCE"])
capture_seconds = int(os.environ["CAPTURE_SECONDS"])
payload = base64.b64decode(os.environ["PAYLOAD_B64"])
sudo_password = base64.b64decode(os.environ["SUDO_PASSWORD_B64"]).decode("utf-8")
target_device_id = os.environ["TARGET_DEVICE_ID"]
target_command_id = os.environ["TARGET_COMMAND_ID"]
field_link_mode = os.environ["FIELD_LINK_MODE"]

FIELD_LINK_VERSION = 1
FRAME_TYPE_TO_CODE = {
    "telemetry": 1,
    "command": 2,
    "ack": 3,
    "control": 4,
}
CODE_TO_FRAME_TYPE = {value: key for key, value in FRAME_TYPE_TO_CODE.items()}

baud_map = {
    9600: termios.B9600,
    19200: termios.B19200,
    38400: termios.B38400,
    57600: termios.B57600,
    115200: termios.B115200,
}

fd = os.open(serial_device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
service_was_active = False
service_stop_method = "none"
prewrite_read_bytes = 0
prewrite_wait_ms = 0
prewrite_quiet_satisfied = False
write_drain_completed = False

def summarize_bytes(data: bytes, limit: int = 96) -> str:
    excerpt = data[:limit]
    return " ".join(f"{byte:02x}" for byte in excerpt)

def cobs_encode(data: bytes) -> bytes:
    out = bytearray()
    code_index = 0
    code = 1
    out.append(0)

    for byte in data:
        if byte == 0:
            out[code_index] = code
            code_index = len(out)
            out.append(0)
            code = 1
            continue

        out.append(byte)
        code += 1
        if code == 0xFF:
            out[code_index] = code
            code_index = len(out)
            out.append(0)
            code = 1

    out[code_index] = code
    return bytes(out)

def cobs_decode(data: bytes) -> bytes:
    out = bytearray()
    index = 0

    while index < len(data):
        code = data[index]
        if code == 0:
            raise ValueError("cobs zero marker inside encoded frame")
        index += 1

        for _ in range(1, code):
            if index >= len(data):
                raise ValueError("cobs code exceeded input length")
            out.append(data[index])
            index += 1

        if code < 0xFF and index < len(data):
            out.append(0)

    return bytes(out)

def encode_field_link_frame(frame_type: str, sequence: int, payload_text: str) -> bytes:
    payload_bytes = payload_text.encode("utf-8")
    header = bytearray(12)
    header[0] = FIELD_LINK_VERSION
    header[1] = FRAME_TYPE_TO_CODE[frame_type]
    header[4:8] = int(sequence & 0xFFFFFFFF).to_bytes(4, "big")
    header[8:12] = len(payload_bytes).to_bytes(4, "big")
    packet = bytes(header) + payload_bytes
    crc = zlib.crc32(packet) & 0xFFFFFFFF
    packet_with_crc = packet + crc.to_bytes(4, "big")
    return cobs_encode(packet_with_crc) + b"\x00"

def decode_field_link_frame(frame_bytes: bytes) -> dict:
    decoded = cobs_decode(frame_bytes)
    if len(decoded) < 16:
        raise ValueError("field-link frame too short")

    version = decoded[0]
    if version != FIELD_LINK_VERSION:
        raise ValueError(f"unsupported field-link version: {version}")

    type_code = decoded[1]
    frame_type = CODE_TO_FRAME_TYPE.get(type_code)
    if not frame_type:
        raise ValueError(f"unknown field-link frame type: {type_code}")

    sequence = int.from_bytes(decoded[4:8], "big")
    payload_length = int.from_bytes(decoded[8:12], "big")
    payload_start = 12
    crc_start = len(decoded) - 4
    actual_payload_length = crc_start - payload_start
    if payload_length != actual_payload_length:
        raise ValueError(
            f"field-link payload length mismatch: header={payload_length} actual={actual_payload_length}"
        )

    expected_crc = int.from_bytes(decoded[crc_start:], "big")
    packet_without_crc = decoded[:crc_start]
    actual_crc = zlib.crc32(packet_without_crc) & 0xFFFFFFFF
    if expected_crc != actual_crc:
        raise ValueError(
            f"field-link crc mismatch: expected=0x{expected_crc:08x} actual=0x{actual_crc:08x}"
        )

    return {
        "frameType": frame_type,
        "sequence": sequence,
        "payloadText": decoded[payload_start:crc_start].decode("utf-8", errors="replace"),
        "frameBytes": len(frame_bytes) + 1,
        "integrity": "crc32_ok",
    }

def wait_for_prewrite_quiet(fd_value: int, quiet_ms: int, max_wait_ms: int):
    if quiet_ms <= 0 or max_wait_ms <= 0:
        return {
            "satisfied": True,
            "waitMs": 0,
            "readBytes": 0,
        }

    started = time.monotonic()
    last_read_at = None
    read_bytes = 0

    while True:
        now = time.monotonic()
        elapsed_ms = int((now - started) * 1000)
        if elapsed_ms >= max_wait_ms:
            return {
                "satisfied": False,
                "waitMs": max_wait_ms,
                "readBytes": read_bytes,
            }

        if last_read_at is not None:
            quiet_for_ms = int((now - last_read_at) * 1000)
            if quiet_for_ms >= quiet_ms:
                return {
                    "satisfied": True,
                    "waitMs": elapsed_ms,
                    "readBytes": read_bytes,
                }

        timeout = min(0.1, max(0.0, (max_wait_ms - elapsed_ms) / 1000.0))
        readable, _, _ = select.select([fd_value], [], [], timeout)
        if not readable:
            if last_read_at is None and elapsed_ms >= quiet_ms:
                return {
                    "satisfied": True,
                    "waitMs": elapsed_ms,
                    "readBytes": read_bytes,
                }
            continue

        try:
            data = os.read(fd_value, 4096)
        except BlockingIOError:
            data = b""
        if data:
            read_bytes += len(data)
            last_read_at = time.monotonic()

def run_systemctl(action: str, check: bool = True):
    return subprocess.run(
        ["sudo", "-S", "-p", "", "systemctl", action, service_name],
        input=(sudo_password + "\n").encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )

try:
    try:
        service_was_active = subprocess.run(
            ["systemctl", "is-active", "--quiet", service_name],
            check=False,
        ).returncode == 0
        if service_was_active:
            run_systemctl("stop", check=True)
            service_stop_method = "sudo-systemctl"
            time.sleep(1.0)

        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = termios.CREAD | termios.CLOCAL | termios.CS8
        attrs[3] = 0
        speed = baud_map.get(baud_rate, termios.B115200)
        attrs[4] = speed
        attrs[5] = speed
        attrs[6][termios.VMIN] = 0
        attrs[6][termios.VTIME] = 0
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        termios.tcflush(fd, termios.TCIOFLUSH)
        time.sleep(0.2)

        payload_text = payload.decode("utf-8", errors="replace")
        if field_link_mode == "cobs-crc-v1":
            effective_tx_sequence = tx_sequence if tx_sequence > 0 else int(time.time() * 1000) & 0xFFFFFFFF
            serial_payload = encode_field_link_frame("command", effective_tx_sequence, payload_text.rstrip("\n"))
        else:
            effective_tx_sequence = None
            serial_payload = payload

        prewrite_result = wait_for_prewrite_quiet(fd, prewrite_quiet_ms, prewrite_max_wait_ms)
        prewrite_read_bytes = prewrite_result["readBytes"]
        prewrite_wait_ms = prewrite_result["waitMs"]
        prewrite_quiet_satisfied = prewrite_result["satisfied"]

        os.write(fd, serial_payload)
        termios.tcdrain(fd)
        write_drain_completed = True

        chunks = []
        deadline = time.time() + capture_seconds
        while time.time() < deadline:
          timeout = max(0.0, min(0.25, deadline - time.time()))
          readable, _, _ = select.select([fd], [], [], timeout)
          if not readable:
            continue
          try:
            data = os.read(fd, 4096)
          except BlockingIOError:
            data = b""
          if data:
            chunks.append(data)

        captured = b"".join(chunks)
        captured_text = captured.decode("utf-8", errors="replace")
        captured_hex = summarize_bytes(captured, 192)
        lines = []
        ack_like_lines = []
        target_telemetry = []
        target_acks = []
        target_last_command_types = []
        target_last_command_ids = []
        target_upload_triggers = []
        decoded_frames = []
        decode_errors = []

        if field_link_mode == "cobs-crc-v1":
            raw_frames = [frame for frame in captured.split(b"\x00") if frame]
            for raw_frame in raw_frames:
                try:
                    frame = decode_field_link_frame(raw_frame)
                    decoded_frames.append(frame)
                    payload_text = frame["payloadText"]
                    if payload_text.strip():
                        lines.append(payload_text)
                    if frame["frameType"] in ("ack", "command"):
                        ack_like_lines.append(payload_text)

                    try:
                        obj = json.loads(payload_text)
                    except Exception:
                        continue

                    if obj.get("device_id") != target_device_id:
                        continue

                    if frame["frameType"] == "ack" and "command_id" in obj and "status" in obj:
                        target_acks.append(obj)
                        continue

                    meta = obj.get("meta")
                    if frame["frameType"] == "telemetry" and isinstance(meta, dict):
                        target_telemetry.append(obj)
                        target_last_command_types.append(meta.get("last_command_type"))
                        target_last_command_ids.append(meta.get("last_command_id"))
                        target_upload_triggers.append(meta.get("upload_trigger"))
                except Exception as err:
                    decode_errors.append({
                        "reason": str(err),
                        "frameBytes": len(raw_frame) + 1,
                        "rawSnippet": summarize_bytes(raw_frame),
                    })
        else:
            lines = [line for line in captured_text.splitlines() if line.strip()]
            ack_like_lines = [line for line in lines if '"command_id"' in line or '"ack_ts"' in line or '"status"' in line]

            for line in lines:
                try:
                    obj = json.loads(line)
                except Exception:
                    continue

                if obj.get("device_id") != target_device_id:
                    continue

                if "command_id" in obj and "status" in obj:
                    target_acks.append(obj)
                    continue

                meta = obj.get("meta")
                if isinstance(meta, dict):
                    target_telemetry.append(obj)
                    target_last_command_types.append(meta.get("last_command_type"))
                    target_last_command_ids.append(meta.get("last_command_id"))
                    target_upload_triggers.append(meta.get("upload_trigger"))

        target_acks_for_command = [
            ack for ack in target_acks
            if ack.get("command_id") == target_command_id
        ]
        telemetry_with_target_command = [
            item for item in target_telemetry
            if isinstance(item.get("meta"), dict)
            and item["meta"].get("last_command_id") == target_command_id
        ]
        result = {
          "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
          "serviceName": service_name,
          "serviceWasActive": service_was_active,
          "serviceStopMethod": service_stop_method,
          "serialDevice": serial_device,
          "baudRate": baud_rate,
          "fieldLinkMode": field_link_mode,
          "prewriteQuietMs": prewrite_quiet_ms,
          "prewriteMaxWaitMs": prewrite_max_wait_ms,
          "prewriteQuietSatisfied": prewrite_quiet_satisfied,
          "prewriteWaitMs": prewrite_wait_ms,
          "prewriteReadBytes": prewrite_read_bytes,
          "txSequence": effective_tx_sequence,
          "writeDrainCompleted": write_drain_completed,
          "captureSeconds": capture_seconds,
          "payloadBytes": len(payload),
          "serialPayloadBytes": len(serial_payload),
          "capturedBytes": len(captured),
          "capturedHex": captured_hex,
          "lineCount": len(lines),
          "ackLikeLineCount": len(ack_like_lines),
          "decodedFrameCount": len(decoded_frames),
          "decodeErrorCount": len(decode_errors),
          "decodedFrames": decoded_frames[:10],
          "decodeErrors": decode_errors[:10],
          "targetDeviceId": target_device_id,
          "targetCommandId": target_command_id,
          "targetTelemetryLineCount": len(target_telemetry),
          "targetAckLineCount": len(target_acks),
          "targetAckForCommandCount": len(target_acks_for_command),
          "targetTelemetryAdvancedToCommand": len(telemetry_with_target_command) > 0,
          "targetLastCommandTypes": target_last_command_types[:10],
          "targetLastCommandIds": target_last_command_ids[:10],
          "targetUploadTriggers": target_upload_triggers[:10],
          "payloadText": payload.decode("utf-8", errors="replace"),
          "capturedText": captured_text,
          "ackLikeLines": ack_like_lines[:10],
          "targetAckLines": target_acks[:10],
        }
        print(json.dumps(result, ensure_ascii=False))
    except Exception as err:
        print(json.dumps({
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": str(err),
            "traceback": traceback.format_exc(),
            "serviceName": service_name,
            "serialDevice": serial_device,
            "fieldLinkMode": field_link_mode,
            "prewriteQuietMs": prewrite_quiet_ms,
            "prewriteMaxWaitMs": prewrite_max_wait_ms,
            "txSequence": tx_sequence,
            "captureSeconds": capture_seconds,
        }, ensure_ascii=False))
        raise SystemExit(91)
finally:
    if service_was_active:
        run_systemctl("start", check=False)
    os.close(fd)
PY
"@

$remoteRaw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript | Out-String
$parsed = $remoteRaw | ConvertFrom-Json
$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  boardHost = $BoardHost
  serviceName = $ServiceName
  action = $Action
  command = $payloadDoc
  rawCapture = $parsed
}

$resultJson = $result | ConvertTo-Json -Depth 8
if ($OutFile) {
  Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
}
$resultJson
