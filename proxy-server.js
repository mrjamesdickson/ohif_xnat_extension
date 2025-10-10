const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// Enable CORS for all routes
app.use(cors());

// Proxy /xnat-api to XNAT demo server
app.use('/xnat-api', createProxyMiddleware({
  target: 'http://demo02.xnatworks.io',
  changeOrigin: true,
  pathRewrite: {
    '^/xnat-api': '',
  },
  logLevel: 'debug',
}));

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`XNAT Proxy server running on http://localhost:${PORT}`);
  console.log(`Proxying /xnat-api to http://demo02.xnatworks.io`);
});
