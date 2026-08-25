param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$MetadataCsvPath = '',
  [string]$InputDirectory = '',
  [string]$OutputDirectory = '',
  [long]$JpegQuality = 88
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectPath = [System.IO.Path]::GetFullPath($ProjectRoot)
$batchRoot = Join-Path $projectPath 'outputs\catalog\review-assets\candidate-selection-2026-08-20'
if ([string]::IsNullOrWhiteSpace($MetadataCsvPath)) {
  $MetadataCsvPath = Join-Path $batchRoot 'ARTCOVR_38_Metadata_Proposals.csv'
}
if ([string]::IsNullOrWhiteSpace($InputDirectory)) {
  $InputDirectory = Join-Path $batchRoot 'vector-staging-v2\public\assets\artworks'
}
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $batchRoot 'protected-display-assets'
}

$metadataPath = [System.IO.Path]::GetFullPath($MetadataCsvPath)
$inputPath = [System.IO.Path]::GetFullPath($InputDirectory)
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not $outputPath.StartsWith($batchRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Protected display output must stay inside the private batch workspace: $outputPath"
}
if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) { throw "Missing metadata CSV: $metadataPath" }
if (-not (Test-Path -LiteralPath $inputPath -PathType Container)) { throw "Missing display input directory: $inputPath" }

$rows = @(Import-Csv -LiteralPath $metadataPath)
if ($rows.Count -ne 38) { throw "Expected 38 metadata rows; received $($rows.Count)." }
if (@($rows | Where-Object { $_.rights_approved -ne 'yes' -or $_.publication_approved -ne 'yes' }).Count -ne 0) {
  throw 'Every protected display row must have explicit rights and publication approval.'
}
if ((@($rows.slug | Sort-Object -Unique)).Count -ne $rows.Count) { throw 'Metadata slugs must be unique.' }

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$targets = foreach ($row in $rows) {
  $source = Join-Path $inputPath ("candidate-{0}.jpg" -f $row.candidate)
  $target = Join-Path $outputPath ("{0}.jpg" -f $row.slug)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing candidate derivative: $source" }
  if (Test-Path -LiteralPath $target) { throw "Refusing to overwrite protected display: $target" }
  [PSCustomObject]@{ Candidate = $row.candidate; Slug = $row.slug; Source = $source; Target = $target }
}

$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } |
  Select-Object -First 1
$encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality,
  $JpegQuality
)
$manifestRows = [System.Collections.Generic.List[object]]::new()

try {
  foreach ($item in $targets) {
    $sourceImage = [System.Drawing.Image]::FromFile($item.Source)
    try {
      if ($sourceImage.Width -ne 1024 -or $sourceImage.Height -ne 1024) {
        throw "Expected a 1024x1024 private display derivative: $($item.Source)"
      }
      $display = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
      $graphics = [System.Drawing.Graphics]::FromImage($display)
      $band = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(158, 0, 0, 0))
      $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(236, 255, 255, 255))
      $font = [System.Drawing.Font]::new('Arial', 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, 1024, 1024)
        $graphics.FillRectangle($band, 777, 962, 247, 62)
        $graphics.DrawString('ARTCOVR / PREVIEW', $font, $white, 794, 980)
        $display.Save($item.Target, $jpegEncoder, $encoderParameters)
      }
      finally {
        $font.Dispose()
        $white.Dispose()
        $band.Dispose()
        $graphics.Dispose()
        $display.Dispose()
      }
    }
    finally {
      $sourceImage.Dispose()
    }

    $sourceHash = (Get-FileHash -LiteralPath $item.Source -Algorithm SHA256).Hash.ToLowerInvariant()
    $protectedHash = (Get-FileHash -LiteralPath $item.Target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sourceHash -eq $protectedHash) { throw "Watermark passthrough detected: $($item.Slug)" }
    $file = Get-Item -LiteralPath $item.Target
    $manifestRows.Add([PSCustomObject]@{
      candidate = $item.Candidate
      slug = $item.Slug
      protectedSha256 = $protectedHash
      bytes = $file.Length
    })
  }
}
finally {
  $encoderParameters.Dispose()
}

$manifest = [PSCustomObject]@{
  version = 'artcovr-protected-display-batch-v1'
  source = 'candidate-selection-2026-08-20/vector-staging-v2'
  watermark = 'ARTCOVR / PREVIEW lower-right overlay'
  count = $manifestRows.Count
  displays = $manifestRows
}
$manifestPath = Join-Path $batchRoot 'ARTCOVR_38_Protected_Display_Manifest.private.json'
[System.IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 5) + "`n"), [System.Text.UTF8Encoding]::new($false))
$manifest | ConvertTo-Json -Depth 5
