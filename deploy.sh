#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$ROOT_DIR"
VIEWER_ROOT="$ROOT_DIR/../ohif_viewer"
VIEWER_DIR="$VIEWER_ROOT/platform/app"

# step 1: rebuild plugin dist
cd "$PLUGIN_DIR"
echo "[deploy] Rebuilding plugin dist..."
npm run build:copy

# step 1b: copy to OHIF viewer's node_modules/dist
if [ -d "$VIEWER_ROOT/node_modules/@ohif/extension-xnat-datasource/dist" ]; then
  echo "[deploy] Copying plugin to node_modules/dist..."

  # Clean up any old root-level JS files (from previous broken deploys)
  cd "$VIEWER_ROOT/node_modules/@ohif/extension-xnat-datasource"
  rm -f XNATClient.js XNATDataSource.js XNATImageLoader.js init.js index.js XNATImageLoader.utils.js
  cd "$PLUGIN_DIR"

  # Copy fresh dist files
  cp -r dist/* "$VIEWER_ROOT/node_modules/@ohif/extension-xnat-datasource/dist/"
  echo "[deploy] ✓ Updated node_modules/dist with latest plugin code"
else
  echo "[deploy] Warning: node_modules/@ohif/extension-xnat-datasource/dist not found"
fi

# step 1c: copy XNAT mode configuration
echo "[deploy] Copying XNAT mode configuration..."
mkdir -p "$VIEWER_ROOT/modes/xnat/src"
if [ -f "$PLUGIN_DIR/config/modes/xnat-mode.js" ]; then
  cp "$PLUGIN_DIR/config/modes/xnat-mode.js" "$VIEWER_ROOT/modes/xnat/src/index.js"
  cp "$PLUGIN_DIR/config/modes/package.json" "$VIEWER_ROOT/modes/xnat/package.json"
  echo "[deploy] ✓ XNAT mode configuration copied"
else
  echo "[deploy] Warning: XNAT mode configuration not found"
fi

# step 1d: copy XNAT app configuration and make it the default
if [ -f "$PLUGIN_DIR/config/app-config-xnat.js" ]; then
  echo "[deploy] Making XNAT config the default..."
  # Backup original default config if it exists
  if [ -f "$VIEWER_ROOT/platform/app/public/config/default.js" ] && [ ! -f "$VIEWER_ROOT/platform/app/public/config/default.js.bak" ]; then
    cp "$VIEWER_ROOT/platform/app/public/config/default.js" "$VIEWER_ROOT/platform/app/public/config/default.js.bak"
    echo "[deploy] ✓ Backed up original default.js"
  fi
  # Copy XNAT config as the default
  cp "$PLUGIN_DIR/config/app-config-xnat.js" "$VIEWER_ROOT/platform/app/public/config/default.js"
  echo "[deploy] ✓ XNAT config is now the default (access at http://localhost:3000)"
fi

# step 2: CRITICAL - Stop server FIRST before clearing caches
echo "[deploy] Stopping any existing processes on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# step 3: Clear ALL webpack caches to prevent serving stale code
echo "[deploy] Clearing webpack caches..."
cd "$VIEWER_ROOT"
rm -rf node_modules/.cache
rm -rf platform/app/dist
rm -rf platform/app/.cache
rm -rf platform/app/node_modules/.cache
echo "[deploy] ✓ Webpack caches cleared"

# step 3: start viewer dev server in background with nohup
cd "$VIEWER_ROOT"
echo "[deploy] Starting viewer dev server from monorepo root..."
# Run from root of monorepo (yarn workspaces setup) and redirect logs to viewer directory
nohup yarn dev > "$VIEWER_DIR/dev-server.log" 2>&1 &
NEW_PID=$!
echo "[deploy] Viewer dev server started with pid $NEW_PID"
echo "[deploy] Server accessible at http://localhost:3000"
echo "[deploy] Done. Follow logs at $VIEWER_DIR/dev-server.log"
