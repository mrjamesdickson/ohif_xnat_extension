import createXNATDataSource from './XNATDataSource.js';
import XNATImageLoader from './XNATImageLoader.js';
import { registerImageLoader } from '@cornerstonejs/core';

const EXTENSION_ID = '@ohif/extension-xnat-datasource';

console.log('XNAT Extension Loading...', EXTENSION_ID);

/**
 * Pre-registration hook to register the XNAT image loader
 */
function preRegistration({ servicesManager, configuration = {} }) {
  console.log('🟢 XNAT Extension preRegistration called with config:', configuration);

  // Register the XNAT image loader with Cornerstone using proper API
  registerImageLoader('xnat', XNATImageLoader.loadImage);
  console.log('🟢 XNAT image loader registered for "xnat:" scheme using registerImageLoader');

  // Configure the image loader with XNAT credentials
  if (configuration.xnatUrl) {
    XNATImageLoader.configure({
      xnatUrl: configuration.xnatUrl,
      username: configuration.username,
      password: configuration.password,
      token: configuration.token,
    });
    console.log('🟢 XNAT image loader configured with credentials');
  } else {
    console.warn('⚠️ No XNAT configuration provided to preRegistration');
  }

  // Expose cache utilities to window for debugging
  if (typeof window !== 'undefined') {
    window.xnatImageCache = {
      getStats: () => {
        const stats = XNATImageLoader.getCacheStats();
        console.log('📊 XNAT Image Cache Stats:', stats);
        return stats;
      },
      clear: () => {
        XNATImageLoader.clearCache();
        console.log('🗑️ XNAT Image Cache cleared');
      },
    };
    console.log('🟢 Cache utilities available: window.xnatImageCache.getStats(), window.xnatImageCache.clear()');
  }
}

/**
 * Get data sources provided by this extension
 */
function getDataSourcesModule() {
  console.log('getDataSourcesModule called');
  const dataSources = [
    {
      name: 'xnat',
      type: 'webApi',
      createDataSource: createXNATDataSource,
    },
  ];
  console.log('Returning data sources:', dataSources);
  return dataSources;
}

const extension = {
  id: EXTENSION_ID,
  preRegistration,
  getDataSourcesModule,
};

console.log('XNAT Extension Loaded:', extension);

export default extension;
