param(
  [string]$Name = "paper",
  [string]$Url = "http://127.0.0.1:29979/mcp"
)

$ErrorActionPreference = "Stop"

$codexConfig = Join-Path $env:USERPROFILE ".codex\config.toml"
$routerDir = Join-Path $env:APPDATA "MCP Router"
$sharedConfig = Join-Path $routerDir "shared-config.json"
$db = Join-Path $routerDir "mcprouter.db"

foreach ($path in @($codexConfig, $sharedConfig, $db)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required file not found: $path"
  }
}

$sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
if (-not $sqlite) {
  throw "sqlite3 was not found in PATH. Install SQLite CLI or add it to PATH before running this script."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath $codexConfig -Destination "$codexConfig.bak-$Name-$stamp"
Copy-Item -LiteralPath $sharedConfig -Destination "$sharedConfig.bak-$Name-$stamp"
Copy-Item -LiteralPath $db -Destination "$db.bak-$Name-$stamp"

$shared = Get-Content -LiteralPath $sharedConfig -Raw | ConvertFrom-Json
$token = $shared.mcpApps.tokens[0].id
if (-not $token) {
  throw "MCP Router token not found in shared-config.json"
}

$configText = Get-Content -LiteralPath $codexConfig -Raw
if ($configText -notmatch "(?m)^\[mcp_servers\.mcp-router\]$") {
  $block = @"

[mcp_servers.mcp-router]
command = "npx"
args = [ "-y", "@mcp_router/cli@latest", "connect" ]
env = { MCPR_TOKEN = "$token" }
"@
  Add-Content -LiteralPath $codexConfig -Value $block
}

$existing = sqlite3 $db "select id from servers where name='$Name' or remote_url='$Url' limit 1;"
if ($existing) {
  $serverId = $existing.Trim()
  sqlite3 $db "update servers set name='$Name', server_type='remote', remote_url='$Url', command=NULL, args=NULL, env=NULL, auto_start=1, disabled=0, description='Paper Design local Streamable HTTP MCP', updated_at=cast(strftime('%s','now') as integer)*1000 where id='$serverId';"
} else {
  $serverId = [guid]::NewGuid().ToString()
  sqlite3 $db "insert into servers (id,name,command,args,env,auto_start,disabled,auto_approve,context_path,server_type,remote_url,bearer_token,input_params,description,version,latest_version,verification_status,required_params,project_id,tool_permissions,created_at,updated_at) values ('$serverId','$Name',NULL,NULL,NULL,1,0,NULL,NULL,'remote','$Url',NULL,NULL,'Paper Design local Streamable HTTP MCP',NULL,NULL,NULL,NULL,NULL,NULL,cast(strftime('%s','now') as integer)*1000,cast(strftime('%s','now') as integer)*1000);"
}

foreach ($tokenEntry in $shared.mcpApps.tokens) {
  if (-not $tokenEntry.serverAccess) {
    $tokenEntry | Add-Member -NotePropertyName serverAccess -NotePropertyValue ([pscustomobject]@{})
  }
  $tokenEntry.serverAccess | Add-Member -NotePropertyName $serverId -NotePropertyValue $true -Force
}

$shared._meta.lastModified = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$shared | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $sharedConfig -Encoding UTF8

Write-Output "Paper MCP registered in MCP Router."
Write-Output "server_id=$serverId"
Write-Output "url=$Url"
Write-Output "codex_router_entry=present"
Write-Output "backups_suffix=$Name-$stamp"
