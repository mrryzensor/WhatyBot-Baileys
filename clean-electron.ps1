$ErrorActionPreference = 'Stop'
$store = pnpm store path --silent
if (-not $store) {
  Write-Error 'No store path'
  exit 1
}

$electronDirs = Get-ChildItem -Path $store -Directory -Filter 'electron@*' -ErrorAction SilentlyContinue
if ($electronDirs) {
  foreach ($dir in $electronDirs) {
    Write-Host ('Removing ' + $dir.FullName)
    Remove-Item -Recurse -Force $dir.FullName
  }
} else {
  Write-Host ('No electron dirs found in ' + $store)
}

pnpm add electron@39.2.4 --force
