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
   */
  async getStudyMetadata(experimentId) {
    try {
      console.log('getStudyMetadata called for experiment:', experimentId);
      const scans = await this.getScans(experimentId);
      console.log(`Found ${scans.length} scans for experiment ${experimentId}`);

      const studyInstanceUID = experimentId; // XNAT experiment ID can map to Study Instance UID

      const series = await Promise.all(
        scans.map(async scan => {
          const files = await this.getScanFiles(experimentId, scan.ID);
          console.log(`Scan ${scan.ID} has ${files?.length || 0} files`);

          if (!files || files.length === 0) {
            return null;
          }

          const modality = this.getModalityFromXsiType(scan.xsiType);

          // Generate proper DICOM UIDs
          // Use XNAT base OID (2.25 is for UUID-derived UIDs)
          const seriesInstanceUID = `2.25.${experimentId}.${scan.ID}`;
          const studyInstanceUID = `2.25.${experimentId}`;

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
                StudyInstanceUID: studyInstanceUID,
                SeriesInstanceUID: seriesInstanceUID,
                SeriesNumber: parseInt(scan.ID) || index + 1,
                SeriesDescription: scan.series_description || scan.type || 'Unknown',
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

          console.log(`Scan ${scan.ID}: xsiType=${scan.xsiType}, modality=${modality}, desc=${scan.series_description}`);

          return {
            SeriesInstanceUID: seriesInstanceUID,
            SeriesNumber: parseInt(scan.ID) || 0,
            SeriesDescription: scan.series_description || scan.type || 'Unknown',
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

        const studyInstanceUid = String(
          experiment.UID || experiment.ID || 'unknown'
        );

        const study = {
          // OHIF expected fields (lowercase, as per WorkList.tsx line 256-266)
          studyInstanceUid: studyInstanceUid,
          StudyInstanceUID: studyInstanceUid,
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
