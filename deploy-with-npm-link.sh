#!/bin/bash

# Deploy XNAT Extension to OHIF Viewer using npm link
# Usage: ./deploy-with-npm-link.sh /path/to/ohif-viewer [--restart]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  OHIF XNAT Extension - npm link Deployment Script  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Parse arguments
RESTART_SERVER=false
OHIF_ROOT=""

for arg in "$@"; do
    case $arg in
        --restart)
            RESTART_SERVER=true
            shift
            ;;
        *)
            if [ -z "$OHIF_ROOT" ]; then
                OHIF_ROOT="$arg"
            fi
            ;;
    esac
done

# Check if OHIF path is provided
if [ -z "$OHIF_ROOT" ]; then
    echo -e "${RED}Error: OHIF viewer path not provided${NC}"
    echo "Usage: ./deploy-with-npm-link.sh /path/to/ohif-viewer [--restart]"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Convert to absolute path
OHIF_ROOT="$( cd "$OHIF_ROOT" && pwd )"

# ============================================================================
# Step 1: Build the extension
# ============================================================================
echo -e "${YELLOW}[1/5] Building extension...${NC}"
cd "$SCRIPT_DIR"
npm run build
echo -e "${GREEN}✓ Extension built successfully${NC}"
echo ""

# ============================================================================
# Step 2: Link the extension
# ============================================================================
echo -e "${YELLOW}[2/5] Linking extension...${NC}"
cd "$SCRIPT_DIR"

# Remove node_modules to avoid dependency conflicts
if [ -d "node_modules" ]; then
    echo "  Removing node_modules from extension to prevent dependency conflicts..."
    rm -rf node_modules
fi

npm link
cd "$OHIF_ROOT"
npm link @ohif/extension-xnat-datasource --legacy-peer-deps

# Also remove node_modules from the symlinked location
if [ -L "node_modules/@ohif/extension-xnat-datasource" ]; then
    LINK_TARGET=$(readlink "node_modules/@ohif/extension-xnat-datasource")
    if [ -d "$LINK_TARGET/node_modules" ]; then
        echo "  Removing node_modules from linked extension directory..."
        rm -rf "$LINK_TARGET/node_modules"
    fi
fi

echo -e "${GREEN}✓ Extension linked successfully${NC}"
echo ""

# ============================================================================
# Step 3: Apply hotfixes
# ============================================================================
echo -e "${YELLOW}[3/5] Applying hotfixes...${NC}"
cp "$SCRIPT_DIR/config/DataSourceWrapper-routes.tsx" "$OHIF_ROOT/platform/app/src/routes/DataSourceWrapper.tsx"
cp "$SCRIPT_DIR/config/rsbuild.config.ts" "$OHIF_ROOT/rsbuild.config.ts"
echo -e "${GREEN}✓ Hotfixes applied${NC}"
echo ""

# ============================================================================
# Step 4: Update pluginConfig.json
# ============================================================================
echo -e "${YELLOW}[4/5] Updating pluginConfig.json...${NC}"
PLUGIN_CONFIG="$OHIF_ROOT/platform/app/pluginConfig.json"

if [ ! -f "$PLUGIN_CONFIG" ]; then
    echo -e "${RED}Error: pluginConfig.json not found at $PLUGIN_CONFIG${NC}"
    exit 1
fi

# Check if the extension is already in pluginConfig.json
if grep -q '"@ohif/extension-xnat-datasource"' "$PLUGIN_CONFIG"; then
    echo "  Extension already present in pluginConfig.json"
else
    # Check if jq is available
    if command -v jq &> /dev/null; then
        # Use jq to add the extension to the .extensions array
        jq '.extensions = [{"packageName": "@ohif/extension-xnat-datasource"}] + .extensions' "$PLUGIN_CONFIG" > "$PLUGIN_CONFIG.tmp"
        mv "$PLUGIN_CONFIG.tmp" "$PLUGIN_CONFIG"
        echo "  Added extension to pluginConfig.json using jq"
    else
        # Fallback: use Python to update the JSON
        python3 -c "
import json
import sys

with open('$PLUGIN_CONFIG', 'r') as f:
    config = json.load(f)

entry = {'packageName': '@ohif/extension-xnat-datasource'}
if entry not in config.get('extensions', []):
    config.setdefault('extensions', []).insert(0, entry)

with open('$PLUGIN_CONFIG', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "  Added extension to pluginConfig.json using Python"
        else
            echo -e "${RED}Error: Could not update pluginConfig.json (jq and python3 not available)${NC}"
            echo "  Please manually add the following entry to pluginConfig.json:"
            echo '  {"packageName": "@ohif/extension-xnat-datasource"}'
            exit 1
        fi
    fi
fi
echo -e "${GREEN}✓ pluginConfig.json updated${NC}"
echo ""

# ============================================================================
# Step 5: Restart the server
# ============================================================================
if [ "$RESTART_SERVER" = true ]; then
    echo -e "${YELLOW}[5/5] Restarting OHIF dev server...${NC}"

    # Kill existing dev server on port 3000
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "  Stopping existing dev server on port 3000..."
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi

    # Start dev server in background
    echo "  Starting dev server..."
    cd "$OHIF_ROOT/platform/app"
    APP_CONFIG=xnat yarn run dev:fast > /tmp/ohif-dev.log 2>&1 &
    DEV_PID=$!
    echo -e "${GREEN}✓ Dev server started (PID: $DEV_PID)${NC}"
    echo -e "${BLUE}  Log file: /tmp/ohif-dev.log${NC}"
    echo -e "${BLUE}  To stop: kill $DEV_PID${NC}"
    echo ""

    # Wait for server to start generating logs
    echo "  Waiting for server to start..."
    sleep 3

    # Tail the logs
    echo -e "${YELLOW}Tailing logs (Ctrl+C to exit, server will keep running)...${NC}"
    echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
    tail -f /tmp/ohif-dev.log
else
    echo -e "${GREEN}Deployment completed successfully!${NC}"
fi
