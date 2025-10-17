# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an OHIF v3 extension that enables loading and displaying DICOM images from XNAT imaging archives. The extension provides a custom data source and image loader that integrates XNAT's REST API with OHIF Viewer's architecture.

## Current Status (Oct 17, 2025)

### Recent Work
**Fixed missing SeriesInstanceUID/StudyInstanceUID extraction (Oct 17)**:
- ✅ Added `(0020,000E)` SeriesInstanceUID and `(0020,000D)` StudyInstanceUID to DICOM tag extraction in `getFileDicomMetadata()`
- These critical tags were being parsed but not extracted, causing scans to be skipped with "Missing SeriesInstanceUID" errors
- Now extracts 15+ tags including both UIDs from first 64KB of each DICOM file
- Test: `tests/fetchDicomHeader.test.mjs` confirms both UIDs are now present

**Migrated from dicomdump REST API to HTTP Range requests**:
- The `/REST/services/dicomdump` endpoint on demo02.xnatworks.io is broken/disabled (returns 404 or empty results)
- Replaced with direct DICOM file fetching using HTTP Range headers (`Range: bytes=0-65535`)
- Fetches only first 64KB of each DICOM file to extract header metadata
- Uses `dicom-parser` with `untilTag: 'x7fe00010'` to parse partial data (stops before pixel data)
- Correct XNAT path is `/data/experiments/.../files/...` NOT `/archive/projects/.../files/...`

### Known Issues
1. **Slice sorting** - Need to verify if slices display in correct anatomical order
2. **Missing Rows/Columns warnings** - Some DICOM files don't have Rows/Columns tags in the first 64KB, defaults are used (this is harmless)

## Build and Development Commands

### Building
```bash
npm run build        # Copy src/ to dist/
npm run dev          # Same as build (watch mode not implemented)
```

### Testing
```bash
npm test                      # Run unit tests (tests/*.mjs)
npm run test:connection       # Test XNAT connectivity (requires .env)
node test-xnat-connection.js  # Same as above
```

### Deployment

**⚠️ CRITICAL WORKFLOW - ALWAYS FOLLOW THIS EXACT SEQUENCE**:

```bash
# 1. FIRST: Stop the dev server (kill port 3000)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 2. THEN: Deploy (rebuilds, clears caches, starts fresh server)
./deploy.sh

# 3. FINALLY: Clear browser cache
# In browser DevTools:
#   Application tab > Storage > Clear site data
#   Then hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+F5 (Windows)
```

**Why this sequence is mandatory**:
- Webpack serves bundles from memory cache if dev server is running during rebuild
- Stopping server BEFORE rebuild ensures webpack doesn't serve stale cached modules
- Browser cache persists old JavaScript bundles and service workers
- **NEVER skip stopping the server first** - this is the #1 cause of "changes not appearing"

**What deploy.sh does**:
1. Rebuilds the plugin dist (`npm run build:copy`)
2. Copies to `../ohif_viewer/node_modules/@ohif/extension-xnat-datasource/dist/`
3. **Clears ALL webpack caches** (`node_modules/.cache`, `platform/app/dist`, `platform/app/.cache`)
4. Stops old dev server if running (but you should do this manually FIRST)
5. Starts fresh dev server

**Verifying deployment**:
```bash
./verify-deploy.sh   # Confirms the deployed files have the latest code
```
This script checks:
- Deployed files exist in node_modules
- Critical fixes are present (SeriesInstanceUID extraction, etc.)
- File timestamps match recent deploy
- All expected DICOM tags are being extracted

**Alternative deployment commands**:
```bash
./build-and-deploy.sh /path/to/ohif-viewer --restart  # Full build and deploy with npm link
```

**Common deployment mistakes**:
❌ Running `./deploy.sh` while dev server is still running → serves stale cached code
❌ Not clearing browser cache → browser serves old JavaScript bundle
❌ Not hard refreshing → service worker serves cached assets
✅ **ALWAYS**: Stop server → Deploy → Clear browser cache → Hard refresh

## Architecture Overview

### Core Components

**Extension Entry (`src/index.js`)**
- Exports extension with `preRegistration` hook and `getDataSourcesModule`
- `preRegistration`: Registers XNAT image loader with Cornerstone using `registerImageLoader('xnat', XNATImageLoader.loadImage)`
- Configures image loader with XNAT credentials from config

**XNATClient (`src/XNATClient.js`)**
- XNAT REST API client handling authentication (Basic or Bearer token)
- Key methods:
  - `getProjects()`, `getSubjects()`, `getExperiments()`, `getScans()`, `getScanFiles()`
  - `resolveStudyInstanceUID()`: Converts DICOM UIDs to XNAT experiment IDs
  - `getStudyMetadata()`: Fetches complete study/series/instance metadata
  - `getScanDicomMetadata()`: **Now uses HTTP Range requests** to fetch first file's DICOM header (was dicomdump)
  - `getFileDicomMetadata()`: Fetches DICOM header via HTTP Range (`bytes=0-65535`) and parses with dicom-parser
  - `getScanFilesDicomMetadata()`: Batch fetches metadata for all files in a scan with concurrency control
  - `searchForStudies()`: Query interface for OHIF study list
- **Critical**: Always requires actual DICOM StudyInstanceUID - never generates fallback UIDs
- **Metadata extraction**: Uses `/data/experiments/{experimentId}/scans/{scanId}/resources/{resourceId}/files/{fileName}` endpoint
- Implements sophisticated file sorting by `ImagePositionPatient` for proper 3D volume ordering (currently not working - see Known Issues)

**XNATDataSource (`src/XNATDataSource.js`)**
- OHIF data source implementation
- Provides study query interface and metadata retrieval
- Key functions:
  - `query.studies.search()`: Returns study list for worklist
  - `query.series.search()`: Returns series for a study
  - `retrieve.series.metadata()`: Fetches and formats complete metadata for OHIF
- Handles multi-frame DICOM volumes by expanding frames into individual instances
- Computes proper `ImagePositionPatient` for each frame using orientation vectors
- Populates `DicomMetadataStore` with series summary and instances
- Supports project filtering via `setProjectFilter()` and localStorage persistence

**XNATImageLoader (`src/XNATImageLoader.js`)**
- Cornerstone image loader for `xnat:` scheme
- `loadImage(imageId)`: Parses `xnat:URL?frame=N`, fetches DICOM, extracts pixel data
- Implements 512MB DICOM file cache with LRU eviction
- Handles multi-frame images by extracting specific frame from pixel data
- Registers metadata provider with Cornerstone for image plane, pixel, VOI LUT modules
- Computes frame positions for 4D data using temporal metadata

**XNATImageLoader.utils (`src/XNATImageLoader.utils.js`)**
- Utility functions for DICOM metadata parsing
- `parseImageId()`: Extracts URL and frame index from imageId
- `getFunctionalGroupValue()`: Searches multi-frame functional groups for metadata
- `parseTemporalPosition()`: Extracts temporal metadata for 4D volumes

### Data Flow

```
Study List → XNATDataSource.query.studies.search()
           → XNATClient.searchForStudies()
           → Returns studies with DICOM StudyInstanceUID

Study Open → XNATDataSource.retrieve.series.metadata(StudyInstanceUID)
           → XNATClient.resolveStudyInstanceUID() → {experimentId, projectId}
           → XNATClient.getStudyMetadata(experimentId, StudyInstanceUID, projectId)
           → Fetches scans, files, DICOM metadata via dicomdump
           → Sorts files by ImagePositionPatient for proper ordering
           → Expands multi-frame volumes into individual frame instances
           → Populates DicomMetadataStore

Image Load → Cornerstone requests imageId: "xnat:https://xnat.org/.../file.dcm?frame=0"
           → XNATImageLoader.loadImage()
           → Fetches DICOM from cache or XNAT with auth headers
           → Parses DICOM, extracts frame pixel data
           → Returns Cornerstone image object
```

### Key Design Decisions

1. **Real DICOM UIDs Required**: The extension uses actual DICOM SeriesInstanceUID and StudyInstanceUID from XNAT metadata. Generated fallback UIDs were removed to ensure cross-system compatibility.

2. **Multi-frame Handling**: Multi-frame DICOM files (4D volumes) are expanded into individual frame instances with computed positions. Sorting is by InstanceNumber first, then FrameNumber to maintain spatial ordering.

3. **File Ordering**: Files are sorted by `positionAlongNormal` (dot product of position and normal vector) to ensure correct slice ordering for oblique acquisitions.

4. **Metadata Sources**:
   - Scan-level metadata from `/REST/services/dicomdump?src=/archive/projects/.../scans/...`
   - File-level metadata fetched for each DICOM file to enable per-slice geometry
   - Fallback to defaults only when DICOM metadata is unavailable

5. **Project Filtering**: Uses `AccessionNumber` field in OHIF study list as project filter. Persisted to localStorage for convenience.

6. **DICOM File Caching**: 512MB cache implemented in image loader to avoid re-fetching same files for multi-frame volumes.

## Configuration

The extension expects configuration in OHIF's `window.config`:

```javascript
{
  dataSources: [{
    namespace: '@ohif/extension-xnat-datasource',
    sourceName: 'xnat',
    configuration: {
      xnatUrl: 'https://xnat.example.org',
      username: 'user',           // OR
      password: 'pass',            // OR
      token: 'api-token',          // Preferred
      promptForProject: true,      // Show project selection dialog
      rememberProjectSelection: true,
      defaultProject: 'PROJECT_ID',
      studySearchLimit: 100,
    }
  }]
}
```

## Important Implementation Notes

### Multi-frame Volume Handling

The extension supports both single-frame and multi-frame DICOM files:
- Each multi-frame file is expanded into N instances (one per frame)
- Frame positions are computed using orientation vectors and slice spacing
- Temporal metadata (TemporalPositionIndex, FrameTime) is preserved per frame
- Both 3D (spatial) and 4D (spatial + temporal) volumes are supported

### DICOM Metadata Requirements

Critical DICOM tags that **must** be present:
- `SeriesInstanceUID (0020,000E)` - Scans missing this are **skipped**
- `StudyInstanceUID (0020,000D)` - Required for proper study association

Tags with fallback defaults (logged as warnings):
- `ImageOrientationPatient (0020,0037)` → defaults to `[1,0,0,0,1,0]`
- `ImagePositionPatient (0020,0032)` → defaults to `[0,0,0]`
- `PixelSpacing (0028,0030)` → defaults to `[1,1]`
- `SliceThickness (0018,0050)` → defaults to `1.0`
- `Rows/Columns (0028,0010/0011)` → defaults to `512`

### Error Handling

- Missing SeriesInstanceUID: Scan is skipped with console warning
- Failed dicomdump request: Scan is skipped (no fallback generation)
- Missing StudyInstanceUID in study list: Experiment is filtered out
- Network errors: Propagated to OHIF with user-facing error dialog

### Debugging Utilities

Global window utilities exposed:
```javascript
window.xnatProjects           // Array of available projects
window.xnatSetProject('ID')   // Set project filter
window.xnatListProjects()     // Console table of projects
window.xnatImageCache.getStats()  // Cache statistics
window.xnatImageCache.clear()     // Clear DICOM cache
```

## File Structure

```
src/
  index.js                    # Extension entry point
  init.js                     # Extension initialization (if present)
  XNATClient.js              # XNAT REST API client (1060 lines)
  XNATDataSource.js          # OHIF data source (956 lines)
  XNATImageLoader.js         # Cornerstone image loader (515 lines)
  XNATImageLoader.utils.js   # Image loader utilities

config/
  DataSourceWrapper.tsx      # OHIF component for data source routing
  DataSourceWrapper-routes.tsx

tests/                       # Unit tests (*.mjs)
deploy.sh                    # Local deployment script
build-and-deploy.sh         # Full deployment with npm link
package.json                 # Dependencies: axios, dcmjs, dicom-parser
```

## Testing Workflow

1. **Connection Test**: `npm run test:connection` - Requires `.env` file with XNAT credentials
2. **Unit Tests**: `npm test` - Runs tests/*.mjs files
3. **Manual Testing**: Use OHIF study list to verify:
   - Study list loads with proper DICOM UIDs
   - Series load without errors
   - Images display correctly
   - Multi-frame volumes show all frames
   - Slice ordering is correct (check with MPR views)

## Common Development Tasks

### Adding DICOM Metadata Fields

1. Add tag extraction in `XNATClient.getStudyMetadata()` using `getTagValue('(####,####)')`
2. Add to instance metadata object returned by `XNATClient`
3. Update `XNATDataSource.retrieve.series.metadata()` to include in formatted metadata
4. Add to `XNATImageLoader` metadata modules if needed for Cornerstone

### Debugging Slice Ordering Issues

1. Check console logs for "sorted N files by ImagePositionPatient"
2. Verify `ImageOrientationPatient` is correct (not default fallback)
3. Check `positionAlongNormal` calculation in `XNATClient.getStudyMetadata()`
4. Use OHIF's MPR views to verify anatomical correctness

### Debugging Multi-frame Issues

1. Check `NumberOfFrames` tag extraction
2. Verify frame expansion in `XNATDataSource.retrieve.series.metadata()`
3. Check frame position calculation (baseOffset + frameOffset)
4. Verify `TemporalPositionIndex` for 4D volumes
5. Check image loader frame extraction by pixel data offset

## Dependencies

- `@ohif/core`: OHIF core services and metadata store
- `@cornerstonejs/core`: Image rendering and metadata providers
- `axios`: HTTP client for XNAT REST API
- `dicom-parser`: DICOM file parsing
- `dcmjs`: DICOM utilities
- React: UI components (project selection dialog)
