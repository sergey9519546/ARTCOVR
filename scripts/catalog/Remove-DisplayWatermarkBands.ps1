<#
.SYNOPSIS
  Removes the 'ARTCOVR / PREVIEW' band from committed storefront displays.

.DESCRIPTION
  The candidate-selection-2026-08-20 batch was published with a visible
  watermark band drawn by New-ProtectedBatchDisplays.ps1. Per the owner
  decision of 2026-08-28, storefront display derivatives no longer carry a
  visible watermark; protection is the lossy 1024x1024 quality-88 re-encode,
  never the clean source bytes.

  For every batch row whose current public JPEG still exhibits the band,
  this script re-encodes the batch's unwatermarked 1024x1024 candidate
  derivative (the same input New-ProtectedBatchDisplays.ps1 consumed) at
  JPEG quality 88 without the band and overwrites public/assets/artworks
  in-place.

  SHA invariants enforced per file:
    * output SHA-256 != clean source SHA-256 (PUBLIC_ASSET_PASSTHROUGH guard)
    * input candidate derivative is exactly 1024x1024
  Rows whose public file shows no band are reported and left untouched.

.PARAMETER ProjectRoot
  Root of the ARTCOVR checkout. Defaults to two levels above this script.

.PARAMETER DryRun
  When specified, reports what would be done without writing any files.
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectPath = [System.IO.Path]::GetFullPath($ProjectRoot)
$batchRoot   = Join-Path $projectPath 'outputs\catalog\review-assets\candidate-selection-2026-08-20'
$csvPath     = Join-Path $batchRoot 'ARTCOVR_38_Metadata_Proposals.csv'
$inputDir    = Join-Path $batchRoot 'vector-staging-v2\public\assets\artworks'
$publicDir   = Join-Path $projectPath 'public\assets\artworks'
$approved    = Join-Path $projectPath 'catalog\approved-artworks.json'

if (-not (Test-Path -LiteralPath $csvPath -PathType Leaf)) { throw "Missing metadata CSV: $csvPath" }
if (-not (Test-Path -LiteralPath $inputDir -PathType Container)) { throw "Missing candidate input directory: $inputDir" }

$rows = @(Import-Csv -LiteralPath $csvPath)
if ($rows.Count -ne 38) { throw "Expected 38 metadata rows; received $($rows.Count)." }
if (@($rows | Where-Object { $_.rights_approved -ne 'yes' -or $_.publication_approved -ne 'yes' }).Count -ne 0) {
  throw 'Every batch row must have explicit rights and publication approval.'
}

$approvedRows = (Get-Content $approvedPath | ConvertFrom-Json) | Where-Object { $_.tier -ne 'delete' }
$bySlug = @{}
foreach ($entry in $approvedRows) { $bySlug[$entry.slug] = $entry }

function Test-Band([System.Drawing.Bitmap]$bmp) {
  # Band signature: a dark overlay rectangle at y=962..1023, x=777..1023 with
  # near-white text. Detect via the luminance step at the band's top edge plus
  # the count of near-white text pixels inside the rectangle.
  $lum961 = 0.0; $lum963 = 0.0; $n = 0
  for ($x = 780; $x -le 1020; $x += 4) {
    $p1 = $bmp.GetPixel($x, 961); $p2 = $bmp.GetPixel($x, 963)
    $lum961 += 0.2126 * $p1.R + 0.7152 * $p1.G + 0.0722 * $p1.B
    $lum963 += 0.2126 * $p2.R + 0.7152 * $p2.G + 0.0722 * $p2.B
    $n++
  }
  $lum961 /= $n; $lum963 /= $n
  $text = 0
  for ($y = 966; $y -le 1018; $y += 2) {
    for ($x = 782; $x -le 1020; $x += 2) {
      $p = $bmp.GetPixel($x, $y)
      if ($p.R -gt 180 -and $p.G -gt 180 -and $p.B -gt 180) { $text++ }
    }
  }
  return (($lum961 -gt 40 -and $lum963 -lt 0.65 * $lum961) -or $text -gt 150)
}

$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality, [long]88
)
$sha256 = [System.Security.Cryptography.SHA256]::Create()

$processed = 0
$unbanded  = [System.Collections.Generic.List[string]]::new()

try {
  foreach ($row in $rows) {
    $slug = $row.slug
    if (-not $bySlug.ContainsKey($slug)) { throw "Batch slug '$slug' is not a published row in approved-artworks.json." }
    $sourceSha = $bySlug[$slug].sha256
    $inputFile = Join-Path $inputDir ("candidate-{0}.jpg" -f $row.candidate)
    $publicFile = Join-Path $publicDir ("{0}.jpg" -f $slug)
    if (-not (Test-Path -LiteralPath $inputFile -PathType Leaf)) { throw "Missing candidate input: $inputFile" }
    if (-not (Test-Path -LiteralPath $publicFile -PathType Leaf)) { throw "Missing public display: $publicFile" }

    $probe = [System.Drawing.Image]::FromFile($publicFile)
    try {
      if ($probe.Width -ne 1024 -or $probe.Height -ne 1024) { $unbanded.Add("$slug (not 1024x1024: $($probe.Width)x$($probe.Height))"); continue }
      $probeBitmap = [System.Drawing.Bitmap]::new($probe)
      try { $banded = Test-Band $probeBitmap } finally { $probeBitmap.Dispose() }
    } finally { $probe.Dispose() }
    if (-not $banded) { $unbanded.Add($slug); continue }

    if ($DryRun) {
      Write-Output "DRY-RUN: would restore $slug from candidate-$($row.candidate).jpg (quality-88, no watermark)"
      $processed++
      continue
    }

    $sourceImage = [System.Drawing.Image]::FromFile($inputFile)
    $display = $null; $graphics = $null
    try {
      if ($sourceImage.Width -ne 1024 -or $sourceImage.Height -ne 1024) {
        throw "Candidate input must be 1024x1024: $inputFile ($($sourceImage.Width)x$($sourceImage.Height))"
      }
      $display  = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
      $graphics = [System.Drawing.Graphics]::FromImage($display)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, 1024, 1024)
        $display.Save($publicFile, $jpegEncoder, $encoderParameters)
      } finally {
        if ($graphics) { $graphics.Dispose() }
      }
    } finally {
      if ($display)     { $display.Dispose() }
      if ($sourceImage) { $sourceImage.Dispose() }
    }

    $newHash = [BitConverter]::ToString($sha256.ComputeHash([System.IO.File]::ReadAllBytes($publicFile))).Replace('-','').ToLower()
    if ($newHash -eq $sourceSha) { throw "Re-encode still equals the clean source SHA for $slug — aborting" }
    Write-Output "OK: $slug  sha=$newHash"
    $processed++
  }
}
finally {
  $encoderParameters.Dispose()
}

if ($unbanded.Count -gt 0) {
  Write-Output ""
  Write-Output "Already unbanded (untouched): $($unbanded.Count)"
  $unbanded | ForEach-Object { Write-Output "  $_" }
}
Write-Output ""
Write-Output "Done. Processed=$processed"
