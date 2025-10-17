#!/usr/bin/env bash
# Verify that the plugin is deployed correctly

set -euo pipefail

VIEWER_ROOT="${1:-../ohif_viewer}"
DEPLOYED_FILE="$VIEWER_ROOT/node_modules/@ohif/extension-xnat-datasource/dist/XNATClient.js"

echo "🔍 Verifying deployment..."
echo ""

if [ ! -f "$DEPLOYED_FILE" ]; then
  echo "❌ Deployed file not found: $DEPLOYED_FILE"
  exit 1
fi

echo "✅ Deployed file exists: $DEPLOYED_FILE"
echo ""

# Check for the critical fix
if grep -q "SeriesInstanceUID - CRITICAL" "$DEPLOYED_FILE"; then
  echo "✅ SeriesInstanceUID extraction is present"
else
  echo "❌ SeriesInstanceUID extraction is MISSING"
  exit 1
fi

if grep -q "StudyInstanceUID - CRITICAL" "$DEPLOYED_FILE"; then
  echo "✅ StudyInstanceUID extraction is present"
else
  echo "❌ StudyInstanceUID extraction is MISSING"
  exit 1
fi

# Check file timestamp
TIMESTAMP=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$DEPLOYED_FILE" 2>/dev/null || stat -c "%y" "$DEPLOYED_FILE" 2>/dev/null | cut -d. -f1)
echo "✅ File last modified: $TIMESTAMP"
echo ""

# Count extracted tags
TAG_COUNT=$(grep -c "{ tag1:" "$DEPLOYED_FILE" || echo "0")
echo "✅ Extracting $TAG_COUNT DICOM tags"
echo ""

echo "✅ Deployment verified successfully!"
echo ""
echo "⚠️  If browser still shows old code:"
echo "   1. Open DevTools → Application → Storage"
echo "   2. Click 'Clear site data'"
echo "   3. Hard refresh (Cmd+Shift+R or Ctrl+Shift+F5)"
