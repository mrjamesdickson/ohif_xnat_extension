#!/bin/bash

# Interactive XNAT Configuration Setup
# This script helps you create a .env file with your XNAT credentials

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env"

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       XNAT Extension Configuration Setup       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠ A .env file already exists.${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
    echo ""
fi

echo -e "${GREEN}Let's configure your XNAT connection...${NC}"
echo ""

# XNAT URL
echo -e "${YELLOW}1. XNAT Server URL${NC}"
read -p "Enter XNAT URL (e.g., https://central.xnat.org): " XNAT_URL
while [ -z "$XNAT_URL" ]; do
    echo -e "${RED}XNAT URL is required!${NC}"
    read -p "Enter XNAT URL: " XNAT_URL
done
echo ""

# Friendly Name
echo -e "${YELLOW}2. Friendly Name (Optional)${NC}"
read -p "Enter a friendly name for this XNAT server [XNAT Server]: " XNAT_FRIENDLY_NAME
XNAT_FRIENDLY_NAME=${XNAT_FRIENDLY_NAME:-XNAT Server}
echo ""

# Authentication Method
echo -e "${YELLOW}3. Authentication Method${NC}"
echo "Choose authentication method:"
echo "  1) Username & Password"
echo "  2) API Token (recommended)"
read -p "Select option (1 or 2): " AUTH_METHOD
echo ""

XNAT_USERNAME=""
XNAT_PASSWORD=""
XNAT_TOKEN=""

if [ "$AUTH_METHOD" == "1" ]; then
    echo -e "${YELLOW}Username & Password Authentication${NC}"
    read -p "Enter username: " XNAT_USERNAME
    read -sp "Enter password: " XNAT_PASSWORD
    echo ""
elif [ "$AUTH_METHOD" == "2" ]; then
    echo -e "${YELLOW}API Token Authentication${NC}"
    echo "To generate a token:"
    echo "  1. Log into XNAT"
    echo "  2. Go to My Account → Manage API Keys"
    echo "  3. Create new token"
    echo ""
    read -sp "Enter API token: " XNAT_TOKEN
    echo ""
else
    echo -e "${RED}Invalid option. No authentication will be configured.${NC}"
fi
echo ""

# Timeout
echo -e "${YELLOW}4. Request Timeout (Optional)${NC}"
read -p "Enter timeout in milliseconds [30000]: " XNAT_TIMEOUT
XNAT_TIMEOUT=${XNAT_TIMEOUT:-30000}
echo ""

# Create .env file
echo -e "${GREEN}Creating .env file...${NC}"
cat > "$ENV_FILE" << EOF
# XNAT Extension Configuration
# Generated: $(date)

# XNAT Server URL (required)
XNAT_URL=$XNAT_URL

EOF

if [ -n "$XNAT_USERNAME" ] && [ -n "$XNAT_PASSWORD" ]; then
    cat >> "$ENV_FILE" << EOF
# Authentication: Username & Password
XNAT_USERNAME=$XNAT_USERNAME
XNAT_PASSWORD=$XNAT_PASSWORD

EOF
elif [ -n "$XNAT_TOKEN" ]; then
    cat >> "$ENV_FILE" << EOF
# Authentication: API Token
XNAT_TOKEN=$XNAT_TOKEN

EOF
else
    cat >> "$ENV_FILE" << EOF
# Authentication: Not configured
# XNAT_USERNAME=
# XNAT_PASSWORD=
# OR
# XNAT_TOKEN=

EOF
fi

cat >> "$ENV_FILE" << EOF
# Optional: Friendly name for the XNAT server
XNAT_FRIENDLY_NAME=$XNAT_FRIENDLY_NAME

# Optional: Request timeout in milliseconds
XNAT_TIMEOUT=$XNAT_TIMEOUT
EOF

echo -e "${GREEN}✓ Configuration saved to $ENV_FILE${NC}"
echo ""

# Show summary
echo -e "${BLUE}Configuration Summary:${NC}"
echo "  XNAT URL: $XNAT_URL"
echo "  Friendly Name: $XNAT_FRIENDLY_NAME"
if [ -n "$XNAT_USERNAME" ]; then
    echo "  Auth Method: Username/Password"
    echo "  Username: $XNAT_USERNAME"
elif [ -n "$XNAT_TOKEN" ]; then
    echo "  Auth Method: API Token"
else
    echo "  Auth Method: None"
fi
echo "  Timeout: ${XNAT_TIMEOUT}ms"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Configuration Complete!               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Deploy the extension with your configuration:"
echo "   ${GREEN}./build-and-deploy.sh /path/to/ohif-viewer${NC}"
echo ""
echo "2. The deployment will automatically create a configured"
echo "   xnat.js file in your OHIF installation"
echo ""
echo "3. Start OHIF with the auto-generated config:"
echo "   ${GREEN}cd /path/to/ohif-viewer${NC}"
echo "   ${GREEN}APP_CONFIG=xnat yarn run dev${NC}"
echo ""
echo "To edit your configuration later:"
echo "  nano $ENV_FILE"
echo ""
