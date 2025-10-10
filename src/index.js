import createXNATDataSource from './XNATDataSource.js';

const EXTENSION_ID = '@ohif/extension-xnat-datasource';

console.log('XNAT Extension Loading...', EXTENSION_ID);

/**
 * Get data sources provided by this extension
 */
const extension = {
  id: EXTENSION_ID,
  dataSources: [
    {
      name: 'xnat',
      type: 'webApi',
      createDataSource: createXNATDataSource,
    },
  ],
};

console.log('XNAT Extension Loaded:', extension);

export default extension;
