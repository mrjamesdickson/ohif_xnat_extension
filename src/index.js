import createXNATDataSource from './XNATDataSource.js';
import XNATImageLoader from './XNATImageLoader.js';
import { registerImageLoader } from '@cornerstonejs/core';
import XNATProjectSelector from './components/XNATProjectSelector';
import XNATCacheInfo from './components/XNATCacheInfo';
import init from './init.js';

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

  // Call init function to set up login dialog
  console.log('🟢 Calling init function from preRegistration');
  init({ servicesManager, configuration });
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

/**
 * Get panel module for side panels
 */
function getPanelModule({ servicesManager }) {
  return [
    {
      name: 'xnat-project-selector',
      iconName: 'icon-xnat',
      iconLabel: 'XNAT Project',
      label: 'XNAT Project',
      component: XNATProjectSelector,
    },
    {
      name: 'xnat-cache-info',
      iconName: 'icon-settings',
      iconLabel: 'XNAT Cache',
      label: 'XNAT Cache',
      component: XNATCacheInfo,
    },
  ];
}

/**
 * Get commands for toolbar actions
 */
function getCommandsModule({ servicesManager }) {
  const { uiDialogService, uiNotificationService } = servicesManager.services;

  return {
    definitions: {
      showXNATProjectSelector: {
        commandFn: () => {
          // Show project selector modal from init.js
          if (window.showProjectSelectorModal) {
            window.showProjectSelectorModal();
          } else {
            console.error('Project selector not available');
          }
        },
        storeContexts: [],
        options: {},
      },
      xnatLogout: {
        commandFn: () => {
          console.log('🚪 Logout command - clearing all data');

          // Clear all storage
          localStorage.clear();
          sessionStorage.clear();

          // Hard redirect to clear all cached data
          window.location.href = window.location.origin + window.location.pathname + '?t=' + Date.now();
        },
        storeContexts: [],
        options: {},
      },
      showXNATCacheInfo: {
        commandFn: () => {
          uiDialogService.create({
            content: XNATCacheInfo,
            contentProps: { servicesManager },
            defaultPosition: 'center',
          });
        },
        storeContexts: [],
        options: {},
      },
    },
    defaultContext: 'DEFAULT',
  };
}

const extension = {
  id: EXTENSION_ID,
  preRegistration,
  getDataSourcesModule,
  getPanelModule,
  getCommandsModule,
};

console.log('XNAT Extension Loaded:', extension);

export default extension;
