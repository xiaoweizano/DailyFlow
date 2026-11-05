$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$playwrightCli = Join-Path $repositoryRoot "node_modules/@playwright/test/cli.js"
$driverProcess = $null
$driverLogDirectory = $null

function Write-DriverDiagnostics {
    if ($null -eq $driverLogDirectory -or -not (Test-Path -LiteralPath $driverLogDirectory)) {
        return
    }

    Get-ChildItem -LiteralPath $driverLogDirectory -File | ForEach-Object {
        Write-Host "----- $($_.Name) (tail) -----"
        Get-Content -LiteralPath $_.FullName -Tail 100
    }
}

if (-not $env:TAURI_WEBDRIVER_URL) {
    $driver = Get-Command "tauri-driver" -ErrorAction SilentlyContinue
    if ($null -eq $driver) {
        Write-Host "SKIP: tauri-driver is not installed. Set TAURI_WEBDRIVER_URL to run the desktop smoke test."
        exit 0
    }

    $env:TAURI_WEBDRIVER_URL = "http://127.0.0.1:4444"
    $tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
    $driverLogDirectory = Join-Path $tempRoot "dailyflow-tauri-driver"
    New-Item -ItemType Directory -Path $driverLogDirectory -Force | Out-Null

    $driverProcess = Start-Process `
        -FilePath $driver.Source `
        -ArgumentList "--port", "4444" `
        -RedirectStandardOutput (Join-Path $driverLogDirectory "tauri-driver.stdout.log") `
        -RedirectStandardError (Join-Path $driverLogDirectory "tauri-driver.stderr.log") `
        -PassThru `
        -WindowStyle Hidden

    $statusUrl = "$env:TAURI_WEBDRIVER_URL/status"
    $deadline = (Get-Date).AddSeconds(30)
    $lastStatusError = "WebDriver status has not been checked."
    $driverReady = $false

    while ((Get-Date) -lt $deadline) {
        if ($driverProcess.HasExited) {
            Write-DriverDiagnostics
            throw "tauri-driver exited before becoming ready with code $($driverProcess.ExitCode)."
        }

        try {
            $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2
            if ($status.value.ready -eq $true) {
                $driverReady = $true
                break
            }
            $lastStatusError = "WebDriver reported ready=false."
        }
        catch {
            $lastStatusError = $_.Exception.Message
        }

        Start-Sleep -Milliseconds 250
    }

    if (-not $driverReady) {
        Write-DriverDiagnostics
        throw "tauri-driver did not become ready within 30 seconds: $lastStatusError"
    }
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
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
        Write-DriverDiagnostics
    }
    exit $testExitCode
}
finally {
    if ($null -ne $driverProcess) {
        Stop-Process -Id $driverProcess.Id -ErrorAction SilentlyContinue
        $driverProcess.WaitForExit(5000)
    }
}
