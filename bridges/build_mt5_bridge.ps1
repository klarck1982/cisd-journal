Param(
  [string]$Python = "py",
  [string]$OutputName = "mt5_readonly_sync"
)

Write-Host "Installing PyInstaller and MetaTrader5 if needed..."
& $Python -3 -m pip install --upgrade pyinstaller MetaTrader5
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building MT5 bridge executable..."
& $Python -3 -m PyInstaller --onefile --name $OutputName "bridges/mt5_readonly_sync.py"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Copying built EXE into bridges folder..."
Copy-Item -Force "dist/$OutputName.exe" "bridges/$OutputName.exe"
Write-Host "Done. Bundled bridge ready at bridges/$OutputName.exe"
