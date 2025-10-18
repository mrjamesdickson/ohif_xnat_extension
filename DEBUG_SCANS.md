# Debug Steps for "Scans not loading"

Please follow these steps and report what you see:

## Step 1: Clear Browser Cache
1. Open DevTools (F12 or Cmd+Option+I)
2. Go to Application tab → Storage → Clear site data
3. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+F5 (Windows)

## Step 2: Check Console Logs
After the page loads, check the Console tab for these key messages:

1. **Credentials restored?**
   - Look for: `✅ Restored credentials from sessionStorage`

2. **Project filter set?**
   - Look for: `🎯 Initial project filter: <project_name>`
   - Should NOT be `null`

3. **Studies search called?**
   - Look for: `studies.search called with params:`
   - Look for: `🔍 Searching for studies with currentProjectFilter:`

4. **Any warnings?**
   - Look for: `⚠️ No project selected`
   - Look for: `⚠️ No authentication available`

## Step 3: Check localStorage
In Console tab, run:
```javascript
localStorage.getItem('ohif.xnat.selectedProject')
```

Should return your project name (e.g., `"test"`)

## Step 4: Check sessionStorage
In Console tab, run:
```javascript
sessionStorage.getItem('xnat-credentials')
```

Should return JSON with your credentials.

## Step 5: Force a refresh after login
1. Click the XNAT toolbar
2. Click "📁 Select Project"
3. Choose a project
4. Click "Select"
5. Watch the console - you should see the page reload
6. After reload, check console for the messages in Step 2

## What to report:
Please paste the console output showing:
- The credential restoration messages
- The project filter initialization message
- The studies.search messages
- Any warnings or errors
