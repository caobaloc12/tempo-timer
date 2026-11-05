import { useEffect, useState } from 'react'

/**
 * Returns a Date.now() snapshot that refreshes while `active`.
 * The timer itself is always computed from timestamps, never decremented.
 */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    if (!active) return

    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])

  return now
}
