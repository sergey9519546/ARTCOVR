<#
.SYNOPSIS
  Re-encodes the 30 PUBLIC_ASSET_PASSTHROUGH artworks.

.DESCRIPTION
  For expansion-batch artworks whose public JPEG is byte-identical to the
  clean source (because they were deployed without the protected-derivative
  pipeline), this script:
    1. Reads the committed (HEAD) public/assets/artworks/{slug}.jpg bytes,
       which are the passthrough bytes whose SHA-256 equals the source SHA.
    2. Re-encodes at 1024x1024 JPEG quality 88 with NO watermark band.
       Per the owner decision of 2026-08-28, storefront display derivatives
       do not carry a visible 'ARTCOVR / PREVIEW' watermark; protection is
       the lossy 1024x1024 re-encode, never the clean source bytes.
    3. Overwrites the public file in-place.

  The result has a different SHA-256 from the clean source, which is the
  invariant asserted by scripts/catalog/validate.ts (PUBLIC_ASSET_PASSTHROUGH).

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

$projectPath  = [System.IO.Path]::GetFullPath($ProjectRoot)
$publicAssets = Join-Path $projectPath 'public\assets\artworks'
$approvedPath = Join-Path $projectPath 'catalog\approved-artworks.json'

# ── Failing IDs from `node --experimental-strip-types scripts/catalog/validate.ts`
$failingIds = @(
  'art_0f6cd23cf71ebbb14ac6', 'art_0f9bd0b056f799756e83', 'art_18fee4bf2eaa9f2ce1a5',
  'art_1db3f7422b353d8f7c60', 'art_382f017ddadad8dcd971', 'art_4086f34a938a03692a7e',
  'art_4a75bfcdf2490e7a4b83', 'art_4d603e11105c86408382', 'art_642cf0c25717c36166ff',
  'art_7042fab38aac05f1101f', 'art_7883ab1e65e974742396', 'art_7a40006d0661fe92b815',
  'art_7d498d5557e8a66000dc', 'art_8b65ec9172e4f0395168', 'art_8ff72ba0b028fbdf1e11',
  'art_9301fc22a3464cb0d296', 'art_9401682d689b745117c1', 'art_9fc168e232a06e37ad41',
  'art_a4dec73be45fb5883646', 'art_ae2326bd33d9ebcccb7a', 'art_bc8268a8e110d051c958',
  'art_c427d53e477404b3a91b', 'art_ca24dc2ffebcfb051043', 'art_cb3ddc35dcde34830e04',
  'art_d27b6457129241d3a6a6', 'art_d9d61f5f3d045bb5f072', 'art_e5ffb2e43ccd57b87273',
  'art_ee6e7132fe55b92cf922', 'art_f6404e9e54d62e89e820', 'art_fd6312bbd6441c9e025a'
)

# ── Load catalog to resolve slug → public path
$approved = Get-Content $approvedPath | ConvertFrom-Json
$rows = $approved | Where-Object { $failingIds -contains $_.id }
if ($rows.Count -ne $failingIds.Count) {
  throw "Expected $($failingIds.Count) rows; found $($rows.Count). Check approved-artworks.json."
}

# ── JPEG encoder setup (quality 88, matches New-ProtectedBatchDisplays.ps1)
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality, [long]88
)

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'artcovr-passthrough-fix'
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$processed = 0
$skipped   = 0

try {
  foreach ($row in $rows) {
    # displayPath is like "/assets/artworks/slug.jpg"
    $fileName     = [System.IO.Path]::GetFileName($row.displayPath)
    $publicFile   = Join-Path $publicAssets $fileName
    $gitHeadPath  = "public/assets/artworks/$fileName"
    $headFile     = Join-Path $tempRoot $fileName

    if (-not (Test-Path -LiteralPath $publicFile -PathType Leaf)) {
      Write-Warning "SKIP (missing): $($row.slug) — $publicFile"
      $skipped++
      continue
    }

    # Read the committed bytes, which are the passthrough bytes under repair.
    & cmd /c "git -C `"$projectPath`" show HEAD:$gitHeadPath > `"$headFile`""
    if ($LASTEXITCODE -ne 0) { throw "git show failed for $gitHeadPath" }
    $currentBytes = [System.IO.File]::ReadAllBytes($headFile)
    $currentHash  = [BitConverter]::ToString($sha256.ComputeHash($currentBytes)).Replace('-','').ToLower()
    if ($currentHash -ne $row.sha256) {
      Write-Warning "SKIP (HEAD is no longer a passthrough): $($row.slug)"
      Write-Warning "  expected=$($row.sha256)"
      Write-Warning "  actual  =$currentHash"
      $skipped++
      continue
    }

    if ($DryRun) {
      Write-Output "DRY-RUN: would re-encode $($row.slug) ($($currentBytes.Length) bytes) → quality-88, no watermark"
      $processed++
      continue
    }

    # ── Re-encode WITHOUT watermark (owner decision 2026-08-28)
    $display    = $null
    $graphics   = $null
    $ms = [System.IO.MemoryStream]::new($currentBytes)
    $sourceImage = [System.Drawing.Image]::FromStream($ms)
    try {
      if ($sourceImage.Width -ne $sourceImage.Height -or $sourceImage.Width -lt 1024) {
        throw "Expected square image >= 1024: $gitHeadPath ($($sourceImage.Width)x$($sourceImage.Height))"
      }
      $display   = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
      $graphics  = [System.Drawing.Graphics]::FromImage($display)
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

    # Verify the re-encoded file has a different SHA than the clean source
    $newBytes = [System.IO.File]::ReadAllBytes($publicFile)
    $newHash  = [BitConverter]::ToString($sha256.ComputeHash($newBytes)).Replace('-','').ToLower()
    if ($newHash -eq $row.sha256) {
      throw "Re-encoded file still matches source SHA for $($row.slug) — aborting"
    }

    Write-Output "OK: $($row.slug)  $($currentBytes.Length) -> $($newBytes.Length) bytes  sha=$newHash"
    $processed++
  }
}
finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

Write-Output ""
Write-Output "Done. Processed=$processed  Skipped=$skipped"
