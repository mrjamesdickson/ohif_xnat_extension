# Integration Guide

This guide shows how to integrate the XNAT data source extension into an existing OHIF Viewer installation.

## Quick Start

### 1. Install the Extension

#### Option A: From npm (when published)
```bash
cd your-ohif-viewer
npm install @ohif/extension-xnat-datasource
```

#### Option B: Local Development
```bash
# In this extension directory
npm install
npm run build

# In your OHIF Viewer directory
npm install file:../path/to/ohif_plugin_for_xnat
```

#### Option C: Link for Development
```bash
# In this extension directory
npm link

# In your OHIF Viewer directory
npm link @ohif/extension-xnat-datasource
```

### 2. Configure OHIF

Edit your OHIF configuration file (usually `public/config/default.js` or `app-config.js`):

```javascript
window.config = {
  extensions: [
    '@ohif/extension-xnat-datasource',
    // ... other extensions
  ],
  dataSources: [
    {
      namespace: '@ohif/extension-xnat-datasource',
      sourceName: 'xnat',
      configuration: {
        xnatUrl: 'https://your-xnat-instance.org',
        username: 'your-username',
        password: 'your-password',
      },
    },
  ],
  defaultDataSourceName: 'xnat',
};
```

### 3. Update OHIF Package Config

If using OHIF v3+, update `platform/viewer/pluginConfig.json`:

```json
{
  "extensions": [
    {
      "packageName": "@ohif/extension-xnat-datasource",
      "version": "^1.0.0"
    }
  ]
}
```

### 4. Start OHIF

```bash
npm run dev
# or
npm start
```

## Advanced Configuration

### Using Environment Variables

Create a `.env` file in your OHIF root:

```bash
XNAT_URL=https://your-xnat.org
XNAT_USERNAME=your_username
XNAT_PASSWORD=your_password
```

Update your config:

```javascript
configuration: {
  xnatUrl: process.env.XNAT_URL,
  username: process.env.XNAT_USERNAME,
  password: process.env.XNAT_PASSWORD,
}
```

### Token-Based Authentication

For production, use API tokens instead of passwords:

1. Generate an API token in XNAT:
   - Log into XNAT
   - Go to My Account → Manage API Keys
   - Create new token

2. Configure OHIF:
```javascript
configuration: {
  xnatUrl: 'https://your-xnat.org',
  token: process.env.XNAT_TOKEN,
}
```

### Multiple XNAT Instances

You can configure multiple XNAT data sources:

```javascript
dataSources: [
  {
    namespace: '@ohif/extension-xnat-datasource',
    sourceName: 'xnat-production',
    configuration: {
      friendlyName: 'Production XNAT',
      xnatUrl: 'https://xnat-prod.org',
      token: process.env.XNAT_PROD_TOKEN,
    },
  },
  {
    namespace: '@ohif/extension-xnat-datasource',
    sourceName: 'xnat-staging',
    configuration: {
      friendlyName: 'Staging XNAT',
      xnatUrl: 'https://xnat-staging.org',
      token: process.env.XNAT_STAGING_TOKEN,
    },
  },
],
```

## CORS Configuration

XNAT must allow CORS requests from your OHIF domain.

### XNAT CORS Setup (Tomcat)

Edit `$TOMCAT_HOME/conf/web.xml` and add:

```xml
<filter>
  <filter-name>CorsFilter</filter-name>
  <filter-class>org.apache.catalina.filters.CorsFilter</filter-class>
  <init-param>
    <param-name>cors.allowed.origins</param-name>
    <param-value>http://localhost:3000,https://your-ohif-domain.com</param-value>
  </init-param>
  <init-param>
    <param-name>cors.allowed.methods</param-name>
    <param-value>GET,POST,HEAD,OPTIONS,PUT</param-value>
  </init-param>
  <init-param>
    <param-name>cors.allowed.headers</param-name>
    <param-value>Content-Type,Authorization,X-Requested-With,Accept</param-value>
  </init-param>
  <init-param>
    <param-name>cors.exposed.headers</param-name>
    <param-value>Access-Control-Allow-Origin,Access-Control-Allow-Credentials</param-value>
  </init-param>
  <init-param>
    <param-name>cors.support.credentials</param-name>
    <param-value>true</param-value>
  </init-param>
</filter>

<filter-mapping>
  <filter-name>CorsFilter</filter-name>
  <url-pattern>/*</url-pattern>
</filter-mapping>
```

### Alternative: Nginx Reverse Proxy

```nginx
server {
  listen 80;
  server_name xnat-proxy.example.com;

  location / {
    proxy_pass http://xnat-backend:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;

    # CORS headers
    add_header Access-Control-Allow-Origin "https://your-ohif-domain.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
    add_header Access-Control-Allow-Credentials "true" always;

    if ($request_method = OPTIONS) {
      return 204;
    }
  }
}
```

## Testing the Integration

### 1. Verify Extension Loaded

Open browser console and check for:
```
XNAT extension initialized
```

### 2. Test XNAT Connection

```javascript
// In browser console
const dataSource = window.config.dataSources[0];
console.log('Data source config:', dataSource);
```

### 3. Load a Study

Navigate to:
```
http://localhost:3000/?StudyInstanceUID=XNAT_EXPERIMENT_ID
```

Replace `XNAT_EXPERIMENT_ID` with an actual experiment ID from your XNAT instance.

## Troubleshooting

### Extension Not Loading

1. Check that the extension is listed in `window.config.extensions`
2. Verify the package is installed: `npm list @ohif/extension-xnat-datasource`
3. Clear browser cache and rebuild: `npm run build`

### Build Errors with Cornerstone Packages

**Error: `Package subpath '.' is not defined by "exports" in @cornerstonejs/core/package.json`**

This error occurs when the build system loads from the extension's `src/` directory instead of the built `dist/` folder, causing dependency conflicts.

**Solution:**
1. Ensure the extension's `package.json` points to `dist/`:
   ```json
   {
     "main": "dist/index.js",
     "module": "dist/index.js"
   }
   ```
2. Build the extension before deploying:
   ```bash
   npm run build
   ```
3. If using npm link, make sure the linked package has been built
4. The `dist/` folder contains the built code without conflicting node_modules

### Authentication Failures

1. Verify credentials are correct
2. Check XNAT user has proper permissions
3. Ensure XNAT is accessible from your network
4. Check for SSL certificate issues (use HTTPS)

### CORS Errors

1. Verify CORS is configured on XNAT server
2. Check browser console for specific CORS errors
3. Use browser network tab to inspect preflight OPTIONS requests
4. Consider using a reverse proxy

### Images Not Loading

1. Check browser network tab for failed requests
2. Verify DICOM files exist in XNAT
3. Check file permissions in XNAT
4. Ensure transfer syntax is supported
5. Look for console errors in XNATImageLoader

### Metadata Issues

1. Check that XNAT REST API returns proper metadata
2. Verify DICOM tags are present in files
3. Check console for parsing errors
3. Enable debug mode in config: `debug: true`

## Development Workflow

### Making Changes to the Extension

```bash
# In extension directory
npm run dev  # Watch mode

# In OHIF directory (separate terminal)
npm start
```

### Building for Production

```bash
# Build extension
npm run build

# In OHIF directory
npm run build
```

### Publishing

```bash
# Update version
npm version patch  # or minor, major

# Build
npm run build

# Publish to npm
npm publish --access public
```

## Support

- Extension Issues: [GitHub Issues](https://github.com/OHIF/Viewers/issues)
- XNAT Documentation: https://wiki.xnat.org/
- OHIF Documentation: https://docs.ohif.org/
