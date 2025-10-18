#!/usr/bin/env node

/**
 * Performance test script
 * Measures actual timings for study metadata loading
 */

const { chromium } = require('playwright-core');

async function testPerformance() {
  console.log('⏱️  Starting performance test...');

  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  // Collect timing logs from the browser
  const timingLogs = [];
  const allLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    allLogs.push(text);

    // Filter for timing and important logs
    if (text.includes('⏱️') || text.includes('TOTAL') ||
        text.includes('getStudyMetadata') || text.includes('scans in') ||
        text.includes('Scan ') || text.includes('Error') || text.includes('❌')) {
      timingLogs.push(text);
      console.log('  📊', text);
    }
  });

  try {
    console.log('📍 Step 1: Navigate to OHIF viewer...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('📍 Step 2: Check if already logged in...');
    const hasCredentials = await page.evaluate(() => {
      return !!sessionStorage.getItem('xnat-credentials');
    });

    if (!hasCredentials) {
      console.log('📍 Step 3: Login with admin/admin...');
      await page.waitForSelector('#xnat-credentials-modal', { timeout: 10000 });
      await page.waitForTimeout(500);

      // Fill form using page.fill instead of element handles
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

    console.log('📍 Step 4: Check if project is selected...');
    const hasProject = await page.evaluate(() => {
      return !!localStorage.getItem('ohif.xnat.selectedProject');
    });

    if (!hasProject) {
      console.log('📍 Step 5: Select a project...');
      // Click toolbar to open it if minimized
      const toolbarExists = await page.evaluate(() => {
        return !!document.getElementById('xnat-toolbar');
      });

      if (toolbarExists) {
        await page.click('#xnat-toolbar-project-btn');
        await page.waitForTimeout(1000);

        const modalExists = await page.evaluate(() => {
          return !!document.getElementById('xnat-project-modal');
        });

        if (modalExists) {
          const projects = await page.evaluate(() => {
            const select = document.querySelector('#xnat-project-modal select');
            return Array.from(select.options).map(opt => opt.value);
          });

          console.log(`  Found ${projects.length} projects:`, projects);

          // Select 'test' project if available, otherwise first project
          const projectToSelect = projects.includes('test') ? 'test' : projects[0];
          console.log(`  Selecting project: ${projectToSelect}`);

          await page.evaluate((value) => {
            const select = document.querySelector('#xnat-project-modal select');
            select.value = value;
          }, projectToSelect);

          await page.evaluate(() => {
            const buttons = document.querySelectorAll('#xnat-project-modal button');
            const selectBtn = Array.from(buttons).find(b => b.textContent === 'Select');
            if (selectBtn) selectBtn.click();
          });

          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(3000);
          console.log('✅ Project selected');
        }
      }
    } else {
      const project = await page.evaluate(() => localStorage.getItem('ohif.xnat.selectedProject'));
      console.log('✅ Project already selected:', project);
    }

    console.log('📍 Step 6: Wait for study list to load...');
    await page.waitForTimeout(5000);

    console.log('📍 Step 7: Count studies...');
    const studyCount = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-cy="study-row"], .study-row, table tbody tr');
      return rows.length;
    });
    console.log(`✅ Found ${studyCount} studies in worklist`);

    if (studyCount === 0) {
      console.log('⚠️  No studies found. Cannot measure metadata load time.');
      return;
    }

    console.log('📍 Step 8: Click first study to measure metadata load time...');
    const studyLoadStart = Date.now();

    // Click the first study row
    await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-cy="study-row"], .study-row, table tbody tr');
      if (rows.length > 0) {
        rows[0].click();
      }
    });

    console.log('  ⏳ Waiting for study to open...');

    // Wait for viewport to appear (indicates study loaded)
    try {
      await page.waitForSelector('[data-cy="viewport-container"], .viewport-wrapper, canvas', {
        timeout: 60000
      });
      const studyLoadEnd = Date.now();
      const totalTime = studyLoadEnd - studyLoadStart;

      console.log('');
      console.log('═══════════════════════════════════════════');
      console.log('📊 PERFORMANCE RESULTS');
      console.log('═══════════════════════════════════════════');
      console.log(`⏱️  Total time to open study: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
      console.log('');
      console.log('Detailed timing breakdown from browser logs:');
      timingLogs.forEach(log => console.log('  ' + log));
      console.log('═══════════════════════════════════════════');

    } catch (error) {
      console.error('❌ Timeout waiting for study to load (60s limit)');
      console.log('');
      console.log('Timing logs collected before timeout:');
      timingLogs.forEach(log => console.log('  ' + log));
      console.log('');
      console.log('Writing full console logs to test-performance.log...');
      const fs = require('fs');
      fs.writeFileSync('test-performance.log', allLogs.join('\n'));
      console.log('✅ Full logs saved to test-performance.log');
    }

    console.log('');
    console.log('📍 Step 9: Keeping browser open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('');
    console.log('Timing logs collected:');
    timingLogs.forEach(log => console.log('  ' + log));
  } finally {
    console.log('🧪 Test complete. Closing browser...');
    await browser.close();
  }
}

// Run the test
testPerformance().catch(console.error);
