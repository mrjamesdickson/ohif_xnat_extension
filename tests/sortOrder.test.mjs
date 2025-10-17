import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const XNAT_URL = process.env.XNAT_URL || 'http://demo02.xnatworks.io';
const XNAT_USERNAME = process.env.XNAT_USERNAME || 'admin';
const XNAT_PASSWORD = process.env.XNAT_PASSWORD || 'admin';

// Test configuration
const TEST_EXPERIMENT = 'XNAT_E00991';
const TEST_PROJECT = 'LIDC-IDRI';
const TEST_SCAN = '4';

/**
 * Test the sort order of DICOM instances in a scan
 */
test('DICOM instances should be sorted correctly by ImagePositionPatient', async () => {
  // Dynamically import XNATClient
  const XNATClientModule = await import('../src/XNATClient.js');
  const XNATClient = XNATClientModule.default;

  // Create client
  const client = new XNATClient({
    xnatUrl: XNAT_URL,
    username: XNAT_USERNAME,
    password: XNAT_PASSWORD,
  });

  console.log(`\n📋 Testing sort order for experiment ${TEST_EXPERIMENT}, scan ${TEST_SCAN}`);

  // Get scan files
  const files = await client.getScanFiles(TEST_EXPERIMENT, TEST_SCAN);
  console.log(`📁 Found ${files.length} files in scan ${TEST_SCAN}`);

  assert.ok(files.length > 0, 'Should have at least one file');

  // Get scan metadata
  const scanMetadata = await client.getScanDicomMetadata(TEST_EXPERIMENT, TEST_SCAN, TEST_PROJECT);
  console.log(`📦 Scan metadata:`, scanMetadata ? 'retrieved' : 'NULL');

  if (!scanMetadata?.ResultSet?.Result) {
    console.warn('⚠️  No scan metadata available, skipping detailed checks');
    return;
  }

  console.log(`✅ Scan has ${scanMetadata.ResultSet.Result.length} metadata tags`);

  // Get per-file metadata
  const fileLevelMetadata = await client.getScanFilesDicomMetadata({
    projectId: TEST_PROJECT,
    experimentId: TEST_EXPERIMENT,
    scanId: TEST_SCAN,
    files: files.slice(0, 10), // Test first 10 files only for speed
  });

  console.log(`\n📊 Per-file metadata for first 10 files:`);

  const fileData = fileLevelMetadata.map((metadata, index) => {
    if (!metadata?.ResultSet?.Result) {
      return null;
    }

    const results = metadata.ResultSet.Result;
    const getTag = (tag) => results.find(item => item.tag1 === tag)?.value || null;

    const instanceNumber = getTag('(0020,0013)');
    const imagePosition = getTag('(0020,0032)');
    const imageOrientation = getTag('(0020,0037)');
    const sliceLocation = getTag('(0020,1041)');

    return {
      file: files[index]?.Name || 'unknown',
      instanceNumber: instanceNumber ? parseInt(instanceNumber, 10) : null,
      imagePosition,
      imageOrientation,
      sliceLocation: sliceLocation ? parseFloat(sliceLocation) : null,
    };
  }).filter(Boolean);

  console.table(fileData);

  // Check if instance numbers are sequential
  const instanceNumbers = fileData
    .map(d => d.instanceNumber)
    .filter(n => n !== null);

  if (instanceNumbers.length > 1) {
    const isSorted = instanceNumbers.every((val, i, arr) =>
      i === 0 || val >= arr[i - 1]
    );

    if (isSorted) {
      console.log(`✅ Instance numbers are in ascending order`);
    } else {
      console.log(`⚠️  Instance numbers are NOT in ascending order`);
      console.log(`   Order: ${instanceNumbers.join(', ')}`);
    }
  }

  // Check ImagePositionPatient variation
  const imagePositions = fileData
    .map(d => d.imagePosition)
    .filter(Boolean);

  if (imagePositions.length > 1) {
    const uniquePositions = new Set(imagePositions);
    console.log(`\n📍 Found ${uniquePositions.size} unique image positions out of ${imagePositions.length} files`);

    if (uniquePositions.size === 1) {
      console.log(`⚠️  All files have the same ImagePositionPatient - this may indicate incorrect metadata`);
    } else {
      console.log(`✅ Image positions vary across files (expected for 3D volumes)`);
    }
  }

  // Parse and compute position along normal vector
  if (fileData.length > 0 && fileData[0].imageOrientation) {
    const orientation = fileData[0].imageOrientation.split('\\').map(parseFloat);

    if (orientation.length === 6) {
      const rowCosines = orientation.slice(0, 3);
      const colCosines = orientation.slice(3, 6);

      // Compute normal vector (cross product)
      const normal = [
        rowCosines[1] * colCosines[2] - rowCosines[2] * colCosines[1],
        rowCosines[2] * colCosines[0] - rowCosines[0] * colCosines[2],
        rowCosines[0] * colCosines[1] - rowCosines[1] * colCosines[0],
      ];

      console.log(`\n🧭 Image orientation normal vector: [${normal.map(n => n.toFixed(4)).join(', ')}]`);

      // Compute position along normal for each file
      const positionsAlongNormal = fileData.map(d => {
        if (!d.imagePosition) return null;
        const pos = d.imagePosition.split('\\').map(parseFloat);
        if (pos.length !== 3) return null;

        return pos[0] * normal[0] + pos[1] * normal[1] + pos[2] * normal[2];
      }).filter(p => p !== null);

      if (positionsAlongNormal.length > 1) {
        const isSortedByPosition = positionsAlongNormal.every((val, i, arr) =>
          i === 0 || val >= arr[i - 1]
        );

        console.log(`\n📏 Positions along normal vector:`);
        console.log(`   ${positionsAlongNormal.map(p => p.toFixed(2)).join(', ')}`);

        if (isSortedByPosition) {
          console.log(`✅ Files are sorted by position along normal vector`);
        } else {
          console.log(`❌ Files are NOT sorted by position along normal vector`);
          console.log(`   This indicates incorrect slice ordering!`);
        }

        assert.ok(isSortedByPosition, 'Files should be sorted by position along normal vector');
      }
    }
  }

  console.log(`\n✅ Sort order test complete\n`);
});
