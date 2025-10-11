import XNATClient from './XNATClient.js';
import { DicomMetadataStore } from '@ohif/core';

/**
 * XNAT Data Source for OHIF Viewer
 * Creates a data source that retrieves images from XNAT
 */
function createXNATDataSource(config) {
  console.log('createXNATDataSource called with config:', config);
  const client = new XNATClient(config);
  let currentProjectFilter = null;

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

          // Get the study metadata which includes series
          const studyMetadata = await client.getStudyMetadata(experimentId);
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

        const formatSeriesMetadata = (studyMetadata) => {
          console.log('📊 Raw study metadata:', studyMetadata);

          // Add instances to DicomMetadataStore with ImageId
          studyMetadata.series.forEach(series => {
            series.instances.forEach(instance => {
              // Create the imageId using our custom xnat: scheme
              const imageId = `xnat:${instance.url}`;

              // Add ImageId to the metadata
              const instanceWithImageId = {
                ...instance.metadata,
                ImageId: imageId,
                wadoRoot: instance.url, // Some OHIF code looks for this
                wadoUri: instance.url,
              };

              DicomMetadataStore.addInstance(instanceWithImageId);
            });
          });
          console.log('✅ Added instances to DicomMetadataStore with ImageId');

          // Format metadata for OHIF
          const naturalizedSeries = (studyMetadata?.series || []).map(series => ({
            SeriesInstanceUID: series.SeriesInstanceUID,
            SeriesNumber: series.SeriesNumber,
            SeriesDescription: series.SeriesDescription,
            Modality: series.Modality,
            instances: series.instances.map(instance => {
              const imageId = `xnat:${instance.url}`;
              return {
                ...instance.metadata,
                url: instance.url,
                ImageId: imageId,
                wadoRoot: instance.url,
                wadoUri: instance.url,
              };
            }),
          }));

          console.log('📊 Formatted series metadata:', {
            count: naturalizedSeries.length,
            firstSeries: naturalizedSeries[0] ? {
              SeriesInstanceUID: naturalizedSeries[0].SeriesInstanceUID,
              instanceCount: naturalizedSeries[0].instances.length,
              firstInstance: naturalizedSeries[0].instances[0]
            } : null
          });
          return naturalizedSeries;
        };

        // If returnPromises is true, return array of promise wrappers
        if (returnPromises) {
          console.log('Returning promise wrapper for lazy loading');
          return [{
            promise: null,
            start: async () => {
              const studyMetadata = await client.getStudyMetadata(StudyInstanceUID);
              console.log('Study metadata retrieved (promise mode):', studyMetadata);
              return formatSeriesMetadata(studyMetadata);
            }
          }];
        }

        // Standard path - fetch immediately
        try {
          const studyMetadata = await client.getStudyMetadata(StudyInstanceUID);
          console.log('Study metadata retrieved:', studyMetadata);
          return formatSeriesMetadata(studyMetadata);
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
      imageCount: displaySet.images?.length
    });

    const imageIds = [];

    if (displaySet.images && displaySet.images.length > 0) {
      displaySet.images.forEach(image => {
        const imageId = getImageIdsForInstance({ instance: image });
        imageIds.push(imageId);
      });
    }

    console.log('🎯 Generated', imageIds.length, 'image IDs, first:', imageIds[0]);
    return imageIds;
  };

  /**
   * Get image ID for a specific instance
   */
  const getImageIdsForInstance = ({ instance }) => {
    console.log('🎯 getImageIdsForInstance called, instance has url:', !!instance.url);

    // Use XNAT custom image loader scheme
    if (instance.url) {
      const imageId = `xnat:${instance.url}`;
      console.log('🎯 Generated imageId:', imageId);
      return imageId;
    }

    throw new Error('No URL available for instance');
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
