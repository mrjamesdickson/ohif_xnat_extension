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
   * Query for studies
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
    series: {
      metadata: async ({ StudyInstanceUID, filters } = {}) => {
        try {
          const studyMetadata = await client.getStudyMetadata(StudyInstanceUID);

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
    getXNATClient: () => client,
  };
}

export default createXNATDataSource;
