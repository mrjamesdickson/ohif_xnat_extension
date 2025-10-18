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
      withCredentials: true,
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
   * Login to XNAT - browser will automatically handle JSESSIONID cookie
   */
  static async login(xnatUrl, username, password) {
    try {
      const response = await axios.post(
        `${xnatUrl}/data/services/auth`,
        null,
        {
          auth: {
            username: username,
            password: password
          },
          withCredentials: true
        }
      );

      console.log('✅ Login successful, JSESSIONID cookie set by browser');
      return true; // Browser handles cookie automatically
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error(`Login failed: ${error.response?.status} ${error.response?.statusText || error.message}`);
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
   * Get DICOM metadata for a scan by fetching the first DICOM file's header
   * Uses HTTP Range request for efficiency
   */
  async getScanDicomMetadata(experimentId, scanId, projectId) {
    try {
      console.log(`🔍 getScanDicomMetadata: experimentId=${experimentId}, scanId=${scanId}, projectId=${projectId}`);

      // Get files for this scan
      const files = await this.getScanFiles(experimentId, scanId);
      if (!files || files.length === 0) {
        console.warn(`⚠️ No files found for scan ${scanId}`);
        return null;
      }

      // Use first file to get scan-level metadata
      const firstFile = files[0];
      console.log(`🔍 Fetching scan metadata from first file: ${firstFile.Name}`);

      const metadata = await this.getFileDicomMetadata({
        projectId,
        experimentId,
        scanId,
        file: firstFile
      });

      if (metadata?.ResultSet?.Result) {
        console.log(`✅ Found ${metadata.ResultSet.Result.length} metadata tags for scan ${scanId}`);
      } else {
        console.warn(`⚠️ No metadata returned for scan ${scanId}`);
      }

      return metadata;
    } catch (error) {
      console.error(`❌ Error fetching DICOM metadata for scan ${scanId}:`, error.message);
      return null;
    }
  }

  /**
   * Convert a /data URI returned by XNAT into a path usable with dicomdump (/archive)
   * @param {string} uri - URI from XNAT file listing
   * @returns {string|null} archive-compatible URI
   */
  _toArchivePath(uri) {
    if (!uri) {
      return null;
    }

    const sanitized = uri.split('?')[0];

    if (sanitized.startsWith('/archive/')) {
      return sanitized;
    }

    if (sanitized.startsWith('/data/archive/')) {
      return sanitized.replace('/data', '');
    }

    if (sanitized.startsWith('/data/')) {
      return sanitized.replace('/data', '/archive');
    }

    if (sanitized.startsWith('/REST/')) {
      return sanitized;
    }

    return sanitized.startsWith('/')
      ? `/archive${sanitized}`
      : `/archive/${sanitized}`;
  }

  /**
   * Fetch DICOM header directly from file using HTTP Range request
   * More efficient than dicomdump - only downloads first 64KB (header only)
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} params.experimentId
   * @param {string} params.scanId
   * @param {Object} params.file - File entry from XNAT file listing
   * @returns {Promise<Object|null>}
   */
  async getFileDicomMetadata({ projectId, experimentId, scanId, file }) {
    // Build path using resource ID from file.cat_ID
    const resourceId = file?.cat_ID || 'DICOM';
    const fileName = file?.Name;

    if (!fileName) {
      console.warn(`No file name found for file:`, file);
      return null;
    }

    try {
      const path = `/data/experiments/${experimentId}/scans/${scanId}/resources/${resourceId}/files/${fileName}`;

      console.log(`🔍 Fetching DICOM header via HTTP Range: ${path.substring(0, 100)}...`);

      // Fetch first 64KB using HTTP Range header (header only, not pixel data)
      const response = await this.client.get(path, {
        headers: {
          'Range': 'bytes=0-65535'
        },
        responseType: 'arraybuffer'
      });

      console.log(`📊 HTTP ${response.status}, Content-Length: ${response.headers['content-length']}, Data size: ${response.data?.byteLength || 0}`);

      const arrayBuffer = response.data;

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        console.warn(`⚠️ Empty response for ${fileName}`);
        return null;
      }
      const dicomParser = await import('dicom-parser');
      const byteArray = new Uint8Array(arrayBuffer);

      // Parse with untilTag option to handle partial data (stops before pixel data)
      // Tag (7FE0,0010) is Pixel Data - we don't need it for metadata
      const dataSet = dicomParser.default.parseDicom(byteArray, {
        untilTag: 'x7fe00010'
      });

      // Extract tags in same format as dicomdump for compatibility
      const extractedData = {
        ResultSet: {
          Result: [
            { tag1: '(0020,000E)', value: dataSet.string('x0020000e') }, // SeriesInstanceUID - CRITICAL
            { tag1: '(0020,000D)', value: dataSet.string('x0020000d') }, // StudyInstanceUID - CRITICAL
            { tag1: '(0020,0013)', value: dataSet.string('x00200013') }, // InstanceNumber
            { tag1: '(0020,0032)', value: dataSet.string('x00200032') }, // ImagePositionPatient
            { tag1: '(0020,0037)', value: dataSet.string('x00200037') }, // ImageOrientationPatient
            { tag1: '(0028,0030)', value: dataSet.string('x00280030') }, // PixelSpacing
            { tag1: '(0018,0050)', value: dataSet.string('x00180050') }, // SliceThickness
            { tag1: '(0018,0088)', value: dataSet.string('x00180088') }, // SpacingBetweenSlices
            { tag1: '(0020,1041)', value: dataSet.string('x00201041') }, // SliceLocation
            { tag1: '(0008,0018)', value: dataSet.string('x00080018') }, // SOPInstanceUID
            { tag1: '(0028,0008)', value: dataSet.string('x00280008') }, // NumberOfFrames
            { tag1: '(0028,0009)', value: dataSet.string('x00280009') }, // FrameIncrementPointer
            { tag1: '(0018,1063)', value: dataSet.string('x00181063') }, // FrameTime
            { tag1: '(0018,1065)', value: dataSet.string('x00181065') }, // FrameTimeVector
            { tag1: '(0020,9128)', value: dataSet.string('x00209128') }, // TemporalPositionIndex
            { tag1: '(0028,0010)', value: dataSet.string('x00280010') }, // Rows
            { tag1: '(0028,0011)', value: dataSet.string('x00280011') }, // Columns
            { tag1: '(0020,0052)', value: dataSet.string('x00200052') }, // FrameOfReferenceUID
            { tag1: '(0008,0032)', value: dataSet.string('x00080032') }, // AcquisitionTime
            { tag1: '(0020,0012)', value: dataSet.string('x00200012') }, // AcquisitionNumber
            { tag1: '(0020,0011)', value: dataSet.string('x00200011') }, // SeriesNumber
          ].filter(item => item.value !== undefined)
        }
      };

      console.log(`✅ Extracted ${extractedData.ResultSet.Result.length} DICOM tags via HTTP Range`);
      return extractedData;
    } catch (error) {
      console.warn(`❌ Failed to fetch DICOM header for ${fileName}:`, error.message || error);
      console.warn(`   Full error:`, error);
      return null;
    }
  }

  /**
   * Fetch dicomdump metadata for a list of scan files with limited concurrency
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} params.experimentId
   * @param {string} params.scanId
   * @param {Array<Object>} params.files
   * @param {number} [params.concurrency=5]
   * @returns {Promise<Array<Object|null>>}
   */
  async getScanFilesDicomMetadata({ projectId, experimentId, scanId, files, concurrency = 5 }) {
    if (!Array.isArray(files) || files.length === 0) {
      return [];
    }

    const results = new Array(files.length).fill(null);

    for (let index = 0; index < files.length; index += concurrency) {
      const chunk = files.slice(index, index + concurrency);

      const chunkResults = await Promise.all(
        chunk.map(file =>
          this.getFileDicomMetadata({ projectId, experimentId, scanId, file })
        )
      );

      chunkResults.forEach((value, chunkOffset) => {
        results[index + chunkOffset] = value;
      });
    }

    return results;
  }

  /**
   * Resolve DICOM StudyInstanceUID to XNAT experiment ID and project ID
   * @returns {Object} {experimentId, projectId}
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
        const experimentProjectId = experiments[0].project;
        console.log(`Resolved ${studyInstanceUID} to experiment ${experimentId} in project ${experimentProjectId}`);
        return { experimentId, projectId: experimentProjectId };
      }

      // If no match found, assume it's already an experiment ID
      console.log(`No match found for UID ${studyInstanceUID}, treating as experiment ID`);
      return { experimentId: studyInstanceUID, projectId: null };
    } catch (error) {
      console.error('Error resolving StudyInstanceUID:', error);
      // Fallback: assume it's already an experiment ID
      return { experimentId: studyInstanceUID, projectId: null };
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
   * @param {string} projectId - XNAT project ID
   */
  async getStudyMetadata(experimentId, actualStudyInstanceUID, projectId) {
    try {
      // Require actualStudyInstanceUID parameter
      if (!actualStudyInstanceUID) {
        throw new Error(`actualStudyInstanceUID parameter is required for getStudyMetadata (experiment ${experimentId}). Cannot proceed without actual DICOM StudyInstanceUID.`);
      }

      const startTime = performance.now();
      console.log('⏱️ getStudyMetadata START for experiment:', experimentId, `with StudyInstanceUID: ${actualStudyInstanceUID.substring(0, 40)}...`, `project: ${projectId}`);

      const scansStartTime = performance.now();
      const scans = await this.getScans(experimentId);
      console.log(`⏱️ Fetched ${scans.length} scans in ${(performance.now() - scansStartTime).toFixed(0)}ms`);

      // Use provided StudyInstanceUID (no fallback)
      let studyInstanceUID = actualStudyInstanceUID;

      const seriesStartTime = performance.now();
      const series = await Promise.all(
        scans.map(async scan => {
          const scanStartTime = performance.now();
          const files = await this.getScanFiles(experimentId, scan.ID);
          console.log(`Scan ${scan.ID} has ${files?.length || 0} files (${(performance.now() - scanStartTime).toFixed(0)}ms)`);

          if (!files || files.length === 0) {
            return null;
          }

          const modality = this.getModalityFromXsiType(scan.xsiType);

          // Try to get actual DICOM metadata from XNAT (using projectId parameter)
          console.log(`🔍 About to call getScanDicomMetadata for scan ${scan.ID}, experimentId=${experimentId}, projectId=${projectId}`);
          const dicomMetadata = await this.getScanDicomMetadata(experimentId, scan.ID, projectId);
          console.log(`📥 getScanDicomMetadata returned for scan ${scan.ID}:`, dicomMetadata ? 'has data' : 'NULL');

          const createTagValueGetter = (dicomData) => {
            const results = dicomData?.ResultSet?.Result || [];
            return (tagPattern) => {
              const tag = results.find(item => item.tag1 === tagPattern);
              return tag?.value || null;
            };
          };

          const parseIntSafe = value => {
            if (value === null || value === undefined || value === '') {
              return null;
            }
            const parsed = parseInt(value, 10);
            return Number.isNaN(parsed) ? null : parsed;
          };

          const parseFloatSafe = value => {
            if (value === null || value === undefined || value === '') {
              return null;
            }
            const parsed = parseFloat(value);
            return Number.isNaN(parsed) ? null : parsed;
          };

          const parseNumberArray = value => {
            if (!value || typeof value !== 'string') {
              return null;
            }
            const parts = value
              .split('\\')
              .map(component => parseFloat(component))
              .filter(num => !Number.isNaN(num));
            return parts.length ? parts : null;
          };

          const computeNormalVector = orientation => {
            if (!Array.isArray(orientation) || orientation.length !== 6) {
              return null;
            }
            const rowCosines = orientation.slice(0, 3);
            const colCosines = orientation.slice(3, 6);
            return [
              rowCosines[1] * colCosines[2] - rowCosines[2] * colCosines[1],
              rowCosines[2] * colCosines[0] - rowCosines[0] * colCosines[2],
              rowCosines[0] * colCosines[1] - rowCosines[1] * colCosines[0],
            ];
          };

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

          // Multi-frame and temporal metadata variables
          let numberOfFrames = 1;
          let frameIncrementPointer = null;
          let frameTime = null;
          let frameTimeVector = null;
          let temporalPositionIndex = null;
          let frameOfReferenceUID = null;

          if (dicomMetadata) {
            // Extract DICOM tags from dicomdump format
            const getTagValue = createTagValueGetter(dicomMetadata);

            const actualSeriesUID = getTagValue('(0020,000E)');
            const actualStudyUID = getTagValue('(0020,000D)');

            numberOfFrames = parseIntSafe(getTagValue('(0028,0008)')) || 1;
            frameIncrementPointer = getTagValue('(0028,0009)');
            frameTime = parseFloatSafe(getTagValue('(0018,1063)'));
            frameTimeVector = getTagValue('(0018,1065)');
            temporalPositionIndex = parseIntSafe(getTagValue('(0020,9128)'));

            // Skip scan if missing SeriesInstanceUID
            if (!actualSeriesUID) {
              console.warn(`Skipping scan ${scan.ID} in experiment ${experimentId}: Missing SeriesInstanceUID (0020,000E)`);
              return null;
            }

            seriesInstanceUID = actualSeriesUID;
            // Use dicomdump StudyInstanceUID if available, otherwise use the provided one
            scanStudyInstanceUID = actualStudyUID || studyInstanceUID;

            // Update study-level UID if we got an actual one from dicomdump
            if (actualStudyUID) {
              studyInstanceUID = actualStudyUID;
            }

            seriesNumber = parseIntSafe(getTagValue('(0020,0011)')) || parseIntSafe(scan.ID) || 0;
            seriesDescription = getTagValue('(0008,103E)') || scan.series_description || scan.type || 'Unknown';

            // Extract geometric metadata for proper 3D reconstruction
            imageOrientation = getTagValue('(0020,0037)'); // ImageOrientationPatient
            imagePosition = getTagValue('(0020,0032)'); // ImagePositionPatient (first slice)
            pixelSpacing = getTagValue('(0028,0030)'); // PixelSpacing
            sliceThickness = parseFloatSafe(getTagValue('(0018,0050)'));
            rows = parseIntSafe(getTagValue('(0028,0010)'));
            columns = parseIntSafe(getTagValue('(0028,0011)'));
            sliceLocation = parseFloatSafe(getTagValue('(0020,1041)')) || 0;
            frameOfReferenceUID = getTagValue('(0020,0052)');

            // Warn about missing geometric fields but don't skip the scan
            let hasWarnings = false;
            if (!imageOrientation) {
              console.warn(`⚠️  Scan ${scan.ID}: Missing ImageOrientationPatient (0020,0037) - using default axial orientation`);
              imageOrientation = '1\\0\\0\\0\\1\\0'; // Default to axial
              hasWarnings = true;
            }
            if (!imagePosition) {
              console.warn(`⚠️  Scan ${scan.ID}: Missing ImagePositionPatient (0020,0032) - using default position`);
              imagePosition = '0\\0\\0'; // Default to origin
              hasWarnings = true;
            }
            if (!pixelSpacing) {
              console.warn(`⚠️  Scan ${scan.ID}: Missing PixelSpacing (0028,0030) - using default 1.0mm`);
              pixelSpacing = '1\\1'; // Default to 1mm spacing
              hasWarnings = true;
            }
            if (!sliceThickness) {
              console.warn(`⚠️  Scan ${scan.ID}: Missing SliceThickness (0018,0050) - using default 1.0mm`);
              sliceThickness = 1.0; // Default to 1mm
              hasWarnings = true;
            }
            if (!rows || !columns) {
              console.warn(`⚠️  Scan ${scan.ID}: Missing Rows/Columns (0028,0010/0028,0011) - using defaults`);
              rows = rows || 512;
              columns = columns || 512;
              hasWarnings = true;
            }

            console.log(`Scan ${scan.ID}: Using ${hasWarnings ? 'partial' : 'complete'} DICOM metadata - Study: ${scanStudyInstanceUID.substring(0, 30)}..., Series: ${seriesInstanceUID.substring(0, 30)}...`);
          } else {
            // No DICOM metadata available from dicomdump - skip this scan
            console.warn(`Skipping scan ${scan.ID} in experiment ${experimentId}: Failed to retrieve DICOM metadata from dicomdump`);
            return null;
          }

          // Retrieve file-level dicom metadata to derive reliable ordering and slice geometry
          console.log(`🔍 Scan ${scan.ID}: About to fetch file-level metadata for ${files.length} files`);
          const fileLevelDicomMetadata = await this.getScanFilesDicomMetadata({
            projectId,
            experimentId,
            scanId: scan.ID,
            files
          });
          console.log(`📦 Scan ${scan.ID}: Retrieved file-level metadata, ${fileLevelDicomMetadata.filter(Boolean).length}/${files.length} successful`);

          const parsedFileMetadata = fileLevelDicomMetadata.map((dicomData, fileIndex) => {
            if (!dicomData) {
              return null;
            }

            const getFileTagValue = createTagValueGetter(dicomData);

            const instanceNumberValue = parseIntSafe(getFileTagValue('(0020,0013)'));
            const imagePositionValue = getFileTagValue('(0020,0032)');
            const imageOrientationValue = getFileTagValue('(0020,0037)');
            const pixelSpacingValue = getFileTagValue('(0028,0030)');
            const sliceThicknessValue = parseFloatSafe(getFileTagValue('(0018,0050)'));
            const spacingBetweenSlicesValue = parseFloatSafe(getFileTagValue('(0018,0088)'));
            const sliceLocationValue = parseFloatSafe(getFileTagValue('(0020,1041)'));
            const sopInstanceUIDValue = getFileTagValue('(0008,0018)');
            const numberOfFramesValue = parseIntSafe(getFileTagValue('(0028,0008)'));
            const frameIncrementPointerValue = getFileTagValue('(0028,0009)');
            const frameTimeValue = parseFloatSafe(getFileTagValue('(0018,1063)'));
            const frameTimeVectorValue = getFileTagValue('(0018,1065)');
            const temporalPositionIndexValue = parseIntSafe(getFileTagValue('(0020,9128)'));
            const rowsValue = parseIntSafe(getFileTagValue('(0028,0010)'));
            const columnsValue = parseIntSafe(getFileTagValue('(0028,0011)'));
            const frameOfReferenceUIDValue = getFileTagValue('(0020,0052)');
            const acquisitionTimeValue = getFileTagValue('(0008,0032)');
            const acquisitionNumberValue = parseIntSafe(getFileTagValue('(0020,0012)'));
            const seriesNumberValue = parseIntSafe(getFileTagValue('(0020,0011)'));

            const imageOrientationArrayValue = parseNumberArray(imageOrientationValue);
            const pixelSpacingArrayValue = parseNumberArray(pixelSpacingValue);
            const frameTimeVectorArrayValue = parseNumberArray(frameTimeVectorValue);

            return {
              instanceNumber: instanceNumberValue,
              imagePosition: imagePositionValue,
              imagePositionArray: parseNumberArray(imagePositionValue),
              imageOrientation: imageOrientationValue,
              imageOrientationArray: imageOrientationArrayValue,
              pixelSpacing: pixelSpacingValue,
              pixelSpacingArray: pixelSpacingArrayValue,
              sliceThickness: sliceThicknessValue,
              spacingBetweenSlices: spacingBetweenSlicesValue,
              sliceLocation: sliceLocationValue,
              sopInstanceUID: sopInstanceUIDValue,
              numberOfFrames: numberOfFramesValue,
              frameIncrementPointer: frameIncrementPointerValue,
              frameTime: frameTimeValue,
              frameTimeVector: frameTimeVectorValue,
              frameTimeVectorArray: frameTimeVectorArrayValue,
              temporalPositionIndex: temporalPositionIndexValue,
              rows: rowsValue,
              columns: columnsValue,
              frameOfReferenceUID: frameOfReferenceUIDValue,
              acquisitionTime: acquisitionTimeValue,
              acquisitionNumber: acquisitionNumberValue,
              seriesNumber: seriesNumberValue,
            };
          });

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

          const baseNormal = computeNormalVector(orientationArray);

          const compareNumeric = (aValue, bValue) => {
            const aValid = Number.isFinite(aValue);
            const bValid = Number.isFinite(bValue);

            if (aValid && bValid) {
              if (aValue < bValue) return -1;
              if (aValue > bValue) return 1;
              return 0;
            }

            if (aValid) return -1;
            if (bValid) return 1;
            return 0;
          };

          // Build file descriptors enriched with per-file metadata to enable deterministic sorting
          const filesWithMetadata = files.map((file, index) => {
            const url = `${this.baseUrl}${file.URI}`;
            const perFileMeta = parsedFileMetadata[index] || {};

            let instanceNum = perFileMeta.instanceNumber;
            if (!Number.isFinite(instanceNum)) {
              if (file.Name) {
                const match = file.Name.match(/[-_]?(\d+)(?:\.dcm)?$/i);
                if (match) {
                  const parsedFromName = parseIntSafe(match[1]);
                  if (parsedFromName !== null) {
                    instanceNum = parsedFromName;
                  }
                }
              }
            }
            if (!Number.isFinite(instanceNum)) {
              instanceNum = index;
            }

            const sliceThicknessValue = perFileMeta.sliceThickness ?? sliceThickness;
            const spacingBetweenSlicesValue = perFileMeta.spacingBetweenSlices ?? null;
            const orientationForMetric = perFileMeta.imageOrientationArray || orientationArray;
            const normalForMetric = computeNormalVector(orientationForMetric) || baseNormal;
            const positionVector = perFileMeta.imagePositionArray || positionArray;
            const pixelSpacingArray = perFileMeta.pixelSpacingArray || spacingArray;
            const pixelSpacingStringValue = perFileMeta.pixelSpacing || (pixelSpacingArray ? pixelSpacingArray.join('\\') : pixelSpacing);
            const frameTimeVectorArray = perFileMeta.frameTimeVectorArray || null;

            let positionAlongNormal = null;
            if (
              normalForMetric &&
              Array.isArray(positionVector) &&
              positionVector.length === 3
            ) {
              positionAlongNormal =
                positionVector[0] * normalForMetric[0] +
                positionVector[1] * normalForMetric[1] +
                positionVector[2] * normalForMetric[2];
            }

            return {
              file,
              url,
              originalIndex: index,
              instanceNumber: instanceNum,
              imagePositionArray: perFileMeta.imagePositionArray,
              orientationArray: orientationForMetric,
              positionAlongNormal,
              pixelSpacingArray,
              pixelSpacingString: pixelSpacingStringValue,
              sliceThicknessValue,
              spacingBetweenSlicesValue,
              sliceLocation: perFileMeta.sliceLocation ?? sliceLocation,
              sopInstanceUID: perFileMeta.sopInstanceUID || null,
              numberOfFrames: perFileMeta.numberOfFrames || numberOfFrames,
              frameIncrementPointer: perFileMeta.frameIncrementPointer ?? frameIncrementPointer,
              frameTime: perFileMeta.frameTime ?? frameTime,
              frameTimeVector: perFileMeta.frameTimeVector ?? frameTimeVector,
              frameTimeVectorArray,
              temporalPositionIndexValue: perFileMeta.temporalPositionIndex ?? temporalPositionIndex,
              frameOfReferenceUID: perFileMeta.frameOfReferenceUID || frameOfReferenceUID,
              rowsValue: perFileMeta.rows || rows,
              columnsValue: perFileMeta.columns || columns,
            };
          });

          // Debug: Log first few files before sorting
          console.log(`🔍 Scan ${scan.ID}: Before sorting, first 5 files:`, filesWithMetadata.slice(0, 5).map((f, idx) => ({
            originalIndex: f.originalIndex,
            instanceNumber: f.instanceNumber,
            positionAlongNormal: f.positionAlongNormal,
            imagePosition: f.imagePositionArray,
            sliceLocation: f.sliceLocation,
            temporalIndex: f.temporalPositionIndexValue,
            fileName: f.file?.name || 'unknown'
          })));

          filesWithMetadata.sort((a, b) => {
            const normalPositionComparison = compareNumeric(a.positionAlongNormal, b.positionAlongNormal);
            if (normalPositionComparison !== 0) {
              return normalPositionComparison;
            }

            const positionComparisonRaw = compareNumeric(
              a.imagePositionArray?.[2],
              b.imagePositionArray?.[2]
            );
            if (positionComparisonRaw !== 0) {
              return positionComparisonRaw;
            }

            const sliceLocationComparison = compareNumeric(a.sliceLocation, b.sliceLocation);
            if (sliceLocationComparison !== 0) {
              return sliceLocationComparison;
            }

            const temporalComparison = compareNumeric(a.temporalPositionIndexValue, b.temporalPositionIndexValue);
            if (temporalComparison !== 0) {
              return temporalComparison;
            }

            const instanceComparison = compareNumeric(a.instanceNumber, b.instanceNumber);
            if (instanceComparison !== 0) {
              return instanceComparison;
            }

            return a.originalIndex - b.originalIndex;
          });

          // Debug: Log first few files after sorting
          console.log(`✅ Scan ${scan.ID}: After sorting, first 5 files:`, filesWithMetadata.slice(0, 5).map((f, idx) => ({
            sortedIndex: idx,
            originalIndex: f.originalIndex,
            instanceNumber: f.instanceNumber,
            positionAlongNormal: f.positionAlongNormal,
            imagePosition: f.imagePositionArray,
            sliceLocation: f.sliceLocation,
            temporalIndex: f.temporalPositionIndexValue,
            fileName: f.file?.name || 'unknown'
          })));

          const firstPosition = filesWithMetadata[0]?.positionAlongNormal ?? filesWithMetadata[0]?.imagePositionArray?.[2];
          const lastPosition = filesWithMetadata[filesWithMetadata.length - 1]?.positionAlongNormal ??
            filesWithMetadata[filesWithMetadata.length - 1]?.imagePositionArray?.[2];

          console.log(`Scan ${scan.ID}: sorted ${filesWithMetadata.length} files by ImagePositionPatient (first position: ${firstPosition}, last position: ${lastPosition})`);

          // Now create instances in the correct order
          const instances = filesWithMetadata.map((fileData, sortedIndex) => {
            const {
              url,
              instanceNumber,
              sopInstanceUID,
              imagePositionArray: perFilePositionArray,
              orientationArray: perFileOrientationArray,
              pixelSpacingString,
              sliceThicknessValue,
              frameIncrementPointer: perFileFrameIncrementPointer,
              frameTime: perFileFrameTime,
              frameTimeVector: perFileFrameTimeVector,
              frameTimeVectorArray: perFileFrameTimeVectorArray,
              numberOfFrames: perFileNumberOfFrames,
              temporalPositionIndexValue,
              frameOfReferenceUID: perFileFrameOfReferenceUID,
              rowsValue,
              columnsValue,
              spacingBetweenSlicesValue,
              sliceLocation: perFileSliceLocation,
            } = fileData;

            if (sortedIndex === 0) {
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

            // Calculate ImagePositionPatient for this slice using sortedIndex
            // Position changes along the normal vector (cross product of orientation vectors)
            let instancePosition = perFilePositionArray || positionArray;
            const orientationForInstance = perFileOrientationArray || orientationArray;

            if ((!instancePosition || instancePosition.length !== 3) &&
                orientationForInstance && orientationForInstance.length === 6 && positionArray) {
              const rowCosines = orientationForInstance.slice(0, 3);
              const colCosines = orientationForInstance.slice(3, 6);
              const normal = [
                rowCosines[1] * colCosines[2] - rowCosines[2] * colCosines[1],
                rowCosines[2] * colCosines[0] - rowCosines[0] * colCosines[2],
                rowCosines[0] * colCosines[1] - rowCosines[1] * colCosines[0]
              ];

              const sliceOffset = sortedIndex * (sliceThicknessValue ?? sliceThickness ?? 1);
              instancePosition = [
                positionArray[0] + normal[0] * sliceOffset,
                positionArray[1] + normal[1] * sliceOffset,
                positionArray[2] + normal[2] * sliceOffset
              ];
            }

            const pixelSpacingArray = parseNumberArray(pixelSpacingString) || spacingArray;
            const thicknessForInstance = sliceThicknessValue ?? sliceThickness ?? 1;
            const spacingBetweenSlicesForInstance = spacingBetweenSlicesValue ?? thicknessForInstance;
            const frameOfReferenceForInstance = perFileFrameOfReferenceUID || frameOfReferenceUID;
            const rowsForInstance = rowsValue || rows;
            const columnsForInstance = columnsValue || columns;

            const metadata = {
              StudyInstanceUID: scanStudyInstanceUID,
              SeriesInstanceUID: seriesInstanceUID,
              SeriesNumber: seriesNumber,
              SeriesDescription: seriesDescription,
              SeriesDate: scan.date || '',
              SeriesTime: '',
              InstanceNumber: instanceNumber,
              SOPInstanceUID: sopInstanceUID || `${seriesInstanceUID}.${sortedIndex + 1}`,
              SOPClassUID: SOPClassUID,
              Modality: modality,
              NumberOfFrames: perFileNumberOfFrames || numberOfFrames,
              FrameIncrementPointer: perFileFrameIncrementPointer ?? frameIncrementPointer,
              FrameTime: perFileFrameTime ?? frameTime,
              FrameTimeVector: perFileFrameTimeVector ?? frameTimeVector,
              TemporalPositionIndex: temporalPositionIndexValue,
              Rows: rowsForInstance,
              Columns: columnsForInstance,
              FrameOfReferenceUID: frameOfReferenceForInstance,
            };

            // Add geometric metadata if available from dicomdump
            // Convert arrays to DICOM format strings (backslash-separated)
            const orientationArrayForInstance = Array.isArray(orientationForInstance) ? orientationForInstance : null;
            const orientationStringForInstance = orientationArrayForInstance ? orientationArrayForInstance.join('\\') : null;
            const positionArrayForInstance = Array.isArray(instancePosition) ? instancePosition : null;
            const positionStringForInstance = positionArrayForInstance ? positionArrayForInstance.join('\\') : null;
            const pixelSpacingArrayForInstance = Array.isArray(pixelSpacingArray) ? pixelSpacingArray : null;
            const pixelSpacingStringForInstance = pixelSpacingArrayForInstance ? pixelSpacingArrayForInstance.join('\\') : null;
            const frameTimeVectorArrayForInstance = Array.isArray(perFileFrameTimeVectorArray)
              ? perFileFrameTimeVectorArray
              : Array.isArray(frameTimeVector)
              ? frameTimeVector
              : null;
            const frameTimeVectorStringForInstance = frameTimeVectorArrayForInstance
              ? frameTimeVectorArrayForInstance.join('\\')
              : perFileFrameTimeVector ?? frameTimeVector;

            if (orientationStringForInstance) {
              metadata.ImageOrientationPatient = orientationStringForInstance;
            }
            if (orientationArrayForInstance) {
              metadata.ImageOrientationPatientNumeric = orientationArrayForInstance;
            }

            if (positionStringForInstance) {
              metadata.ImagePositionPatient = positionStringForInstance;
            }
            if (positionArrayForInstance) {
              metadata.ImagePositionPatientNumeric = positionArrayForInstance;
            }

            if (pixelSpacingStringForInstance) {
              metadata.PixelSpacing = pixelSpacingStringForInstance;
            }
            if (pixelSpacingArrayForInstance && pixelSpacingArrayForInstance.length === 2) {
              metadata.PixelSpacingNumeric = pixelSpacingArrayForInstance;
              metadata.RowPixelSpacing = pixelSpacingArrayForInstance[0];
              metadata.ColumnPixelSpacing = pixelSpacingArrayForInstance[1];
            }

            if (frameTimeVectorStringForInstance) {
              metadata.FrameTimeVector = frameTimeVectorStringForInstance;
            }
            if (frameTimeVectorArrayForInstance) {
              metadata.FrameTimeVectorNumeric = frameTimeVectorArrayForInstance;
            }
            if (thicknessForInstance) {
              metadata.SliceThickness = thicknessForInstance;
              metadata.SpacingBetweenSlices = spacingBetweenSlicesForInstance;
            }
            metadata.SliceLocation = perFileSliceLocation ?? (sliceLocation + (sortedIndex * (sliceThickness ?? 1)));

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
      console.log(`⏱️ Processed all ${scans.length} scans in ${(performance.now() - seriesStartTime).toFixed(0)}ms`);

      const filteredSeries = series.filter(s => s !== null);
      console.log(`⏱️ TOTAL getStudyMetadata time: ${(performance.now() - startTime).toFixed(0)}ms for ${filteredSeries.length} series`);

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

      const queryString = new URLSearchParams(params).toString();
      console.log(`Fetching experiments from: ${this.baseUrl}/data/experiments?${queryString}`);

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
  async searchForStudies(params = {}, limit = 100) {
    try {
      // Support project filtering via AccessionNumber field (OHIF study list filter)
      // Default to 'test' project if no filter specified
      const projectFilter = params.AccessionNumber || 'test';

      console.log('Searching for XNAT experiments...', projectFilter ? `in project: ${projectFilter}` : 'all projects');

      // Get experiments directly - much faster than nested queries
      const experiments = await this.getExperimentsAll(limit, projectFilter);

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

      const studies = imagingExperiments
        .filter(experiment => {
          // Filter out experiments without DICOM StudyInstanceUID
          if (!experiment.UID) {
            console.warn(`Skipping experiment ${experiment.ID || 'unknown'}: Missing DICOM StudyInstanceUID`);
            return false;
          }
          return true;
        })
        .map(experiment => {
        const modality = String(this.getModalityFromXsiType(experiment.xsiType));

        const rawDate =
          experiment.date ??
          experiment['data_fields/date'] ??
          experiment.data_fields?.date ??
          '';
        const formattedDate = String(rawDate || '').replace(/-/g, '');

        const xnatExperimentId = String(experiment.ID || 'unknown');
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
