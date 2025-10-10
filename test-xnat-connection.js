#!/usr/bin/env node

/**
 * XNAT Connection Test Script
 * Tests connectivity to XNAT instance and retrieves sample data
 */

const axios = require('axios');
require('dotenv').config();

const XNAT_URL = process.env.XNAT_URL;
const XNAT_USERNAME = process.env.XNAT_USERNAME;
const XNAT_PASSWORD = process.env.XNAT_PASSWORD;
const XNAT_TOKEN = process.env.XNAT_TOKEN;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testConnection() {
  log(colors.blue, '\n╔════════════════════════════════════════╗');
  log(colors.blue, '║   XNAT Connection Test Script         ║');
  log(colors.blue, '╚════════════════════════════════════════╝\n');

  if (!XNAT_URL) {
    log(colors.red, '❌ Error: XNAT_URL not set in .env file');
    log(colors.yellow, 'Run ./setup-config.sh to configure');
    process.exit(1);
  }

  log(colors.blue, `Testing connection to: ${XNAT_URL}\n`);

  // Setup axios with auth
  const headers = {};
  if (XNAT_TOKEN) {
    headers['Authorization'] = `Bearer ${XNAT_TOKEN}`;
    log(colors.blue, 'Using token authentication');
  } else if (XNAT_USERNAME && XNAT_PASSWORD) {
    const auth = Buffer.from(`${XNAT_USERNAME}:${XNAT_PASSWORD}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
    log(colors.blue, `Using basic authentication (${XNAT_USERNAME})`);
  } else {
    log(colors.yellow, '⚠ Warning: No authentication configured');
  }

  const client = axios.create({
    baseURL: XNAT_URL,
    headers,
    timeout: 10000,
  });

  try {
    // Test 1: Basic connectivity
    log(colors.yellow, '\n[1/4] Testing basic connectivity...');
    await client.get('/');
    log(colors.green, '✓ XNAT server is reachable');

    // Test 2: Get projects
    log(colors.yellow, '\n[2/4] Fetching projects...');
    const projectsResponse = await client.get('/data/projects', {
      params: { format: 'json' }
    });
    const projects = projectsResponse.data.ResultSet.Result;
    log(colors.green, `✓ Found ${projects.length} project(s)`);

    if (projects.length === 0) {
      log(colors.yellow, '⚠ No projects found in XNAT');
      return;
    }

    // Show first 5 projects
    console.log('\nProjects:');
    projects.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name} (${p.ID})`);
    });
    if (projects.length > 5) {
      console.log(`  ... and ${projects.length - 5} more`);
    }

    // Test 3: Try to get experiments directly (all experiments)
    log(colors.yellow, `\n[3/4] Fetching all experiments...`);

    let experiments = [];
    let projectWithData = null;
    let subjectWithData = null;

    try {
      const allExperimentsResponse = await client.get('/data/experiments', {
        params: { format: 'json' }
      });
      const allExperiments = allExperimentsResponse.data.ResultSet?.Result || [];

      if (allExperiments.length > 0) {
        // Use first experiment
        experiments = allExperiments.slice(0, 10); // Get first 10
        const firstExp = allExperiments[0];

        log(colors.green, `✓ Found ${allExperiments.length} total experiment(s)`);

        // Try to get project info from first experiment
        if (firstExp.project) {
          projectWithData = { ID: firstExp.project, name: firstExp.project };
        }
      }
    } catch (err) {
      log(colors.yellow, '  Direct experiments endpoint not available, trying per-project search...');
    }

    // Fallback: Search through projects if direct approach didn't work
    if (experiments.length === 0) {
      for (const project of projects) {
        // Get subjects for this project
        const subjectsResponse = await client.get(`/data/projects/${project.ID}/subjects`, {
          params: { format: 'json' }
        });
        const subjects = subjectsResponse.data.ResultSet.Result;

        if (subjects.length === 0) continue;

        // Check each subject for experiments
        for (const subject of subjects) {
          const experimentsResponse = await client.get(
            `/data/projects/${project.ID}/subjects/${subject.ID}/experiments`,
            { params: { format: 'json' } }
          );
          const subjectExperiments = experimentsResponse.data.ResultSet.Result;

          if (subjectExperiments.length > 0) {
            experiments = subjectExperiments;
            projectWithData = project;
            subjectWithData = subject;
            log(colors.green, `✓ Found ${experiments.length} experiment(s) in project "${project.name}"`);
            log(colors.green, `  Subject: "${subject.label}"`);
            break;
          }
        }

        if (experiments.length > 0) break;
      }
    }

    if (experiments.length === 0) {
      log(colors.yellow, '⚠ No experiments found');
      log(colors.blue, '\nYour XNAT instance has no imaging experiments.');
      log(colors.blue, 'Options:');
      log(colors.blue, '  1. Upload DICOM data to XNAT');
      log(colors.blue, '  2. Try XNAT Central for test data: https://central.xnat.org');
      return;
    }

    console.log('\nExperiments:');
    experiments.slice(0, 3).forEach(e => {
      console.log(`  - ${e.label || e.ID} (${e.ID})`);
    });
    if (experiments.length > 3) {
      console.log(`  ... and ${experiments.length - 3} more`);
    }

    // Test 4: Get scans
    const firstExperiment = experiments[0];
    log(colors.yellow, `\n[4/4] Fetching scans for experiment "${firstExperiment.ID}"...`);
    const scansResponse = await client.get(`/data/experiments/${firstExperiment.ID}/scans`, {
      params: { format: 'json' }
    });
    const scans = scansResponse.data.ResultSet.Result;
    log(colors.green, `✓ Found ${scans.length} scan(s)`);

    if (scans.length > 0) {
      console.log('\nScans:');
      scans.forEach(s => {
        console.log(`  - Scan ${s.ID}: ${s.type || 'Unknown'} (${s.modality || 'N/A'})`);
      });
    }

    // Success summary
    log(colors.green, '\n╔════════════════════════════════════════╗');
    log(colors.green, '║      Connection Test Successful!      ║');
    log(colors.green, '╚════════════════════════════════════════╝\n');

    log(colors.blue, 'Test with OHIF:');
    console.log(`  http://localhost:3000/?StudyInstanceUID=${firstExperiment.ID}\n`);

  } catch (error) {
    log(colors.red, '\n❌ Connection test failed!');

    if (error.response) {
      log(colors.red, `Status: ${error.response.status}`);
      log(colors.red, `Message: ${error.response.statusText}`);

      if (error.response.status === 401) {
        log(colors.yellow, '\n⚠ Authentication failed - check your credentials');
      } else if (error.response.status === 403) {
        log(colors.yellow, '\n⚠ Access forbidden - check user permissions');
      } else if (error.response.status === 404) {
        log(colors.yellow, '\n⚠ XNAT REST API endpoint not found');
      }
    } else if (error.request) {
      log(colors.red, 'No response received from server');
      log(colors.yellow, '\nPossible issues:');
      log(colors.yellow, '  - XNAT URL is incorrect');
      log(colors.yellow, '  - XNAT server is down');
      log(colors.yellow, '  - Network/firewall issues');
      log(colors.yellow, '  - CORS not configured');
    } else {
      log(colors.red, `Error: ${error.message}`);
    }

    console.error('\nFull error:', error.message);
    process.exit(1);
  }
}

testConnection();
