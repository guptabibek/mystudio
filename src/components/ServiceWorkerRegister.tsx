'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const isProd = process.env.NODE_ENV === 'production'

    if (!isProd) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister().catch(() => {
            // Ignore unregister failures to avoid impacting app usage.
          })
        })
      })

      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.startsWith('lumiere-')) {
              caches.delete(key).catch(() => {
                // Ignore cache deletion failures to avoid impacting app usage.
              })
            }
          })
        })
      }

      return
    }

    const registerServiceWorker = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore registration failures to avoid impacting app usage.
      })
    }

    window.addEventListener('load', registerServiceWorker)
    return () => {
      window.removeEventListener('load', registerServiceWorker)
    }
  }, [])

  return null
}
