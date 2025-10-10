# OHIF XNAT Data Source Extension

An OHIF extension that enables pulling and displaying DICOM images from remote XNAT instances.

## Quick Start

```bash
# 1. Configure XNAT credentials interactively
./setup-config.sh

# 2. Build and deploy to your OHIF installation
./build-and-deploy.sh /path/to/ohif-viewer

# 3. Start OHIF with auto-generated config
cd /path/to/ohif-viewer
APP_CONFIG=xnat yarn run dev
```

The setup script will guide you through configuring your XNAT connection. The deployment script then automatically creates a ready-to-use `xnat.js` configuration file.

**Alternative:** Manually create `.env` file:
```bash
cp .env.example .env
# Edit .env with your XNAT URL and credentials
```

## Features

- Connect to remote XNAT instances
- Browse projects, subjects, experiments, and scans
- Retrieve and display DICOM images in OHIF Viewer
- Support for both basic authentication and token-based authentication
- Automatic metadata extraction and mapping to DICOM standards

## Installation

### Quick Deploy (Recommended for OHIF Monorepo)

Use the build and deployment script to automatically build and install the extension:

```bash
./build-and-deploy.sh /path/to/your/ohif-viewer
```

This script will:
- Install extension dependencies
- Build the extension
- Copy the extension to `extensions/xnat-datasource`
- Install dependencies in OHIF context
- Create example configuration
- Rebuild OHIF workspace

### Manual Installation

```bash
npm install @ohif/extension-xnat-datasource
```

Or add to your OHIF Viewer's package.json:

```json
{
  "dependencies": {
    "@ohif/extension-xnat-datasource": "^1.0.0"
  }
}
```

## Configuration

### Automated Configuration (Recommended)

The easiest way to configure XNAT credentials is using the interactive setup script or a `.env` file:

#### Option A: Interactive Setup (Easiest)

```bash
./setup-config.sh
```

This script will guide you through all configuration options and create the `.env` file for you.

#### Option B: Manual `.env` File

1. **Create `.env` file:**
```bash
cp .env.example .env
```

2. **Edit `.env` with your XNAT details:**
```bash
# XNAT Server URL (required)
XNAT_URL=https://your-xnat-instance.org

# Authentication Method 1: Username & Password
XNAT_USERNAME=your_username
XNAT_PASSWORD=your_password

# OR Authentication Method 2: API Token (recommended)
# XNAT_TOKEN=your_api_token

# Optional settings
XNAT_FRIENDLY_NAME=My XNAT Server
XNAT_TIMEOUT=30000
```

3. **Deploy with auto-configuration:**
```bash
./build-and-deploy.sh /path/to/ohif-viewer
```

This will automatically generate a configured `public/config/xnat.js` file in your OHIF installation.

4. **Start OHIF using the auto-generated config:**
```bash
cd /path/to/ohif-viewer
APP_CONFIG=xnat yarn run dev
```

### Manual Configuration

#### Basic Authentication

Create or update your OHIF configuration file (e.g., `app-config.js`):

```javascript
window.config = {
  extensions: [
    '@ohif/extension-xnat-datasource'
  ],
  dataSources: [
    {
      namespace: '@ohif/extension-xnat-datasource',
      sourceName: 'xnat',
      configuration: {
        xnatUrl: 'https://your-xnat-instance.org',
        username: 'your-username',
        password: 'your-password'
      }
    }
  ],
  defaultDataSourceName: 'xnat'
};
```

### Token-Based Authentication

For enhanced security, use token-based authentication:

```javascript
window.config = {
  extensions: [
    '@ohif/extension-xnat-datasource'
  ],
  dataSources: [
    {
      namespace: '@ohif/extension-xnat-datasource',
      sourceName: 'xnat',
      configuration: {
        xnatUrl: 'https://your-xnat-instance.org',
        token: 'your-api-token'
      }
    }
  ],
  defaultDataSourceName: 'xnat'
};
```

## Usage

### Starting OHIF with XNAT Extension

1. Install dependencies:
```bash
npm install
```

2. Configure your XNAT connection in the config file

3. Build and start OHIF:
```bash
npm run build
npm run serve
```

4. Access OHIF in your browser and browse XNAT studies

### Query Parameters

You can filter studies using query parameters:

- `PatientName` - Filter by patient name
- `StudyDate` - Filter by study date
- Custom XNAT fields

Example URL:
```
http://localhost:3000/?StudyInstanceUID=EXPERIMENT_ID
```

## Architecture

### Components

1. **XNATClient** - Handles communication with XNAT REST API
   - Authentication (Basic and Token)
   - Project/Subject/Experiment/Scan retrieval
   - DICOM file download

2. **XNATDataSource** - OHIF data source implementation
   - Study querying and retrieval
   - Metadata mapping to DICOM format
   - Integration with OHIF metadata store

3. **XNATImageLoader** - Cornerstone image loader
   - Custom `xnat:` URL scheme
   - DICOM parsing and image rendering
   - Authentication header injection

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
- `/data/projects/{project}/subjects` - List subjects in a project
- `/data/projects/{project}/subjects/{subject}/experiments` - List experiments
- `/data/experiments/{experiment}/scans` - List scans in an experiment
- `/data/experiments/{experiment}/scans/{scan}/resources/DICOM/files` - List DICOM files
- File download endpoints for DICOM retrieval

## Development

### Project Structure

```
.
├── src/
│   ├── index.js              # Main extension entry point
│   ├── init.js               # Extension initialization
│   ├── XNATClient.js         # XNAT REST API client
│   ├── XNATDataSource.js     # OHIF data source implementation
│   └── XNATImageLoader.js    # Cornerstone image loader
├── config/
│   ├── xnat-config.example.json
│   └── xnat-config-token.example.json
├── examples/
│   └── app-config.js         # Example OHIF configuration
├── setup-config.sh           # Interactive configuration setup
├── build-and-deploy.sh       # Build and deployment script
├── .env.example              # Environment variables template
├── package.json
├── README.md
└── INTEGRATION.md            # Detailed integration guide
```

### Building

Build the extension:

```bash
npm run build
```

Or use the all-in-one build and deploy script:

```bash
./build-and-deploy.sh /path/to/ohif-viewer
```

### Local Development

For active development with auto-rebuild:

```bash
# Watch for changes and rebuild
npm run dev

# In another terminal, start OHIF
cd /path/to/ohif-viewer
yarn run dev
```

### Testing

**Quick test:**
```bash
# Automated connection test (requires .env file)
node test-xnat-connection.js
```

This will verify:
- XNAT connectivity
- Authentication
- Available projects, subjects, experiments
- Provides test URLs for OHIF

**Manual test in OHIF:**
```bash
# Start OHIF with XNAT config
cd /path/to/ohif-viewer
APP_CONFIG=xnat yarn run dev

# Open in browser with experiment ID
# http://localhost:3000/?StudyInstanceUID=EXPERIMENT_ID
```

**See [TESTING.md](TESTING.md) for comprehensive testing guide.**

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
