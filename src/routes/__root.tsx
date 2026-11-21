import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { useEffect } from 'react'
import { isDesktop } from '../lib/vitals-source'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
})

function Root() {
  useEffect(() => {
    if (!isDesktop() && location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined)
    }
  }, [])
  return <Outlet />
}
