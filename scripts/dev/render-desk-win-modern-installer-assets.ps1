[CmdletBinding()]
param(
  [string]$LargeSource = "apps/desk/public/images/landslide.png",
  [string]$SmallSource = "apps/desk/public/images/app-icon.png",
  [string]$OutDir = "apps/desk-win/installer-modern/assets"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

function New-Brush([int]$r, [int]$g, [int]$b, [int]$a = 255) {
  return New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb($a, $r, $g, $b))
}

function New-ModernSidebar([string]$backgroundPath, [string]$iconPath, [string]$outPath, [int]$width = 248, [int]$height = 488) {
  $bg = [System.Drawing.Image]::FromFile($backgroundPath)
  $icon = [System.Drawing.Image]::FromFile($iconPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $width, $height
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $rect = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $width, $height
        $g.FillRectangle((New-Brush 10 18 28), $rect)

        $sourceRect = New-Object System.Drawing.Rectangle -ArgumentList 120, 0, ([Math]::Min($bg.Width - 120, 500)), $bg.Height
        $destRect = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $width, $height
        $imgAttr = New-Object System.Drawing.Imaging.ImageAttributes
        $matrix = New-Object System.Drawing.Imaging.ColorMatrix
        $matrix.Matrix00 = 0.52
        $matrix.Matrix11 = 0.58
        $matrix.Matrix22 = 0.68
        $matrix.Matrix33 = 0.92
        $imgAttr.SetColorMatrix($matrix)
        try {
          $g.DrawImage($bg, $destRect, $sourceRect.X, $sourceRect.Y, $sourceRect.Width, $sourceRect.Height, [System.Drawing.GraphicsUnit]::Pixel, $imgAttr)
        } finally {
          $imgAttr.Dispose()
        }

        $overlay = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList $rect, ([System.Drawing.Color]::FromArgb(46, 5, 12, 20)), ([System.Drawing.Color]::FromArgb(196, 8, 18, 28)), 90
        try {
          $g.FillRectangle($overlay, $rect)
        } finally {
          $overlay.Dispose()
        }

        $goldPen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(204, 197, 156, 84)), 2
        $linePen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(94, 84, 131, 168)), 2
        $linePenThin = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(48, 113, 171, 214)), 1
        try {
          $g.DrawLine($goldPen, 0, 0, $width, 0)
          $g.DrawLine($goldPen, 0, $height - 1, $width, $height - 1)
          for ($i = 0; $i -lt 3; $i++) {
            $g.DrawArc($linePen, -50, 268 + ($i * 18), $width + 100, 100, 195, 150)
          }
          for ($i = 0; $i -lt 2; $i++) {
            $g.DrawArc($linePenThin, -40, 110 + ($i * 22), $width + 80, 120, 210, 120)
          }
        } finally {
          $goldPen.Dispose()
          $linePen.Dispose()
          $linePenThin.Dispose()
        }

        $cardBrush = New-Brush 12 24 36 176
        $cardBorder = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(120, 197, 156, 84)), 1
        try {
          $g.FillRectangle($cardBrush, 20, $height - 156, $width - 40, 128)
          $g.DrawRectangle($cardBorder, 20, $height - 156, $width - 40, 128)
        } finally {
          $cardBrush.Dispose()
          $cardBorder.Dispose()
        }

        $iconSize = 66
        $iconX = 26
        $iconY = 28
        $g.DrawImage($icon, $iconX, $iconY, $iconSize, $iconSize)

        $titleFont = New-Object System.Drawing.Font -ArgumentList "Microsoft YaHei UI", 17, ([System.Drawing.FontStyle]::Bold)
        $labelFont = New-Object System.Drawing.Font -ArgumentList "Microsoft YaHei UI", 9, ([System.Drawing.FontStyle]::Regular)
        $smallFont = New-Object System.Drawing.Font -ArgumentList "Microsoft YaHei UI", 8, ([System.Drawing.FontStyle]::Regular)
        $titleBrush = New-Brush 243 247 250
        $labelBrush = New-Brush 198 211 223
        $accentBrush = New-Brush 210 177 99
        try {
          $g.DrawString("Landslide Desk", $titleFont, $titleBrush, 28, 118)
          $g.DrawString("Modern field deployment installer", $labelFont, $labelBrush, 28, 146)
          $g.DrawString("BRANDED DESKTOP DELIVERY", $smallFont, $accentBrush, 28, ($height - 144))
          $g.DrawString("Cleaner shell", $labelFont, $titleBrush, 28, ($height - 116))
          $g.DrawString("Chinese flow and install options", $labelFont, $titleBrush, 28, ($height - 92))
          $g.DrawString("Built on the validated runtime chain", $labelFont, $titleBrush, 28, ($height - 68))
          $g.DrawString("Ready for final visual polishing", $labelFont, $titleBrush, 28, ($height - 44))
        } finally {
          $titleFont.Dispose()
          $labelFont.Dispose()
          $smallFont.Dispose()
          $titleBrush.Dispose()
          $labelBrush.Dispose()
          $accentBrush.Dispose()
        }

        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $g.Dispose()
      }
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $bg.Dispose()
    $icon.Dispose()
  }
}

function New-ModernLogo([string]$iconPath, [string]$outPath, [int]$size = 84) {
  $icon = [System.Drawing.Image]::FromFile($iconPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $size, $size
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

        $logoRect = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $size, $size
        $backBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList $logoRect, ([System.Drawing.Color]::FromArgb(255, 14, 26, 39)), ([System.Drawing.Color]::FromArgb(255, 18, 47, 72)), 45
        $ringPen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(218, 197, 156, 84)), 2
        try {
          $g.FillEllipse($backBrush, 2, 2, $size - 4, $size - 4)
          $g.DrawEllipse($ringPen, 2, 2, $size - 4, $size - 4)
        } finally {
          $backBrush.Dispose()
          $ringPen.Dispose()
        }

        $g.DrawImage($icon, 12, 12, $size - 24, $size - 24)
        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $g.Dispose()
      }
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $icon.Dispose()
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullLargeSource = Join-Path $repoRoot $LargeSource
$fullSmallSource = Join-Path $repoRoot $SmallSource
$fullOutDir = Join-Path $repoRoot $OutDir

foreach ($path in @($fullLargeSource, $fullSmallSource)) {
  if (-not (Test-Path $path)) {
    throw "modern installer asset source not found: $path"
  }
}

Ensure-Dir $fullOutDir

$sidebar = Join-Path $fullOutDir "BrandSidebar.png"
$logo = Join-Path $fullOutDir "BrandLogo.png"

New-ModernSidebar -backgroundPath $fullLargeSource -iconPath $fullSmallSource -outPath $sidebar
New-ModernLogo -iconPath $fullSmallSource -outPath $logo

[pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  outDir = $OutDir
  sidebar = $sidebar
  logo = $logo
} | ConvertTo-Json -Depth 4
