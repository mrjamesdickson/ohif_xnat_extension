import axios from 'axios';
import dcmjs from 'dcmjs';

/**
 * XNAT API Client for retrieving DICOM images
 */
class XNATClient {
  constructor(config) {
    this.baseUrl = config.xnatUrl;
    this.username = config.username;
    this.password = config.password;
    this.token = config.token;

    console.log('XNATClient config:', {
      baseUrl: this.baseUrl,
      hasUsername: !!this.username,
      hasPassword: !!this.password,
      hasToken: !!this.token
    });

    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Setup authentication
    if (this.token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
      console.log('Using Bearer token authentication');
    } else if (this.username && this.password) {
      const auth = btoa(`${this.username}:${this.password}`);
      this.client.defaults.headers.common['Authorization'] = `Basic ${auth}`;
      console.log('Using Basic authentication');
    } else {
      console.warn('No authentication credentials provided!');
    }
  }

  /**
   * Get all projects from XNAT
   */
  async getProjects() {
    try {
      const response = await this.client.get('/data/projects', {
        params: { format: 'json' }
      });
      return response.data?.ResultSet?.Result || [];
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  }

  /**
   * Get subjects for a project
   */
  async getSubjects(projectId) {
    try {
      const response = await this.client.get(`/data/projects/${projectId}/subjects`, {
        params: { format: 'json' }
      });
      return response.data?.ResultSet?.Result || [];
    } catch (error) {
      console.error('Error fetching subjects:', error);
      throw error;
    }
  }

  /**
   * Get experiments for a subject
   */
  async getExperiments(projectId, subjectId) {
    try {
      const response = await this.client.get(
        `/data/projects/${projectId}/subjects/${subjectId}/experiments`,
        { params: { format: 'json' } }
      );
      return response.data?.ResultSet?.Result || [];
    } catch (error) {
      console.error('Error fetching experiments:', error);
      throw error;
    }
  }

  /**
   * Get scans for an experiment
   */
  async getScans(experimentId) {
    try {
      const response = await this.client.get(
        `/data/experiments/${experimentId}/scans`,
        { params: { format: 'json' } }
      );
      return response.data?.ResultSet?.Result || [];
    } catch (error) {
      console.error('Error fetching scans:', error);
      throw error;
    }
  }

  /**
   * Get DICOM files for a scan
   */
  async getScanFiles(experimentId, scanId) {
    try {
      const response = await this.client.get(
        `/data/experiments/${experimentId}/scans/${scanId}/resources/DICOM/files`,
        { params: { format: 'json' } }
      );
      const files = response.data?.ResultSet?.Result || [];
      if (files.length > 0) {
        console.log(`Sample file object for scan ${scanId}:`, files[0]);
      }
      return files;
    } catch (error) {
      console.error('Error fetching scan files:', error);
      throw error;
    }
  }

  /**
   * Get DICOM metadata for a scan from XNAT using dicomdump service
   * This retrieves actual DICOM tags including SeriesInstanceUID
   */
  async getScanDicomMetadata(experimentId, scanId, projectId) {
    try {
      // Use XNAT's dicomdump service for better metadata extraction
      const src = `/archive/projects/${projectId}/experiments/${experimentId}/scans/${scanId}`;
      const response = await this.client.get(
        `/REST/services/dicomdump`,
        {
          params: {
            src: src,
            format: 'json'
          }
        }
      );

      // dicomdump returns DICOM tags in a different format
      const dicomData = response.data;

      if (dicomData && typeof dicomData === 'object') {
        console.log(`Retrieved DICOM metadata for scan ${scanId} via dicomdump`);
        return dicomData;
      }

      return null;
    } catch (error) {
      console.error(`Error fetching DICOM metadata for scan ${scanId}:`, error.message);
      // Return null instead of throwing - we'll fall back to generated UIDs
      return null;
    }
  }

  /**
   * Resolve DICOM StudyInstanceUID to XNAT experiment ID
   */
  async resolveStudyInstanceUID(studyInstanceUID, projectId = null) {
    try {
      console.log(`Resolving StudyInstanceUID: ${studyInstanceUID}`);

      const params = {
        format: 'json',
        columns: 'ID,UID,project',
        UID: studyInstanceUID
      };

      if (projectId) {
        params.project = projectId;
      }

      const response = await this.client.get('/data/experiments', { params });
      const experiments = response.data?.ResultSet?.Result || [];

      if (experiments.length > 0) {
        const experimentId = experiments[0].ID;
        console.log(`Resolved ${studyInstanceUID} to experiment ${experimentId}`);
        return experimentId;
      }

      // If no match found, assume it's already an experiment ID
      console.log(`No match found for UID ${studyInstanceUID}, treating as experiment ID`);
      return studyInstanceUID;
    } catch (error) {
      console.error('Error resolving StudyInstanceUID:', error);
      // Fallback: assume it's already an experiment ID
      return studyInstanceUID;
    }
  }

  /**
   * Download a DICOM file
   */
  async downloadDicomFile(fileUri) {
    try {
      const response = await this.client.get(fileUri, {
        responseType: 'arraybuffer'
      });
      return response.data;
    } catch (error) {
      console.error('Error downloading DICOM file:', error);
      throw error;
    }
  }

  /**
   * Get Study metadata in DICOM format
   * @param {string} experimentId - XNAT experiment ID
   * @param {string} actualStudyInstanceUID - Optional actual DICOM StudyInstanceUID from study list
   */
  async getStudyMetadata(experimentId, actualStudyInstanceUID = null) {
    try {
      console.log('getStudyMetadata called for experiment:', experimentId, actualStudyInstanceUID ? `with StudyInstanceUID: ${actualStudyInstanceUID.substring(0, 40)}...` : '');
      const scans = await this.getScans(experimentId);
      console.log(`Found ${scans.length} scans for experiment ${experimentId}`);

      // Use provided StudyInstanceUID or generate fallback
      let studyInstanceUID = actualStudyInstanceUID || `2.25.${experimentId}`;

      const series = await Promise.all(
        scans.map(async scan => {
          const files = await this.getScanFiles(experimentId, scan.ID);
          console.log(`Scan ${scan.ID} has ${files?.length || 0} files`);

          if (!files || files.length === 0) {
            return null;
          }

          const modality = this.getModalityFromXsiType(scan.xsiType);

          // Get project ID from scan object
          const projectId = scan.project || scan['xnat:imagescandata/project'] || '';

          // Try to get actual DICOM metadata from XNAT
          const dicomMetadata = await this.getScanDicomMetadata(experimentId, scan.ID, projectId);

          // Use actual DICOM UIDs if available, otherwise generate them
          let seriesInstanceUID;
          let scanStudyInstanceUID;
          let seriesNumber;
          let seriesDescription;

          if (dicomMetadata) {
            // Extract DICOM tags from dicomdump format
            // dicomdump returns ResultSet.Result array with tag1, value, desc
            const results = dicomMetadata.ResultSet?.Result || [];

            // Helper function to find tag value
            const getTagValue = (tagPattern) => {
              const tag = results.find(item => item.tag1 === tagPattern);
              return tag?.value || null;
            };

            const actualSeriesUID = getTagValue('(0020,000E)');
            const actualStudyUID = getTagValue('(0020,000D)');

            seriesInstanceUID = actualSeriesUID || `2.25.${experimentId}.${scan.ID}`;
            // Use dicomdump UID if available, otherwise use the study-level UID (which could be from parameter or generated)
            scanStudyInstanceUID = actualStudyUID || studyInstanceUID;
            seriesNumber = parseInt(getTagValue('(0020,0011)')) || parseInt(scan.ID) || 0;
            seriesDescription = getTagValue('(0008,103E)') || scan.series_description || scan.type || 'Unknown';

            // Update study-level UID if we got an actual one from dicomdump
            if (actualStudyUID) {
              studyInstanceUID = actualStudyUID;
            }

            if (actualSeriesUID) {
              console.log(`Scan ${scan.ID}: Using actual DICOM UIDs - Study: ${scanStudyInstanceUID.substring(0, 30)}..., Series: ${seriesInstanceUID.substring(0, 30)}...`);
            } else {
              console.log(`Scan ${scan.ID}: Using generated UIDs (metadata unavailable)`);
            }
          } else {
            // Fallback: use study-level UID (from parameter or generated) and generate series UID
            seriesInstanceUID = `2.25.${experimentId}.${scan.ID}`;
            scanStudyInstanceUID = studyInstanceUID;
            seriesNumber = parseInt(scan.ID) || 0;
            seriesDescription = scan.series_description || scan.type || 'Unknown';
            console.log(`Scan ${scan.ID}: Using fallback UIDs (dicomdump unavailable) - Study: ${scanStudyInstanceUID.substring(0, 30)}...`);
          }

          // Get all instances for this series - use full URL with baseUrl
          const instances = files.map((file, index) => {
            const url = `${this.baseUrl}${file.URI}`;
            if (index === 0) {
              console.log(`Sample DICOM file URL for scan ${scan.ID}:`, url);
            }

            // Determine SOPClassUID based on modality
            // These are common DICOM SOPClassUIDs
            let SOPClassUID;
            if (modality === 'CT') {
              SOPClassUID = '1.2.840.10008.5.1.4.1.1.2'; // CT Image Storage
            } else if (modality === 'MR') {
              SOPClassUID = '1.2.840.10008.5.1.4.1.1.4'; // MR Image Storage
            } else if (modality === 'PT') {
              SOPClassUID = '1.2.840.10008.5.1.4.1.1.128'; // PET Image Storage
            } else {
              SOPClassUID = '1.2.840.10008.5.1.4.1.1.2'; // Default to CT
            }

            return {
              url,
              metadata: {
                StudyInstanceUID: scanStudyInstanceUID,
                SeriesInstanceUID: seriesInstanceUID,
                SeriesNumber: seriesNumber,
                SeriesDescription: seriesDescription,
                SeriesDate: scan.date || '',
                SeriesTime: '',
                InstanceNumber: index + 1,
                SOPInstanceUID: `${seriesInstanceUID}.${index + 1}`,
                SOPClassUID: SOPClassUID,
                Modality: modality,
                NumberOfFrames: 1,
                Rows: 512,  // Default, will be overwritten when DICOM loads
                Columns: 512,
              }
            };
          });

          console.log(`Scan ${scan.ID}: xsiType=${scan.xsiType}, modality=${modality}, desc=${seriesDescription}`);

          return {
            SeriesInstanceUID: seriesInstanceUID,
            SeriesNumber: seriesNumber,
            SeriesDescription: seriesDescription,
            Modality: modality,
            instances,
          };
        })
      );

      const filteredSeries = series.filter(s => s !== null);
      console.log(`Returning ${filteredSeries.length} series for experiment ${experimentId}`);

      return {
        StudyInstanceUID: studyInstanceUID,
        StudyDescription: experimentId,
        series: filteredSeries,
      };
    } catch (error) {
      console.error('Error getting study metadata:', error);
      throw error;
    }
  }

  /**
   * Get all experiments from XNAT
   */
  async getExperimentsAll(limit = 100, project = null) {
    try {
      const params = {
        format: 'json',
        limit: limit,
        columns: [
          'ID',
          'UID',
          'date',
          'label',
          'project',
          'subject_ID',
          'xsiType',
          'modality'
        ].join(',')
      };

      // Add project filter if specified
      if (project) {
        params.project = project;
      }

      const response = await this.client.get('/data/experiments', { params });
      return response.data?.ResultSet?.Result || [];
    } catch (error) {
      console.error('Error fetching all experiments:', error);
      throw error;
    }
  }

  /**
   * Search for studies matching query parameters
   * Uses direct /data/experiments API for better performance
   */
  async searchForStudies(params = {}) {
    try {
      // Support project filtering via AccessionNumber field (OHIF study list filter)
      const projectFilter = params.AccessionNumber || null;

      console.log('Searching for XNAT experiments...', projectFilter ? `in project: ${projectFilter}` : 'all projects');

      // Get experiments directly - much faster than nested queries
      const experiments = await this.getExperimentsAll(100, projectFilter);

      console.log(`Found ${experiments.length} experiments from XNAT`);

      // Filter for imaging sessions only (exclude non-imaging xsiTypes)
      const imagingExperiments = experiments.filter(exp => {
        const modality = this.getModalityFromXsiType(exp.xsiType);
        return modality !== 'OT'; // Exclude "Other" type (non-imaging sessions)
      });

      console.log(`Filtered to ${imagingExperiments.length} imaging sessions`);

      if (imagingExperiments.length > 0) {
        console.log('Sample imaging experiment:', imagingExperiments[0]);
      }

      const studies = imagingExperiments.map(experiment => {
        const modality = String(this.getModalityFromXsiType(experiment.xsiType));

        const rawDate =
          experiment.date ??
          experiment['data_fields/date'] ??
          experiment.data_fields?.date ??
          '';
        const formattedDate = String(rawDate || '').replace(/-/g, '');

        // Preserve the XNAT experiment ID for metadata retrieval while
        // still exposing the actual DICOM StudyInstanceUID when available.
        const xnatExperimentId = String(experiment.ID || 'unknown');
        const dicomStudyInstanceUid = String(
          experiment.UID || xnatExperimentId
        );

        const study = {
          // OHIF expected fields (lowercase, as per WorkList.tsx line 256-266)
          studyInstanceUid: dicomStudyInstanceUid,
          StudyInstanceUID: dicomStudyInstanceUid,
          xnatExperimentId: xnatExperimentId,
          XnatExperimentID: xnatExperimentId,
          date: formattedDate,  // YYYYMMDD format
          time: String(''),
          description: String(experiment.label || 'No Description'),
          modalities: modality,
          accession: String(experiment.ID || ''),
          instances: Number(0),
          patientName: String(experiment.label || 'Unknown'),
          mrn: String(experiment.subject_ID || experiment.ID || 'unknown'),

          // Additional XNAT fields
          ProjectID: String(experiment.project || ''),
          ProjectName: String(experiment.project || ''),
          StudyDate: formattedDate,
        };

        // Ensure all fields are defined
        Object.keys(study).forEach(key => {
          if (study[key] === undefined || study[key] === null) {
            study[key] = '';
          }
        });

        return study;
      });

      console.log(`Returning ${studies.length} studies to OHIF`);
      console.log('First study sample:', studies[0]);
      return studies;
    } catch (error) {
      console.error('Error searching for studies:', error);
      throw error;
    }
  }

  /**
   * Extract modality from XNAT xsiType
   */
  getModalityFromXsiType(xsiType) {
    if (!xsiType) return 'OT';

    const typeMap = {
      // Session types
      'xnat:ctSessionData': 'CT',
      'xnat:mrSessionData': 'MR',
      'xnat:petSessionData': 'PT',
      'xnat:crSessionData': 'CR',
      'xnat:dxSessionData': 'DX',
      'xnat:mgSessionData': 'MG',
      'xnat:usSessionData': 'US',
      // Scan types
      'xnat:ctScanData': 'CT',
      'xnat:mrScanData': 'MR',
      'xnat:petScanData': 'PT',
      'xnat:crScanData': 'CR',
      'xnat:dxScanData': 'DX',
      'xnat:mgScanData': 'MG',
      'xnat:usScanData': 'US',
    };

    return typeMap[xsiType] || 'OT';
  }
}

export default XNATClient;
