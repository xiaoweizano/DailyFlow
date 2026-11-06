#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
application_pid=""
application_log="$(mktemp -t dailyflow-desktop-smoke.XXXXXX.log)"

cleanup() {
  if [[ -n "$application_pid" ]]; then
    kill "$application_pid" 2>/dev/null || true
    wait "$application_pid" 2>/dev/null || true
  fi
  rm -f "$application_log"
}
trap cleanup EXIT

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

if [[ "$TAURI_APP_PATH" == *.app ]]; then
  info_plist="$TAURI_APP_PATH/Contents/Info.plist"
  if [[ ! -f "$info_plist" ]]; then
    echo "FAIL: macOS app bundle is missing Contents/Info.plist: $TAURI_APP_PATH" >&2
    exit 1
  fi
  executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$info_plist")"
  application_executable="$TAURI_APP_PATH/Contents/MacOS/$executable_name"
else
  application_executable="$TAURI_APP_PATH"
fi

if [[ ! -x "$application_executable" ]]; then
  echo "FAIL: Tauri executable is not runnable: $application_executable" >&2
  exit 1
fi

"$application_executable" >"$application_log" 2>&1 &
application_pid="$!"

for _ in {1..20}; do
  if ! kill -0 "$application_pid" 2>/dev/null; then
    echo "FAIL: DailyFlow exited during startup." >&2
    tail -n 100 "$application_log" >&2 || true
    exit 1
  fi
  sleep 0.25
done

echo "DailyFlow stayed alive for 5 seconds (PID $application_pid)."
echo "DEGRADED: WKWebView does not expose a stable CDP-equivalent automation endpoint."
echo "The macOS smoke verifies packaged launch and process stability; lifecycle workflows run on Windows CDP."
