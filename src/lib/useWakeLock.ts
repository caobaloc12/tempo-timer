import { useEffect } from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

/**
 * Keeps the display awake while `active` is true.
 * iOS Safari 18.4+ supports this inside standalone home-screen web apps.
 * Silently no-ops where unsupported or denied.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return

    const nav = navigator as WakeLockNavigator
    if (!nav.wakeLock) return

    const lock: { current: WakeLockSentinelLike | null } = { current: null }
    let cancelled = false

    const request = async (): Promise<void> => {
      if (document.visibilityState !== 'visible' || lock.current) return
      try {
        const next = await nav.wakeLock?.request('screen')
        if (!next) return
        if (cancelled) {
          void next.release()
          return
        }
        lock.current = next
        next.addEventListener('release', () => {
          if (lock.current === next) lock.current = null
        })
      } catch {
        /* denied, battery saver, or unsupported */
      }
    }

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      const current = lock.current
      lock.current = null
      if (current) {
        void current.release().catch(() => undefined)
      }
    }
  }, [active])
}
