import XNATImageLoader from './XNATImageLoader.js';
import XNATClient from './XNATClient.js';

/**
 * Initialize the XNAT extension
 * This function is called when the extension is loaded
 */
export default function init({ servicesManager, configuration = {} }) {
  console.log('✅ XNAT extension init called');

  // CRITICAL: Restore credentials from sessionStorage IMMEDIATELY before anything else
  const sessionCreds = sessionStorage.getItem('xnat-credentials');
  if (sessionCreds && !window.xnatCredentials) {
    try {
      window.xnatCredentials = JSON.parse(sessionCreds);
      console.log('✅ Restored credentials from sessionStorage EARLY in init');
    } catch (e) {
      console.error('Failed to parse session credentials:', e);
    }
  }

  // Add XNAT floating toolbar when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => addXNATToolbar(), 1000);
    });
  } else {
    setTimeout(() => addXNATToolbar(), 1000);
  }
  setTimeout(() => addXNATToolbar(), 5000);

  // Check if user needs to login on first access - multiple attempts in case DOM isn't ready
  setTimeout(() => checkForInitialLogin(), 500);
  setTimeout(() => checkForInitialLogin(), 1000);
  setTimeout(() => checkForInitialLogin(), 2000);

  // Expose functions globally so commands can call them
  window.showProjectSelectorModal = showProjectSelectorModal;
}

function checkForInitialLogin() {
  // Check if credentials exist in sessionStorage or memory
  const sessionCreds = sessionStorage.getItem('xnat-credentials');
  const hasCredentials = (window.xnatCredentials && window.xnatCredentials.username) || sessionCreds;

  console.log('🔍 checkForInitialLogin: hasCredentials=', hasCredentials);

  // If credentials in sessionStorage but not in window, restore them
  if (sessionCreds && !window.xnatCredentials) {
    try {
      window.xnatCredentials = JSON.parse(sessionCreds);
      console.log('✅ Restored credentials from sessionStorage');
    } catch (e) {
      console.error('Failed to parse session credentials:', e);
    }
  }

  // If not logged in, show the login dialog
  if (!hasCredentials) {
    console.log('🔑 No credentials found, showing login dialog');
    showCredentialsDialog();
  } else {
    console.log('✅ Found credentials, skipping login dialog');
  }
}

function checkUrlForProjectSelector() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('changeproject') === 'true') {
    console.log('🔘 changeproject=true detected in URL');
    // Show credentials dialog first
    showCredentialsDialog();
    // Clean up URL without page reload
    const url = new URL(window.location.href);
    url.searchParams.delete('changeproject');
    window.history.replaceState({}, '', url);
  }
}

function showCredentialsDialog() {
  // Remove existing modal if any
  const existingModal = document.getElementById('xnat-credentials-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Get saved URL or default to proxy path
  const savedUrl = localStorage.getItem('xnat-url') || '/xnat-api';

  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'xnat-credentials-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Create modal content
  const content = document.createElement('div');
  content.style.cssText = `
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
  `;

  const title = document.createElement('h2');
  title.textContent = 'Connect to XNAT';
  title.style.cssText = `
    color: white;
    margin: 0 0 16px 0;
    font-size: 20px;
  `;

  const form = document.createElement('form');
  form.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;

  // URL field
  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'XNAT URL';
  urlLabel.style.cssText = 'color: #aaa; font-size: 12px;';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = '/xnat-api or https://xnat.example.org';
  urlInput.value = savedUrl;
  urlInput.required = true;
  urlInput.style.cssText = `
    background: #2a2a2a;
    color: white;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px;
    font-size: 14px;
  `;

  // Username field
  const usernameLabel = document.createElement('label');
  usernameLabel.textContent = 'Username';
  usernameLabel.style.cssText = 'color: #aaa; font-size: 12px; margin-top: 8px;';
  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.placeholder = 'username';
  usernameInput.value = '';
  usernameInput.required = true;
  usernameInput.style.cssText = `
    background: #2a2a2a;
    color: white;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px;
    font-size: 14px;
  `;

  // Password field
  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = 'Password';
  passwordLabel.style.cssText = 'color: #aaa; font-size: 12px; margin-top: 8px;';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.placeholder = 'password';
  passwordInput.required = true;
  passwordInput.style.cssText = `
    background: #2a2a2a;
    color: white;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px;
    font-size: 14px;
  `;

  // Error message
  const errorMsg = document.createElement('div');
  errorMsg.style.cssText = `
    color: #ff4444;
    font-size: 12px;
    display: none;
  `;

  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 8px;
    margin-top: 16px;
  `;

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = `
    background: #2a2a2a;
    color: white;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px 16px;
    cursor: pointer;
    flex: 1;
  `;
  cancelButton.onclick = () => modal.remove();

  const connectButton = document.createElement('button');
  connectButton.type = 'submit';
  connectButton.textContent = 'Connect';
  connectButton.style.cssText = `
    background: #5acce6;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 10px 16px;
    cursor: pointer;
    font-weight: 600;
    flex: 1;
  `;

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';
    connectButton.disabled = true;
    connectButton.textContent = 'Connecting...';

    const xnatUrl = urlInput.value.trim().replace(/\/$/, '');
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
      // Test credentials by fetching projects
      const testClient = new XNATClient({ xnatUrl, username, password });
      const projects = await testClient.getProjects();

      // Store credentials in sessionStorage (cleared when tab closes, NOT when page refreshes)
      sessionStorage.setItem('xnat-credentials', JSON.stringify({
        url: xnatUrl,
        username: username,
        password: password,
      }));

      // Also set in window for immediate use
      window.xnatCredentials = {
        url: xnatUrl,
        username: username,
        password: password,
      };

      // Store projects globally
      window.xnatProjects = projects;
      window.xnatUrl = xnatUrl;

      // Close credentials dialog
      modal.remove();

      // Show success message
      const successMsg = document.createElement('div');
      successMsg.textContent = 'Login successful! Reloading...';
      successMsg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #5acce6;
        color: white;
        padding: 20px 40px;
        border-radius: 8px;
        font-size: 16px;
        z-index: 10001;
      `;
      document.body.appendChild(successMsg);

      // Reload page to initialize with credentials
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('XNAT connection error:', error);
      errorMsg.textContent = error.message || 'Failed to connect to XNAT';
      errorMsg.style.display = 'block';
      connectButton.disabled = false;
      connectButton.textContent = 'Connect';
    }
  };

  form.appendChild(urlLabel);
  form.appendChild(urlInput);
  form.appendChild(usernameLabel);
  form.appendChild(usernameInput);
  form.appendChild(passwordLabel);
  form.appendChild(passwordInput);
  form.appendChild(errorMsg);
  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(connectButton);
  form.appendChild(buttonContainer);

  content.appendChild(title);
  content.appendChild(form);
  modal.appendChild(content);

  // Close on overlay click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  };

  document.body.appendChild(modal);
}

function addProjectSelectorButton() {
  console.log('🔘 Attempting to add project selector button...');

  // Check if button already exists
  if (document.getElementById('xnat-project-selector-btn')) {
    console.log('🔘 Button already exists, skipping');
    return;
  }

  // Create floating button
  console.log('🔘 Creating button element');

  // Get current project name
  const currentProjectId = localStorage.getItem('ohif.xnat.selectedProject');
  const buttonText = currentProjectId ? `XNAT: ${currentProjectId}` : 'XNAT: Select Project';

  const button = document.createElement('button');
  button.id = 'xnat-project-selector-btn';
  button.innerHTML = buttonText;
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    background: #5acce6;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: all 0.2s;
  `;

  button.onmouseover = () => {
    button.style.background = '#4ab4d1';
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
  };
  button.onmouseout = () => {
    button.style.background = '#5acce6';
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  };

  button.onclick = () => showProjectSelectorModal();

  document.body.appendChild(button);
  console.log('🔘 Button added to DOM successfully!');
}

function showProjectSelectorModal() {
  // Remove existing modal if any
  const existingModal = document.getElementById('xnat-project-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Make sure projects are available
  if (!window.xnatProjects || window.xnatProjects.length === 0) {
    console.error('No XNAT projects available. Please wait for initialization.');
    alert('Loading projects... Please try again in a moment.');
    return;
  }

  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'xnat-project-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Create modal content
  const content = document.createElement('div');
  content.style.cssText = `
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
  `;

  const title = document.createElement('h2');
  title.textContent = 'Select XNAT Project';
  title.style.cssText = `
    color: white;
    margin: 0 0 16px 0;
    font-size: 20px;
  `;

  const form = document.createElement('form');
  form.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;

  // Project dropdown
  const projectLabel = document.createElement('label');
  projectLabel.textContent = 'Project';
  projectLabel.style.cssText = 'color: #aaa; font-size: 12px;';

  const projectSelect = document.createElement('select');
  projectSelect.required = true;
  projectSelect.style.cssText = `
    background: #2a2a2a;
    color: white;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px;
    font-size: 14px;
    cursor: pointer;
  `;

  // Get projects from global window variable
  const projects = window.xnatProjects || [];
  const currentProject = localStorage.getItem('ohif.xnat.selectedProject');

  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.ID;
    option.textContent = `${project.ID} - ${project.name || 'No name'}`;
    if (project.ID === currentProject) {
      option.selected = true;
    }
    projectSelect.appendChild(option);
  });

  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 8px;
    margin-top: 16px;
  `;

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = `
    background: #2a2a2a;
    color: white;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 10px 16px;
    cursor: pointer;
    flex: 1;
  `;
  cancelButton.onclick = () => modal.remove();

  const selectButton = document.createElement('button');
  selectButton.type = 'submit';
  selectButton.textContent = 'Select';
  selectButton.style.cssText = `
    background: #5acce6;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 10px 16px;
    cursor: pointer;
    font-weight: 600;
    flex: 1;
  `;

  form.onsubmit = (e) => {
    e.preventDefault();
    const selectedProject = projectSelect.value;

    // Save to localStorage using the correct key that XNATDataSource expects
    localStorage.setItem('ohif.xnat.selectedProject', selectedProject);

    // Add a timestamp to force cache busting on reload
    localStorage.setItem('xnat-project-changed', Date.now().toString());

    console.log(`✅ Project selected: ${selectedProject}`);
    console.log('🔄 Please refresh the page to load studies from this project');

    modal.remove();

    // Show message to user
    const successMsg = document.createElement('div');
    successMsg.textContent = `Project "${selectedProject}" selected. Refreshing...`;
    successMsg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #5acce6;
      color: white;
      padding: 20px 40px;
      border-radius: 8px;
      font-size: 16px;
      z-index: 10001;
    `;
    document.body.appendChild(successMsg);

    // Redirect to root page with cache-busting timestamp
    setTimeout(() => {
      window.location.href = window.location.origin + '/?t=' + Date.now();
    }, 1000);
  };

  form.appendChild(projectLabel);
  form.appendChild(projectSelect);
  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(selectButton);
  form.appendChild(buttonContainer);

  content.appendChild(title);
  content.appendChild(form);
  modal.appendChild(content);

  // Close on overlay click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  };

  document.body.appendChild(modal);
}

function addLogoutButton() {
  console.log('🔘 Attempting to add logout button...');

  // Check if button already exists
  if (document.getElementById('xnat-logout-btn')) {
    console.log('🔘 Logout button already exists, skipping');
    return;
  }

  console.log('🔘 Creating logout button element');

  const button = document.createElement('button');
  button.id = 'xnat-logout-btn';
  button.textContent = '🚪 Logout';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 200px;
    background: #e63946;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 20px;
    z-index: 9999;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: all 0.2s;
  `;

  button.onmouseover = () => {
    button.style.background = '#d62828';
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
  };
  button.onmouseout = () => {
    button.style.background = '#e63946';
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  };

  button.onclick = () => {
    console.log('🚪 Logout clicked - clearing all data');

    // Show logout message
    const logoutMsg = document.createElement('div');
    logoutMsg.textContent = 'Logging out...';
    logoutMsg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #e63946;
      color: white;
      padding: 20px 40px;
      border-radius: 8px;
      font-size: 16px;
      z-index: 10001;
    `;
    document.body.appendChild(logoutMsg);

    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();

    // Hard redirect to clear all cached data (bypasses cache completely)
    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname + '?t=' + Date.now();
    }, 500);
  };

  document.body.appendChild(button);
  console.log('🔘 Logout button added to DOM successfully!');
}

function toggleToolbarMode() {
  const toolbar = document.getElementById('xnat-toolbar');
  const currentMode = localStorage.getItem('xnat-toolbar-mode') || 'floating';

  if (currentMode === 'floating') {
    // Switch to right panel mode - adjust OHIF's main viewport
    localStorage.setItem('xnat-toolbar-mode', 'panel');
    const savedWidth = parseInt(localStorage.getItem('xnat-panel-width') || '250');

    // Add margin to OHIF's main app container
    const appContainer = document.querySelector('.viewport-wrapper, [data-cy="viewport-container"], #root > div');
    if (appContainer) {
      appContainer.style.marginRight = savedWidth + 'px';
      appContainer.style.transition = 'margin-right 0.3s ease';
    }

    toolbar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: ${savedWidth}px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-left: 1px solid rgba(255,255,255,0.1);
      border-radius: 0;
      padding: 0;
      z-index: 1000;
      box-shadow: -4px 0 16px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-y: auto;
      cursor: default;
      pointer-events: auto;
    `;

    // Add resize handle
    addResizeHandle();
    console.log('🔧 Switched to panel mode');
  } else {
    // Switch to floating mode - restore OHIF's viewport
    localStorage.setItem('xnat-toolbar-mode', 'floating');

    // Remove margin from OHIF's main app container
    const appContainer = document.querySelector('.viewport-wrapper, [data-cy="viewport-container"], #root > div');
    if (appContainer) {
      appContainer.style.marginRight = '0';
    }

    // Remove resize handle
    const resizeHandle = document.getElementById('xnat-resize-handle');
    if (resizeHandle) {
      resizeHandle.remove();
    }

    toolbar.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 0;
      z-index: 9999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-width: 200px;
      cursor: move;
    `;
    console.log('🔧 Switched to floating mode');
  }
}

function addResizeHandle() {
  // Remove existing handle if present
  const existingHandle = document.getElementById('xnat-resize-handle');
  if (existingHandle) {
    existingHandle.remove();
  }

  const toolbar = document.getElementById('xnat-toolbar');
  const handle = document.createElement('div');
  handle.id = 'xnat-resize-handle';
  handle.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: rgba(90, 204, 230, 0.3);
    cursor: ew-resize;
    z-index: 10;
    transition: background 0.2s;
  `;

  handle.onmouseover = () => {
    handle.style.background = 'rgba(90, 204, 230, 0.6)';
  };
  handle.onmouseout = () => {
    handle.style.background = 'rgba(90, 204, 230, 0.3)';
  };

  let isResizing = false;
  let startX;
  let startWidth;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = toolbar.offsetWidth;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const delta = startX - e.clientX;
    const newWidth = Math.max(200, Math.min(800, startWidth + delta));

    toolbar.style.width = newWidth + 'px';

    const appContainer = document.querySelector('.viewport-wrapper, [data-cy="viewport-container"], #root > div');
    if (appContainer) {
      appContainer.style.marginRight = newWidth + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      // Save the new width
      localStorage.setItem('xnat-panel-width', toolbar.offsetWidth);
      console.log('🔧 Panel width saved:', toolbar.offsetWidth);
    }
  });

  toolbar.appendChild(handle);
}

function addXNATToolbar() {
  console.log('🔧 Adding XNAT toolbar...');

  // Check if toolbar already exists
  if (document.getElementById('xnat-toolbar')) {
    console.log('🔧 Toolbar already exists, updating project name');
    const currentProjectId = localStorage.getItem('ohif.xnat.selectedProject');
    const projectBtn = document.getElementById('xnat-toolbar-project-btn');
    if (projectBtn) {
      projectBtn.innerHTML = `<span style="font-size: 16px;">📁</span> ${currentProjectId || 'Select Project'}`;
    }
    return;
  }

  const currentProjectId = localStorage.getItem('ohif.xnat.selectedProject');
  const savedMode = localStorage.getItem('xnat-toolbar-mode') || 'floating';
  const savedWidth = parseInt(localStorage.getItem('xnat-panel-width') || '250');

  // Create toolbar container
  const toolbar = document.createElement('div');
  toolbar.id = 'xnat-toolbar';

  // Apply initial style based on saved mode
  if (savedMode === 'panel') {
    toolbar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: ${savedWidth}px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-left: 1px solid rgba(255,255,255,0.1);
      border-radius: 0;
      padding: 0;
      z-index: 1000;
      box-shadow: -4px 0 16px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-y: auto;
      cursor: default;
      pointer-events: auto;
    `;

    // Apply margin to OHIF viewport on initial load
    setTimeout(() => {
      const appContainer = document.querySelector('.viewport-wrapper, [data-cy="viewport-container"], #root > div');
      if (appContainer) {
        appContainer.style.marginRight = savedWidth + 'px';
        appContainer.style.transition = 'margin-right 0.3s ease';
      }
    }, 100);
  } else {
    toolbar.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 0;
      z-index: 9999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-width: 200px;
      cursor: move;
    `;
  }

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    background: rgba(255,255,255,0.05);
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px 12px 0 0;
    cursor: move;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const title = document.createElement('div');
  title.innerHTML = '<span style="font-size: 18px;">🔷</span> <strong>XNAT</strong>';
  title.style.cssText = `
    color: #5acce6;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  `;

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
  `;

  // Toggle view mode button (floating vs panel)
  const toggleViewBtn = document.createElement('button');
  toggleViewBtn.innerHTML = '⇄';
  toggleViewBtn.title = 'Toggle floating/panel mode';
  toggleViewBtn.style.cssText = `
    background: none;
    border: none;
    color: #888;
    font-size: 16px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  toggleViewBtn.onclick = (e) => {
    e.stopPropagation();
    toggleToolbarMode();
  };

  const minimizeBtn = document.createElement('button');
  minimizeBtn.innerHTML = '−';
  minimizeBtn.style.cssText = `
    background: none;
    border: none;
    color: #888;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    const content = document.getElementById('xnat-toolbar-content');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      minimizeBtn.innerHTML = '−';
    } else {
      content.style.display = 'none';
      minimizeBtn.innerHTML = '+';
    }
  };

  buttonContainer.appendChild(toggleViewBtn);
  buttonContainer.appendChild(minimizeBtn);

  titleBar.appendChild(title);
  titleBar.appendChild(buttonContainer);

  // Content area
  const content = document.createElement('div');
  content.id = 'xnat-toolbar-content';
  content.style.cssText = `
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  // Project button
  const projectBtn = document.createElement('button');
  projectBtn.id = 'xnat-toolbar-project-btn';
  projectBtn.innerHTML = `<span style="font-size: 16px;">📁</span> ${currentProjectId || 'Select Project'}`;
  projectBtn.style.cssText = `
    background: rgba(90, 204, 230, 0.15);
    color: #5acce6;
    border: 1px solid rgba(90, 204, 230, 0.3);
    border-radius: 6px;
    padding: 10px 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
  `;
  projectBtn.onmouseover = () => {
    projectBtn.style.background = 'rgba(90, 204, 230, 0.25)';
    projectBtn.style.borderColor = 'rgba(90, 204, 230, 0.5)';
  };
  projectBtn.onmouseout = () => {
    projectBtn.style.background = 'rgba(90, 204, 230, 0.15)';
    projectBtn.style.borderColor = 'rgba(90, 204, 230, 0.3)';
  };
  projectBtn.onclick = () => showProjectSelectorModal();

  // Logout button
  const logoutBtn = document.createElement('button');
  logoutBtn.innerHTML = '<span style="font-size: 16px;">🚪</span> Logout';
  logoutBtn.style.cssText = `
    background: rgba(230, 57, 70, 0.15);
    color: #e63946;
    border: 1px solid rgba(230, 57, 70, 0.3);
    border-radius: 6px;
    padding: 10px 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  `;
  logoutBtn.onmouseover = () => {
    logoutBtn.style.background = 'rgba(230, 57, 70, 0.25)';
    logoutBtn.style.borderColor = 'rgba(230, 57, 70, 0.5)';
  };
  logoutBtn.onmouseout = () => {
    logoutBtn.style.background = 'rgba(230, 57, 70, 0.15)';
    logoutBtn.style.borderColor = 'rgba(230, 57, 70, 0.3)';
  };
  logoutBtn.onclick = () => {
    localStorage.clear();
    sessionStorage.clear();
    // Redirect to root path with cache-busting timestamp
    window.location.href = window.location.origin + '/?t=' + Date.now();
  };

  content.appendChild(projectBtn);
  content.appendChild(logoutBtn);
  toolbar.appendChild(titleBar);
  toolbar.appendChild(content);

  // Make it draggable (only in floating mode)
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  titleBar.addEventListener('mousedown', (e) => {
    const currentMode = localStorage.getItem('xnat-toolbar-mode') || 'floating';
    if (currentMode === 'floating') {
      isDragging = true;
      initialX = e.clientX - toolbar.offsetLeft;
      initialY = e.clientY - toolbar.offsetTop;
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      toolbar.style.left = currentX + 'px';
      toolbar.style.top = currentY + 'px';
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  document.body.appendChild(toolbar);

  // Add resize handle if in panel mode
  if (savedMode === 'panel') {
    setTimeout(() => addResizeHandle(), 100);
  }

  console.log('🔧 XNAT toolbar added successfully!');
}
