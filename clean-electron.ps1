$ErrorActionPreference = 'Stop'

Write-Host "Cleaning Electron dependencies using npm..."

# Remove electron from node_modules if it exists
if (Test-Path "node_modules/electron") {
    Write-Host "Removing node_modules/electron..."
    Remove-Item -Recurse -Force "node_modules/electron"
}

# Clear npm cache (optional, but can help)
# Write-Host "Clearing npm cache..."
# npm cache clean --force

Write-Host "Reinstalling electron 39.2.4 using npm..."
npm install electron@39.2.4 --save-dev --force

Write-Host "✅ Electron has been reinstalled."
