const CACHE_NAME = 'ascenda-v1.0.0';
const STATIC_CACHE = 'ascenda-static-v1.0.0';
const DYNAMIC_CACHE = 'ascenda-dynamic-v1.0.0';
const API_CACHE = 'ascenda-api-v1.0.0';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/register.html',
  '/profile.html',
  '/jupas.html',
  '/grade.html',
  '/manifest.json',
  'css/style.css',
  'css/leaderboard.css',
  'css/animations.css',
  'js/supabase.js',
  'js/leaderboard.js',
  'js/jupas.js',
  'js/grading.js',
  'js/anticheat.js',
  'js/watermark.js',
  'js/notifications.js',
  'js/payment.js',
  'js/verification.js',
  'js/i18n.js',
  'data/schools.json',
  'data/jupas-data.json'
];

// API endpoints to cache with specific strategies
const API_CACHE_PATTERNS = [
  /^https:\/\/.*\/rest\/v1\/leaderboard/,
  /^https:\/\/.*\/rest\/v1\/user_profiles/,
  /^https:\/\/.*\/rest\/v1\/schools/,
  /^https:\/\/.*\/rest\/v1\/jupas_programs/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v1.0.0');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v1.0.0');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== API_CACHE &&
                cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Handle different request types
  if (isAPIRequest(request)) {
    event.respondWith(handleAPIRequest(request));
  } else if (isStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
  } else {
    event.respondWith(handleDynamicRequest(request));
  }
});

// Check if request is for API
function isAPIRequest(request) {
  return API_CACHE_PATTERNS.some(pattern => pattern.test(request.url));
}

// Check if request is for static asset
function isStaticAsset(request) {
  const url = new URL(request.url);
  return request.url.includes(self.location.origin) && 
         (url.pathname.includes('css/') || 
          url.pathname.includes('js/') || 
          url.pathname.includes('data/') ||
          url.pathname.endsWith('.json') ||
          url.pathname.endsWith('.html'));
}

// Handle API requests with network-first strategy
async function handleAPIRequest(request) {
  const url = new URL(request.url);
  const cacheKey = `${request.method}:${request.url}`;

  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      // Clone response before caching
      const responseToCache = networkResponse.clone();
      await cache.put(cacheKey, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);
    
    // Fallback to cache
    const cachedResponse = await caches.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for API failures
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'No network connection and cached data not available',
        timestamp: new Date().toISOString()
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

// Handle static assets with cache-first strategy
async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Return cached version immediately
    return cachedResponse;
  }

  try {
    // Fetch from network and cache
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Failed to fetch static asset:', request.url);
    
    // Return offline page for HTML requests
    if (request.url.endsWith('.html')) {
      return caches.match('/index.html');
    }
    
    // Return error for other assets
    return new Response('Resource not available offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Handle dynamic requests with stale-while-revalidate
async function handleDynamicRequest(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  // Always try to fetch from network in background
  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Network request failed:', request.url);
      return null;
    });

  // Return cached version immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // Wait for network if no cache available
  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Return offline page as last resort
  return caches.match('/index.html');
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'score-upload') {
    event.waitUntil(syncScoreUploads());
  } else if (event.tag === 'leaderboard-refresh') {
    event.waitUntil(refreshLeaderboardCache());
  }
});

// Sync pending score uploads
async function syncScoreUploads() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const pendingUploads = await cache.match('/pending-uploads');
    
    if (pendingUploads) {
      const uploads = await pendingUploads.json();
      
      for (const upload of uploads) {
        try {
          const response = await fetch('/api/upload-score', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(upload)
          });
          
          if (response.ok) {
            console.log('[SW] Synced upload:', upload.id);
          }
        } catch (error) {
          console.error('[SW] Failed to sync upload:', upload.id, error);
        }
      }
      
      // Clear pending uploads after processing
      await cache.delete('/pending-uploads');
    }
  } catch (error) {
    console.error('[SW] Error syncing uploads:', error);
  }
}

// Refresh leaderboard cache
async function refreshLeaderboardCache() {
  try {
    const response = await fetch('/api/leaderboard');
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put('/api/leaderboard', response.clone());
      console.log('[SW] Leaderboard cache refreshed');
    }
  } catch (error) {
    console.error('[SW] Failed to refresh leaderboard:', error);
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('[SW] Push message received');
  
  let notificationData = {
    title: 'Ascenda',
    body: 'You have a new notification',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiByeD0iMjQiIGZpbGw9InVybCgjZ3JhZGllbnQwXzBfMSkiLz4KPHBhdGggZD0iTTEyIDQ4SDQ4Vjg0SDEyVjQ4WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTcyIDQ4SDEwOFY4NEg3MlY0OFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMzIgNDhSDE2OFY4NEgxMzJWNDhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIgMTA4SDQ4VjE0NEgxMlYxMDhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNzIgMTA4SDEwOFYxNDRINzJWMTA4WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTEzMiAxMDhSDE2OFYxNDRIMTMyVjEwOFoiIGZpbGw9IndoaXRlIi8+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9ImdyYWRpZW50MF8wXzEiIHgxPSIwIiB5MT0iMCIgeDI9IjE5MiIgeTI9IjE5MiIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjMjU2M2ViIi8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzFkNGVkOCIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPgo=',
    badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIHZpZXdCb3g9IjAgMCA3MiA3MiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzYiIGN5PSIzNiIgcj0iMzYiIGZpbGw9IiMyNTYzZWIiLz4KPHBhdGggZD0iTTI0IDI0SDQ4VjQ4SDI0VjI0WiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==',
    tag: 'ascenda-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.error('[SW] Error parsing push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  
  event.notification.close();

  const action = event.action;
  const urlToOpen = new URL('/', self.location.origin);

  if (action === 'view') {
    // Open specific page based on notification data
    if (event.notification.data && event.notification.data.url) {
      urlToOpen.pathname = event.notification.data.url;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === urlToOpen.href && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen.href);
        }
      })
  );
});

// Message handling from clients
self.addEventListener('message', (event) => {
  console.log('[SW] Message received from client:', event.data);
  
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_UPDATE':
      updateCache(payload);
      break;
      
    case 'CLEAR_CACHE':
      clearCache(payload);
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// Update specific cache
async function updateCache({ url, cacheName = DYNAMIC_CACHE }) {
  try {
    const cache = await caches.open(cacheName);
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
      console.log('[SW] Cache updated for:', url);
    }
  } catch (error) {
    console.error('[SW] Failed to update cache:', url, error);
  }
}

// Clear specific cache
async function clearCache({ cacheName = DYNAMIC_CACHE }) {
  try {
    await caches.delete(cacheName);
    console.log('[SW] Cache cleared:', cacheName);
  } catch (error) {
    console.error('[SW] Failed to clear cache:', cacheName, error);
  }
}

// Periodic background sync for leaderboard updates
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  
  if (event.tag === 'leaderboard-update') {
    event.waitUntil(refreshLeaderboardCache());
  }
});

// Network status monitoring
self.addEventListener('online', () => {
  console.log('[SW] Client is online');
  // Trigger any pending sync operations
  self.registration.sync.register('score-upload');
});

self.addEventListener('offline', () => {
  console.log('[SW] Client is offline');
});

// Cleanup old caches periodically
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep only current version caches
          if (!cacheName.includes('v1.0.0')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
