$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$playwrightCli = Join-Path $repositoryRoot "node_modules/@playwright/test/cli.js"
$applicationProcess = $null
$applicationLogDirectory = $null

function Write-ApplicationDiagnostics {
    if ($null -eq $applicationLogDirectory -or -not (Test-Path -LiteralPath $applicationLogDirectory)) {
        return
    }

    Get-ChildItem -LiteralPath $applicationLogDirectory -File | ForEach-Object {
        Write-Host "----- $($_.Name) (tail) -----"
        Get-Content -LiteralPath $_.FullName -Tail 100
    }
}

function Get-AvailableTcpPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

function Stop-ApplicationProcess {
    if ($null -eq $applicationProcess) {
        return
    }

    $applicationProcess.Refresh()
    if (-not $applicationProcess.HasExited) {
        $null = & taskkill.exe /PID $applicationProcess.Id /T /F 2>$null
        $null = $applicationProcess.WaitForExit(5000)
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

if (-not $env:TAURI_WEBVIEW2_CDP_URL -and -not $env:TAURI_APP_PATH) {
    Write-Host "SKIP: no packaged Tauri application was found. Build the desktop application or set TAURI_APP_PATH."
    exit 0
}

try {
    if (-not $env:TAURI_WEBVIEW2_CDP_URL) {
        $cdpPort = Get-AvailableTcpPort
        $env:TAURI_WEBVIEW2_CDP_URL = "http://127.0.0.1:$cdpPort"

        $tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
        $applicationLogDirectory = Join-Path $tempRoot "dailyflow-desktop-smoke"
        New-Item -ItemType Directory -Path $applicationLogDirectory -Force | Out-Null

        $previousBrowserArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort"
        try {
            $applicationProcess = Start-Process `
                -FilePath $env:TAURI_APP_PATH `
                -WorkingDirectory (Split-Path -Parent $env:TAURI_APP_PATH) `
                -RedirectStandardOutput (Join-Path $applicationLogDirectory "application.stdout.log") `
                -RedirectStandardError (Join-Path $applicationLogDirectory "application.stderr.log") `
                -PassThru `
                -WindowStyle Hidden
        }
        finally {
            $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousBrowserArguments
        }

        $versionUrl = "$env:TAURI_WEBVIEW2_CDP_URL/json/version"
        $deadline = (Get-Date).AddSeconds(60)
        $lastCdpError = "WebView2 CDP has not been checked."
        $cdpReady = $false

        while ((Get-Date) -lt $deadline) {
            $applicationProcess.Refresh()
            if ($applicationProcess.HasExited) {
                Write-ApplicationDiagnostics
                throw "DailyFlow exited before WebView2 CDP became ready with code $($applicationProcess.ExitCode)."
            }

            try {
                $version = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 2
                if ($version.Browser) {
                    $cdpReady = $true
                    Write-Host "WebView2 CDP ready: $($version.Browser)"
                    break
                }
                $lastCdpError = "WebView2 CDP returned no browser version."
            }
            catch {
                $lastCdpError = $_.Exception.Message
            }

            Start-Sleep -Milliseconds 250
        }

        if (-not $cdpReady) {
            Write-ApplicationDiagnostics
            throw "WebView2 CDP did not become ready within 60 seconds: $lastCdpError"
        }
    }
    else {
        Write-Host "Using existing WebView2 CDP endpoint: $env:TAURI_WEBVIEW2_CDP_URL"
    }

    $node = Get-Command "node.exe"
    $env:DAILYFLOW_DESKTOP_SMOKE_ONLY = "true"
    $testProcess = Start-Process `
        -FilePath $node.Source `
        -ArgumentList @(
            $playwrightCli,
            "test",
            "apps/desktop/e2e/smoke.spec.ts",
            "--project=windows-desktop"
        ) `
        -WorkingDirectory $repositoryRoot `
        -NoNewWindow `
        -Wait `
        -PassThru
    $testExitCode = $testProcess.ExitCode
    if ($testExitCode -ne 0) {
        Write-ApplicationDiagnostics
    }
    exit $testExitCode
}
finally {
    Stop-ApplicationProcess
}
