#!/bin/bash

# Build and Deploy XNAT Extension to OHIF Viewer
# Usage: ./build-and-deploy.sh /path/to/ohif-viewer [--restart]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  OHIF XNAT Extension - Build & Deploy Script  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load .env file if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${GREEN}Loading configuration from .env file...${NC}"
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
    CONFIG_LOADED=true
else
    echo -e "${YELLOW}No .env file found. Configuration will use defaults.${NC}"
    echo -e "${YELLOW}To configure XNAT settings, copy .env.example to .env${NC}"
    CONFIG_LOADED=false
fi
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
    echo "Usage: ./build-and-deploy.sh /path/to/ohif-viewer [--restart]"
    echo ""
    echo "Options:"
    echo "  --restart    Restart the OHIF dev server after deployment"
    echo ""
    echo "Example:"
    echo "  ./build-and-deploy.sh ~/projects/ohif-viewer --restart"
    exit 1
fi

# Verify OHIF directory exists
if [ ! -d "$OHIF_ROOT" ]; then
    echo -e "${RED}Error: OHIF directory not found: $OHIF_ROOT${NC}"
    exit 1
fi

# Convert to absolute path
OHIF_ROOT="$( cd "$OHIF_ROOT" && pwd )"

# Set paths
EXTENSION_DIR="$OHIF_ROOT/extensions/xnat-datasource"
PLUGIN_CONFIG="$OHIF_ROOT/platform/viewer/pluginConfig.json"

# Verify it's an OHIF installation
if [ ! -d "$OHIF_ROOT/extensions" ]; then
    echo -e "${RED}Error: Not a valid OHIF installation (no extensions/ directory)${NC}"
    exit 1
fi

# Detect package manager (yarn or npm) in extension
if [ -f "$SCRIPT_DIR/yarn.lock" ]; then
    EXT_PKG_MANAGER="yarn"
elif [ -f "$SCRIPT_DIR/package-lock.json" ]; then
    EXT_PKG_MANAGER="npm"
else
    EXT_PKG_MANAGER="npm"
fi

# Detect package manager in OHIF
if [ -f "$OHIF_ROOT/yarn.lock" ]; then
    OHIF_PKG_MANAGER="yarn"
elif [ -f "$OHIF_ROOT/package-lock.json" ]; then
    OHIF_PKG_MANAGER="npm"
else
    OHIF_PKG_MANAGER="yarn"
fi

echo -e "${GREEN}Configuration:${NC}"
echo "  Extension directory: $SCRIPT_DIR"
echo "  OHIF root: $OHIF_ROOT"
echo "  Extension pkg manager: $EXT_PKG_MANAGER"
echo "  OHIF pkg manager: $OHIF_PKG_MANAGER"
echo ""

# ============================================================================
# Step 1: Install dependencies in extension
# ============================================================================

echo -e "${YELLOW}[1/9] Installing extension dependencies...${NC}"
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
    if [ "$EXT_PKG_MANAGER" = "yarn" ]; then
        yarn --ignore-engines
    else
        npm install --legacy-peer-deps
    fi
    echo -e "${GREEN}✓ Extension dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi
echo ""

# ============================================================================
# Step 2: Build the extension
# ============================================================================

echo -e "${YELLOW}[2/9] Building extension...${NC}"
cd "$SCRIPT_DIR"

if [ "$EXT_PKG_MANAGER" = "yarn" ]; then
    yarn build
else
    npm run build
fi
echo -e "${GREEN}✓ Extension built successfully${NC}"
echo ""

# Verify build output exists
if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo -e "${RED}Error: Build failed - dist directory not created${NC}"
    exit 1
fi

# ============================================================================

# Step 3: Copy extension to OHIF (SKIPPED)

# ============================================================================

# echo -e "${YELLOW}[3/9] Deploying extension to OHIF...${NC}"
echo ""

# ============================================================================
# Step 4: Install extension dependencies in OHIF context
# ============================================================================

echo -e "${YELLOW}[4/9] Installing extension dependencies in OHIF context...${NC}"
cd "$EXTENSION_DIR"

if [ "$OHIF_PKG_MANAGER" = "yarn" ]; then
    yarn --ignore-engines 2>/dev/null || echo "  (Yarn install skipped - will be handled by workspace)"
else
    npm install --legacy-peer-deps 2>/dev/null || echo "  (NPM install skipped - will be handled by workspace)"
fi
echo -e "${GREEN}✓ Extension dependencies ready${NC}"
echo ""

# ============================================================================
# Step 5: Update pluginConfig.json
# ============================================================================
echo -e "${YELLOW}[5/9] Copying pluginConfig.json...${NC}"

# Find pluginConfig.json in common locations
PLUGIN_CONFIG_FOUND=""
for location in "$OHIF_ROOT/platform/app/pluginConfig.json" "$OHIF_ROOT/platform/viewer/pluginConfig.json" "$OHIF_ROOT/pluginConfig.json"; do
    if [ -f "$location" ]; then
        PLUGIN_CONFIG="$location"
        PLUGIN_CONFIG_FOUND="yes"
        break
    fi
done

if [ "$PLUGIN_CONFIG_FOUND" = "yes" ]; then
    # Check if extension is already in config
    if grep -q "@ohif/extension-xnat-datasource" "$PLUGIN_CONFIG"; then
        echo "  Extension already in pluginConfig.json"
    else
        # Create backup
        cp "$PLUGIN_CONFIG" "$PLUGIN_CONFIG.backup"
        echo "  Backup created: $PLUGIN_CONFIG.backup"

        # Add extension to pluginConfig.json using Python/Node/manual edit
        if command -v python3 &> /dev/null; then
            PLUGIN_CONFIG_PATH="$PLUGIN_CONFIG" python3 << 'EOF'
import json
import os

config_file = os.environ['PLUGIN_CONFIG_PATH']

with open(config_file, 'r') as f:
    config = json.load(f)

# Check if extensions array exists
if 'extensions' not in config:
    config['extensions'] = []

# Check if already exists
exists = any(ext.get('packageName') == '@ohif/extension-xnat-datasource' for ext in config['extensions'])

if not exists:
    # Add at the beginning
    config['extensions'].insert(0, {'packageName': '@ohif/extension-xnat-datasource'})

    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)
    print('added')
else:
    print('exists')
EOF
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}  ✓ XNAT extension added to pluginConfig.json${NC}"
            fi
        elif command -v node &> /dev/null; then
            PLUGIN_CONFIG_PATH="$PLUGIN_CONFIG" node << 'EOF'
const fs = require('fs');
const configFile = process.env.PLUGIN_CONFIG_PATH;

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

if (!config.extensions) {
    config.extensions = [];
}

const exists = config.extensions.some(ext => ext.packageName === '@ohif/extension-xnat-datasource');

if (!exists) {
    config.extensions.unshift({ packageName: '@ohif/extension-xnat-datasource' });
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
    console.log('added');
} else {
    console.log('exists');
}
EOF
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}  ✓ XNAT extension added to pluginConfig.json${NC}"
            fi
        else
            echo -e "${YELLOW}  Manual action required: Add the following to $PLUGIN_CONFIG:${NC}"
            echo ""
            echo -e "${BLUE}    {${NC}"
            echo -e "${BLUE}      \"packageName\": \"@ohif/extension-xnat-datasource\"${NC}"
            echo -e "${BLUE}    }${NC}"
            echo ""
        fi
    fi
else
    echo -e "${YELLOW}  Warning: pluginConfig.json not found${NC}"
    echo "  Searched locations:"
    echo "    - $OHIF_ROOT/platform/app/pluginConfig.json"
    echo "    - $OHIF_ROOT/platform/viewer/pluginConfig.json"
    echo "    - $OHIF_ROOT/pluginConfig.json"
fi
echo -e "${GREEN}✓ Configuration updated${NC}"
echo ""

# ============================================================================
# Step 6: Create symlink in node_modules
# ============================================================================
echo -e "${YELLOW}[6/9] Creating symlink in node_modules...${NC}"
cd "$OHIF_ROOT"

# Create symlink so webpack can find the extension
NMDIR="$OHIF_ROOT/node_modules/@ohif"
mkdir -p "$NMDIR"
if [ -L "$NMDIR/extension-xnat-datasource" ]; then
    rm "$NMDIR/extension-xnat-datasource"
fi
ln -s "$SCRIPT_DIR" "$NMDIR/extension-xnat-datasource"
echo -e "${GREEN}✓ Symlink created: node_modules/@ohif/extension-xnat-datasource${NC}"
echo ""

# ============================================================================
# Step 7: Rebuild OHIF workspace
# ============================================================================
echo -e "${YELLOW}[7/9] Rebuilding OHIF workspace...${NC}"
cd "$OHIF_ROOT"

if [ "$OHIF_PKG_MANAGER" = "yarn" ]; then
    echo "  Running yarn..."
    yarn --ignore-engines
else
    echo "  Running npm install..."
    npm install --legacy-peer-deps
fi
echo -e "${GREEN}✓ OHIF workspace rebuilt${NC}"
echo ""

# ============================================================================
# Create XNAT configuration
# ============================================================================

echo -e "${YELLOW}Creating XNAT configuration files...${NC}"
mkdir -p "$OHIF_ROOT/public/config"

# Always create/update example config
EXAMPLE_CONFIG="$OHIF_ROOT/public/config/xnat-example.js"
cat > "$EXAMPLE_CONFIG" << 'EOF'
/**
 * XNAT Extension Configuration Example
 * Copy this to default.js or your main config file
 */
window.config = {
  extensions: [
    '@ohif/extension-xnat-datasource',
    '@ohif/extension-default',
    '@ohif/extension-cornerstone',
    '@ohif/extension-cornerstone-dicom-sr',
  ],
  modes: [
    '@ohif/mode-longitudinal',
  ],
  dataSources: [
    {
      namespace: '@ohif/extension-xnat-datasource',
      sourceName: 'xnat',
      configuration: {
        friendlyName: 'XNAT Server',
        xnatUrl: process.env.XNAT_URL || 'https://central.xnat.org',
        username: process.env.XNAT_USERNAME || '',
        password: process.env.XNAT_PASSWORD || '',
        // Or use token: process.env.XNAT_TOKEN || '',
      },
    },
  ],
  defaultDataSourceName: 'xnat',
};
EOF
echo -e "${GREEN}✓ Example config created: $EXAMPLE_CONFIG${NC}"

# If .env was loaded, create configured file
if [ "$CONFIG_LOADED" = true ]; then
    XNAT_CONFIG="$OHIF_ROOT/public/config/xnat.js"

    # Set defaults if not provided
    XNAT_URL="${XNAT_URL:-https://central.xnat.org}"
    XNAT_FRIENDLY_NAME="${XNAT_FRIENDLY_NAME:-XNAT Server}"
    XNAT_USERNAME="${XNAT_USERNAME:-}"
    XNAT_PASSWORD="${XNAT_PASSWORD:-}"
    XNAT_TOKEN="${XNAT_TOKEN:-}"
    XNAT_TIMEOUT="${XNAT_TIMEOUT:-30000}"

    echo -e "${GREEN}✓ Creating configured XNAT config from .env: $XNAT_CONFIG${NC}"

    # Determine authentication method
    if [ -n "$XNAT_TOKEN" ]; then
        AUTH_CONFIG="token: '$XNAT_TOKEN',"
        AUTH_COMMENT="// Using API token authentication"
    elif [ -n "$XNAT_USERNAME" ] && [ -n "$XNAT_PASSWORD" ]; then
        AUTH_CONFIG="username: '$XNAT_USERNAME',
        password: '$XNAT_PASSWORD',"
        AUTH_COMMENT="// Using username/password authentication"
    else
        AUTH_CONFIG="// No authentication configured"
        AUTH_COMMENT="// WARNING: No authentication credentials provided"
    fi

    # Also create in platform/app/public/xnat for APP_CONFIG support
    XNAT_APP_CONFIG_DIR="$OHIF_ROOT/platform/app/public/xnat"
    mkdir -p "$XNAT_APP_CONFIG_DIR"

    cat > "$XNAT_CONFIG" << EOF
/**
 * XNAT Extension Configuration
 * Auto-generated from .env file
 * Generated: $(date)
 */
window.config = {
  name: 'config/xnat.js',
  routerBasename: '/',
  dangerouslyUseDynamicConfig: {
    enabled: false,
  },
  extensions: [
    '@ohif/extension-xnat-datasource',
    '@ohif/extension-default',
    '@ohif/extension-cornerstone',
    '@ohif/extension-cornerstone-dicom-sr',
  ],
  modes: [
    '@ohif/mode-longitudinal',
  ],
  customizationService: {
    default: {
      studyListFunctionsEnabled: true,
    },
  },
  showStudyList: true,
  studyListDataSource: 'xnat',
  maxNumberOfWebWorkers: 3,
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  strictZSpacingForVolumeViewport: true,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: false,
  maxNumRequests: {
    interaction: 100,
    thumbnail: 75,
    prefetch: 25,
  },
  dataSources: [
    {
      namespace: '@ohif/extension-xnat-datasource',
      sourceName: 'xnat',
      configuration: {
        friendlyName: '$XNAT_FRIENDLY_NAME',
        xnatUrl: '$XNAT_URL',
        $AUTH_COMMENT
        $AUTH_CONFIG
        timeout: $XNAT_TIMEOUT,
      },
    },
  ],
  defaultDataSourceName: 'xnat',
  httpErrorHandler: error => {
    console.warn('HTTP Error:', error.status);
  },
};
EOF

    # Copy to APP_CONFIG directory for webpack
    cp "$XNAT_CONFIG" "$XNAT_APP_CONFIG_DIR/app-config.js"

    echo -e "${GREEN}✓ Configured XNAT config created with settings from .env${NC}"
    echo -e "${BLUE}  Config file: $XNAT_CONFIG${NC}"
    echo -e "${BLUE}  APP_CONFIG file: $XNAT_APP_CONFIG_DIR/app-config.js${NC}"
    echo -e "${BLUE}  XNAT URL: $XNAT_URL${NC}"
    echo -e "${BLUE}  Friendly Name: $XNAT_FRIENDLY_NAME${NC}"
    if [ -n "$XNAT_TOKEN" ]; then
        echo -e "${BLUE}  Auth: API Token${NC}"
    elif [ -n "$XNAT_USERNAME" ]; then
        echo -e "${BLUE}  Auth: Username ($XNAT_USERNAME)${NC}"
    else
        echo -e "${YELLOW}  Auth: None configured${NC}"
    fi
fi
echo ""

# ============================================================================
# Step 8: Hotfix DataSourceWrapper.tsx
# ============================================================================
echo -e "${YELLOW}[8/9] Applying hotfix for DataSourceWrapper.tsx...${NC}"
cp "$SCRIPT_DIR/config/DataSourceWrapper-routes.tsx" "$OHIF_ROOT/platform/app/src/routes/DataSourceWrapper.tsx"
echo -e "${GREEN}✓ DataSourceWrapper.tsx hotfixed${NC}"

# ============================================================================
# Step 9: Hotfix rsbuild.config.ts
# ============================================================================
echo -e "${YELLOW}[9/9] Applying hotfix for rsbuild.config.ts...${NC}"
cp "$SCRIPT_DIR/config/rsbuild.config.ts" "$OHIF_ROOT/rsbuild.config.ts"
echo -e "${GREEN}✓ rsbuild.config.ts hotfixed${NC}"

# ============================================================================
# Success message
# ============================================================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Deployment Completed Successfully!     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""

if [ "$CONFIG_LOADED" = true ]; then
    echo -e "${YELLOW}1. Use Auto-Generated XNAT Configuration${NC}"
    echo "   Your XNAT settings have been configured automatically!"
    echo "   Config file: ${GREEN}$OHIF_ROOT/public/config/xnat.js${NC}"
    echo ""
    echo "   To use it, update your OHIF viewer startup to use this config:"
    echo "   - Option A: Set APP_CONFIG environment variable"
    echo "     export APP_CONFIG=xnat"
    echo "   - Option B: Copy/merge into public/config/default.js"
    echo ""
else
    echo -e "${YELLOW}1. Configure XNAT Data Source${NC}"
    echo "   ${YELLOW}No .env file found - manual configuration required${NC}"
    echo "   To auto-configure on next deployment:"
    echo "     cp $SCRIPT_DIR/.env.example $SCRIPT_DIR/.env"
    echo "     # Edit .env with your XNAT credentials"
    echo "     ./build-and-deploy.sh $OHIF_ROOT"
    echo ""
    echo "   Or manually edit: $OHIF_ROOT/public/config/default.js"
    echo "   See example: $EXAMPLE_CONFIG"
    echo ""
fi

echo -e "${YELLOW}2. Verify Plugin Configuration${NC}"
echo "   Check that $PLUGIN_CONFIG"
echo "   includes the XNAT extension in the extensions array"
echo ""
echo -e "${YELLOW}3. Start OHIF Viewer${NC}"
echo "   cd $OHIF_ROOT"
if [ "$OHIF_PKG_MANAGER" = "yarn" ]; then
    if [ "$CONFIG_LOADED" = true ]; then
        echo "   APP_CONFIG=xnat yarn run dev"
    else
        echo "   yarn run dev"
    fi
else
    if [ "$CONFIG_LOADED" = true ]; then
        echo "   APP_CONFIG=xnat npm run dev"
    else
        echo "   npm run dev"
    fi
fi
echo ""
echo -e "${YELLOW}4. Verify Installation${NC}"
echo "   Open browser console and look for:"
    echo "   ${GREEN}'XNAT extension initialized'${NC}"
if [ "$CONFIG_LOADED" = true ]; then
    echo "   ${GREEN}'Connected to XNAT: $XNAT_URL'${NC}"
fi
echo ""
echo -e "${YELLOW}5. Test with XNAT Study${NC}"
echo "   http://localhost:3000/?StudyInstanceUID=YOUR_EXPERIMENT_ID"
echo ""
echo -e "${BLUE}Configuration Files:${NC}"
echo "   Example config: $EXAMPLE_CONFIG"
if [ "$CONFIG_LOADED" = true ]; then
    echo "   ${GREEN}Active config: $XNAT_CONFIG${NC}"
fi
echo ""
echo -e "${BLUE}Troubleshooting:${NC}"
echo "   - Check browser console for errors"
    echo "   - Verify XNAT server is accessible"
    echo "   - Ensure CORS is configured on XNAT"
    echo "   - See INTEGRATION.md for detailed help"
echo ""

# ============================================================================
# Restart dev server if requested
# ============================================================================
if [ "$RESTART_SERVER" = true ]; then
    echo -e "${YELLOW}Restarting OHIF dev server...${NC}"

    # Kill existing dev server on port 3000
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "  Stopping existing dev server on port 3000..."
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi

    # Clear webpack cache
    if [ -d "$OHIF_ROOT/node_modules/.cache" ]; then
        echo "  Clearing webpack cache..."
        rm -rf "$OHIF_ROOT/node_modules/.cache"
    fi

    # Start dev server in background
    echo "  Starting dev server..."
    cd "$OHIF_ROOT/platform/app"

    if [ "$CONFIG_LOADED" = true ]; then
        if [ "$OHIF_PKG_MANAGER" = "yarn" ]; then
            APP_CONFIG=xnat yarn run dev > /tmp/ohif-dev.log 2>&1 &
        else
            APP_CONFIG=xnat npm run dev > /tmp/ohif-dev.log 2>&1 &
        fi
    else
        if [ "$OHIF_PKG_MANAGER" = "yarn" ]; then
            yarn run dev > /tmp/ohif-dev.log 2>&1 &
        else
            npm run dev > /tmp/ohif-dev.log 2>&1 &
        fi
    fi

    DEV_PID=$!
    echo -e "${GREEN}✓ Dev server started (PID: $DEV_PID)${NC}"
    echo -e "${BLUE}  Log file: /tmp/ohif-dev.log${NC}"
    echo -e "${BLUE}  To stop: kill $DEV_PID${NC}"
    echo ""
fi