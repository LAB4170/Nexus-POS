import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './index.css';

// EMERGENCY CACHE BUSTER:
// Forcefully unregister any lingering Service Workers from previous PWA setups
// that are hijacking the landing page and serving stale cached assets.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      console.warn('🗑️ Forcefully unregistered stale service worker.');
    }
  });
}

// Clear all CacheStorage (used by Service Workers) to ensure fresh Netlify assets
if ('caches' in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name);
      console.warn(`🗑️ Cleared stale PWA cache: ${name}`);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
