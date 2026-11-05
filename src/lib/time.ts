export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Countdown display: rounds up so 44.2s shows as 0:45. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  return formatSeconds(totalSeconds)
}

/** Elapsed display: rounds to the nearest second. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  return formatSeconds(totalSeconds)
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function secToMs(seconds: number): number {
  return Math.max(0, seconds) * 1000
}
