import XNATImageLoader from './XNATImageLoader.js';

/**
 * Initialize the XNAT extension
 * This function is called when the extension is loaded
 */
export default function init({ servicesManager, configuration = {} }) {
  if (servicesManager?.services) {
    console.log('🧩 XNAT init available services:', Object.keys(servicesManager.services));
    const layoutService = servicesManager.services.layoutService;
    if (layoutService) {
      console.log('🧩 layoutService API:', Object.keys(layoutService));
    }
  }

  // Validate required services
  if (!servicesManager?.services?.cornerstoneService) {
    console.error('❌ XNAT extension init failed: cornerstoneService not available');
    return;
  }

  const { cornerstoneService } = servicesManager.services;

  // Get cornerstone instance
  const cornerstoneLibraries = cornerstoneService.getCornerstoneLibraries();
  if (!cornerstoneLibraries?.cornerstone) {
    console.error('❌ XNAT extension init failed: Cornerstone library not available');
    return;
  }

  const cornerstone = cornerstoneLibraries.cornerstone;

  // Configure and register the XNAT image loader
  XNATImageLoader.configure(configuration);
  XNATImageLoader.register(cornerstone);

  console.log('✅ XNAT extension initialized');
}
