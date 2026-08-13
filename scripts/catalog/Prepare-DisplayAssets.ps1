param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$PrivateSourceMapPath = '',
  [int]$DisplaySize = 1024,
  [long]$JpegQuality = 90
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectPath = [System.IO.Path]::GetFullPath($ProjectRoot)
$candidatePath = Join-Path $projectPath 'catalog\curated-artworks.json'
if ([string]::IsNullOrWhiteSpace($PrivateSourceMapPath)) {
  $PrivateSourceMapPath = if ($env:ARTCOVR_PRIVATE_ROOT) {
    Join-Path $env:ARTCOVR_PRIVATE_ROOT 'direct-source-map.local.json'
  }
  else {
    'E:\ART_COLLECTION\.artcovr-private\direct-source-map.local.json'
  }
}
$sourceMapPath = [System.IO.Path]::GetFullPath($PrivateSourceMapPath)
if (-not (Test-Path -LiteralPath $sourceMapPath -PathType Leaf)) {
  throw "Private source map is missing: $sourceMapPath"
}
$outputDirectory = Join-Path $projectPath 'outputs\catalog\review-assets'
$publicDirectory = Join-Path $projectPath 'public\assets\artworks'
$thumbnailDirectory = Join-Path $projectPath 'outputs\catalog\thumbnails'
if (-not $outputDirectory.StartsWith($projectPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe display output path: $outputDirectory"
}
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $publicDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $thumbnailDirectory | Out-Null

function Clear-DerivedImages {
  param([Parameter(Mandatory)] [string]$Directory)
  $resolved = [System.IO.Path]::GetFullPath($Directory)
  if (-not $resolved.StartsWith($projectPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe derived-image directory: $resolved"
  }
  foreach ($file in [System.IO.Directory]::GetFiles($resolved, '*', [System.IO.SearchOption]::TopDirectoryOnly)) {
    if ([System.IO.Path]::GetExtension($file).ToLowerInvariant() -in @('.jpg', '.jpeg', '.png', '.webp', '.avif')) {
      [System.IO.File]::Delete($file)
    }
  }
}

Clear-DerivedImages -Directory $outputDirectory
Clear-DerivedImages -Directory $publicDirectory
Clear-DerivedImages -Directory $thumbnailDirectory

$candidates = @(Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json)
$sourceMap = @{}
foreach ($entry in @(Get-Content -LiteralPath $sourceMapPath -Raw | ConvertFrom-Json)) {
  if ($sourceMap.ContainsKey([string]$entry.id)) {
    throw "Duplicate private source-map id: $($entry.id)"
  }
  $sourceMap[[string]$entry.id] = $entry
}
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } |
  Select-Object -First 1
$encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality,
  $JpegQuality
)

function New-ScaledBitmap {
  param(
    [Parameter(Mandatory)] [System.Drawing.Image]$Source,
    [Parameter(Mandatory)] [int]$Width,
    [Parameter(Mandatory)] [int]$Height
  )

  $bitmap = [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Black)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $scale = [Math]::Max($Width / $Source.Width, $Height / $Source.Height)
    $drawWidth = [int][Math]::Ceiling($Source.Width * $scale)
    $drawHeight = [int][Math]::Ceiling($Source.Height * $scale)
    $left = [int][Math]::Floor(($Width - $drawWidth) / 2)
    $top = [int][Math]::Floor(($Height - $drawHeight) / 2)
    $graphics.DrawImage($Source, $left, $top, $drawWidth, $drawHeight)
  }
  finally {
    $graphics.Dispose()
  }
  return $bitmap
}

function Add-RasterWatermark {
  param([Parameter(Mandatory)] [System.Drawing.Bitmap]$Bitmap)

  $graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
  $smallFont = [System.Drawing.Font]::new('Arial', 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $badgeInk = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 255, 255, 255))
  $badgeBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(120, 0, 0, 0))
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $badge = [System.Drawing.RectangleF]::new($Bitmap.Width - 232, $Bitmap.Height - 58, 214, 40)
    $graphics.FillRectangle($badgeBackground, $badge)
    $graphics.DrawString('ARTCOVR PREVIEW', $smallFont, $badgeInk, $Bitmap.Width - 218, $Bitmap.Height - 52)
  }
  finally {
    $badgeBackground.Dispose()
    $badgeInk.Dispose()
    $smallFont.Dispose()
    $graphics.Dispose()
  }
}

$written = [System.Collections.Generic.List[string]]::new()
foreach ($candidate in $candidates) {
  if ($candidate.validationStatus -ne 'technical-pass') { continue }
  $sourceEntry = $sourceMap[[string]$candidate.id]
  if ($null -eq $sourceEntry) {
    throw "Missing private source-map entry for $($candidate.id)"
  }
  $sourcePath = [System.IO.Path]::GetFullPath([string]$sourceEntry.sourceAbsolutePath)
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing source artwork: $sourcePath"
  }
  $actualHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne [string]$candidate.sha256) {
    throw "Source hash mismatch for $($candidate.id)"
  }
  $filename = [System.IO.Path]::GetFileName([string]$candidate.displayPath)
  $outputPath = Join-Path $outputDirectory $filename
  if (-not $outputPath.StartsWith($outputDirectory + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe artwork output path: $outputPath"
  }

  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    if ($source.Width -ne $source.Height -or $source.Width -lt 1024) {
      throw "Source failed decoded-dimension gate: $sourcePath ($($source.Width)x$($source.Height))"
    }
    $display = New-ScaledBitmap -Source $source -Width $DisplaySize -Height $DisplaySize
    try {
      Add-RasterWatermark -Bitmap $display
      $display.Save($outputPath, $jpegEncoder, $encoderParameters)
      $thumbnail = New-ScaledBitmap -Source $display -Width 128 -Height 128
      try {
      $thumbnail.Save((Join-Path $thumbnailDirectory $filename), $jpegEncoder, $encoderParameters)
      }
      finally {
        $thumbnail.Dispose()
      }
      Copy-Item -LiteralPath $outputPath -Destination (Join-Path $publicDirectory $filename) -Force
      $written.Add($outputPath)
    }
    finally {
      $display.Dispose()
    }
  }
  finally {
    $source.Dispose()
  }
}

if ($written.Count -ne @($candidates | Where-Object { $_.validationStatus -eq 'technical-pass' }).Count) {
  throw "Display asset count does not match the technically valid candidate count."
}

$featured = [System.Drawing.Image]::FromFile($written[0])
try {
  foreach ($iconSpec in @(
    @{ Name = 'icon-192.png'; Size = 192 },
    @{ Name = 'icon-512.png'; Size = 512 },
    @{ Name = 'apple-touch-icon.png'; Size = 180 }
  )) {
    $icon = New-ScaledBitmap -Source $featured -Width $iconSpec.Size -Height $iconSpec.Size
    try { $icon.Save((Join-Path $projectPath ('public\' + $iconSpec.Name)), [System.Drawing.Imaging.ImageFormat]::Png) }
    finally { $icon.Dispose() }
  }

  $og = [System.Drawing.Bitmap]::new(1200, 630, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($og)
  $brandFont = [System.Drawing.Font]::new('Arial', 78, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $detailFont = [System.Drawing.Font]::new('Arial', 25, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $gray = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 190, 190, 190))
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(255, 10, 10, 10))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($featured, 0, 0, 630, 630)
    $graphics.DrawString('ARTCOVR', $brandFont, $white, 685, 210)
    $graphics.DrawString('COVER ART, MADE YOURS', $detailFont, $gray, 691, 310)
    $og.Save((Join-Path $projectPath 'public\og-image.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $gray.Dispose()
    $white.Dispose()
    $detailFont.Dispose()
    $brandFont.Dispose()
    $graphics.Dispose()
    $og.Dispose()
  }
}
finally {
  $featured.Dispose()
  $encoderParameters.Dispose()
}

[PSCustomObject]@{
  DecodedSources = $written.Count
  WatermarkedDisplays = $written.Count
  ReviewAssetDirectory = $outputDirectory
  PublicStagingDisplays = $written.Count
  PublicStagingDirectory = $publicDirectory
  WorkbookThumbnails = $written.Count
  ThumbnailDirectory = $thumbnailDirectory
  BrowserIcons = 3
  OpenGraphImage = (Join-Path $projectPath 'public\og-image.png')
} | ConvertTo-Json
