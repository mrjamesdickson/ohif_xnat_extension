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
   * @param {string} actualStudyInstanceUID - Required actual DICOM StudyInstanceUID from study list
   */
  async getStudyMetadata(experimentId, actualStudyInstanceUID) {
    try {
      // Require actualStudyInstanceUID parameter
      if (!actualStudyInstanceUID) {
        throw new Error(`actualStudyInstanceUID parameter is required for getStudyMetadata (experiment ${experimentId}). Cannot proceed without actual DICOM StudyInstanceUID.`);
      }

      console.log('getStudyMetadata called for experiment:', experimentId, `with StudyInstanceUID: ${actualStudyInstanceUID.substring(0, 40)}...`);
      const scans = await this.getScans(experimentId);
      console.log(`Found ${scans.length} scans for experiment ${experimentId}`);

      // Use provided StudyInstanceUID (no fallback)
      let studyInstanceUID = actualStudyInstanceUID;

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

          // Geometric metadata variables
          let imageOrientation;
          let imagePosition;
          let pixelSpacing;
          let sliceThickness;
          let rows;
          let columns;
          let sliceLocation;

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

            // Require actual SeriesInstanceUID
            if (!actualSeriesUID) {
              throw new Error(`Missing SeriesInstanceUID (0020,000E) in DICOM metadata for experiment ${experimentId}, scan ${scan.ID}`);
            }

            seriesInstanceUID = actualSeriesUID;
            // Use dicomdump StudyInstanceUID if available, otherwise use the provided one
            scanStudyInstanceUID = actualStudyUID || studyInstanceUID;

            // Update study-level UID if we got an actual one from dicomdump
            if (actualStudyUID) {
              studyInstanceUID = actualStudyUID;
            }

            seriesNumber = parseInt(getTagValue('(0020,0011)')) || parseInt(scan.ID) || 0;
            seriesDescription = getTagValue('(0008,103E)') || scan.series_description || scan.type || 'Unknown';

            // Extract geometric metadata for proper 3D reconstruction
            imageOrientation = getTagValue('(0020,0037)'); // ImageOrientationPatient
            imagePosition = getTagValue('(0020,0032)'); // ImagePositionPatient (first slice)
            pixelSpacing = getTagValue('(0028,0030)'); // PixelSpacing
            sliceThickness = parseFloat(getTagValue('(0018,0050)'));
            rows = parseInt(getTagValue('(0028,0010)'));
            columns = parseInt(getTagValue('(0028,0011)'));
            sliceLocation = parseFloat(getTagValue('(0020,1041)')) || 0;

            // Require critical geometric fields
            if (!imageOrientation) {
              throw new Error(`Missing ImageOrientationPatient (0020,0037) in DICOM metadata for experiment ${experimentId}, scan ${scan.ID}`);
            }
            if (!imagePosition) {
              throw new Error(`Missing ImagePositionPatient (0020,0032) in DICOM metadata for experiment ${experimentId}, scan ${scan.ID}`);
            }
            if (!pixelSpacing) {
              throw new Error(`Missing PixelSpacing (0028,0030) in DICOM metadata for experiment ${experimentId}, scan ${scan.ID}`);
            }
            if (!sliceThickness) {
              throw new Error(`Missing SliceThickness (0018,0050) in DICOM metadata for experiment ${experimentId}, scan ${scan.ID}`);
            }
            if (!rows || !columns) {
              throw new Error(`Missing Rows/Columns (0028,0010/0028,0011) in DICOM metadata for experiment ${experimentId}, scan ${scan.ID}`);
            }

            console.log(`Scan ${scan.ID}: Using actual DICOM metadata - Study: ${scanStudyInstanceUID.substring(0, 30)}..., Series: ${seriesInstanceUID.substring(0, 30)}...`);
          } else {
            // No DICOM metadata available from dicomdump - throw error
            throw new Error(`Failed to retrieve DICOM metadata from dicomdump for experiment ${experimentId}, scan ${scan.ID}. Cannot proceed without actual DICOM UIDs and geometric data.`);
          }

          // Parse geometric data if available from dicomdump
          let orientationArray = null;
          let positionArray = null;
          let spacingArray = null;

          if (imageOrientation) {
            orientationArray = imageOrientation.split('\\').map(parseFloat);
          }
          if (imagePosition) {
            positionArray = imagePosition.split('\\').map(parseFloat);
          }
          if (pixelSpacing) {
            spacingArray = pixelSpacing.split('\\').map(parseFloat);
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

            // Calculate ImagePositionPatient for this slice
            // Position changes along the normal vector (cross product of orientation vectors)
            let instancePosition = positionArray;
            if (positionArray && orientationArray && orientationArray.length === 6) {
              // Calculate normal vector (cross product of row and column orientation)
              const rowCosines = orientationArray.slice(0, 3);
              const colCosines = orientationArray.slice(3, 6);
              const normal = [
                rowCosines[1] * colCosines[2] - rowCosines[2] * colCosines[1],
                rowCosines[2] * colCosines[0] - rowCosines[0] * colCosines[2],
                rowCosines[0] * colCosines[1] - rowCosines[1] * colCosines[0]
              ];

              // Calculate position for this slice
              const sliceOffset = index * sliceThickness;
              instancePosition = [
                positionArray[0] + normal[0] * sliceOffset,
                positionArray[1] + normal[1] * sliceOffset,
                positionArray[2] + normal[2] * sliceOffset
              ];
            }

            const metadata = {
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
              Rows: rows,
              Columns: columns,
            };

            // Add geometric metadata if available from dicomdump
            if (orientationArray) {
              metadata.ImageOrientationPatient = orientationArray;
            }
            if (instancePosition) {
              metadata.ImagePositionPatient = instancePosition;
            }
            if (spacingArray && spacingArray.length === 2) {
              metadata.PixelSpacing = spacingArray;
              metadata.RowPixelSpacing = spacingArray[0];
              metadata.ColumnPixelSpacing = spacingArray[1];
            }
            if (sliceThickness) {
              metadata.SliceThickness = sliceThickness;
              metadata.SpacingBetweenSlices = sliceThickness;
            }
            metadata.SliceLocation = sliceLocation + (index * sliceThickness);

            return {
              url,
              metadata
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

        // Require actual DICOM StudyInstanceUID from XNAT experiment
        const xnatExperimentId = String(experiment.ID || 'unknown');

        if (!experiment.UID) {
          throw new Error(`Missing DICOM StudyInstanceUID for XNAT experiment ${xnatExperimentId}. Cannot proceed without actual DICOM UID.`);
        }

        const dicomStudyInstanceUid = String(experiment.UID);

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
