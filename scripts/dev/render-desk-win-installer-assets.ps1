[CmdletBinding()]
param(
  [string]$LargeSource = "apps/desk/public/images/landslide.png",
  [string]$SmallSource = "apps/desk/public/images/app-icon.png",
  [string]$OutDir = "apps/desk-win/installer/assets"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

function New-WizardBitmap([string]$sourcePath, [string]$outPath, [int]$width, [int]$height, [string]$title = "") {
  $src = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $rect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(12, 20, 34)), ([System.Drawing.Color]::FromArgb(16, 84, 122)), 90
        try {
          $graphics.FillRectangle($brush, $rect)
        } finally {
          $brush.Dispose()
        }

        $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35, 211, 238))
        $accentSoft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, 186, 208))
        $cardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(205, 10, 18, 30))
        $cardBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 143, 199, 214)), 1
        try {
          $graphics.FillEllipse($accentSoft, $width - 70, 18, 44, 44)
          $graphics.FillEllipse($accent, $width - 48, 38, 12, 12)
          $graphics.FillRectangle($cardBrush, 10, $height - 126, $width - 20, 98)
          $graphics.DrawRectangle($cardBorder, 10, $height - 126, $width - 20, 98)
        } finally {
          $accent.Dispose()
          $accentSoft.Dispose()
          $cardBrush.Dispose()
          $cardBorder.Dispose()
        }

        $scale = [Math]::Min($width / $src.Width, $height / $src.Height)
        $drawW = [int]($src.Width * $scale)
        $drawH = [int]($src.Height * $scale)
        $x = [int](($width - $drawW) / 2)
        $y = [int](($height - $drawH) / 2) - 12

        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        $matrix = New-Object System.Drawing.Imaging.ColorMatrix
        $matrix.Matrix33 = 0.78
        $attributes.SetColorMatrix($matrix)
        try {
          $graphics.DrawImage($src, (New-Object System.Drawing.Rectangle $x, $y, $drawW, $drawH), 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
        } finally {
          $attributes.Dispose()
        }

        if ($title) {
          $eyebrowFont = New-Object System.Drawing.Font "Microsoft YaHei UI", 7, ([System.Drawing.FontStyle]::Bold)
          $font = New-Object System.Drawing.Font "Microsoft YaHei UI", 14, ([System.Drawing.FontStyle]::Bold)
          $subFont = New-Object System.Drawing.Font "Microsoft YaHei UI", 8, ([System.Drawing.FontStyle]::Regular)
          $bulletFont = New-Object System.Drawing.Font "Microsoft YaHei UI", 7, ([System.Drawing.FontStyle]::Regular)
          $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(242, 248, 252))
          $sub = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(196, 220, 232))
          $accentText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(125, 211, 252))
          try {
            $graphics.DrawString("WINDOWS INSTALLER", $eyebrowFont, $accentText, 12, ($height - 118))
            $graphics.DrawString($title, $font, $white, 12, ($height - 102))
            $graphics.DrawString("Landslide Desk Installer", $subFont, $sub, 12, ($height - 80))
            $graphics.DrawString("- Guided install with brand polish", $bulletFont, $white, 14, ($height - 58))
            $graphics.DrawString("- Self-contained runtime package", $bulletFont, $white, 14, ($height - 42))
            $graphics.DrawString("- WebView2 handled by installer", $bulletFont, $white, 14, ($height - 26))
          } finally {
            $eyebrowFont.Dispose()
            $font.Dispose()
            $subFont.Dispose()
            $bulletFont.Dispose()
            $white.Dispose()
            $sub.Dispose()
            $accentText.Dispose()
          }
        }

        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
      } finally {
        $graphics.Dispose()
      }
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullLargeSource = Join-Path $repoRoot $LargeSource
$fullSmallSource = Join-Path $repoRoot $SmallSource
$fullOutDir = Join-Path $repoRoot $OutDir

foreach ($path in @($fullLargeSource, $fullSmallSource)) {
  if (-not (Test-Path $path)) {
    throw "installer asset source not found: $path"
  }
}

Ensure-Dir $fullOutDir

$wizardLarge = Join-Path $fullOutDir "WizardImage.bmp"
$wizardSmall = Join-Path $fullOutDir "WizardSmallImage.bmp"

New-WizardBitmap -sourcePath $fullLargeSource -outPath $wizardLarge -width 164 -height 314 -title "Landslide Monitor"
New-WizardBitmap -sourcePath $fullSmallSource -outPath $wizardSmall -width 55 -height 55

[pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  outDir = $OutDir
  wizardImage = $wizardLarge
  wizardSmallImage = $wizardSmall
} | ConvertTo-Json -Depth 4
