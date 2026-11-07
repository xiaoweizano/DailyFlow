$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$playwrightCli = Join-Path $repositoryRoot "node_modules/@playwright/test/cli.js"
$applicationProcess = $null
$applicationLogDirectory = $null

function Write-ApplicationDiagnostics {
    if ($null -ne $applicationLogDirectory -and (Test-Path -LiteralPath $applicationLogDirectory)) {
        Get-ChildItem -LiteralPath $applicationLogDirectory -File | ForEach-Object {
            Write-Host "----- $($_.Name) (tail) -----"
            Get-Content -LiteralPath $_.FullName -Tail 100
        }
    }

    if ($null -ne $applicationProcess) {
        try {
            Write-Host "----- DailyFlow process -----"
            Get-CimInstance Win32_Process -Filter "ProcessId = $($applicationProcess.Id)" |
                Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine |
                Format-List
        }
        catch {
            Write-Host "Unable to inspect DailyFlow process: $($_.Exception.Message)"
        }
    }

    try {
        Write-Host "----- WebView2 processes -----"
        Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
            Select-Object ProcessId, ParentProcessId, CommandLine |
            Format-List
    }
    catch {
        Write-Host "Unable to inspect WebView2 processes: $($_.Exception.Message)"
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

if (-not $env:TAURI_APP_PATH) {
    Write-Host "SKIP: no packaged Tauri application was found. Build the desktop application or set TAURI_APP_PATH."
    exit 0
}

try {
    if (-not $env:TAURI_WEBVIEW2_CDP_URL) {
        $cdpPort = Get-AvailableTcpPort
        $env:TAURI_WEBVIEW2_CDP_URL = "http://127.0.0.1:$cdpPort"
    }
    else {
        $cdpPort = ([Uri]$env:TAURI_WEBVIEW2_CDP_URL).Port
    }

    $tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
    $applicationLogDirectory = Join-Path $tempRoot "dailyflow-desktop-smoke"
    New-Item -ItemType Directory -Path $applicationLogDirectory -Force | Out-Null

    $previousBrowserArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
    try {
        $stdoutPath = Join-Path $applicationLogDirectory "application.stdout.log"
        $stderrPath = Join-Path $applicationLogDirectory "application.stderr.log"
        $applicationCommand = '{0} > "{1}" 2> "{2}"' -f `
            $env:TAURI_APP_PATH,
            $stdoutPath,
            $stderrPath
        $applicationProcess = Start-Process `
            -FilePath $env:ComSpec `
            -ArgumentList @('/d', '/s', '/c', $applicationCommand) `
            -WorkingDirectory (Split-Path -Parent $env:TAURI_APP_PATH) `
            -PassThru `
            -WindowStyle Hidden
    }
    finally {
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousBrowserArguments
    }
    Write-Host "Started DailyFlow process $($applicationProcess.Id) with CDP endpoint $env:TAURI_WEBVIEW2_CDP_URL"

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

    $node = Get-Command "node.exe"
    $env:DAILYFLOW_DESKTOP_SMOKE_ONLY = "true"
    $env:DAILYFLOW_DESKTOP_PID = "$($applicationProcess.Id)"
    $env:DAILYFLOW_SMOKE_RUN_ID = Get-Date -Format "yyyyMMddHHmmss"
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
        exit $testExitCode
    }

    $applicationProcess.Refresh()
    if (-not $applicationProcess.WaitForExit(15000)) {
        Write-ApplicationDiagnostics
        throw "DailyFlow did not exit within 15 seconds after lifecycle_quit."
    }

    $applicationProcess.WaitForExit()
    $applicationExitCode = $applicationProcess.ExitCode
    if ($applicationExitCode -ne 0) {
        Write-ApplicationDiagnostics
        throw "DailyFlow exited with code $applicationExitCode after lifecycle_quit."
    }
}
finally {
    Remove-Item Env:DAILYFLOW_DESKTOP_PID -ErrorAction SilentlyContinue
    Remove-Item Env:DAILYFLOW_SMOKE_RUN_ID -ErrorAction SilentlyContinue
    Stop-ApplicationProcess
}
