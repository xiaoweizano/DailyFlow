$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$playwrightCli = Join-Path $repositoryRoot "node_modules/@playwright/test/cli.js"
$driverProcess = $null

if (-not $env:TAURI_WEBDRIVER_URL) {
    $driver = Get-Command "tauri-driver" -ErrorAction SilentlyContinue
    if ($null -eq $driver) {
        Write-Host "SKIP: tauri-driver is not installed. Set TAURI_WEBDRIVER_URL to run the desktop smoke test."
        exit 0
    }

    $env:TAURI_WEBDRIVER_URL = "http://127.0.0.1:4444"
    $driverProcess = Start-Process -FilePath $driver.Source -ArgumentList "--port", "4444" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

if (-not $env:TAURI_APP_PATH) {
    $candidatePaths = @(
        (Join-Path $repositoryRoot "apps/desktop/src-tauri/target/release/DailyFlow.exe"),
        (Join-Path $repositoryRoot "apps/desktop/src-tauri/target/debug/DailyFlow.exe"),
        (Join-Path $repositoryRoot "apps/desktop/src-tauri/target/release/dailyflow-desktop.exe"),
        (Join-Path $repositoryRoot "apps/desktop/src-tauri/target/debug/dailyflow-desktop.exe")
    )
    $env:TAURI_APP_PATH = $candidatePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $env:TAURI_APP_PATH) {
    Write-Host "SKIP: no packaged Tauri application was found. Build the desktop application or set TAURI_APP_PATH."
    if ($null -ne $driverProcess) {
        Stop-Process -Id $driverProcess.Id -ErrorAction SilentlyContinue
    }
    exit 0
}

try {
    & pnpm exec playwright test "apps/desktop/e2e/smoke.spec.ts" --project=windows-desktop
    exit $LASTEXITCODE
}
finally {
    if ($null -ne $driverProcess) {
        Stop-Process -Id $driverProcess.Id -ErrorAction SilentlyContinue
    }
}
