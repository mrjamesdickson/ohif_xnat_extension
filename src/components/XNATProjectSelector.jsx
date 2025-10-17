import React, { useState, useEffect } from 'react';

export default function XNATProjectSelector({ servicesManager }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get projects from window global (set by XNATDataSource)
    if (window.xnatProjects) {
      setProjects(window.xnatProjects);

      // Get current project from localStorage
      const currentProject = localStorage.getItem('xnat-project-filter');
      if (currentProject) {
        setSelectedProject(currentProject);
      }
      setLoading(false);
    }
  }, []);

  const handleProjectChange = (projectId) => {
    setSelectedProject(projectId);

    // Use the global function to set the project
    if (window.xnatSetProject) {
      window.xnatSetProject(projectId);
    }

    // Show notification
    const { uiNotificationService } = servicesManager.services;
    if (uiNotificationService) {
      uiNotificationService.show({
        title: 'Project Changed',
        message: `Switched to project: ${projectId}`,
        type: 'success',
        duration: 3000,
      });
    }

    // Refresh the study list
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  if (loading) {
    return React.createElement('div', { className: 'text-white p-2' }, 'Loading projects...');
  }

  if (!projects.length) {
    return React.createElement('div', { className: 'text-white p-2' }, 'No projects available');
  }

  return React.createElement('div', { className: 'p-4 bg-black text-white' },
    React.createElement('h6', { className: 'text-lg font-semibold mb-4' }, 'Select XNAT Project'),
    React.createElement('div', { className: 'mb-4' },
      React.createElement('label', { className: 'block text-sm mb-2' }, 'Project:'),
      React.createElement('select', {
        value: selectedProject,
        onChange: (e) => handleProjectChange(e.target.value),
        className: 'w-full bg-gray-800 text-white border border-gray-600 rounded p-2'
      },
        React.createElement('option', { value: '' }, 'All Projects'),
        projects.map((project) =>
          React.createElement('option', { key: project.id, value: project.id },
            `${project.id} - ${project.name}`
          )
        )
      )
    ),
    React.createElement('div', { className: 'text-xs text-gray-400' },
      React.createElement('p', null, `Current: ${selectedProject || 'All Projects'}`),
      React.createElement('p', { className: 'mt-2' }, `Total Projects: ${projects.length}`)
    )
  );
}
