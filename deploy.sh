#!/bin/bash

# Deploy XNAT Extension to OHIF Viewer
# Usage: ./deploy.sh /path/to/ohif-viewer

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}OHIF XNAT Extension Deployment Script${NC}"
echo "========================================"

# Check if OHIF path is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: OHIF viewer path not provided${NC}"
    echo "Usage: ./deploy.sh /path/to/ohif-viewer"
    exit 1
fi

OHIF_ROOT="$1"
EXTENSION_DIR="$OHIF_ROOT/extensions/xnat-datasource"
PLUGIN_CONFIG="$OHIF_ROOT/platform/viewer/pluginConfig.json"

# Verify OHIF directory exists
if [ ! -d "$OHIF_ROOT" ]; then
    echo -e "${RED}Error: OHIF directory not found: $OHIF_ROOT${NC}"
    exit 1
fi

# Verify it's an OHIF installation
if [ ! -d "$OHIF_ROOT/extensions" ]; then
    echo -e "${RED}Error: Not a valid OHIF installation (no extensions/ directory)${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1/5: Copying extension to OHIF...${NC}"
# Create extensions directory if it doesn't exist
mkdir -p "$OHIF_ROOT/extensions"

# Remove existing extension if present
if [ -d "$EXTENSION_DIR" ]; then
    echo "Removing existing extension..."
    rm -rf "$EXTENSION_DIR"
fi

# Copy extension
cp -r "$(pwd)" "$EXTENSION_DIR"
echo -e "${GREEN}✓ Extension copied to $EXTENSION_DIR${NC}"

echo -e "${YELLOW}Step 2/5: Installing extension dependencies...${NC}"
cd "$EXTENSION_DIR"

# Detect package manager (yarn or npm)
if [ -f "$OHIF_ROOT/yarn.lock" ]; then
    PKG_MANAGER="yarn"
elif [ -f "$OHIF_ROOT/package-lock.json" ]; then
    PKG_MANAGER="npm"
else
    # Default to yarn for OHIF
    PKG_MANAGER="yarn"
fi

echo "Using package manager: $PKG_MANAGER"

# Install dependencies
if [ "$PKG_MANAGER" = "yarn" ]; then
    yarn --ignore-engines
else
    npm install --legacy-peer-deps
fi
echo -e "${GREEN}✓ Extension dependencies installed${NC}"

echo -e "${YELLOW}Step 3/5: Updating pluginConfig.json...${NC}"
if [ -f "$PLUGIN_CONFIG" ]; then
    # Check if extension is already in config
    if grep -q "@ohif/extension-xnat-datasource" "$PLUGIN_CONFIG"; then
        echo "Extension already in pluginConfig.json"
    else
        # Create backup
        cp "$PLUGIN_CONFIG" "$PLUGIN_CONFIG.backup"
        echo "Backup created: $PLUGIN_CONFIG.backup"

        # Add extension to config (basic approach - may need manual verification)
        echo -e "${YELLOW}Please manually add the following to $PLUGIN_CONFIG:${NC}"
        echo ""
        echo '  {'
        echo '    "packageName": "@ohif/extension-xnat-datasource"'
        echo '  }'
        echo ""
    fi
else
    echo -e "${YELLOW}Warning: pluginConfig.json not found at expected location${NC}"
    echo "You may need to manually configure the extension"
fi
echo -e "${GREEN}✓ Plugin configuration checked${NC}"

echo -e "${YELLOW}Step 4/5: Reinstalling OHIF workspace dependencies...${NC}"
cd "$OHIF_ROOT"

if [ "$PKG_MANAGER" = "yarn" ]; then
    yarn --ignore-engines
else
    npm install --legacy-peer-deps
fi
echo -e "${GREEN}✓ Workspace dependencies updated${NC}"

echo -e "${YELLOW}Step 5/5: Creating example configuration...${NC}"
EXAMPLE_CONFIG="$OHIF_ROOT/public/config/xnat-example.js"
if [ ! -f "$EXAMPLE_CONFIG" ]; then
    mkdir -p "$OHIF_ROOT/public/config"
    cat > "$EXAMPLE_CONFIG" << 'EOF'
window.config = {
  extensions: [
    '@ohif/extension-xnat-datasource',
    '@ohif/extension-default',
    '@ohif/extension-cornerstone',
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
else
    echo "Example config already exists, skipping..."
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Update your OHIF config file (e.g., public/config/default.js)"
echo "   - Add '@ohif/extension-xnat-datasource' to extensions array"
echo "   - Configure XNAT data source (see $EXAMPLE_CONFIG)"
echo ""
echo "2. Verify pluginConfig.json includes the extension:"
echo "   $PLUGIN_CONFIG"
echo ""
echo "3. Start OHIF:"
echo "   cd $OHIF_ROOT"
echo "   $PKG_MANAGER run dev"
echo ""
echo -e "${YELLOW}Note: Check the console for 'XNAT extension initialized' message${NC}"
