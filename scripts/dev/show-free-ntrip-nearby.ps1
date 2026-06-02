param(
  [string]$CasterHost = "rtk2go.com",
  [int]$CasterPort = 2101,
  [double]$Latitude = 22.68,
  [double]$Longitude = 110.20,
  [int]$Limit = 20
)

$ErrorActionPreference = "Stop"

$client = [System.Net.Sockets.TcpClient]::new()
$client.ReceiveTimeout = 10000
$client.SendTimeout = 10000
$client.Connect($CasterHost, $CasterPort)
$stream = $client.GetStream()
$request = "GET / HTTP/1.0`r`nUser-Agent: NTRIP lsmv2-sourcetable-debug`r`nAccept: */*`r`nConnection: close`r`n`r`n"
$requestBytes = [Text.Encoding]::ASCII.GetBytes($request)
$stream.Write($requestBytes, 0, $requestBytes.Length)

$buffer = New-Object byte[] 65536
$memory = [System.IO.MemoryStream]::new()
while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
  $memory.Write($buffer, 0, $read)
}
$client.Close()

$text = [Text.Encoding]::ASCII.GetString($memory.ToArray())
$rows = @()

foreach ($line in ($text -split "`r?`n")) {
  if (-not $line.StartsWith("STR;")) {
    continue
  }

  $parts = $line.Split(";")
  if ($parts.Length -lt 12) {
    continue
  }

  $lat = 0.0
  $lon = 0.0
  if (-not [double]::TryParse($parts[9], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lat)) {
    continue
  }
  if (-not [double]::TryParse($parts[10], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lon)) {
    continue
  }
  if ($lat -eq 0 -and $lon -eq 0) {
    continue
  }

  $km = [math]::Sqrt([math]::Pow(($lat - $Latitude) * 111, 2) + [math]::Pow(($lon - $Longitude) * 102, 2))
  $rows += [pscustomobject]@{
    mount = $parts[1]
    country = $parts[8]
    lat = $lat
    lon = $lon
    km = [math]::Round($km, 1)
    format = $parts[3]
    messages = $parts[4]
  }
}

$rows | Sort-Object km | Select-Object -First $Limit | Format-Table -AutoSize
