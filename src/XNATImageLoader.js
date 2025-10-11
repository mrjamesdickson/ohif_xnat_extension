import dicomParser from 'dicom-parser';
import axios from 'axios';

/**
 * Image loader for XNAT
 * Handles loading DICOM images from XNAT using the xnat: URL scheme
 */

let config = null;

/**
 * Configure the image loader with XNAT credentials
 */
export function configure(xnatConfig) {
  config = xnatConfig;
}

/**
 * Load an image from XNAT
 * @param {String} imageId - Image ID in format xnat:URL
 * @returns {Promise<Object>} Image object compatible with Cornerstone
 */
export async function loadImage(imageId) {
  console.log('🔵 XNATImageLoader.loadImage called with imageId:', imageId);

  // Extract URL from imageId (format: xnat:URL)
  const url = imageId.replace('xnat:', '');
  console.log('🔵 Fetching DICOM from URL:', url);
  console.log('🔵 Config available:', !!config, 'has credentials:', !!(config?.username && config?.password));

  try {
    // Setup authentication headers
    const headers = {
      'Content-Type': 'application/dicom',
    };

    if (config) {
      if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
        console.log('🔵 Using Bearer token authentication');
      } else if (config.username && config.password) {
        const auth = btoa(`${config.username}:${config.password}`);
        headers['Authorization'] = `Basic ${auth}`;
        console.log('🔵 Using Basic authentication');
      }
    } else {
      console.warn('⚠️ No config available for authentication!');
    }

    // Fetch the DICOM file
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers,
    });

    const arrayBuffer = response.data;

    // Parse DICOM data
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    // Extract image metadata
    const pixelDataElement = dataSet.elements.x7fe00010;
    const transferSyntax = dataSet.string('x00020010');
    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const bitsAllocated = dataSet.uint16('x00280100');
    const pixelRepresentation = dataSet.uint16('x00280103');
    const samplesPerPixel = dataSet.uint16('x00280002') || 1;
    const photometricInterpretation = dataSet.string('x00280004');

    // Get window/level
    const windowCenter = parseFloat(dataSet.string('x00281050')) || 0;
    const windowWidth = parseFloat(dataSet.string('x00281051')) || 0;

    // Extract pixel data
    let pixelData;
    if (bitsAllocated === 8) {
      pixelData = new Uint8Array(
        arrayBuffer,
        pixelDataElement.dataOffset,
        pixelDataElement.length
      );
    } else if (bitsAllocated === 16) {
      if (pixelRepresentation === 0) {
        pixelData = new Uint16Array(
          arrayBuffer,
          pixelDataElement.dataOffset,
          pixelDataElement.length / 2
        );
      } else {
        pixelData = new Int16Array(
          arrayBuffer,
          pixelDataElement.dataOffset,
          pixelDataElement.length / 2
        );
      }
    } else {
      throw new Error(`Unsupported bits allocated: ${bitsAllocated}`);
    }

    // Create image object for Cornerstone
    const image = {
      imageId,
      minPixelValue: dataSet.int16('x00280106') || 0,
      maxPixelValue: dataSet.int16('x00280107') || 0,
      slope: parseFloat(dataSet.string('x00281053')) || 1,
      intercept: parseFloat(dataSet.string('x00281052')) || 0,
      windowCenter: Array.isArray(windowCenter) ? windowCenter[0] : windowCenter,
      windowWidth: Array.isArray(windowWidth) ? windowWidth[0] : windowWidth,
      rows,
      columns,
      height: rows,
      width: columns,
      color: samplesPerPixel > 1,
      columnPixelSpacing: parseFloat(dataSet.string('x00280030')?.split('\\')[1]) || 1,
      rowPixelSpacing: parseFloat(dataSet.string('x00280030')?.split('\\')[0]) || 1,
      sizeInBytes: pixelData.byteLength,
      getPixelData: () => pixelData,
      photometricInterpretation,
      samplesPerPixel,
    };

    // Calculate min/max if not provided
    if (image.minPixelValue === 0 && image.maxPixelValue === 0) {
      let min = 65535;
      let max = -32768;
      for (let i = 0; i < pixelData.length; i++) {
        const value = pixelData[i];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      image.minPixelValue = min;
      image.maxPixelValue = max;
    }

    // Calculate window/level if not provided
    if (!image.windowCenter || !image.windowWidth) {
      const range = image.maxPixelValue - image.minPixelValue;
      image.windowCenter = (image.maxPixelValue + image.minPixelValue) / 2;
      image.windowWidth = range;
    }

    console.log('🔵 Successfully loaded DICOM image, size:', image.width, 'x', image.height);

    // Cornerstone3D expects a Promise that resolves to the image directly
    return image;
  } catch (error) {
    console.error('🔴 Error loading image from XNAT:', error);
    throw error;
  }
}

/**
 * Register the XNAT image loader with Cornerstone
 */
export function register(cornerstone) {
  cornerstone.registerImageLoader('xnat', loadImage);
}

export default {
  configure,
  loadImage,
  register,
};
