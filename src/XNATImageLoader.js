import dicomParser from 'dicom-parser';
import axios from 'axios';
import { metaData as cornerstoneMetaData } from '@cornerstonejs/core';

/**
 * Image loader for XNAT
 * Handles loading DICOM images from XNAT using the xnat: URL scheme
 */

let config = null;
const metadataCache = new Map();
let metadataProviderRegistered = false;

// DICOM file cache for improved performance
const dicomFileCache = new Map();
const CACHE_SIZE_LIMIT = 512 * 1024 * 1024; // 512MB cache limit
let currentCacheSize = 0;

const MetadataModuleKeys = {
  IMAGE_PLANE: 'imagePlaneModule',
  IMAGE_PIXEL: 'imagePixelModule',
  GENERAL_SERIES: 'generalSeriesModule',
  GENERAL_IMAGE: 'generalImageModule',
  SOP_COMMON: 'sopCommonModule',
  VOI_LUT: 'voiLUTModule',
  MODALITY_LUT: 'modalityLutModule',
  CALIBRATION: 'calibrationModule',
  MULTI_FRAME: 'multiFrameModule',
};

function ensureMetadataProviderRegistered() {
  if (metadataProviderRegistered) {
    return;
  }

  const provider = (type, imageId) => {
    const metadata = metadataCache.get(imageId);
    if (!metadata) {
      return undefined;
    }

    switch (type) {
      case MetadataModuleKeys.IMAGE_PLANE:
        return metadata.imagePlaneModule;
      case MetadataModuleKeys.IMAGE_PIXEL:
        return metadata.imagePixelModule;
      case MetadataModuleKeys.GENERAL_SERIES:
        return metadata.generalSeriesModule;
      case MetadataModuleKeys.GENERAL_IMAGE:
        return metadata.generalImageModule;
      case MetadataModuleKeys.SOP_COMMON:
        return metadata.sopCommonModule;
      case MetadataModuleKeys.VOI_LUT:
        return metadata.voiLUTModule;
      case MetadataModuleKeys.MODALITY_LUT:
        return metadata.modalityLutModule;
      case MetadataModuleKeys.CALIBRATION:
        return metadata.calibrationModule;
      case MetadataModuleKeys.MULTI_FRAME:
        return metadata.multiFrameModule;
      default:
        return undefined;
    }
  };

  cornerstoneMetaData.addProvider(provider, 100);
  metadataProviderRegistered = true;
}

function cacheMetadata(imageId, metadata) {
  metadataCache.set(imageId, metadata);
}

function parseNumberArray(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parts = value.split('\\').map(part => parseFloat(part)).filter(num => !Number.isNaN(num));
  return parts.length ? parts : null;
}

function parseFloatValue(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFloatValues(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const numbers = value.map(item => parseFloat(item)).filter(num => !Number.isNaN(num));
    return numbers.length ? numbers : null;
  }

  return parseNumberArray(value);
}

function getSequenceItem(dataSet, tag) {
  const sequenceElement = dataSet?.elements?.[tag];
  if (!sequenceElement || !sequenceElement.items || !sequenceElement.items.length) {
    return null;
  }

  return sequenceElement.items[0]?.dataSet || null;
}

function getFunctionalGroupValue({
  fallbackDataSet,
  sharedDataSet,
  perFrameDataSet,
  sequenceTag,
  valueTag,
  fallbackTag,
}) {
  const valueFromPerFrame = getSequenceItem(perFrameDataSet, sequenceTag)?.string?.(valueTag);
  if (valueFromPerFrame) {
    return valueFromPerFrame;
  }

  const valueFromShared = getSequenceItem(sharedDataSet, sequenceTag)?.string?.(valueTag);
  if (valueFromShared) {
    return valueFromShared;
  }

  if (fallbackTag && fallbackDataSet) {
    return fallbackDataSet.string(fallbackTag);
  }

  return null;
}

function parseTemporalPosition(dataSet, perFrameFunctionalGroups, frameIndex) {
  const perFrameDataSet = perFrameFunctionalGroups?.items?.[frameIndex]?.dataSet;
  const frameContentItem = getSequenceItem(perFrameDataSet, 'x00209111'); // FrameContentSequence
  const temporalPosition = frameContentItem ? frameContentItem.intString('x00209128') : null;
  const frameTime = dataSet.floatString('x00181063') || null; // FrameTime

  return {
    temporalPositionIndex: temporalPosition,
    frameTime,
  };
}

function parseImageId(imageId) {
  const raw = imageId.replace(/^xnat:/, '');

  try {
    const url = new URL(raw);
    const frameParam = url.searchParams.get('frame');
    const frame = frameParam !== null ? parseInt(frameParam, 10) : 0;
    url.searchParams.delete('frame');
    return {
      url: url.toString(),
      frameIndex: Number.isInteger(frame) && frame >= 0 ? frame : 0,
    };
  } catch (error) {
    // Fallback: treat as simple string without additional params
    const [base, query] = raw.split('?');
    let frameIndex = 0;
    if (query) {
      const params = new URLSearchParams(query);
      const frameParam = params.get('frame');
      if (frameParam) {
        const parsed = parseInt(frameParam, 10);
        if (Number.isInteger(parsed) && parsed >= 0) {
          frameIndex = parsed;
        }
      }
    }

    return {
      url: base,
      frameIndex,
    };
  }
}

/**
 * Evict old entries from DICOM file cache when limit is reached
 */
function evictFromCache() {
  if (dicomFileCache.size === 0) return;

  // Remove oldest entry (first in Map)
  const firstKey = dicomFileCache.keys().next().value;
  const cachedData = dicomFileCache.get(firstKey);
  if (cachedData) {
    currentCacheSize -= cachedData.byteLength;
    dicomFileCache.delete(firstKey);
    console.log('🗑️ Evicted from cache:', firstKey, 'New cache size:', Math.round(currentCacheSize / 1024 / 1024), 'MB');
  }
}

/**
 * Configure the image loader with XNAT credentials
 */
export function configure(xnatConfig) {
  config = xnatConfig;
  ensureMetadataProviderRegistered();
}

/**
 * Load an image from XNAT
 * @param {String} imageId - Image ID in format xnat:URL
 * @returns {Object} Image load object with promise property
 */
export function loadImage(imageId) {
  console.error('🔵🔵🔵 XNATImageLoader.loadImage CALLED!!! imageId:', imageId);
  console.log('🔵 XNATImageLoader.loadImage called with imageId:', imageId);
  ensureMetadataProviderRegistered();

  const { url, frameIndex } = parseImageId(imageId);
  console.log('🔵 Fetching DICOM from URL:', url, 'frame index:', frameIndex);
  console.log('🔵 Config available:', !!config, 'has credentials:', !!(config?.username && config?.password));

  const promise = (async () => {
    try {
    // Check if DICOM file is already cached (cache by URL, not imageId with frame)
    let arrayBuffer;
    if (dicomFileCache.has(url)) {
      console.log('✅ DICOM file found in cache:', url);
      arrayBuffer = dicomFileCache.get(url).arrayBuffer;
    } else {
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

      arrayBuffer = response.data;

      // Add to cache
      const byteLength = arrayBuffer.byteLength;

      // Evict old entries if cache is full
      while (currentCacheSize + byteLength > CACHE_SIZE_LIMIT && dicomFileCache.size > 0) {
        evictFromCache();
      }

      // Cache the DICOM file
      dicomFileCache.set(url, {
        arrayBuffer,
        byteLength,
        timestamp: Date.now(),
      });
      currentCacheSize += byteLength;

      console.log('💾 Cached DICOM file:', url, 'Cache size:', Math.round(currentCacheSize / 1024 / 1024), 'MB', 'Entries:', dicomFileCache.size);
    }

    // Parse DICOM data
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
      throw new Error('Pixel data element (7FE0,0010) not found in DICOM dataset');
    }

    const transferSyntax = dataSet.string('x00020010');
    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const bitsAllocated = dataSet.uint16('x00280100');
    const bitsStored = dataSet.uint16('x00280101') || bitsAllocated;
    const highBit = dataSet.uint16('x00280102');
    const pixelRepresentation = dataSet.uint16('x00280103');
    const samplesPerPixel = dataSet.uint16('x00280002') || 1;
    const photometricInterpretation = dataSet.string('x00280004') || 'MONOCHROME2';
    const planarConfiguration = dataSet.uint16('x00280006') || 0;
    const numberOfFrames = parseInt(dataSet.string('x00280008') || '1', 10) || 1;

    const boundedFrameIndex = Math.min(Math.max(frameIndex, 0), numberOfFrames - 1);
    if (boundedFrameIndex !== frameIndex) {
      console.warn(`⚠️ Requested frame index ${frameIndex} is outside range, using ${boundedFrameIndex}`);
    }

    const bytesPerSample = bitsAllocated / 8;
    const frameSizeBytes = rows * columns * samplesPerPixel * bytesPerSample;
    const frameOffsetBytes = boundedFrameIndex * frameSizeBytes;

    const availableBytes = Math.max(
      0,
      Math.min(frameSizeBytes, pixelDataElement.length - frameOffsetBytes)
    );

    if (availableBytes <= 0) {
      throw new Error('No pixel data available for requested frame');
    }

    if (availableBytes !== frameSizeBytes) {
      console.warn('⚠️ Frame pixel data truncated due to limited buffer length');
    }

    const pixelDataOffset = pixelDataElement.dataOffset + frameOffsetBytes;
    let pixelData;
    if (bitsAllocated === 8) {
      pixelData = new Uint8Array(arrayBuffer, pixelDataOffset, availableBytes);
    } else if (bitsAllocated === 16) {
      const length = availableBytes / 2;
      if (pixelRepresentation === 0) {
        pixelData = new Uint16Array(arrayBuffer, pixelDataOffset, length);
      } else {
        pixelData = new Int16Array(arrayBuffer, pixelDataOffset, length);
      }
    } else if (bitsAllocated === 32) {
      const length = availableBytes / 4;
      pixelData = new Float32Array(arrayBuffer, pixelDataOffset, length);
    } else {
      throw new Error(`Unsupported bits allocated: ${bitsAllocated}`);
    }

    const windowCenterValues = parseFloatValues(dataSet.string('x00281050'));
    const windowWidthValues = parseFloatValues(dataSet.string('x00281051'));
    const windowCenter = windowCenterValues ? windowCenterValues[0] : null;
    const windowWidth = windowWidthValues ? windowWidthValues[0] : null;

    const rescaleSlope = parseFloatValue(dataSet.string('x00281053')) ?? 1;
    const rescaleIntercept = parseFloatValue(dataSet.string('x00281052')) ?? 0;

    const sharedFunctionalGroupsElement = dataSet.elements?.x52009229 || null;
    const perFrameFunctionalGroupsElement = dataSet.elements?.x52009230 || null;
    const sharedFunctionalGroups = sharedFunctionalGroupsElement?.items?.[0]?.dataSet || null;
    const perFrameFunctionalGroup = perFrameFunctionalGroupsElement?.items?.[boundedFrameIndex]?.dataSet || null;

    const orientationString = getFunctionalGroupValue({
      fallbackDataSet: dataSet,
      sharedDataSet: sharedFunctionalGroups,
      perFrameDataSet: perFrameFunctionalGroup,
      sequenceTag: 'x00209116',
      valueTag: 'x00200037',
      fallbackTag: 'x00200037',
    });
    const positionString = getFunctionalGroupValue({
      fallbackDataSet: dataSet,
      sharedDataSet: sharedFunctionalGroups,
      perFrameDataSet: perFrameFunctionalGroup,
      sequenceTag: 'x00209113',
      valueTag: 'x00200032',
      fallbackTag: 'x00200032',
    });
    const pixelSpacingString = getFunctionalGroupValue({
      fallbackDataSet: dataSet,
      sharedDataSet: sharedFunctionalGroups,
      perFrameDataSet: perFrameFunctionalGroup,
      sequenceTag: 'x00289110',
      valueTag: 'x00280030',
      fallbackTag: 'x00280030',
    });
    const sliceThicknessString = getFunctionalGroupValue({
      fallbackDataSet: dataSet,
      sharedDataSet: sharedFunctionalGroups,
      perFrameDataSet: perFrameFunctionalGroup,
      sequenceTag: 'x00289110',
      valueTag: 'x00180050',
      fallbackTag: 'x00180050',
    });
    const spacingBetweenSlicesString = getFunctionalGroupValue({
      fallbackDataSet: dataSet,
      sharedDataSet: sharedFunctionalGroups,
      perFrameDataSet: perFrameFunctionalGroup,
      sequenceTag: 'x00289110',
      valueTag: 'x00180088',
      fallbackTag: 'x00180088',
    });

    const orientationArray = parseNumberArray(orientationString) || [1, 0, 0, 0, 1, 0];
    const rawPositionArray = parseNumberArray(positionString);
    const positionArray = rawPositionArray || [0, 0, 0];
    const pixelSpacingArray = parseNumberArray(pixelSpacingString) || [1, 1];
    const sliceThickness = parseFloatValue(sliceThicknessString) || parseFloatValue(spacingBetweenSlicesString) || 1;
    const spacingBetweenSlices = parseFloatValue(spacingBetweenSlicesString) || sliceThickness;

    let framePosition = positionArray;
    if (!rawPositionArray && numberOfFrames > 1) {
      const rowCosines = orientationArray.slice(0, 3);
      const colCosines = orientationArray.slice(3, 6);
      const normal = [
        rowCosines[1] * colCosines[2] - rowCosines[2] * colCosines[1],
        rowCosines[2] * colCosines[0] - rowCosines[0] * colCosines[2],
        rowCosines[0] * colCosines[1] - rowCosines[1] * colCosines[0],
      ];
      framePosition = [
        positionArray[0] + normal[0] * sliceThickness * boundedFrameIndex,
        positionArray[1] + normal[1] * sliceThickness * boundedFrameIndex,
        positionArray[2] + normal[2] * sliceThickness * boundedFrameIndex,
      ];
    }

    const sliceLocation = framePosition?.[2] ?? parseFloatValue(dataSet.string('x00201041')) ?? 0;
    const frameOfReferenceUID = dataSet.string('x00200052') || undefined;
    const temporalInfo = parseTemporalPosition(dataSet, perFrameFunctionalGroupsElement, boundedFrameIndex);

    let minPixelValue = dataSet.int16('x00280106');
    let maxPixelValue = dataSet.int16('x00280107');
    if (minPixelValue === undefined || maxPixelValue === undefined || (minPixelValue === 0 && maxPixelValue === 0)) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < pixelData.length; i++) {
        const value = pixelData[i];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      minPixelValue = min;
      maxPixelValue = max;
    }

    const generalSeriesModule = {
      seriesInstanceUID: dataSet.string('x0020000e'),
      seriesNumber: dataSet.intString('x00200011') || null,
      seriesDescription: dataSet.string('x0008103e') || undefined,
      modality: dataSet.string('x00080060') || undefined,
      seriesDate: dataSet.string('x00080021') || undefined,
      seriesTime: dataSet.string('x00080031') || undefined,
    };

    const sopInstanceUID = dataSet.string('x00080018');
    const sopClassUID = dataSet.string('x00080016');

    const metadataForImage = {
      imagePlaneModule: {
        frameOfReferenceUID,
        rows,
        columns,
        imageOrientationPatient: orientationArray,
        rowCosines: orientationArray.slice(0, 3),
        columnCosines: orientationArray.slice(3, 6),
        imagePositionPatient: framePosition,
        pixelSpacing: [pixelSpacingArray[0], pixelSpacingArray[1]],
        rowPixelSpacing: pixelSpacingArray[0],
        columnPixelSpacing: pixelSpacingArray[1],
        sliceThickness,
        spacingBetweenSlices,
        sliceLocation,
      },
      imagePixelModule: {
        samplesPerPixel,
        photometricInterpretation,
        bitsAllocated,
        bitsStored,
        highBit: highBit ?? bitsStored - 1,
        pixelRepresentation,
        planarConfiguration,
      },
      generalSeriesModule,
      generalImageModule: {
        sopInstanceUID,
        instanceNumber: dataSet.intString('x00200013') || boundedFrameIndex + 1,
        imageType: dataSet.string('x00080008') || undefined,
        temporalPositionIndex: temporalInfo.temporalPositionIndex || undefined,
      },
      sopCommonModule: {
        sopInstanceUID,
        sopClassUID,
      },
      voiLUTModule: {
        windowCenter: windowCenter != null ? [windowCenter] : undefined,
        windowWidth: windowWidth != null ? [windowWidth] : undefined,
        voiLUTFunction: dataSet.string('x00281055') || undefined,
      },
      modalityLutModule: {
        rescaleIntercept,
        rescaleSlope,
        rescaleType: dataSet.string('x00281054') || undefined,
      },
      calibrationModule: {},
      multiFrameModule: {
        numberOfFrames,
        frameIncrementPointer: dataSet.string('x00280009') || undefined,
        temporalPositionIndex: temporalInfo.temporalPositionIndex || undefined,
        frameTime: temporalInfo.frameTime || undefined,
      },
    };

    cacheMetadata(imageId, metadataForImage);

    const image = {
      imageId,
      minPixelValue,
      maxPixelValue,
      slope: rescaleSlope,
      intercept: rescaleIntercept,
      windowCenter: windowCenter ?? (minPixelValue + maxPixelValue) / 2,
      windowWidth: windowWidth ?? Math.max(maxPixelValue - minPixelValue, 1),
      rows,
      columns,
      height: rows,
      width: columns,
      color: samplesPerPixel > 1,
      columnPixelSpacing: pixelSpacingArray[1] || 1,
      rowPixelSpacing: pixelSpacingArray[0] || 1,
      sizeInBytes: pixelData.byteLength,
      getPixelData: () => pixelData,
      photometricInterpretation,
      samplesPerPixel,
      numberOfComponents: samplesPerPixel,
      frameNumber: boundedFrameIndex + 1,
      numberOfFrames,
      frameOfReferenceUID,
      imageFrame: {
        rows,
        columns,
        pixelData,
        pixelDataLength: pixelData.length,
        samplesPerPixel,
        photometricInterpretation,
        planarConfiguration,
        bitsAllocated,
        bitsStored,
        highBit: highBit ?? bitsStored - 1,
        pixelRepresentation,
        transferSyntax,
        frameNumber: boundedFrameIndex + 1,
        numberOfFrames,
      },
      render: true,
    };

    console.log('🔵 Successfully loaded DICOM image, size:', image.width, 'x', image.height, 'frame', boundedFrameIndex + 1, '/', numberOfFrames);
    console.log('🔵 Image details:', {
      minPixelValue: image.minPixelValue,
      maxPixelValue: image.maxPixelValue,
      windowCenter: image.windowCenter,
      windowWidth: image.windowWidth,
      pixelDataLength: pixelData.length,
      pixelDataType: pixelData.constructor.name,
      frameNumber: image.frameNumber,
      numberOfFrames: image.numberOfFrames,
    });

    return image;
    } catch (error) {
      console.error('🔴 Error loading image from XNAT:', error);
      throw error;
    }
  })();

  // Return an object with the promise property as expected by Cornerstone
  return {
    promise,
  };
}

/**
 * Clear the DICOM file cache
 */
export function clearCache() {
  dicomFileCache.clear();
  currentCacheSize = 0;
  console.log('🗑️ DICOM file cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    entries: dicomFileCache.size,
    sizeBytes: currentCacheSize,
    sizeMB: Math.round(currentCacheSize / 1024 / 1024 * 100) / 100,
    limitMB: Math.round(CACHE_SIZE_LIMIT / 1024 / 1024),
  };
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
  clearCache,
  getCacheStats,
};
