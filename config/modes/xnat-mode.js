/**
 * XNAT Mode Configuration Extension
 * This file adds XNAT-specific toolbar buttons to the basic viewer mode
 * Copy this to ../ohif_viewer/modes/xnat/ during deployment
 */

function modeFactory({ modeConfiguration }) {
  return {
    id: 'xnat',
    routeName: 'xnat',
    displayName: 'XNAT Viewer',

    onModeEnter: () => {
      // Initialize XNAT-specific features
      console.log('XNAT mode activated');
    },

    routes: [
      {
        path: 'xnat',
        layoutTemplate: () => {
          return {
            id: 'xnatLayout',
            props: {
              leftPanels: ['seriesList'],
              rightPanels: ['measure'],
              viewports: [
                {
                  namespace: '@ohif/extension-default.viewportModule.dicom',
                  displaySetsToDisplay: ['@ohif/extension-default.sopClassHandlerModule.stack'],
                },
              ],
            },
          };
        },
      },
    ],

    extensions: [
      '@ohif/extension-default',
      '@ohif/extension-cornerstone',
      '@ohif/extension-xnat-datasource',
    ],

    // Add XNAT toolbar buttons
    toolbar: {
      primary: {
        left: [
          {
            id: 'xnat-project',
            label: 'XNAT Project',
            icon: 'icon-settings',
            tooltip: 'Select XNAT Project',
            commands: 'showXNATProjectSelector',
            type: 'command',
          },
          {
            id: 'xnat-cache',
            label: 'Cache',
            icon: 'icon-settings',
            tooltip: 'View/Clear DICOM Cache',
            commands: 'showXNATCacheInfo',
            type: 'command',
          },
        ],
      },
    },
  };
}

const mode = {
  id: 'xnat',
  modeFactory,
  extensionDependencies: {
    '@ohif/extension-default': '^3.0.0',
    '@ohif/extension-cornerstone': '^3.0.0',
    '@ohif/extension-xnat-datasource': '^1.0.0',
  },
};

export default mode;
