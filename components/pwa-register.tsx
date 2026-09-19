'use client';
import { useEffect } from 'react';
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    const reloadForNewWorker = () => {
      if (reloading || !navigator.serviceWorker.controller) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reloadForNewWorker);
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(() => {});

    return () => navigator.serviceWorker.removeEventListener('controllerchange', reloadForNewWorker);
  }, []);

  return null;
}
