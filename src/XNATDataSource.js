import React from 'react';
import XNATClient from './XNATClient.js';
import XNATImageLoader from './XNATImageLoader.js';
import { DicomMetadataStore, classes as OHIFClasses } from '@ohif/core';
import dicomParser from 'dicom-parser';
import axios from 'axios';

const STORAGE_KEY_FALLBACK = 'ohif.xnat.selectedProject';

function getPersistedProject(storageKey) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(storageKey) || null;
  } catch (error) {
    console.warn('⚠️ Unable to read persisted XNAT project selection:', error);
    return null;
  }
}

function persistProject(storageKey, projectId) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    if (projectId) {
      window.localStorage.setItem(storageKey, projectId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch (error) {
    console.warn('⚠️ Unable to persist XNAT project selection:', error);
  }
}

function ProjectSelectionDialog({ projects, defaultValue, onSubmit, onCancel, hide }) {
  const [selectedProject, setSelectedProject] = React.useState(
    defaultValue || projects?.[0]?.ID || ''
  );

  const sortedProjects = React.useMemo(() => {
    if (!Array.isArray(projects)) {
      return [];
    }
    return [...projects].sort((a, b) => {
      const nameA = (a.name || a.ID || '').toLowerCase();
      const nameB = (b.name || b.ID || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [projects]);

  const labelElement = React.createElement(
    'label',
    {
      htmlFor: 'xnat-project-select',
      className: 'block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1',
    },
    'Select a project'
  );

  const selectElement = React.createElement(
    'select',
    {
      id: 'xnat-project-select',
      className: 'ohif-input w-full',
      value: selectedProject,
      onChange: event => setSelectedProject(event.target.value),
    },
    sortedProjects.map(project =>
      React.createElement(
        'option',
        {
          key: project.ID,
          value: project.ID,
        },
        project.name || project.ID
      )
    )
  );

  const cancelButton = React.createElement(
    'button',
    {
      type: 'button',
      className: 'ohif-button ohif-button--secondary',
      onClick: () => {
        onCancel();
        hide();
      },
    },
    'Cancel'
  );

  const continueButton = React.createElement(
    'button',
    {
      type: 'button',
      className: 'ohif-button ohif-button--primary',
      disabled: !selectedProject,
      onClick: () => {
        onSubmit(selectedProject);
        hide();
      },
    },
    'Continue'
  );

  const buttonRow = React.createElement(
    'div',
    { className: 'flex justify-end gap-2' },
    cancelButton,
    continueButton
  );

  const selectRow = React.createElement(
    'div',
    null,
    labelElement,
    selectElement
  );

  return React.createElement(
    'div',
    { className: 'flex flex-col gap-4 p-4 text-left' },
    selectRow,
    buttonRow
  );
}

/**
 * XNAT Data Source for OHIF Viewer
 * Creates a data source that retrieves images from XNAT
 */
function createXNATDataSource(configuration = {}, servicesManager) {
  const config = configuration || {};
  console.log('createXNATDataSource called with config:', config);

  // Check for runtime credentials in memory (set by login dialog)
  const runtimeCredentials = window.xnatCredentials;

  // Use runtime credentials if available, otherwise fall back to config
  const effectiveConfig = {
    ...config,
    xnatUrl: runtimeCredentials ? runtimeCredentials.url : config.xnatUrl,
    username: runtimeCredentials ? runtimeCredentials.username : config.username,
    password: runtimeCredentials ? runtimeCredentials.password : config.password,
    token: runtimeCredentials ? null : config.token,
  };

  console.log('Using authentication:', runtimeCredentials ? 'Runtime credentials (from login popup)' : 'Config credentials');

  const client = new XNATClient(effectiveConfig);
  const studySearchLimit = Number.isFinite(Number(config.studySearchLimit))
    ? Number(config.studySearchLimit)
    : Number.isFinite(Number(config.studyListLimit))
    ? Number(config.studyListLimit)
    : 100;
  const shouldPromptForProject = config.promptForProject !== false;
  const shouldRememberSelection = config.rememberProjectSelection !== false;
  const projectStorageKey = config.projectPreferenceKey || STORAGE_KEY_FALLBACK;

  const services = servicesManager?.services || {};
  const uiDialogService = services.uiDialogService;

  // Debug: Check what's actually in localStorage
  const localStorageValue = typeof window !== 'undefined' ? localStorage.getItem(projectStorageKey) : null;
  console.log('📦 localStorage value:', localStorageValue, 'for key:', projectStorageKey);

  const initialStoredProject =
    config.defaultProject ||
    (shouldRememberSelection ? getPersistedProject(projectStorageKey) : null);

  let currentProjectFilter = initialStoredProject || null;
  console.log('🎯 Initial project filter:', currentProjectFilter, 'shouldRememberSelection:', shouldRememberSelection, 'config.defaultProject:', config.defaultProject);
  const metadataProvider = OHIFClasses.MetadataProvider;

  // Configure the XNAT image loader with credentials
  // Note: XNATImageLoader is imported at module level, but we configure it here
  // because it needs runtime configuration from the data source
  XNATImageLoader.configure({
    xnatUrl: effectiveConfig.xnatUrl,
    username: effectiveConfig.username,
    password: effectiveConfig.password,
    token: effectiveConfig.token,
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
        NumberOfFrames: dataSet.intString('x00280008') || dataSet.uint16('x00280008') || 1,
        FrameIncrementPointer: dataSet.string('x00280009'),
        FrameTime: dataSet.string('x00181063'),
        FrameTimeVector: dataSet.string('x00181065'),
        TemporalPositionIndex: dataSet.intString('x00209128') || null,
        SpacingBetweenSlices: dataSet.string('x00180088'),
        NumberOfTemporalPositions: dataSet.intString('x00200105') || null,
        TemporalResolution: dataSet.string('x00200110'),

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
  const isDialogServiceReady = service => {
    if (!service || typeof service.show !== 'function') {
      return false;
    }
    try {
      const fnString = service.show.toString();
      return !fnString.includes('NOT IMPLEMENTED');
    } catch (error) {
      return true;
    }
  };

  const waitForDialogService = async service => {
    if (isDialogServiceReady(service)) {
      return true;
    }

    return new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 40;
      const interval = setInterval(() => {
        attempts += 1;
        if (isDialogServiceReady(service) || attempts >= maxAttempts) {
          clearInterval(interval);
          resolve(isDialogServiceReady(service));
        }
      }, 50);
    });
  };

  const promptForProjectSelection = async projects => {
    if (
      !shouldPromptForProject ||
      !uiDialogService ||
      !Array.isArray(projects) ||
      projects.length === 0
    ) {
      return null;
    }

    const ready = await waitForDialogService(uiDialogService);

    if (!ready) {
      console.warn('⚠️ uiDialogService not ready; falling back to window prompt for project selection.');
      const defaultValue =
        currentProjectFilter || config.defaultProject || projects?.[0]?.ID || '';
      // eslint-disable-next-line no-alert
      const manualSelection = window.prompt(
        'Select XNAT Project by ID:',
        defaultValue || ''
      );
      return manualSelection || null;
    }

    return new Promise(resolve => {
      const dialogId = 'xnat-project-selection';

      uiDialogService.show({
        id: dialogId,
        title: 'Select XNAT Project',
        shouldCloseOnEsc: true,
        content: ProjectSelectionDialog,
        contentProps: {
          projects,
          defaultValue:
            currentProjectFilter || config.defaultProject || projects?.[0]?.ID || '',
          onSubmit: projectId => {
            resolve(projectId);
          },
          onCancel: () => {
            resolve(null);
          },
        },
      });
    });
  };

  const initialize = async () => {
    try {
      // Check if we have authentication
      const hasBasicAuth = effectiveConfig.username && effectiveConfig.password;
      const hasToken = effectiveConfig.token;

      if (!hasBasicAuth && !hasToken) {
        console.warn('⚠️ No authentication available yet, skipping initialization. Waiting for user login...');
        // Don't throw error, just skip initialization
        // The login dialog will handle authentication and trigger reload
        return;
      }

      const projects = await client.getProjects();
      console.log('XNAT connection successful');
      console.log(`📁 Available XNAT Projects (${projects.length}):`, projects.map(p => p.ID).join(', '));
      console.log('💡 To filter by project, use the Accession # field in the study list, or run: window.xnatSetProject("PROJECT_ID")');

      // Expose project filtering globally for easy access
      window.xnatProjects = projects;
      window.xnatSetProject = projectId => {
        setProjectFilter(projectId);
        console.log(`✅ Filter set to project: ${projectId || 'All Projects'}`);
        console.log('🔄 Refresh the study list to see filtered results');
      };
      window.xnatListProjects = () => {
        console.table(projects.map(p => ({ ID: p.ID, Name: p.name || p.ID })));
      };

      // Don't auto-prompt for project selection on init
      // User can use the floating button to select a project manually
      if (currentProjectFilter) {
        console.log(`🎯 Default project filter applied: ${currentProjectFilter}`);
      } else {
        console.log(`💡 No project selected. Use the "📁 Select Project" button to choose a project.`);
      }
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
      // Check authentication before any query
      _checkAuth: () => {
        const runtimeCreds = window.xnatCredentials;
        const hasAuth = (runtimeCreds && runtimeCreds.username) ||
                       (effectiveConfig.username && effectiveConfig.password) ||
                       effectiveConfig.token;
        if (!hasAuth) {
          throw new Error('Please login first');
        }
      },
      mapParams: params => params,
      search: async (queryParams = {}) => {
        console.log('studies.search called with params:', queryParams);

        // Check authentication first
        const runtimeCreds = window.xnatCredentials;
        const hasAuth = (runtimeCreds && runtimeCreds.username) ||
                       (effectiveConfig.username && effectiveConfig.password) ||
                       effectiveConfig.token;

        if (!hasAuth) {
          console.warn('⚠️ No authentication available, returning empty results');
          return [];
        }

        // Check if a project is selected
        if (!currentProjectFilter) {
          console.warn('⚠️ No project selected. Use the "XNAT: Select Project" button to choose a project.');
          return [];
        }

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
          console.log('🔍 Searching for studies with currentProjectFilter:', currentProjectFilter);
          if (currentProjectFilter) {
            params.AccessionNumber = currentProjectFilter;
          }

          const studies = await client.searchForStudies(params, studySearchLimit);
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

          // Resolve DICOM UID to XNAT experiment ID and project ID
          // Pass current project filter to constrain the lookup to that project
          const { experimentId: resolvedExperimentId, projectId: resolvedProjectId } = await client.resolveStudyInstanceUID(
            experimentId,
            currentProjectFilter
          );

          // Use current project filter if set, otherwise use resolved project
          // This handles cases where experiments are shared across projects
          const projectToUse = currentProjectFilter || resolvedProjectId;
          console.log(`Using project: ${projectToUse} (filter: ${currentProjectFilter}, resolved: ${resolvedProjectId})`);

          // Get the study metadata which includes series, passing the original StudyInstanceUID and project ID
          const studyMetadata = await client.getStudyMetadata(resolvedExperimentId, experimentId, projectToUse);
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
    if (shouldRememberSelection) {
      persistProject(projectStorageKey, projectId);
    }
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

          const ensureModalityLutModule = (metadata) => {
            if (!metadata) {
              return;
            }

            const module = metadata.modalityLutModule || {};
            const rawSlope = module.rescaleSlope ?? metadata.RescaleSlope ?? metadata.rescaleSlope;
            const rawIntercept = module.rescaleIntercept ?? metadata.RescaleIntercept ?? metadata.rescaleIntercept;
            const rawType = module.rescaleType ?? metadata.RescaleType ?? metadata.rescaleType;

            const slope = parseFloat(rawSlope);
            const intercept = parseFloat(rawIntercept);

            module.rescaleSlope = Number.isFinite(slope) ? slope : 1;
            module.rescaleIntercept = Number.isFinite(intercept) ? intercept : 0;
            module.rescaleType = rawType || module.rescaleType;
            if (typeof module.scaled === 'undefined') {
              module.scaled = false;
            }

            metadata.modalityLutModule = module;
          };

          const parseNumericArray = (value) => {
            if (Array.isArray(value)) {
              return value
                .map(item => parseFloat(item))
                .filter(item => !Number.isNaN(item));
            }
            if (typeof value === 'number') {
              return Number.isNaN(value) ? [] : [value];
            }
            if (typeof value === 'string') {
              return value
                .split('\\')
                .map(component => parseFloat(component))
                .filter(component => !Number.isNaN(component));
            }
            return [];
          };

          const getOrientationArray = (metadata) => {
            const primary = metadata.ImageOrientationPatientNumeric ?? metadata.ImageOrientationPatient;
            const arr = parseNumericArray(primary);
            return arr.length === 6 ? arr : [];
          };

          const getPositionArray = (metadata) => {
            const primary = metadata.ImagePositionPatientNumeric ?? metadata.ImagePositionPatient;
            const arr = parseNumericArray(primary);
            return arr.length === 3 ? arr : [];
          };

          const getPixelSpacingArray = (metadata) => {
            const primary = metadata.PixelSpacingNumeric ?? metadata.PixelSpacing;
            const arr = parseNumericArray(primary);
            return arr.length >= 2 ? arr.slice(0, 2) : [];
          };

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

              ensureModalityLutModule(metadata);

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
                modalityLutModule: metadata.modalityLutModule,
              };
            }

            // Build instances array with imageId and proper metadata
            if (!instancesPerSeries[seriesUID]) {
              instancesPerSeries[seriesUID] = [];
            }

            series.instances.forEach((instance, index) => {
              const baseImageId = `xnat:${instance.url}`;

              // Use DICOM metadata for all instances in the series
              const instanceMeta = instance.metadata || {};
              const baseMetadata = { ...(dicomMetadata || {}), ...instanceMeta };

              ensureModalityLutModule(baseMetadata);

              let pixelSpacingArray = getPixelSpacingArray(baseMetadata);
              if (pixelSpacingArray.length < 2) {
                pixelSpacingArray = [
                  parseFloat(baseMetadata.RowPixelSpacing) || 1,
                  parseFloat(baseMetadata.ColumnPixelSpacing) || 1,
                ];
              }
              if (pixelSpacingArray.length < 2) {
                pixelSpacingArray = [1, 1];
              }
              const rowPixelSpacing = pixelSpacingArray[0];
              const columnPixelSpacing = pixelSpacingArray[1];

              let orientationArray = getOrientationArray(baseMetadata);
              if (orientationArray.length !== 6) {
                orientationArray = [1, 0, 0, 0, 1, 0];
              }
              const rowCosines = orientationArray.slice(0, 3);
              const columnCosines = orientationArray.slice(3, 6);
              const normal = [
                rowCosines[1] * columnCosines[2] - rowCosines[2] * columnCosines[1],
                rowCosines[2] * columnCosines[0] - rowCosines[0] * columnCosines[2],
                rowCosines[0] * columnCosines[1] - rowCosines[1] * columnCosines[0],
              ];

              let basePositionArray = getPositionArray(baseMetadata);
              if (basePositionArray.length !== 3) {
                basePositionArray = [0, 0, 0];
              }

              const sliceThickness = parseFloat(baseMetadata.SliceThickness) || null;
              const spacingBetweenSlices = parseFloat(baseMetadata.SpacingBetweenSlices) || null;
              const nominalSliceSpacing = spacingBetweenSlices || sliceThickness || 1;

              const numberOfFrames = parseInt(baseMetadata.NumberOfFrames, 10) || 1;
              const temporalPositionIndexRaw =
                baseMetadata.TemporalPositionIndex ?? baseMetadata.temporalPositionIndex;
              const temporalPositionIndex =
                temporalPositionIndexRaw !== undefined && temporalPositionIndexRaw !== null
                  ? parseInt(temporalPositionIndexRaw, 10)
                  : undefined;
              const hasTemporalDimension =
                temporalPositionIndex !== undefined && temporalPositionIndex !== null ||
                baseMetadata.FrameTime !== undefined ||
                baseMetadata.FrameTimeVector !== undefined;
              const frameSpacing = hasTemporalDimension ? 0 : nominalSliceSpacing;

              const baseOffset = index * nominalSliceSpacing;

              for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
                const frameImageId = numberOfFrames > 1
                  ? `${baseImageId}?frame=${frameIndex}`
                  : baseImageId;

                const frameOffset = frameIndex * frameSpacing;
                const totalOffset = baseOffset + frameOffset;

                const framePosition = [
                  basePositionArray[0] + normal[0] * totalOffset,
                  basePositionArray[1] + normal[1] * totalOffset,
                  basePositionArray[2] + normal[2] * totalOffset,
                ];
                const framePositionString = framePosition.join('\\');

                const instanceMetadata = {
                  ...baseMetadata,
                  StudyInstanceUID: studyMetadata.StudyInstanceUID,
                  SeriesInstanceUID: seriesUID,
                  SOPInstanceUID: instanceMeta.SOPInstanceUID || baseMetadata.SOPInstanceUID,
                  SOPClassUID: instanceMeta.SOPClassUID || baseMetadata.SOPClassUID,
                  InstanceNumber: instanceMeta.InstanceNumber || baseMetadata.InstanceNumber || index + 1,
                  InStackPositionNumber: index * numberOfFrames + frameIndex + 1,
                  ImagePositionPatient: framePositionString,
                  ImagePositionPatientNumeric: framePosition,
                  SliceLocation: framePosition[2],
                  ImageOrientationPatient: orientationArray.join('\\'),
                  ImageOrientationPatientNumeric: orientationArray,
                  NumberOfFrames: numberOfFrames,
                  FrameNumber: frameIndex + 1,
                  TemporalPositionIndex: temporalPositionIndex,
                  FrameTime: baseMetadata.FrameTime,
                  FrameTimeVector: baseMetadata.FrameTimeVector,
                  FrameTimeVectorNumeric: baseMetadata.FrameTimeVectorNumeric,
                  RowPixelSpacing: rowPixelSpacing,
                  ColumnPixelSpacing: columnPixelSpacing,
                  PixelSpacing: `${rowPixelSpacing}\\${columnPixelSpacing}`,
                  PixelSpacingNumeric: [rowPixelSpacing, columnPixelSpacing],
                };

                if (!instanceMetadata.modalityLutModule) {
                  const slope = parseFloat(baseMetadata.RescaleSlope);
                  const intercept = parseFloat(baseMetadata.RescaleIntercept);
                  instanceMetadata.modalityLutModule = {
                    rescaleSlope: Number.isFinite(slope) ? slope : 1,
                    rescaleIntercept: Number.isFinite(intercept) ? intercept : 0,
                    rescaleType: baseMetadata.RescaleType || undefined,
                    scaled: false,
                  };
                } else if (instanceMetadata.modalityLutModule && typeof instanceMetadata.modalityLutModule.scaled === 'undefined') {
                  instanceMetadata.modalityLutModule = {
                    ...instanceMetadata.modalityLutModule,
                    scaled: false,
                  };
                }

                const instanceWithImageId = {
                  ...instanceMetadata,
                  imageId: frameImageId,
                };

                ensureModalityLutModule(instanceWithImageId);

                instancesPerSeries[seriesUID].push(instanceWithImageId);

                metadataProvider.addImageIdToUIDs(frameImageId, {
                  StudyInstanceUID: instanceMetadata.StudyInstanceUID,
                  SeriesInstanceUID: seriesUID,
                  SOPInstanceUID: instanceMetadata.SOPInstanceUID,
                });
              }
            });
          }

          // Sort instances for each series
          // For 4D data: sort by InstanceNumber first, then FrameNumber
          // This ensures correct spatial ordering, with frames within each instance in sequence
          Object.keys(instancesPerSeries).forEach(seriesUID => {
            instancesPerSeries[seriesUID].sort((a, b) => {
              const instanceDiff = (a.InstanceNumber || 0) - (b.InstanceNumber || 0);
              if (instanceDiff !== 0) return instanceDiff;
              // If same instance, sort by frame number
              return (a.FrameNumber || 0) - (b.FrameNumber || 0);
            });
          });

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
              // Resolve DICOM UID to XNAT experiment ID and project ID
              const { experimentId, projectId } = await client.resolveStudyInstanceUID(StudyInstanceUID);
              const studyMetadata = await client.getStudyMetadata(experimentId, StudyInstanceUID, projectId);
              console.log('🔄 Study metadata retrieved in promise mode:', studyMetadata);
              return await formatSeriesMetadata(studyMetadata);
            }
          }];
        }

        // Standard path - fetch immediately
        try {
          // Resolve DICOM UID to XNAT experiment ID and project ID
          const { experimentId, projectId } = await client.resolveStudyInstanceUID(StudyInstanceUID);
          const studyMetadata = await client.getStudyMetadata(experimentId, StudyInstanceUID, projectId);
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
