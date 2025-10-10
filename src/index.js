import createXNATDataSource from './XNATDataSource.js';

const EXTENSION_ID = '@ohif/extension-xnat-datasource';

console.log('XNAT Extension Loading...', EXTENSION_ID);

/**
 * Get data sources provided by this extension
 */
function getDataSourcesModule() {
  console.log('getDataSourcesModule called');
  const dataSources = [
    {
      name: 'xnat',
      type: 'webApi',
      createDataSource: createXNATDataSource,
    },
  ];
  console.log('Returning data sources:', dataSources);
  return dataSources;
}

const extension = {
  id: EXTENSION_ID,
  getDataSourcesModule,
};

console.log('XNAT Extension Loaded:', extension);

export default extension;
