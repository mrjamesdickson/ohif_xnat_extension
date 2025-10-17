import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const XNAT_URL = process.env.XNAT_URL || 'http://demo02.xnatworks.io';
const XNAT_USERNAME = process.env.XNAT_USERNAME || 'admin';
const XNAT_PASSWORD = process.env.XNAT_PASSWORD || 'admin';

// Test configuration - scan 16 that's being skipped
const TEST_EXPERIMENT = 'XNAT_E00973';
const TEST_PROJECT = 'LIDC-IDRI';
const TEST_SCAN = '16';

async function testFetchDicomHeader() {
  // Dynamically import XNATClient
  const XNATClientModule = await import('../src/XNATClient.js');
  const XNATClient = XNATClientModule.default;

  // Create client
  const client = new XNATClient({
    xnatUrl: XNAT_URL,
    username: XNAT_USERNAME,
    password: XNAT_PASSWORD,
  });

  console.log(`\n🔍 Testing DICOM header fetch for experiment ${TEST_EXPERIMENT}, scan ${TEST_SCAN}`);

  // Get scan files
  const files = await client.getScanFiles(TEST_EXPERIMENT, TEST_SCAN);
  console.log(`📁 Found ${files.length} files in scan ${TEST_SCAN}`);

  if (!files || files.length === 0) {
    console.error('❌ No files found in scan');
    return;
  }

  // Try fetching metadata from first file
  console.log(`\n📥 Fetching metadata from first file: ${files[0].Name}`);
  const metadata = await client.getFileDicomMetadata({
    projectId: TEST_PROJECT,
    experimentId: TEST_EXPERIMENT,
    scanId: TEST_SCAN,
    file: files[0],
  });

  if (!metadata) {
    console.error('❌ No metadata returned');
    return;
  }

  if (!metadata.ResultSet?.Result) {
    console.error('❌ Metadata has no ResultSet.Result');
    console.log('Metadata structure:', JSON.stringify(metadata, null, 2));
    return;
  }

  console.log(`\n✅ Found ${metadata.ResultSet.Result.length} DICOM tags\n`);

  // Show all tags
  console.log('📋 DICOM Header Tags:');
  console.log('─'.repeat(80));

  metadata.ResultSet.Result.forEach(tag => {
    const tagName = tag.tag1 || 'unknown';
    const value = tag.value || '';
    const displayValue = value.length > 60 ? value.substring(0, 60) + '...' : value;
    console.log(`${tagName.padEnd(20)} = ${displayValue}`);
  });

  console.log('─'.repeat(80));

  // Check for critical tags
  const getTag = (tagPattern) => {
    const tag = metadata.ResultSet.Result.find(item => item.tag1 === tagPattern);
    return tag?.value || null;
  };

  const seriesUID = getTag('(0020,000E)');
  const studyUID = getTag('(0020,000D)');
  const instanceNumber = getTag('(0020,0013)');
  const imagePosition = getTag('(0020,0032)');
  const imageOrientation = getTag('(0020,0037)');

  console.log('\n🔑 Critical Tags:');
  console.log(`  SeriesInstanceUID (0020,000E): ${seriesUID || '❌ MISSING'}`);
  console.log(`  StudyInstanceUID (0020,000D):  ${studyUID || '❌ MISSING'}`);
  console.log(`  InstanceNumber (0020,0013):    ${instanceNumber || '⚠️  missing'}`);
  console.log(`  ImagePositionPatient (0020,0032): ${imagePosition || '⚠️  missing'}`);
  console.log(`  ImageOrientationPatient (0020,0037): ${imageOrientation || '⚠️  missing'}`);

  if (!seriesUID) {
    console.log('\n❌ SeriesInstanceUID is MISSING - this is why the scan is being skipped!');
  } else {
    console.log('\n✅ SeriesInstanceUID is present - scan should NOT be skipped');
  }
}

testFetchDicomHeader().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
