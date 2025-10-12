# Changelog

All notable changes to the OHIF XNAT Data Source Extension will be documented in this file.

## [Unreleased]

### Added
- **DICOM Metadata Retrieval**: Extension now retrieves actual DICOM SeriesInstanceUID values from XNAT REST API
  - New method `getScanDicomMetadata()` fetches DICOM tags from `/data/experiments/{experimentId}/scans/{scanId}/resources/DICOM/metadata`
  - Extracts actual SeriesInstanceUID (0020,000E), StudyInstanceUID (0020,000D), SeriesNumber (0020,0011), and SeriesDescription (0008,103E)
  - Graceful fallback to generated UIDs (`2.25.{experimentId}.{scanId}`) if metadata retrieval fails
  - Provides better cross-system compatibility with PACS and other DICOM systems

### Fixed
- **Build Configuration**: Fixed `package.json` to point to `dist/index.js` instead of `src/index.js`
  - Prevents dependency conflicts when building with OHIF viewer
  - Resolves "Package subpath '.' is not defined" errors
  - Ensures proper module resolution in production builds

### Technical Details

**Files Modified:**
- `src/XNATClient.js`:
  - Added `getScanDicomMetadata()` method (lines 128-150)
  - Updated `getStudyMetadata()` to use actual DICOM UIDs (lines 170-278)
- `package.json`:
  - Changed `main` from `"src/index.js"` to `"dist/index.js"`
  - Changed `module` from `"src/index.js"` to `"dist/index.js"`

**API Endpoints:**
- Now utilizes `/data/experiments/{experimentId}/scans/{scanId}/resources/DICOM/metadata?format=json`

**Benefits:**
- Real DICOM UIDs ensure proper identification across systems
- Maintains compatibility with existing functionality via fallback mechanism
- Improves integration with enterprise PACS systems
- No breaking changes - transparent upgrade for existing deployments

## [1.0.0] - Initial Release

### Features
- Connect to remote XNAT instances
- Browse projects, subjects, experiments, and scans
- Retrieve and display DICOM images in OHIF Viewer
- Support for both basic authentication and token-based authentication
- Automatic metadata extraction and mapping to DICOM standards
- Custom `xnat:` URL scheme for image loading
- CORS-aware proxy support
- Interactive configuration setup script
- Automated build and deployment scripts
