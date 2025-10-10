# Testing Guide

This guide explains how to test the XNAT extension for OHIF.

## Prerequisites

1. Extension deployed to OHIF
2. `.env` file configured with XNAT credentials
3. XNAT instance accessible and has data

## Quick Test

Run the automated connection test:

```bash
node test-xnat-connection.js
```

This will:
- Test connectivity to XNAT
- Verify authentication works
- List available projects, subjects, experiments
- Show scan information
- Provide a test URL for OHIF

## Manual Testing Steps

### 1. Test XNAT API Directly

```bash
# Load environment variables
source .env

# Test basic connection
curl -I $XNAT_URL

# Test authentication and list projects
curl -u $XNAT_USERNAME:$XNAT_PASSWORD \
  "$XNAT_URL/data/projects?format=json" | jq .

# Or with token
curl -H "Authorization: Bearer $XNAT_TOKEN" \
  "$XNAT_URL/data/projects?format=json" | jq .
```

### 2. Test Extension Loading in OHIF

Start OHIF:
```bash
cd /path/to/ohif-viewer
APP_CONFIG=xnat yarn run dev
```

Open browser console (F12) and verify:
- ✅ `XNAT extension initialized`
- ✅ No errors in console
- ✅ Extension appears in loaded extensions list

### 3. Test Study Loading

Get an experiment ID from XNAT (use test script output or API calls).

Navigate to:
```
http://localhost:3000/?StudyInstanceUID=EXPERIMENT_ID
```

**Expected behavior:**
1. Study metadata loads
2. Series appear in study panel
3. Images render in viewport
4. Can scroll through images
5. Window/level adjustments work

### 4. Browser Developer Tools Checks

#### Console Tab (F12 → Console)

Look for:
```
XNAT extension initialized
```

No errors like:
- ❌ `Failed to load resource`
- ❌ `CORS policy error`
- ❌ `401 Unauthorized`
- ❌ `Network error`

#### Network Tab (F12 → Network)

Filter by "data/experiments" or "DICOM":

**Check for:**
- ✅ API calls return 200 status
- ✅ DICOM files download successfully
- ✅ No CORS errors
- ✅ Authentication headers present

**Common issues:**
- ❌ Status 0 = CORS issue
- ❌ Status 401 = Authentication failed
- ❌ Status 404 = Experiment not found
- ❌ Status 500 = XNAT server error

### 5. Test Different Study Types

Test with various XNAT data:

**Single series study:**
```
http://localhost:3000/?StudyInstanceUID=SINGLE_SERIES_EXP
```

**Multiple series study:**
```
http://localhost:3000/?StudyInstanceUID=MULTI_SERIES_EXP
```

**Different modalities:**
- CT scan
- MRI scan
- PET scan
- X-ray

### 6. Test Authentication Methods

#### Basic Auth Test
Edit `.env`:
```bash
XNAT_USERNAME=your_username
XNAT_PASSWORD=your_password
XNAT_TOKEN=  # Leave empty
```

Redeploy and test.

#### Token Auth Test
Edit `.env`:
```bash
XNAT_USERNAME=  # Leave empty
XNAT_PASSWORD=  # Leave empty
XNAT_TOKEN=your_api_token
```

Redeploy and test.

## Automated Test Checklist

- [ ] XNAT server is reachable
- [ ] Authentication succeeds
- [ ] Can list projects
- [ ] Can list subjects
- [ ] Can list experiments
- [ ] Can list scans
- [ ] Can download DICOM files
- [ ] Extension loads in OHIF
- [ ] Study metadata displays
- [ ] Images render correctly
- [ ] Can navigate between series
- [ ] Window/level controls work
- [ ] No console errors
- [ ] No network errors

## Common Test Scenarios

### Test 1: Fresh Installation

```bash
# Start fresh
rm -rf /path/to/ohif-viewer/extensions/xnat-datasource

# Configure
./setup-config.sh

# Deploy
./build-and-deploy.sh /path/to/ohif-viewer

# Test connection
node test-xnat-connection.js

# Start OHIF
cd /path/to/ohif-viewer
APP_CONFIG=xnat yarn run dev
```

### Test 2: Credential Update

```bash
# Update credentials
./setup-config.sh

# Redeploy
./build-and-deploy.sh /path/to/ohif-viewer

# Verify connection
node test-xnat-connection.js
```

### Test 3: Multiple XNAT Instances

Create multiple configs and test switching between them.

## Troubleshooting Tests

### Connection Fails

**Check network:**
```bash
ping your-xnat-instance.org
curl -I https://your-xnat-instance.org
```

**Check credentials:**
```bash
# Try logging into XNAT web UI with same credentials
```

**Check CORS:**
```bash
curl -X OPTIONS -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -I https://your-xnat-instance.org/data/projects
```

Look for:
- `Access-Control-Allow-Origin` header
- `Access-Control-Allow-Methods` header

### Images Don't Load

**Check DICOM files exist:**
```bash
curl -u username:password \
  "https://xnat.org/data/experiments/EXP_ID/scans/1/resources/DICOM/files?format=json"
```

**Check file download:**
```bash
curl -u username:password \
  "https://xnat.org/data/experiments/EXP_ID/scans/1/resources/DICOM/files/FILE_NAME" \
  -o test.dcm

# Verify it's a valid DICOM file
file test.dcm
```

### Authentication Errors

**Test credentials directly:**
```bash
# Basic auth
curl -u username:password https://xnat.org/data/projects

# Token auth
curl -H "Authorization: Bearer TOKEN" https://xnat.org/data/projects
```

If these fail, credentials are incorrect.

## Performance Testing

### Test with Large Studies

1. Find a study with many series (>10)
2. Find a study with large images (512x512 or larger)
3. Monitor load times
4. Check memory usage in browser

### Network Performance

Use browser DevTools:
1. Open Network tab
2. Load a study
3. Check:
   - Total transfer size
   - Load time
   - Number of requests

## Integration Testing

### Test with OHIF Features

Once study loads, test:
- [ ] Layout changes (1x1, 2x2, etc.)
- [ ] Window/level presets
- [ ] Measurement tools
- [ ] Screenshot capture
- [ ] Series comparison

### Test Study List (if implemented)

Navigate to OHIF without StudyInstanceUID:
```
http://localhost:3000/
```

Should show study list from XNAT (if implemented).

## Continuous Testing

Create a test script that runs regularly:

```bash
#!/bin/bash
# test-daily.sh

echo "Running daily XNAT extension test..."

# Test connection
node test-xnat-connection.js

# Test OHIF can start
cd /path/to/ohif-viewer
yarn run build

echo "Tests complete!"
```

## Reporting Issues

When reporting issues, include:

1. **Test script output:**
   ```bash
   node test-xnat-connection.js > test-output.txt 2>&1
   ```

2. **Browser console logs** (F12 → Console → right-click → Save as...)

3. **Network logs** (F12 → Network → Export HAR)

4. **Configuration** (sanitize credentials):
   ```bash
   cat .env | sed 's/PASSWORD=.*/PASSWORD=***/' | sed 's/TOKEN=.*/TOKEN=***/'
   ```

5. **XNAT version:**
   ```bash
   curl -I https://your-xnat-instance.org | grep Server
   ```

6. **OHIF version:**
   ```bash
   cd /path/to/ohif-viewer
   git describe --tags || cat package.json | grep version
   ```

## Success Criteria

The extension is working correctly when:

✅ Test script completes without errors
✅ OHIF starts without console errors
✅ Study loads and displays images
✅ Can interact with images (scroll, window/level)
✅ Multiple series can be viewed
✅ No CORS or authentication errors
✅ Performance is acceptable (study loads in <5 seconds)

## Next Steps

After testing:

1. **Document any issues** found
2. **Note any missing features** needed
3. **Test with real clinical data** (if applicable)
4. **Verify security** (especially for production)
5. **Performance optimization** if needed
