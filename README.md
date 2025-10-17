# OHIF XNAT Data Source Extension

An OHIF v3 extension that enables loading and displaying DICOM images from XNAT imaging archives using HTTP Range requests for efficient metadata extraction.

## Quick Start

```bash
# 1. Stop any running dev server
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 2. Deploy (rebuilds plugin, clears caches, starts server)
./deploy.sh

# 3. Clear browser cache (DevTools > Application > Storage > Clear site data)
#    Then hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+F5 on Windows)

# 4. Access at http://localhost:3000 (XNAT config is now default)
```

The deploy script:
- Rebuilds the plugin from `src/` to `dist/`
- Copies to `../ohif_viewer/node_modules/@ohif/extension-xnat-datasource/dist/`
- Makes XNAT config the default (backs up original to `default.js.bak`)
- Clears ALL webpack caches to prevent stale code
- Stops old dev server and starts fresh one

**⚠️ CRITICAL**: Always stop the server BEFORE deploying. Running `deploy.sh` while server is active will serve stale cached code.

## Features

- **HTTP Range Request Metadata Extraction**: Fetches only first 64KB of DICOM files for efficient header parsing
- **Project Filtering**: UI components for selecting XNAT projects with localStorage persistence
- **Cache Management**: 512MB DICOM file cache with LRU eviction and UI controls
- **Real DICOM UIDs**: Extracts actual SeriesInstanceUID and StudyInstanceUID from file headers
- **Multi-frame Support**: Handles 4D volumes with proper frame expansion and position calculation
- **Shared Experiments**: Correctly handles experiments shared across multiple XNAT projects
- **Basic and Token Auth**: Supports both authentication methods with secure credential handling

## Installation

This extension is designed for local development with an OHIF viewer instance. It assumes you have:
- OHIF viewer cloned at `../ohif_viewer` (relative to this repo)
- Node.js and npm installed
- Access to an XNAT instance (tested with demo02.xnatworks.io)

### Configuration

Edit `config/app-config-xnat.js` with your XNAT credentials:

```javascript
{
  xnatUrl: 'https://demo02.xnatworks.io',
  username: 'your-username',
  password: 'your-password',
  // OR use token auth:
  // token: 'your-api-token'
}
```

### Deployment Script

The `deploy.sh` script handles the complete deployment workflow. See CLAUDE.md for detailed deployment instructions and troubleshooting.

## UI Features

### Project Selector
Click the "Select Project" button in the toolbar to switch between XNAT projects. Selection is persisted to localStorage.

### Cache Management
Click the "Cache Info" button to view DICOM cache statistics and clear the cache.

## Usage

After deploying with `./deploy.sh`, navigate to `http://localhost:3000`. The XNAT config is automatically set as default. Select a project from the dropdown and click on a study to view scans.

## Architecture

### Components

1. **XNATClient** (`src/XNATClient.js`) - XNAT REST API client
   - HTTP Range requests for DICOM header extraction (first 64KB only)
   - Extracts 15+ DICOM tags including SeriesInstanceUID, StudyInstanceUID
   - Project-aware experiment resolution for shared data
   - Concurrency-limited batch metadata fetching

2. **XNATDataSource** (`src/XNATDataSource.js`) - OHIF data source
   - Study/series querying with project filtering
   - Multi-frame volume expansion into individual instances
   - DicomMetadataStore population with proper UIDs
   - Project filter persistence via localStorage

3. **XNATImageLoader** (`src/XNATImageLoader.js`) - Cornerstone image loader
   - Custom `xnat:` URL scheme handler
   - 512MB DICOM file cache with LRU eviction
   - Multi-frame image support with frame-specific pixel data extraction
   - Metadata provider for Cornerstone image plane/pixel/VOI modules

4. **UI Components** (`src/components/`)
   - `XNATProjectSelector.jsx` - Project dropdown with reload
   - `XNATCacheInfo.jsx` - Cache statistics and clear button

### Data Flow

```
XNAT Instance
    ↓
XNATClient (REST API)
    ↓
XNATDataSource (Metadata mapping)
    ↓
OHIF Metadata Store
    ↓
XNATImageLoader (Image rendering)
    ↓
Cornerstone (Display)
```

## XNAT API Endpoints Used

- `/data/projects` - List all projects
- `/data/experiments?UID={studyUID}&project={project}` - Resolve DICOM StudyInstanceUID to XNAT experiment
- `/data/experiments/{id}/scans` - List scans
- `/data/experiments/{id}/scans/{scan}/files` - List DICOM files
- `/data/experiments/{id}/scans/{scan}/resources/{resource}/files/{file}` - Download DICOM with HTTP Range support

## Development

### Project Structure

```
.
├── src/
│   ├── index.js                    # Extension entry point
│   ├── init.js                     # Preregistration and initialization
│   ├── XNATClient.js               # XNAT REST API client with HTTP Range support
│   ├── XNATDataSource.js           # OHIF data source with project filtering
│   ├── XNATImageLoader.js          # Cornerstone image loader with caching
│   ├── XNATImageLoader.utils.js    # Image loader utility functions
│   └── components/
│       ├── XNATProjectSelector.jsx # Project selection UI
│       └── XNATCacheInfo.jsx       # Cache management UI
├── config/
│   ├── app-config-xnat.js          # OHIF app configuration
│   ├── modes/
│   │   ├── xnat-mode.js            # XNAT mode with toolbar buttons
│   │   └── package.json            # Mode package metadata
│   ├── DataSourceWrapper.tsx       # Data source routing
│   └── DataSourceWrapper-routes.tsx
├── tests/                          # Unit tests
├── deploy.sh                       # Local deployment script
├── verify-deploy.sh                # Deployment verification
├── CLAUDE.md                       # AI assistant development guide
├── package.json
└── README.md
```

### Local Development

See `CLAUDE.md` for detailed development workflow and deployment instructions. Key points:

- Always stop server before deploying: `lsof -ti:3000 | xargs kill -9 2>/dev/null || true`
- Deploy with: `./deploy.sh`
- Clear browser cache after every deploy (DevTools > Application > Storage > Clear site data)
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+F5 (Windows)

### Testing

```bash
# Run unit tests
npm test

# Test DICOM header extraction
node tests/fetchDicomHeader.test.mjs

# Verify deployment
./verify-deploy.sh
```

## Troubleshooting

### Connection Issues

- Verify XNAT URL is accessible
- Check authentication credentials
- Ensure CORS is configured on XNAT server
- Check browser console for errors

### Image Loading Issues

- Verify DICOM files are available in XNAT
- Check file permissions in XNAT
- Ensure transfer syntax is supported
- Check network tab for failed requests

### Build Issues

**Error: `Package subpath '.' is not defined by "exports"`**
- This occurs when the extension's `package.json` points to `src/` instead of `dist/`
- Solution: Ensure `package.json` has:
  ```json
  "main": "dist/index.js",
  "module": "dist/index.js"
  ```
- Run `npm run build` before deploying
- The `dist/` folder contains the built extension without conflicting dependencies

### CORS Configuration

Add to XNAT's `web.xml` or proxy configuration:

```xml
<filter>
  <filter-name>CorsFilter</filter-name>
  <filter-class>org.apache.catalina.filters.CorsFilter</filter-class>
  <init-param>
    <param-name>cors.allowed.origins</param-name>
    <param-value>*</param-value>
  </init-param>
  <init-param>
    <param-name>cors.allowed.methods</param-name>
    <param-value>GET,POST,HEAD,OPTIONS</param-value>
  </init-param>
</filter>
```

## Security Considerations

- Store credentials securely (use environment variables or secure config)
- Use HTTPS for XNAT connections
- Prefer token-based authentication over basic auth
- Implement token rotation policies
- Validate SSL certificates in production

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/OHIF/Viewers/issues)
- XNAT Documentation: https://wiki.xnat.org/
- OHIF Documentation: https://docs.ohif.org/

## Related Projects

- [OHIF Viewer](https://github.com/OHIF/Viewers)
- [XNAT](https://www.xnat.org/)
- [Cornerstone](https://github.com/cornerstonejs/cornerstone)
