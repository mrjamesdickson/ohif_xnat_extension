import XNATClient from './XNATClient.js';
import { DicomMetadataStore, classes as OHIFClasses } from '@ohif/core';
import dicomParser from 'dicom-parser';
import axios from 'axios';

/**
 * XNAT Data Source for OHIF Viewer
 * Creates a data source that retrieves images from XNAT
 */
function createXNATDataSource(config) {
  console.log('createXNATDataSource called with config:', config);
  const client = new XNATClient(config);
  let currentProjectFilter = null;
  const metadataProvider = OHIFClasses.MetadataProvider;

  // Configure the XNAT image loader with credentials
  const XNATImageLoader = require('./XNATImageLoader.js').default;
  XNATImageLoader.configure({
    xnatUrl: config.xnatUrl,
    username: config.username,
    password: config.password,
    token: config.token,
  });
  console.log('✅ XNAT image loader configured with datasource credentials');

  /**
   * Fetch and parse DICOM metadata from a DICOM file
   */
  const fetchDicomMetadata = async (url) => {
    try {
      const headers = {
        'Content-Type': 'application/dicom',
      };

      if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
      } else if (config.username && config.password) {
        const auth = btoa(`${config.username}:${config.password}`);
        headers['Authorization'] = `Basic ${auth}`;
      }

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers,
      });

      const arrayBuffer = response.data;
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      // Extract comprehensive DICOM metadata
      const metadata = {
        // SOP Common Module
        SOPClassUID: dataSet.string('x00080016'),
        SOPInstanceUID: dataSet.string('x00080018'),

        // Patient Module
        PatientName: dataSet.string('x00100010'),
        PatientID: dataSet.string('x00100020'),
        PatientBirthDate: dataSet.string('x00100030'),
        PatientSex: dataSet.string('x00100040'),

        // Study Module
        StudyInstanceUID: dataSet.string('x0020000d'),
        StudyDate: dataSet.string('x00080020'),
        StudyTime: dataSet.string('x00080030'),
        StudyDescription: dataSet.string('x00081030'),
        AccessionNumber: dataSet.string('x00080050'),

        // Series Module
        SeriesInstanceUID: dataSet.string('x0020000e'),
        SeriesNumber: dataSet.uint16('x00200011'),
        SeriesDescription: dataSet.string('x0008103e'),
        SeriesDate: dataSet.string('x00080021'),
        SeriesTime: dataSet.string('x00080031'),
        Modality: dataSet.string('x00080060'),
        ProtocolName: dataSet.string('x00180015'),

        // Image Pixel Module
        Rows: dataSet.uint16('x00280010'),
        Columns: dataSet.uint16('x00280011'),
        BitsAllocated: dataSet.uint16('x00280100'),
        BitsStored: dataSet.uint16('x00280101'),
        HighBit: dataSet.uint16('x00280102'),
        PixelRepresentation: dataSet.uint16('x00280103'),
        SamplesPerPixel: dataSet.uint16('x00280002') || 1,
        PhotometricInterpretation: dataSet.string('x00280004'),
        PlanarConfiguration: dataSet.uint16('x00280006'),
        PixelAspectRatio: dataSet.string('x00280034'),

        // Modality LUT Module
        RescaleIntercept: parseFloat(dataSet.string('x00281052')) || 0,
        RescaleSlope: parseFloat(dataSet.string('x00281053')) || 1,
        RescaleType: dataSet.string('x00281054'),

        // VOI LUT Module
        WindowCenter: dataSet.string('x00281050'),
        WindowWidth: dataSet.string('x00281051'),
        WindowCenterWidthExplanation: dataSet.string('x00281055'),

        // Image Plane Module
        PixelSpacing: dataSet.string('x00280030'),
        ImageOrientationPatient: dataSet.string('x00200037'),
        ImagePositionPatient: dataSet.string('x00200032'),
        SliceThickness: dataSet.string('x00180050'),
        SliceLocation: dataSet.string('x00201041'),
        FrameOfReferenceUID: dataSet.string('x00200052'),

        // Instance Module
        InstanceNumber: dataSet.uint16('x00200013'),

        // Acquisition Module (if available)
        AcquisitionNumber: dataSet.uint16('x00200012'),
        AcquisitionDate: dataSet.string('x00080022'),
        AcquisitionTime: dataSet.string('x00080032'),
      };

      console.log('📋 Parsed DICOM metadata:', metadata);
      return metadata;
    } catch (error) {
      console.error('❌ Error fetching DICOM metadata:', error);
      throw error;
    }
  };

  /**
   * Initialize the data source
   */
  const initialize = async () => {
    try {
      const projects = await client.getProjects();
      console.log('XNAT connection successful');
      console.log(`📁 Available XNAT Projects (${projects.length}):`, projects.map(p => p.ID).join(', '));
      console.log('💡 To filter by project, use the Accession # field in the study list, or run: window.xnatSetProject("PROJECT_ID")');

      // Expose project filtering globally for easy access
      window.xnatProjects = projects;
      window.xnatSetProject = (projectId) => {
        setProjectFilter(projectId);
        console.log(`✅ Filter set to project: ${projectId || 'All Projects'}`);
        console.log('🔄 Refresh the study list to see filtered results');
      };
      window.xnatListProjects = () => {
        console.table(projects.map(p => ({ ID: p.ID, Name: p.name || p.ID })));
      };
    } catch (error) {
      console.error('Failed to connect to XNAT:', error);
      throw new Error('Unable to connect to XNAT instance');
    }
  };

  /**
   * Query for studies and series
   */
  const query = {
    studies: {
      mapParams: params => params,
      search: async (queryParams = {}) => {
        console.log('studies.search called with params:', queryParams);
        try {
          // If searching for specific StudyInstanceUIDs, return those
          if (queryParams.StudyInstanceUIDs) {
            console.log('Searching for specific studies:', queryParams.StudyInstanceUIDs);
            const uids = Array.isArray(queryParams.StudyInstanceUIDs)
              ? queryParams.StudyInstanceUIDs
              : [queryParams.StudyInstanceUIDs];

            // Return minimal study data for the UIDs
            const studies = uids.map(uid => ({
              studyInstanceUid: uid,
              date: '',
              time: '',
              description: uid,
              modalities: 'MR',
              accession: uid,
              instances: 0,
              patientName: uid,
              mrn: uid,
            }));

            console.log('Returning studies for UIDs:', studies);
            return studies;
          }

          // Add current project filter if set
          const params = { ...queryParams };
          if (currentProjectFilter) {
            params.AccessionNumber = currentProjectFilter;
          }

          const studies = await client.searchForStudies(params);
          return studies;
        } catch (error) {
          console.error('Error querying studies:', error);
          throw error;
        }
      },
    },
    series: {
      search: async (queryParams = {}) => {
        console.log('series.search called with params:', queryParams);
        try {
          // OHIF passes the experiment ID directly as a string
          const experimentId = typeof queryParams === 'string' ? queryParams :
                               queryParams.studyInstanceUid ||
                               queryParams.StudyInstanceUID ||
                               queryParams.studyInstanceUIDs?.[0];

          if (!experimentId) {
            console.warn('No experiment ID provided to series.search, params:', queryParams);
            return [];
          }

          // Resolve DICOM UID to XNAT experiment ID
          const resolvedExperimentId = await client.resolveStudyInstanceUID(experimentId);

          // Get the study metadata which includes series
          const studyMetadata = await client.getStudyMetadata(resolvedExperimentId);
          console.log('Study metadata for series search:', studyMetadata);

          // Format series for OHIF WorkList
          const series = (studyMetadata?.series || []).map(s => ({
            studyInstanceUid: studyMetadata.StudyInstanceUID,
            seriesInstanceUid: s.SeriesInstanceUID,
            seriesNumber: s.SeriesNumber,
            description: s.SeriesDescription,  // UI expects 'description', not 'seriesDescription'
            seriesDescription: s.SeriesDescription,
            modality: s.Modality,
            instances: s.instances.length,
            numSeriesInstances: s.instances.length,  // WorkList expects this field name
          }));

          console.log('Returning series for WorkList:', series);
          return series;
        } catch (error) {
          console.error('Error querying series:', error);
          throw error;
        }
      },
    },
  };

  /**
   * Set project filter
   */
  const setProjectFilter = (projectId) => {
    currentProjectFilter = projectId;
    console.log('Project filter set to:', projectId || 'All Projects');
  };

  /**
   * Retrieve study metadata
   */
  const retrieve = {
    directURL: async ({ url, headers }) => {
      console.log('retrieve.directURL called:', url);
      // Not implemented for XNAT
      return null;
    },
    bulkDataURI: async ({ StudyInstanceUID, BulkDataURI }) => {
      console.log('retrieve.bulkDataURI called for study:', StudyInstanceUID);
      // Not implemented for XNAT
      return null;
    },
    series: {
      metadata: async ({ StudyInstanceUID, filters, returnPromises } = {}) => {
        console.log('retrieve.series.metadata called for study:', StudyInstanceUID,
                    'filters:', filters, 'returnPromises:', returnPromises);

        const formatSeriesMetadata = async (studyMetadata) => {
          console.log('📊 Raw study metadata:', studyMetadata);

          // Build series summary and instances per series (matching DicomWeb format)
          const seriesSummaryMetadata = {};
          const instancesPerSeries = {};

          // Process each series
          for (const series of studyMetadata.series) {
            const seriesUID = series.SeriesInstanceUID;

            // Fetch DICOM metadata from the first instance of this series
            let dicomMetadata = null;
            if (series.instances.length > 0) {
              const firstInstanceUrl = series.instances[0].url;
              console.log('📥 Fetching DICOM metadata from first instance:', firstInstanceUrl);
              try {
                dicomMetadata = await fetchDicomMetadata(firstInstanceUrl);
              } catch (error) {
                console.error('⚠️ Failed to fetch DICOM metadata for series', seriesUID, error);
              }
            }

            // Create series summary using actual DICOM metadata if available
            if (!seriesSummaryMetadata[seriesUID]) {
              const baseMetadata = series.instances[0]?.metadata || {};
              const metadata = dicomMetadata || baseMetadata;

              seriesSummaryMetadata[seriesUID] = {
                StudyInstanceUID: metadata.StudyInstanceUID || studyMetadata.StudyInstanceUID,
                StudyDescription: metadata.StudyDescription || studyMetadata.StudyDescription,
                SeriesInstanceUID: metadata.SeriesInstanceUID || series.SeriesInstanceUID,
                SeriesDescription: metadata.SeriesDescription || series.SeriesDescription,
                SeriesNumber: metadata.SeriesNumber || series.SeriesNumber,
                SeriesDate: metadata.SeriesDate || '',
                SeriesTime: metadata.SeriesTime || '',
                Modality: metadata.Modality || series.Modality,
                SOPClassUID: metadata.SOPClassUID || baseMetadata.SOPClassUID,
                ProtocolName: metadata.ProtocolName || '',
              };
            }

            // Build instances array with imageId and proper metadata
            if (!instancesPerSeries[seriesUID]) {
              instancesPerSeries[seriesUID] = [];
            }

            series.instances.forEach((instance, index) => {
              const imageId = `xnat:${instance.url}`;

              // Use DICOM metadata for all instances in the series
              // (ideally we'd fetch each one, but using first instance metadata as template)
              const baseMetadata = dicomMetadata || instance.metadata;

              // Calculate unique position for each slice if not available
              const sliceSpacing = parseFloat(baseMetadata.SliceThickness) || 1;
              const basePosition = baseMetadata.ImagePositionPatient
                ? baseMetadata.ImagePositionPatient.split('\\').map(parseFloat)
                : [0, 0, 0];

              // Calculate position for this slice (increment Z position)
              const instancePosition = [
                basePosition[0],
                basePosition[1],
                basePosition[2] + (index * sliceSpacing)
              ];

              const instanceMetadata = {
                ...baseMetadata,
                // Ensure critical fields are always set - use XNAT experiment ID as StudyInstanceUID
                StudyInstanceUID: studyMetadata.StudyInstanceUID, // Always use XNAT experiment ID
                SeriesInstanceUID: seriesUID,
                // Override instance-specific values
                SOPInstanceUID: instance.metadata.SOPInstanceUID || baseMetadata.SOPInstanceUID,
                InstanceNumber: instance.metadata.InstanceNumber || index + 1,
                // Set unique position for each slice
                ImagePositionPatient: instancePosition.join('\\'),
                SliceLocation: instancePosition[2],
                // Ensure orientation is set (default to axial if missing)
                ImageOrientationPatient: baseMetadata.ImageOrientationPatient || '1\\0\\0\\0\\1\\0',
              };

              const instanceWithImageId = {
                ...instanceMetadata,
                imageId: imageId,  // lowercase 'i' - OHIF looks for this
              };

              instancesPerSeries[seriesUID].push(instanceWithImageId);

              // Register imageId to UIDs mapping with metadataProvider
              metadataProvider.addImageIdToUIDs(imageId, {
                StudyInstanceUID: instanceMetadata.StudyInstanceUID,
                SeriesInstanceUID: seriesUID,
                SOPInstanceUID: instanceMetadata.SOPInstanceUID,
              });
            });
          }

          // Add to DicomMetadataStore (OHIF expects this)
          DicomMetadataStore.addSeriesMetadata(Object.values(seriesSummaryMetadata), false);
          Object.keys(instancesPerSeries).forEach(seriesInstanceUID => {
            const instances = instancesPerSeries[seriesInstanceUID];
            console.log(`📦 Adding ${instances.length} instances for series ${seriesInstanceUID}, first instance has StudyInstanceUID:`, instances[0]?.StudyInstanceUID);
            DicomMetadataStore.addInstances(instances, false);
          });
          console.log('✅ Added series and instances to DicomMetadataStore');
          console.log('✅ Registered imageId to UIDs mappings with metadataProvider');

          console.log('📊 Returning series summary metadata:', {
            count: Object.keys(seriesSummaryMetadata).length,
            seriesUIDs: Object.keys(seriesSummaryMetadata),
            firstSeries: Object.values(seriesSummaryMetadata)[0]
          });

          // Verify instances have StudyInstanceUID
          Object.keys(instancesPerSeries).forEach(seriesUID => {
            const instances = instancesPerSeries[seriesUID];
            const firstInstance = instances[0];
            console.log(`🔍 Verification - Series ${seriesUID}:`, {
              instanceCount: instances.length,
              firstInstanceHasStudyUID: !!firstInstance?.StudyInstanceUID,
              firstInstanceStudyUID: firstInstance?.StudyInstanceUID,
              firstInstanceSeriesUID: firstInstance?.SeriesInstanceUID,
              firstInstanceSOPUID: firstInstance?.SOPInstanceUID,
            });
          });

          // Return object indexed by SeriesInstanceUID (NOT array!)
          return seriesSummaryMetadata;
        };

        // If returnPromises is true, return array of promise wrappers
        if (returnPromises) {
          console.log('🔄 returnPromises=true, returning promise wrapper with start() function');
          return [{
            promise: null,
            start: async () => {
              console.log('🔄 Promise wrapper start() called for study:', StudyInstanceUID);
              // Resolve DICOM UID to XNAT experiment ID
              const experimentId = await client.resolveStudyInstanceUID(StudyInstanceUID);
              const studyMetadata = await client.getStudyMetadata(experimentId);
              console.log('🔄 Study metadata retrieved in promise mode:', studyMetadata);
              return await formatSeriesMetadata(studyMetadata);
            }
          }];
        }

        // Standard path - fetch immediately
        try {
          // Resolve DICOM UID to XNAT experiment ID
          const experimentId = await client.resolveStudyInstanceUID(StudyInstanceUID);
          const studyMetadata = await client.getStudyMetadata(experimentId);
          console.log('Study metadata retrieved:', studyMetadata);
          return await formatSeriesMetadata(studyMetadata);
        } catch (error) {
          console.error('Error retrieving study:', error);
          throw error;
        }
      },
    },
  };

  /**
   * Get image IDs for display set
   */
  const getImageIdsForDisplaySet = (displaySet) => {
    console.log('🎯 getImageIdsForDisplaySet called with displaySet:', {
      displaySetInstanceUID: displaySet.displaySetInstanceUID,
      SeriesInstanceUID: displaySet.SeriesInstanceUID,
      hasImages: !!displaySet.images,
      imageCount: displaySet.images?.length,
      hasInstances: !!displaySet.instances,
      instanceCount: displaySet.instances?.length,
      displaySetKeys: Object.keys(displaySet),
    });

    const imageIds = [];

    // Try both 'images' and 'instances' properties
    const instances = displaySet.images || displaySet.instances;

    if (!instances || instances.length === 0) {
      console.error('🔴 No images or instances found in displaySet!');
      console.log('🔴 DisplaySet structure:', JSON.stringify(displaySet, null, 2).substring(0, 500));
      return imageIds;
    }

    instances.forEach((instance, index) => {
      console.log(`🎯 Processing instance ${index + 1}/${instances.length}, has imageId:`, !!instance.imageId);
      const imageId = getImageIdsForInstance({ instance });
      imageIds.push(imageId);
    });

    console.log('🎯 Generated', imageIds.length, 'image IDs, first:', imageIds[0]);
    return imageIds;
  };

  /**
   * Get image ID for a specific instance
   */
  const getImageIdsForInstance = ({ instance }) => {
    console.log('🎯 getImageIdsForInstance called, has imageId:', !!instance.imageId, 'has url:', !!instance.url);

    // Instance already has imageId from DicomMetadataStore
    if (instance.imageId) {
      console.log('🎯 Using existing imageId:', instance.imageId);
      return instance.imageId;
    }

    // Fallback: generate from URL if available
    if (instance.url) {
      const imageId = `xnat:${instance.url}`;
      console.log('🎯 Generated imageId from URL:', imageId);
      return imageId;
    }

    console.error('🔴 Instance has no imageId or url:', instance);
    throw new Error('No imageId or URL available for instance');
  };

  /**
   * Get configuration
   */
  const getConfig = () => {
    return { ...config, dicomUploadEnabled: false };
  };

  /**
   * Get study instance UIDs
   * IMPORTANT: Must return array directly, NOT a Promise
   */
  const getStudyInstanceUIDs = ({ params, query } = {}) => {
    console.log('getStudyInstanceUIDs called with params:', params, 'query:', query);
    console.log('Current URL:', window.location.href);

    // Try to get StudyInstanceUIDs from URL if not in params
    if (!params?.StudyInstanceUIDs) {
      const urlParams = new URLSearchParams(window.location.search);
      const studyUIDs = urlParams.get('StudyInstanceUIDs');

      if (studyUIDs) {
        console.log('Found StudyInstanceUIDs in URL:', studyUIDs);
        const uids = studyUIDs.includes(',') ? studyUIDs.split(',') : [studyUIDs];
        console.log('Returning UIDs array:', uids);
        return uids;  // Return array directly, NOT Promise
      }
    }

    // If StudyInstanceUIDs are provided in params, return them
    if (params?.StudyInstanceUIDs) {
      const uids = Array.isArray(params.StudyInstanceUIDs)
        ? params.StudyInstanceUIDs
        : [params.StudyInstanceUIDs];
      console.log('Returning StudyInstanceUIDs from params:', uids);
      return uids;  // Return array directly, NOT Promise
    }

    console.log('No StudyInstanceUIDs found, returning empty array');
    // Return empty array directly, NOT Promise
    return [];
  };

  return {
    initialize,
    query,
    retrieve,
    store: () => console.warn('store() not implemented for XNAT data source'),
    reject: () => console.warn('reject() not implemented for XNAT data source'),
    parseRouteParams: (params) => {
      console.log('parseRouteParams called with:', params);
      // Extract StudyInstanceUIDs from URL params
      return {
        StudyInstanceUIDs: params.StudyInstanceUIDs,
      };
    },
    deleteStudyMetadataPromise: () => console.warn('deleteStudyMetadataPromise() not implemented for XNAT data source'),
    getImageIdsForDisplaySet,
    getImageIdsForInstance,
    getConfig,
    setProjectFilter,
    getStudyInstanceUIDs,
    getXNATClient: () => client,
  };
}

export default createXNATDataSource;
