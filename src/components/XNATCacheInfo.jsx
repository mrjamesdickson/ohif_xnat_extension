import React, { useState, useEffect } from 'react';

export default function XNATCacheInfo({ servicesManager }) {
  const [cacheStats, setCacheStats] = useState(null);

  const refreshStats = () => {
    if (window.xnatImageCache && window.xnatImageCache.getStats) {
      const stats = window.xnatImageCache.getStats();
      setCacheStats(stats);
    }
  };

  useEffect(() => {
    refreshStats();
    // Refresh every 5 seconds
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClearCache = () => {
    if (window.xnatImageCache && window.xnatImageCache.clear) {
      window.xnatImageCache.clear();
      refreshStats();

      const { uiNotificationService } = servicesManager.services;
      if (uiNotificationService) {
        uiNotificationService.show({
          title: 'Cache Cleared',
          message: 'DICOM image cache has been cleared',
          type: 'success',
          duration: 3000,
        });
      }
    }
  };

  if (!cacheStats) {
    return React.createElement('div', { className: 'p-4 bg-black text-white' },
      React.createElement('h6', { className: 'text-lg font-semibold mb-4' }, 'XNAT Cache Info'),
      React.createElement('p', { className: 'text-gray-400' }, 'Cache not available')
    );
  }

  const percentage = Math.min((cacheStats.sizeMB / 512) * 100, 100);

  return React.createElement('div', { className: 'p-4 bg-black text-white' },
    React.createElement('h6', { className: 'text-lg font-semibold mb-4' }, 'XNAT Image Cache'),

    React.createElement('div', { className: 'mb-4 space-y-2' },
      React.createElement('div', { className: 'flex justify-between' },
        React.createElement('span', { className: 'text-gray-400' }, 'Cached Files:'),
        React.createElement('span', { className: 'font-mono' }, cacheStats.entries)
      ),
      React.createElement('div', { className: 'flex justify-between' },
        React.createElement('span', { className: 'text-gray-400' }, 'Cache Size:'),
        React.createElement('span', { className: 'font-mono' }, `${cacheStats.sizeMB.toFixed(2)} MB`)
      ),
      React.createElement('div', { className: 'flex justify-between' },
        React.createElement('span', { className: 'text-gray-400' }, 'Limit:'),
        React.createElement('span', { className: 'font-mono text-gray-500' }, '512 MB')
      ),
      React.createElement('div', { className: 'w-full bg-gray-700 rounded-full h-2 mt-2' },
        React.createElement('div', {
          className: 'bg-blue-500 h-2 rounded-full transition-all',
          style: { width: `${percentage}%` }
        })
      )
    ),

    React.createElement('button', {
      onClick: handleClearCache,
      className: 'w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded'
    }, 'Clear Cache'),

    React.createElement('div', { className: 'mt-4 text-xs text-gray-500' },
      React.createElement('p', null, 'Cache auto-evicts when full (LRU)'),
      React.createElement('p', null, 'Updates every 5 seconds')
    )
  );
}
