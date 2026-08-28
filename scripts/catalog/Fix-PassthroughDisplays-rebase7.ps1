<#
.SYNOPSIS
  Re-encodes the 7 lost-source-rebase artworks whose public JPEG is a
  PUBLIC_ASSET_PASSTHROUGH of their archived private master.

.DESCRIPTION
  The 2026-08-16 lost-source rebase (catalog/swaps/2026-08-16-lost-source-rebase.json)
  rebased seven works onto their surviving display JPEG after the original PNGs
  were lost. The archival copy of each master now lives at
  <PrivateRecoveredRoot>\{slug}.jpg and is the work's canonical private source;
  approved-artworks.json already describes those bytes. Because the public
  storefront file is byte-identical to that master, scripts/catalog/validate.ts
  reports PUBLIC_ASSET_PASSTHROUGH for all seven.

  This script applies the same repair Fix-PassthroughDisplays.ps1 applied to the
  30 expansion-batch works on 2026-08-28:
    1. Read the archived private master (read-only; never modified).
    2. Re-encode at 1024x1024 JPEG quality 88 with NO watermark band.
       Per the owner decision of 2026-08-28, storefront display derivatives do
       not carry a visible 'ARTCOVR / PREVIEW' watermark; protection is the
       lossy 1024x1024 re-encode, never the clean source bytes.
    3. Overwrite public/assets/artworks/{slug}.jpg in place.

  SHA invariants enforced per file:
    * the archived master's SHA-256 still equals the approved row's sha256
    * output SHA-256 != the clean source SHA-256 (PUBLIC_ASSET_PASSTHROUGH guard)

.PARAMETER ProjectRoot
  Root of the ARTCOVR checkout. Defaults to two levels above this script.

.PARAMETER PrivateRecoveredRoot
  Directory holding the archived masters. Defaults to the private recovered store.

.PARAMETER DryRun
  When specified, reports what would be done without writing any files.
#>
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$PrivateRecoveredRoot = 'E:\ART_COLLECTION\.artcovr-private\recovered',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectPath  = [System.IO.Path]::GetFullPath($ProjectRoot)
$publicAssets = Join-Path $projectPath 'public\assets\artworks'
$approvedPath = Join-Path $projectPath 'catalog\approved-artworks.json'
$swapPath     = Join-Path $projectPath 'catalog\swaps\2026-08-16-lost-source-rebase.json'
$recoveredDir = [System.IO.Path]::GetFullPath($PrivateRecoveredRoot)

if (-not (Test-Path -LiteralPath $approvedPath -PathType Leaf)) { throw "Missing approved catalog: $approvedPath" }
if (-not (Test-Path -LiteralPath $swapPath -PathType Leaf)) { throw "Missing rebase directive: $swapPath" }
if (-not (Test-Path -LiteralPath $recoveredDir -PathType Container)) { throw "Missing private recovered store: $recoveredDir" }

# The seven rebased works, read from the swap directive so the script can never
# drift from the recorded migration.
$swap = Get-Content -LiteralPath $swapPath -Raw | ConvertFrom-Json
$works = @($swap.works)
if ($works.Count -ne 7) { throw "Expected 7 rebased works; received $($works.Count)." }

$approved = Get-Content -LiteralPath $approvedPath -Raw | ConvertFrom-Json
$bySlug = @{}
foreach ($entry in $approved) { $bySlug[$entry.slug] = $entry }

# JPEG encoder setup (quality 88, matches New-ProtectedBatchDisplays.ps1 and
# Fix-PassthroughDisplays.ps1).
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality, [long]88
)

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$processed = 0
$skipped   = 0

try {
  foreach ($work in $works) {
    $slug = $work.slug
    $row  = $bySlug[$slug]
    if ($null -eq $row) { throw "Rebased slug '$slug' is not present in approved-artworks.json." }
    if ($row.id -ne $work.newId) {
      throw "Approved id for '$slug' is $($row.id) but the rebase directive expects $($work.newId)."
    }
    if ($row.sha256 -ne $work.newSha256) {
      throw "Approved sha256 for '$slug' does not match the rebase directive."
    }

    $sourceFile = Join-Path $recoveredDir "$slug.jpg"
    $publicFile = Join-Path $publicAssets ([System.IO.Path]::GetFileName($row.displayPath))
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Missing archived master: $sourceFile" }
    if (-not (Test-Path -LiteralPath $publicFile -PathType Leaf)) { throw "Missing public display: $publicFile" }

    # The archived master is the canonical private source; it is only ever read.
    $sourceBytes = [System.IO.File]::ReadAllBytes($sourceFile)
    $sourceHash  = [BitConverter]::ToString($sha256.ComputeHash($sourceBytes)).Replace('-','').ToLower()
    if ($sourceHash -ne $row.sha256) {
      throw "Archived master for '$slug' no longer matches the approved sha256 -- aborting."
    }

    $publicHash = [BitConverter]::ToString(
      $sha256.ComputeHash([System.IO.File]::ReadAllBytes($publicFile))
    ).Replace('-','').ToLower()
    if ($publicHash -ne $sourceHash) {
      Write-Warning "SKIP (no longer a passthrough): $slug"
      Write-Warning "  source=$sourceHash"
      Write-Warning "  public=$publicHash"
      $skipped++
      continue
    }

    if ($DryRun) {
      Write-Output "DRY-RUN: would re-encode $slug ($($sourceBytes.Length) bytes) -> 1024x1024 quality-88, no watermark"
      $processed++
      continue
    }

    # Re-encode WITHOUT watermark (owner decision 2026-08-28).
    $display = $null; $graphics = $null
    $ms = [System.IO.MemoryStream]::new($sourceBytes)
    $sourceImage = [System.Drawing.Image]::FromStream($ms)
    try {
      if ($sourceImage.Width -ne $sourceImage.Height -or $sourceImage.Width -lt 1024) {
        throw "Expected square master >= 1024: $sourceFile ($($sourceImage.Width)x$($sourceImage.Height))"
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
      $ms.Dispose()
    }

    $newBytes = [System.IO.File]::ReadAllBytes($publicFile)
    $newHash  = [BitConverter]::ToString($sha256.ComputeHash($newBytes)).Replace('-','').ToLower()
    if ($newHash -eq $sourceHash) {
      throw "Re-encoded file still matches the clean source SHA for $slug -- aborting"
    }

    # The archived master must be untouched by this run.
    $verifyHash = [BitConverter]::ToString(
      $sha256.ComputeHash([System.IO.File]::ReadAllBytes($sourceFile))
    ).Replace('-','').ToLower()
    if ($verifyHash -ne $sourceHash) { throw "Archived master for '$slug' was modified -- aborting" }

    Write-Output "OK: $slug  $($sourceBytes.Length) -> $($newBytes.Length) bytes  sha=$newHash"
    $processed++
  }
}
finally {
  $encoderParameters.Dispose()
}

Write-Output ""
Write-Output "Done. Processed=$processed  Skipped=$skipped"
