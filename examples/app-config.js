/**
 * Example OHIF App Configuration with XNAT Extension
 *
 * This file shows how to configure OHIF Viewer to use the XNAT data source extension.
 * Copy this to your OHIF viewer's public/config directory and customize as needed.
 */

window.config = {
  routerBasename: '/',

  extensions: [
    // Include the XNAT data source extension
    '@ohif/extension-xnat-datasource',
    // Other OHIF extensions
    '@ohif/extension-default',
    '@ohif/extension-cornerstone',
  ],

  modes: [],

  // Configure custom routes if needed
  customizationService: {
    // Custom XNAT study list
    studyList: {
      // Additional columns for XNAT-specific metadata
      additionalColumns: [
        {
          id: 'ProjectID',
          label: 'XNAT Project',
          getValue: study => study.ProjectID || '',
        },
        {
          id: 'ProjectName',
          label: 'Project Name',
          getValue: study => study.ProjectName || '',
        },
      ],
    },
  },

  showStudyList: true,

  // Configure data sources
  dataSources: [
    {
      namespace: '@ohif/extension-xnat-datasource',
      sourceName: 'xnat',
      configuration: {
        friendlyName: 'XNAT Server',

        // XNAT server URL
        xnatUrl: process.env.XNAT_URL || 'https://central.xnat.org',

        // Authentication - Option 1: Username/Password
        username: process.env.XNAT_USERNAME || '',
        password: process.env.XNAT_PASSWORD || '',

        // Authentication - Option 2: API Token (recommended)
        // token: process.env.XNAT_TOKEN || '',

        // Optional: Custom headers
        headers: {
          // Add any custom headers here
        },

        // Optional: Request timeout in milliseconds
        timeout: 30000,
      },
    },
  ],

  // Set XNAT as the default data source
  defaultDataSourceName: 'xnat',

  // Study Prefetcher configuration
  studyPrefetcher: {
    enabled: true,
    maxNumPrefetchRequests: 5,
  },

  // Hotkeys configuration
  hotkeys: [
    {
      commandName: 'incrementActiveViewport',
      label: 'Next Viewport',
      keys: ['right'],
    },
    {
      commandName: 'decrementActiveViewport',
      label: 'Previous Viewport',
      keys: ['left'],
    },
  ],

  // Default viewport settings
  defaultViewport: {
    cornerstoneViewportOptions: {
      // Cornerstone viewport options
    },
  },

  // Enable debugging in development
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Example usage with environment variables:
 *
 * 1. Create a .env file in your OHIF root:
 *    XNAT_URL=https://your-xnat.org
 *    XNAT_USERNAME=your_username
 *    XNAT_PASSWORD=your_password
 *
 * 2. Or use XNAT_TOKEN for token-based auth:
 *    XNAT_URL=https://your-xnat.org
 *    XNAT_TOKEN=your_api_token
 *
 * 3. Start OHIF:
 *    npm start
 */
