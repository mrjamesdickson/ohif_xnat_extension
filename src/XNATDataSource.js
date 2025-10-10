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
        try {
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
      metadata: async ({ StudyInstanceUID, filters } = {}) => {
        console.log('retrieve.series.metadata called for study:', StudyInstanceUID, 'filters:', filters);
        try {
          const studyMetadata = await client.getStudyMetadata(StudyInstanceUID);
          console.log('Study metadata retrieved:', studyMetadata);

          // Format metadata for OHIF
          const naturalizedSeries = (studyMetadata?.series || []).map(series => ({
            SeriesInstanceUID: series.SeriesInstanceUID,
            SeriesNumber: series.SeriesNumber,
            SeriesDescription: series.SeriesDescription,
            Modality: series.Modality,
            instances: series.instances.map(instance => ({
              ...instance.metadata,
              url: instance.url,
            })),
          }));

          console.log('Returning naturalized series:', naturalizedSeries);
          return naturalizedSeries;
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
    const imageIds = [];

    if (displaySet.images && displaySet.images.length > 0) {
      displaySet.images.forEach(image => {
        const imageId = getImageIdsForInstance({ instance: image });
        imageIds.push(imageId);
      });
    }

    return imageIds;
  };

  /**
   * Get image ID for a specific instance
   */
  const getImageIdsForInstance = ({ instance }) => {
    // Use WADO URI scheme for direct DICOM file access
    if (instance.url) {
      return `wadouri:${instance.url}`;
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
   */
  const getStudyInstanceUIDs = ({ params, filter } = {}) => {
    console.log('getStudyInstanceUIDs called with params:', params);
    // Return empty array - studies are loaded via query.studies.search
    return Promise.resolve([]);
  };

  return {
    initialize,
    query,
    retrieve,
    store: () => console.warn('store() not implemented for XNAT data source'),
    reject: () => console.warn('reject() not implemented for XNAT data source'),
    parseRouteParams: () => console.warn('parseRouteParams() not implemented for XNAT data source'),
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
