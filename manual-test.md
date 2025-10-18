# Manual Test for Project Selection

Since I cannot directly control your browser, please follow these steps:

## Step 1: Check Current Project
Open browser console (F12 or right-click → Inspect → Console tab) and paste this:

```javascript
console.log('Current project:', localStorage.getItem('xnat-selected-project'));
console.log('All localStorage keys:', Object.keys(localStorage));
```

**Write down what project name you see.**

---

## Step 2: Change Project
1. Click the "📁 Select Project" button (bottom right corner)
2. In the dropdown, select a **different** project (e.g., if you see "test", select "Prostate-AEC")
3. Click the "Select" button
4. Wait for the page to reload

---

## Step 3: Check New Project
After the page reloads, open console again and paste:

```javascript
console.log('New project:', localStorage.getItem('xnat-selected-project'));
console.log('All localStorage keys:', Object.keys(localStorage));
```

**Write down what project name you see now.**

---

## Step 4: Report Results
Tell me:
- What was the project in Step 1?
- What project did you select in Step 2?
- What was the project in Step 3?
- Did the project value change?

This will tell us if the localStorage is actually updating or if there's a bug in saving the selection.
