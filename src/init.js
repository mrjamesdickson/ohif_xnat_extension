import XNATImageLoader from './XNATImageLoader.js';

/**
 * Initialize the XNAT extension
 * This function is called when the extension is loaded
 */
export default function init({ servicesManager, configuration = {} }) {
  const { cornerstoneService } = servicesManager.services;

  // Get cornerstone instance
  const cornerstone = cornerstoneService.getCornerstoneLibraries().cornerstone;

  // Configure and register the XNAT image loader
  XNATImageLoader.configure(configuration);
  XNATImageLoader.register(cornerstone);

  console.log('XNAT extension initialized');
}
