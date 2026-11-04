#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
driver_pid=""

cleanup() {
  if [[ -n "$driver_pid" ]]; then
    kill "$driver_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ -z "${TAURI_WEBDRIVER_URL:-}" ]]; then
  if ! command -v tauri-driver >/dev/null 2>&1; then
    echo "SKIP: tauri-driver is not installed. Set TAURI_WEBDRIVER_URL to run the desktop smoke test."
    exit 0
  fi

  export TAURI_WEBDRIVER_URL="http://127.0.0.1:4444"
  tauri-driver --port 4444 >/tmp/dailyflow-tauri-driver.log 2>&1 &
  driver_pid="$!"
  sleep 2
fi

if [[ -z "${TAURI_APP_PATH:-}" ]]; then
  for candidate in \
    "$repository_root/apps/desktop/src-tauri/target/release/DailyFlow.app" \
    "$repository_root/apps/desktop/src-tauri/target/debug/DailyFlow.app" \
    "$repository_root/apps/desktop/src-tauri/target/release/dailyflow-desktop" \
    "$repository_root/apps/desktop/src-tauri/target/debug/dailyflow-desktop"; do
    if [[ -e "$candidate" ]]; then
      export TAURI_APP_PATH="$candidate"
      break
    fi
  done
fi

if [[ -z "${TAURI_APP_PATH:-}" ]]; then
  echo "SKIP: no packaged Tauri application was found. Build the desktop application or set TAURI_APP_PATH."
  exit 0
fi

cd "$repository_root"
pnpm exec playwright test apps/desktop/e2e/smoke.spec.ts --project=windows-desktop
