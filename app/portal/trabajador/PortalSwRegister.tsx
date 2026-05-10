'use client'

import { useEffect } from 'react'

export default function PortalSwRegister() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      window.location.protocol === 'http:' && window.location.hostname !== 'localhost'
    ) {
      return
    }

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/portal-sw.js', {
          scope: '/portal/trabajador',
        })
        // Auto-update si hay nueva versión
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING')
            }
          })
        })
      } catch (err) {
        console.error('[portal-sw] register failed:', err)
      }
    }

    register()
  }, [])

  return null
}
