import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpatialWorkspace } from './ui/SpatialWorkspace';
import { Capacitor } from '@capacitor/core';
createRoot(document.getElementById('root')!).render(<StrictMode><SpatialWorkspace /></StrictMode>);
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  // No immediate activation while editing; a new worker activates after old
  // clients close. Only this build's local application assets enter its cache.
  void navigator.serviceWorker.register(new URL('sw.js', window.location.href).href).catch(() => {});
}
