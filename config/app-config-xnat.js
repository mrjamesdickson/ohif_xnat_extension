// XNAT OHIF App Configuration
// This config enables the XNAT mode as default and adds toolbar buttons

window.config = {
  routerBasename: '/',
  showStudyList: true,

  // Use XNAT mode as default
  defaultDataSourceName: 'xnat',

  dataSources: [
    {
      namespace: '@ohif/extension-xnat-datasource',
      sourceName: 'xnat',
      configuration: {
        xnatUrl: 'http://demo02.xnatworks.io',
        username: 'admin',
        password: 'admin',
      },
    },
  ],

  // Available modes - XNAT mode first (becomes default)
  modes: ['@ohif/mode-xnat', '@ohif/mode-longitudinal'],

  extensions: [],
};
