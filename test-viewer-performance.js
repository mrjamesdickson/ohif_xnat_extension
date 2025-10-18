#!/usr/bin/env node

/**
 * Test script to verify viewer performance and caching
 * Validates that:
 * 1. Study loads within acceptable time
 * 2. Each DICOM file metadata is fetched only once (cache working)
 * 3. Second load is much faster (cache hits)
 */

const { chromium } = require('playwright-core');

async function testViewerPerformance() {
  console.log('⏱️  Starting viewer performance test...');

  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  // Track all HTTP requests to DICOM files
  const dicomRequests = new Map(); // fileName -> count
  const metadataRequests = [];

  page.on('request', request => {
    const url = request.url();
    // Track DICOM file metadata requests (HTTP Range requests)
    if (url.includes('/data/experiments/') && url.includes('/files/') && request.headers()['range']) {
      const fileName = url.split('/').pop().split('?')[0];
      dicomRequests.set(fileName, (dicomRequests.get(fileName) || 0) + 1);
      metadataRequests.push({
        fileName,
        url: url.substring(0, 100),
        time: Date.now()
      });
    }
  });

  // Collect console logs for cache hits/misses
  const cacheLogs = [];
  const timingLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('💾 Cache HIT') || text.includes('🔍 Cache MISS')) {
      cacheLogs.push(text);
    }
    if (text.includes('⏱️') || text.includes('TOTAL')) {
      timingLogs.push(text);
      console.log('  📊', text);
    }
  });

  try {
    console.log('📍 Step 1: Navigate and login...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

    // Check if already logged in
    const hasCredentials = await page.evaluate(() => {
      return !!sessionStorage.getItem('xnat-credentials');
    });

    if (!hasCredentials) {
      console.log('📍 Step 2: Login...');
      await page.waitForSelector('#xnat-credentials-modal', { timeout: 10000 });
      await page.waitForTimeout(500);

      await page.fill('#xnat-credentials-modal input:nth-of-type(1)', '/xnat-api');
      await page.fill('#xnat-credentials-modal input:nth-of-type(2)', 'admin');
      await page.fill('#xnat-credentials-modal input:nth-of-type(3)', 'admin');

      await page.click('#xnat-credentials-modal button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      console.log('✅ Login successful');
    } else {
      console.log('✅ Already logged in');
    }

    // Ensure test project is selected
    const currentProject = await page.evaluate(() => localStorage.getItem('ohif.xnat.selectedProject'));
    if (currentProject !== 'test') {
      console.log('📍 Step 3: Select test project...');
      await page.click('#xnat-toolbar-project-btn');
      await page.waitForTimeout(1000);

      await page.evaluate(() => {
        const select = document.querySelector('#xnat-project-modal select');
        select.value = 'test';
      });

      await page.evaluate(() => {
        const buttons = document.querySelectorAll('#xnat-project-modal button');
        const selectBtn = Array.from(buttons).find(b => b.textContent === 'Select');
        if (selectBtn) selectBtn.click();
      });

      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      console.log('✅ Test project selected');
    }

    console.log('📍 Step 4: Wait for study list...');
    await page.waitForTimeout(5000);

    console.log('📍 Step 5: Click first study to open viewer...');
    const studyCount = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-cy="study-row"], .study-row, table tbody tr');
      return rows.length;
    });

    if (studyCount === 0) {
      console.log('❌ No studies found in worklist');
      return;
    }

    console.log(`  Found ${studyCount} studies`);

    // Clear request tracking
    dicomRequests.clear();
    metadataRequests.length = 0;
    cacheLogs.length = 0;

    const firstLoadStart = Date.now();

    // Click first study to open series list
    await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-cy="study-row"], .study-row, table tbody tr');
      if (rows.length > 0) {
        rows[0].click();
      }
    });

    console.log('  ⏳ Waiting for series list to load...');
    await page.waitForTimeout(3000);

    // Now click on a series to actually open the viewer
    console.log('  📍 Clicking on first series to open viewer...');
    const seriesClicked = await page.evaluate(() => {
      // Try different selectors for series rows
      const seriesRows = document.querySelectorAll(
        '[data-cy="series-row"], .series-row, [role="row"]:not([data-cy="study-row"])'
      );
      console.log('Found series rows:', seriesRows.length);
      if (seriesRows.length > 1) {
        // Skip header row, click first data row
        seriesRows[1].click();
        return true;
      }
      return false;
    });

    if (!seriesClicked) {
      console.log('⚠️  Could not find series to click, trying double-click on study...');
      await page.evaluate(() => {
        const rows = document.querySelectorAll('[data-cy="study-row"], .study-row, table tbody tr');
        if (rows.length > 0) {
          rows[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        }
      });
    }

    console.log('  ⏳ Waiting for viewer to load...');

    // Wait for images to appear (canvas elements)
    try {
      await page.waitForSelector('canvas', { timeout: 90000 });
      const firstLoadEnd = Date.now();
      const firstLoadTime = firstLoadEnd - firstLoadStart;

      console.log('✅ Viewer loaded!');
      console.log('');

      // Get cache stats
      const cacheStats = await page.evaluate(() => {
        if (window.xnatMetadataCache) {
          return window.xnatMetadataCache.getStats();
        }
        return null;
      });

      // Analyze results
      console.log('═══════════════════════════════════════════');
      console.log('📊 FIRST LOAD RESULTS');
      console.log('═══════════════════════════════════════════');
      console.log(`⏱️  Load time: ${firstLoadTime}ms (${(firstLoadTime/1000).toFixed(2)}s)`);
      console.log(`📁 Total DICOM metadata requests: ${metadataRequests.length}`);
      console.log('');

      // Check for duplicate requests
      let duplicateCount = 0;
      const duplicates = [];
      dicomRequests.forEach((count, fileName) => {
        if (count > 1) {
          duplicateCount++;
          duplicates.push(`  ${fileName}: ${count} requests`);
        }
      });

      if (duplicateCount === 0) {
        console.log('✅ NO DUPLICATE REQUESTS - Each file fetched exactly once!');
      } else {
        console.log(`❌ DUPLICATE REQUESTS DETECTED (${duplicateCount} files):`);
        duplicates.forEach(d => console.log(d));
      }
      console.log('');

      if (cacheStats) {
        console.log('📊 Cache Stats After First Load:');
        console.log(`  Hits: ${cacheStats.hits}`);
        console.log(`  Misses: ${cacheStats.misses}`);
        console.log(`  Size: ${cacheStats.size} entries`);
        console.log(`  Hit Rate: ${cacheStats.hitRate}`);
      }
      console.log('');

      console.log('Timing breakdown:');
      timingLogs.forEach(log => console.log('  ' + log));
      console.log('═══════════════════════════════════════════');
      console.log('');

      // Now test second load (should be much faster with cache)
      console.log('📍 Step 6: Go back to study list...');
      await page.click('button[aria-label="Back"], button[title="Back"], a[href="/"]');
      await page.waitForTimeout(3000);

      console.log('📍 Step 7: Open same study again (testing cache)...');

      // Clear tracking for second load
      dicomRequests.clear();
      metadataRequests.length = 0;
      cacheLogs.length = 0;
      timingLogs.length = 0;

      const secondLoadStart = Date.now();

      // Click first study again
      await page.evaluate(() => {
        const rows = document.querySelectorAll('[data-cy="study-row"], .study-row, table tbody tr');
        if (rows.length > 0) {
          rows[0].click();
        }
      });

      await page.waitForSelector('canvas', { timeout: 30000 });
      const secondLoadEnd = Date.now();
      const secondLoadTime = secondLoadEnd - secondLoadStart;

      console.log('✅ Second load complete!');
      console.log('');

      // Get updated cache stats
      const cacheStats2 = await page.evaluate(() => {
        if (window.xnatMetadataCache) {
          return window.xnatMetadataCache.getStats();
        }
        return null;
      });

      console.log('═══════════════════════════════════════════');
      console.log('📊 SECOND LOAD RESULTS (Cache Test)');
      console.log('═══════════════════════════════════════════');
      console.log(`⏱️  Load time: ${secondLoadTime}ms (${(secondLoadTime/1000).toFixed(2)}s)`);
      console.log(`📁 DICOM metadata requests: ${metadataRequests.length}`);
      console.log('');

      if (metadataRequests.length === 0) {
        console.log('✅ PERFECT - No network requests! All data from cache!');
      } else {
        console.log(`⚠️  Some requests still made: ${metadataRequests.length}`);
        console.log('   (Expected 0 - all should be cached)');
      }
      console.log('');

      if (cacheStats2) {
        console.log('📊 Cache Stats After Second Load:');
        console.log(`  Hits: ${cacheStats2.hits}`);
        console.log(`  Misses: ${cacheStats2.misses}`);
        console.log(`  Size: ${cacheStats2.size} entries`);
        console.log(`  Hit Rate: ${cacheStats2.hitRate}`);
      }
      console.log('');

      const improvement = ((1 - secondLoadTime/firstLoadTime) * 100).toFixed(1);
      console.log('📈 Performance Improvement:');
      console.log(`  First load:  ${(firstLoadTime/1000).toFixed(2)}s`);
      console.log(`  Second load: ${(secondLoadTime/1000).toFixed(2)}s`);
      console.log(`  Improvement: ${improvement}% faster`);
      console.log('═══════════════════════════════════════════');
      console.log('');

      // Final verdict
      console.log('📋 TEST RESULTS:');
      const allTestsPassed = duplicateCount === 0 &&
                            metadataRequests.length === 0 &&
                            secondLoadTime < firstLoadTime * 0.5;

      if (allTestsPassed) {
        console.log('✅ ALL TESTS PASSED!');
        console.log('  ✓ No duplicate requests on first load');
        console.log('  ✓ No network requests on second load (100% cache)');
        console.log('  ✓ Second load >50% faster than first load');
      } else {
        console.log('⚠️  SOME TESTS FAILED:');
        if (duplicateCount > 0) {
          console.log(`  ✗ Duplicate requests detected (${duplicateCount} files)`);
        }
        if (metadataRequests.length > 0) {
          console.log(`  ✗ Network requests on second load (${metadataRequests.length} - expected 0)`);
        }
        if (secondLoadTime >= firstLoadTime * 0.5) {
          console.log(`  ✗ Second load not significantly faster (${improvement}% - expected >50%)`);
        }
      }

    } catch (error) {
      console.error('❌ Timeout waiting for viewer to load');
      console.log('Requests made:', metadataRequests.length);
      console.log('Cache logs:', cacheLogs.slice(0, 10));
    }

    console.log('');
    console.log('📍 Keeping browser open for 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    console.log('🧪 Test complete. Closing browser...');
    await browser.close();
  }
}

// Run the test
testViewerPerformance().catch(console.error);
