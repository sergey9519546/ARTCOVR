# ARTCOVR — moves files removed by the 2026-08-14 rationalization into _to_delete\
# Review _to_delete\ afterwards and delete it when satisfied.
# Run from the repository root:  powershell -ExecutionPolicy Bypass -File scripts\cleanup-removed-files.ps1
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$trash = Join-Path $repoRoot "_to_delete"
$removed = @(
  "components.json"
  "db\custom.db"
  "prisma\schema.prisma"
  "src\components\ui\accordion.tsx"
  "src\components\ui\alert-dialog.tsx"
  "src\components\ui\alert.tsx"
  "src\components\ui\aspect-ratio.tsx"
  "src\components\ui\avatar.tsx"
  "src\components\ui\badge.tsx"
  "src\components\ui\breadcrumb.tsx"
  "src\components\ui\button.tsx"
  "src\components\ui\calendar.tsx"
  "src\components\ui\card.tsx"
  "src\components\ui\carousel.tsx"
  "src\components\ui\chart.tsx"
  "src\components\ui\checkbox.tsx"
  "src\components\ui\collapsible.tsx"
  "src\components\ui\context-menu.tsx"
  "src\components\ui\dialog.tsx"
  "src\components\ui\drawer.tsx"
  "src\components\ui\dropdown-menu.tsx"
  "src\components\ui\form.tsx"
  "src\components\ui\hover-card.tsx"
  "src\components\ui\input-otp.tsx"
  "src\components\ui\input.tsx"
  "src\components\ui\label.tsx"
  "src\components\ui\menubar.tsx"
  "src\components\ui\navigation-menu.tsx"
  "src\components\ui\pagination.tsx"
  "src\components\ui\popover.tsx"
  "src\components\ui\progress.tsx"
  "src\components\ui\radio-group.tsx"
  "src\components\ui\resizable.tsx"
  "src\components\ui\scroll-area.tsx"
  "src\components\ui\select.tsx"
  "src\components\ui\separator.tsx"
  "src\components\ui\sheet.tsx"
  "src\components\ui\sidebar.tsx"
  "src\hooks\use-mobile.ts"
  "src\hooks\use-toast.ts"
  "src\lib\artcovr\catalog.ts"
  "src\lib\utils.ts"
  "tests\unit\catalog.test.ts"
)
$moved = 0
foreach ($rel in $removed) {
  $src = Join-Path $repoRoot $rel
  if (Test-Path -LiteralPath $src) {
    $dest = Join-Path $trash $rel
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Move-Item -LiteralPath $src -Destination $dest -Force
    $moved++
  }
}
# Remove now-empty directories left behind
foreach ($dir in @("src\components\ui", "prisma", "db", "mini-services")) {
  $p = Join-Path $repoRoot $dir
  if ((Test-Path -LiteralPath $p) -and -not (Get-ChildItem -LiteralPath $p -Recurse -File)) {
    Remove-Item -LiteralPath $p -Recurse -Force
  }
}
Write-Host "Moved $moved removed files into _to_delete\. Review and delete that folder when satisfied."
