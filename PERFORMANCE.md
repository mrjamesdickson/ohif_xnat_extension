# Performance Analysis - XNAT OHIF Extension

## Current Bottleneck: Study Metadata Loading

When a user clicks on a study in the worklist, the following sequence occurs:

### 1. Fetch Scan List (~100-500ms)
```
GET /data/experiments/{experimentId}/scans
```
Fast, returns JSON list of scans.

### 2. For Each Scan (Parallel)
For each scan, we execute:

**a) Get File List (~100-300ms per scan)**
```
GET /data/experiments/{experimentId}/scans/{scanId}/resources/DICOM/files
```

**b) Fetch First File Metadata (~200-500ms per scan)**
```
GET /data/experiments/{experimentId}/scans/{scanId}/resources/{resourceId}/files/{fileName}
Headers: Range: bytes=0-65535
```
- Fetches first 64KB of DICOM file
- Parses with dicom-parser
- Extracts ~20 DICOM tags (SeriesInstanceUID, ImageOrientation, etc.)

**c) Fetch ALL File Metadata (~N × 200-500ms per scan)**
```javascript
getScanFilesDicomMetadata({ files, concurrency: 5 })
```
- Fetches first 64KB of EVERY file in the scan
- Processes 5 files at a time (concurrency limit)
- For a 100-slice scan: 20 batches × 500ms = ~10 seconds PER SCAN

### Total Time Estimate
**For a study with 5 scans (100 slices each):**
- Scan list: 200ms
- 5 scans in parallel:
  - File lists: 300ms
  - First file metadata: 500ms
  - All files (100 each): 10,000ms
- **TOTAL: ~10-15 seconds**

## Current Code Location
File: `src/XNATClient.js`

```javascript
// Line 403: getStudyMetadata()
async getStudyMetadata(experimentId, actualStudyInstanceUID, projectId) {
  const scans = await this.getScans(experimentId);

  const series = await Promise.all(
    scans.map(async scan => {
      // Get files
      const files = await this.getScanFiles(experimentId, scan.ID);

      // Get scan-level metadata (1st file only)
      const dicomMetadata = await this.getScanDicomMetadata(experimentId, scan.ID, projectId);

      // ⚠️ BOTTLENECK: Get metadata for ALL files
      const fileLevelDicomMetadata = await this.getScanFilesDicomMetadata({
        projectId, experimentId, scanId: scan.ID, files, concurrency: 5
      });

      // Process all file metadata to build instance list
      // ...
    })
  );
}
```

## Optimization Strategies

### Option 1: Lazy Loading (Recommended)
**Only load metadata when user actually views the series**
- Initially: Show series list from scan-level metadata only
- On series click: Fetch file-level metadata for that series only
- Impact: First view ~1-2s, subsequent series ~2-3s each
- Implementation: Modify `retrieve.series.metadata` to fetch on-demand

### Option 2: Increase Concurrency
**Current: 5 files at a time → Increase to 20-50**
```javascript
concurrency: 20  // Instead of 5
```
- Impact: ~4x faster (10s → 2.5s per scan)
- Risk: May overwhelm XNAT server or trigger rate limits

### Option 3: Smart Caching
**Cache metadata at multiple levels**
```javascript
// Cache structure
scanMetadataCache[experimentId][scanId] = {
  scanLevel: {...},
  fileLevel: {...},
  timestamp: Date.now()
}
```
- Impact: Subsequent loads instant
- Trade-off: Memory usage, invalidation complexity

### Option 4: Metadata Pre-fetching API
**Request XNAT to provide bulk metadata endpoint**
```
GET /data/experiments/{id}/scans/{scanId}/metadata/bulk
```
- Returns all file metadata in single request
- Requires XNAT server changes
- Best long-term solution

### Option 5: Progressive Loading
**Stream results as they arrive**
```javascript
// Show series as soon as scan-level metadata is ready
// Update with file positions as file-level metadata arrives
```
- Impact: User sees results immediately, refinement happens in background
- Complexity: Requires async metadata updates in OHIF

## Implemented Optimization (Oct 17, 2025)

**Option 2: Increased Concurrency from 5 → 20**

Changed `getScanFilesDicomMetadata({ concurrency: 20 })` in XNATClient.js:320

**Why not lazy loading?**
- The image viewer requires ALL file metadata to display images correctly
- Lazy loading would require significant refactoring of OHIF's metadata flow
- Higher concurrency provides immediate 4x improvement with minimal risk

**Expected improvement:**
- Before: 60+ seconds (4 scans, 503 files total, concurrency=5)
- After: ~15-20 seconds (same data, concurrency=20)
- **4x faster** with no functionality changes

**Future optimizations:**
- Option 1 (Lazy Loading): Load metadata only when series is viewed
- Option 3 (Smart Caching): Cache metadata across page reloads
- Option 4 (Bulk API): Request XNAT server enhancement for single-request metadata

## Monitoring

Use browser console to see timing logs:
```
⏱️ getStudyMetadata START for experiment: ...
⏱️ Fetched 5 scans in 200ms
Scan 1 has 100 files (300ms)
Scan 2 has 100 files (300ms)
...
⏱️ Processed all 5 scans in 12000ms
⏱️ TOTAL getStudyMetadata time: 12500ms for 5 series
```

## References
- XNATClient.js:403 - `getStudyMetadata()`
- XNATClient.js:320 - `getScanFilesDicomMetadata()` (concurrency=5)
- XNATClient.js:154 - `getScanDicomMetadata()`
- XNATClient.js:224 - `getFileDicomMetadata()` (HTTP Range request)
