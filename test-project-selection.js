#!/usr/bin/env node

/**
 * Test script to verify project selection functionality
 * Uses Puppeteer (headless Chrome) to test the UI flow
 */

const { chromium } = require('playwright-core');

async function testProjectSelection() {
  console.log('🧪 Starting project selection test...');

  const browser = await chromium.launch({
    headless: false, // Show browser for debugging
  });

  const page = await browser.newPage();

  // Enable console logging from the page
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('🎯') || text.includes('📦') || text.includes('🔍')) {
      console.log('  Browser:', text);
    }
  });

  try {
    console.log('📍 Step 1: Navigate to OHIF viewer...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('📍 Step 2: Clear all browser storage (hard reset)...');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    console.log('✅ Storage cleared');

    console.log('📍 Step 3: Reload page after clearing storage...');
    await page.reload({ waitUntil: 'networkidle' });

    console.log('📍 Step 4: Wait for page to load...');
    await page.waitForTimeout(3000);

    // Check if login dialog is present
    const loginDialogExists = await page.evaluate(() => {
      return !!document.getElementById('xnat-credentials-modal');
    });

    if (loginDialogExists) {
      console.log('📍 Step 3: Login dialog detected, logging in with admin/admin...');

      // Fill in login form (URL, username, password)
      const inputs = await page.$$('#xnat-credentials-modal input');
      console.log(`  Found ${inputs.length} input fields`);

      // First input is URL (should be /xnat-api), second is username, third is password
      await inputs[0].fill('/xnat-api');  // URL
      await inputs[1].fill('admin');       // Username
      await inputs[2].fill('admin');       // Password

      console.log('📍 Step 4: Submitting login form...');
      await page.click('#xnat-credentials-modal button[type="submit"]');

      console.log('📍 Step 5: Waiting for page reload after login...');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(5000);

      console.log('✅ Login successful!');
    }

    // Check localStorage (using correct key)
    const localStorage = await page.evaluate(() => {
      return {
        project: localStorage.getItem('ohif.xnat.selectedProject'),
        credentials: sessionStorage.getItem('xnat-credentials') ? 'exists' : 'missing'
      };
    });
    console.log('📦 Current state:', localStorage);

    console.log('📍 Step 6: Look for project selector button...');
    const buttonExists = await page.evaluate(() => {
      return !!document.getElementById('xnat-project-selector-btn');
    });

    if (buttonExists) {
      console.log('✅ Project selector button found');

      console.log('📍 Step 7: Click project selector button...');
      await page.click('#xnat-project-selector-btn');
      await page.waitForTimeout(1000);

      console.log('📍 Step 5: Check if modal appeared...');
      const modalExists = await page.evaluate(() => {
        return !!document.getElementById('xnat-project-modal');
      });

      if (modalExists) {
        console.log('✅ Project selector modal opened');

        console.log('📍 Step 6: Get available projects...');
        const projects = await page.evaluate(() => {
          const select = document.querySelector('#xnat-project-modal select');
          if (!select) return [];
          return Array.from(select.options).map(opt => ({
            value: opt.value,
            text: opt.textContent,
            selected: opt.selected
          }));
        });

        console.log('📦 Available projects:', projects.length);
        projects.forEach((p, i) => {
          if (p.selected) {
            console.log(`  ${i + 1}. ${p.text} ← CURRENTLY SELECTED`);
          } else {
            console.log(`  ${i + 1}. ${p.text}`);
          }
        });

        // Select a different project
        if (projects.length > 1) {
          const newProject = projects.find(p => !p.selected);
          if (newProject) {
            console.log(`📍 Step 7: Selecting project "${newProject.value}"...`);
            await page.evaluate((value) => {
              const select = document.querySelector('#xnat-project-modal select');
              select.value = value;
            }, newProject.value);

            console.log('📍 Step 8: Click Select button...');
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('#xnat-project-modal button');
              const selectBtn = Array.from(buttons).find(b => b.textContent === 'Select');
              if (selectBtn) selectBtn.click();
            });

            console.log('📍 Step 9: Wait for page reload...');
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
            await page.waitForTimeout(3000);

            console.log('📍 Step 10: Check if project changed...');
            const newLocalStorage = await page.evaluate(() => {
              return {
                project: localStorage.getItem('ohif.xnat.selectedProject'),
                credentials: sessionStorage.getItem('xnat-credentials') ? 'exists' : 'missing'
              };
            });

            console.log('📦 New state:', newLocalStorage);

            if (newLocalStorage.project === newProject.value) {
              console.log('✅ SUCCESS: Project changed to', newProject.value);

              console.log('📍 Step 11: Wait for studies to load...');
              await page.waitForTimeout(5000);

              console.log('📍 Step 12: Check console logs for study query...');
              // The browser console logs should show the new project being used

              console.log('📍 Step 13: Count studies in the list...');
              const studyCount = await page.evaluate(() => {
                // Try to find study list elements
                const studyRows = document.querySelectorAll('[data-cy="study-row"], .study-row, table tbody tr');
                return studyRows.length;
              });

              console.log(`📊 Found ${studyCount} studies in the worklist`);

              if (studyCount > 0) {
                console.log('✅ Studies are displayed in the worklist');
              } else {
                console.log('⚠️  No studies found in the worklist (might be empty project or still loading)');
              }

            } else {
              console.log('❌ FAILED: Project did not change. Expected:', newProject.value, 'Got:', newLocalStorage.project);
            }
          }
        }

      } else {
        console.log('❌ Project selector modal did not open');
      }

    } else {
      console.log('❌ Project selector button not found');
      console.log('   This might be normal if you need to login first');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    console.log('🧪 Test complete. Closing browser in 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

// Run the test
testProjectSelection().catch(console.error);
