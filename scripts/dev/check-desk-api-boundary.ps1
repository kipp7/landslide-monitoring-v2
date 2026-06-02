[CmdletBinding()]
param(
  [string]$DeskPackageFile = "apps/desk/package.json",
  [string]$DeskWinProjectFile = "apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj",
  [string]$OutFile = "docs/unified/reports/desk-api-boundary-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullDeskPackageFile = Join-Path $repoRoot $DeskPackageFile
$fullDeskWinProjectFile = Join-Path $repoRoot $DeskWinProjectFile
$fullOutFile = Join-Path $repoRoot $OutFile

foreach ($path in @($fullDeskPackageFile, $fullDeskWinProjectFile)) {
  if (-not (Test-Path $path)) {
    throw "required file not found: $path"
  }
}

function Get-PropertyMap([object]$InputObject) {
  $map = @{}
  if ($null -eq $InputObject) {
    return $map
  }
  foreach ($prop in $InputObject.PSObject.Properties) {
    $map[$prop.Name] = [string]$prop.Value
  }
  return $map
}

$deskPackage = Get-Content -Path $fullDeskPackageFile -Raw -Encoding UTF8 | ConvertFrom-Json
$deskDependencies = Get-PropertyMap $deskPackage.dependencies
$deskDevDependencies = Get-PropertyMap $deskPackage.devDependencies

[xml]$deskWinProject = Get-Content -Path $fullDeskWinProjectFile -Raw -Encoding UTF8
$deskWinPackageReferences = @(
  $deskWinProject.SelectNodes("//PackageReference") |
    ForEach-Object { [string]$_.Include } |
    Where-Object { $_ }
)

$bannedJsPackages = @(
  "pg",
  "postgres",
  "@clickhouse/client",
  "mysql",
  "mysql2",
  "better-sqlite3",
  "sqlite3",
  "@supabase/supabase-js",
  "typeorm",
  "sequelize",
  "knex",
  "prisma",
  "@prisma/client",
  "mongoose"
)

$bannedDotnetPackages = @(
  "Npgsql",
  "ClickHouse.Client",
  "ClickHouse.Driver",
  "MySqlConnector",
  "Microsoft.Data.SqlClient",
  "System.Data.SqlClient",
  "Microsoft.Data.Sqlite",
  "Dapper"
)

$badDeskDependencies = @(
  $deskDependencies.Keys |
    Where-Object { $bannedJsPackages -contains $_.ToLowerInvariant() } |
    Sort-Object |
    ForEach-Object {
      [pscustomobject]@{
        package = $_
        version = $deskDependencies[$_]
      }
    }
)

$badDeskDevDependencies = @(
  $deskDevDependencies.Keys |
    Where-Object { $bannedJsPackages -contains $_.ToLowerInvariant() } |
    Sort-Object |
    ForEach-Object {
      [pscustomobject]@{
        package = $_
        version = $deskDevDependencies[$_]
      }
    }
)

$badDeskWinPackageReferences = @(
  $deskWinPackageReferences |
    Where-Object { $bannedDotnetPackages -contains $_ } |
    Sort-Object -Unique |
    ForEach-Object {
      [pscustomobject]@{
        package = $_
      }
    }
)

$sourcePatterns = @(
  [pscustomobject]@{
    key = "pgImport"
    pattern = '(from\s+["'']pg["''])|(require\(["'']pg["'']\))'
    detail = "PostgreSQL driver import"
  },
  [pscustomobject]@{
    key = "clickhouseClient"
    pattern = '@clickhouse/client|ClickHouseClient'
    detail = "ClickHouse client reference"
  },
  [pscustomobject]@{
    key = "npgsql"
    pattern = '\bNpgsql(Connection|Command|DataSource)?\b'
    detail = "Npgsql direct database reference"
  },
  [pscustomobject]@{
    key = "sqlConnection"
    pattern = '\b(SqlConnection|Microsoft\.Data\.SqlClient|System\.Data\.SqlClient)\b'
    detail = "SQL Server direct database reference"
  },
  [pscustomobject]@{
    key = "mysql"
    pattern = '\b(mysql2?|MySqlConnector|MySqlConnection)\b'
    detail = "MySQL direct database reference"
  },
  [pscustomobject]@{
    key = "sqlite"
    pattern = '\b(better-sqlite3|sqlite3|SQLiteConnection|Microsoft\.Data\.Sqlite)\b'
    detail = "SQLite direct database reference"
  },
  [pscustomobject]@{
    key = "ormClient"
    pattern = '\b(typeorm|sequelize|knex|prisma|@prisma/client|mongoose)\b'
    detail = "ORM or direct database SDK reference"
  },
  [pscustomobject]@{
    key = "supabaseClient"
    pattern = '@supabase/supabase-js|createClient\s*\(\s*["'']https?://[^"'']*supabase\.co'
    detail = "Potential direct hosted database client reference"
  },
  [pscustomobject]@{
    key = "postgresConnString"
    pattern = 'postgres(ql)?:\/\/'
    detail = "PostgreSQL connection string"
  },
  [pscustomobject]@{
    key = "clickhouseConnString"
    pattern = 'clickhouse:\/\/'
    detail = "ClickHouse connection string"
  },
  [pscustomobject]@{
    key = "adoConnString"
    pattern = '(Host|Server)\s*=\s*[^;]+;.*Database\s*='
    detail = "ADO-style database connection string"
  }
)

$sourceRoots = @(
  (Join-Path $repoRoot "apps/desk"),
  (Join-Path $repoRoot "apps/desk-win")
)

$sourceFiles = @(
  Get-ChildItem -Path $sourceRoots -Recurse -File |
    Where-Object {
      $normalized = $_.FullName.Replace('\', '/')
      $normalized -notmatch '/(node_modules|dist|bin|obj)/' -and
      $_.Name -notin @("package.json", "package-lock.json") -and
      $_.Extension -in @(".ts", ".tsx", ".js", ".jsx", ".json", ".cs", ".config", ".xml")
    }
)

$sourceViolations = New-Object System.Collections.Generic.List[object]
foreach ($file in $sourceFiles) {
  foreach ($pattern in $sourcePatterns) {
    $matches = Select-String -Path $file.FullName -Pattern $pattern.pattern -Encoding UTF8
    foreach ($match in $matches) {
      $sourceViolations.Add([pscustomobject]@{
          key = $pattern.key
          detail = $pattern.detail
          file = $match.Path.Replace("$repoRoot\", "")
          line = $match.LineNumber
          snippet = ($match.Line.Trim())
        })
    }
  }
}

$apiLayerFiles = @(
  "apps/desk/src/api/client.ts",
  "apps/desk/src/api/httpClient.ts",
  "apps/desk/src/api/mockClient.ts"
)
$missingApiLayerFiles = @(
  $apiLayerFiles |
    Where-Object { -not (Test-Path (Join-Path $repoRoot $_)) }
)

$checks = @(
  [pscustomobject]@{
    key = "deskDependenciesClean"
    ok = ($badDeskDependencies.Count -eq 0)
    actual = @($badDeskDependencies | ForEach-Object { $_.package })
    expected = @()
  },
  [pscustomobject]@{
    key = "deskDevDependenciesClean"
    ok = ($badDeskDevDependencies.Count -eq 0)
    actual = @($badDeskDevDependencies | ForEach-Object { $_.package })
    expected = @()
  },
  [pscustomobject]@{
    key = "deskWinPackageReferencesClean"
    ok = ($badDeskWinPackageReferences.Count -eq 0)
    actual = @($badDeskWinPackageReferences | ForEach-Object { $_.package })
    expected = @()
  },
  [pscustomobject]@{
    key = "deskApiLayerPresent"
    ok = ($missingApiLayerFiles.Count -eq 0)
    actual = @($missingApiLayerFiles)
    expected = @()
  },
  [pscustomobject]@{
    key = "sourceBoundaryClean"
    ok = ($sourceViolations.Count -eq 0)
    actual = $sourceViolations.Count
    expected = 0
  }
)

$failed = @($checks | Where-Object { -not $_.ok })

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  ready = ($failed.Count -eq 0)
  scope = [ordered]@{
    deskPackageFile = $DeskPackageFile
    deskWinProjectFile = $DeskWinProjectFile
    sourceRoots = @("apps/desk", "apps/desk-win")
  }
  boundary = [ordered]@{
    currentFormalClient = "desk-win"
    allowedDataEntry = "API-only"
    disallowedDirectStores = @("PostgreSQL", "ClickHouse")
  }
  checks = $checks
  banned = [ordered]@{
    jsPackages = $bannedJsPackages
    dotnetPackages = $bannedDotnetPackages
  }
  violations = [ordered]@{
    deskDependencies = $badDeskDependencies
    deskDevDependencies = $badDeskDevDependencies
    deskWinPackageReferences = $badDeskWinPackageReferences
    sourceMatches = $sourceViolations
    missingApiLayerFiles = $missingApiLayerFiles
  }
  failedKeys = @($failed | ForEach-Object { $_.key })
}

$json = $result | ConvertTo-Json -Depth 8
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8

if ($failed.Count -gt 0) {
  throw "desk API boundary check failed: $((@($failed | ForEach-Object { $_.key })) -join ', ')"
}

$json
