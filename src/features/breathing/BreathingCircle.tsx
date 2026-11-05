import { formatClock } from '../../lib/time'
import { PHASE_LABELS } from './machine'
import type { BreathPhase } from './machine'

interface BreathingCircleProps {
  phase: BreathPhase
  remainingMs: number
  scale: number
  paused: boolean
  reducedMotion: boolean
}

export function BreathingCircle({
  phase,
  remainingMs,
  scale,
  paused,
  reducedMotion,
}: BreathingCircleProps) {
  return (
    <div className="relative aspect-square w-[min(68vw,17rem,42vh)] shrink-0">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full border border-breathe/15"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[13%] rounded-full border border-breathe/50 bg-breathe/10 shadow-[0_0_70px_-12px_rgba(129,140,248,0.65)]"
        style={{
          transform: `scale(${scale})`,
          transition: reducedMotion ? 'none' : 'transform 100ms linear',
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[11px] font-semibold tracking-[0.32em] text-breathe">
          {PHASE_LABELS[phase]}
        </p>
        <p className="tabular mt-2 text-[clamp(2.75rem,14vw,4.25rem)] leading-none font-light tracking-tight text-text">
          {formatClock(remainingMs)}
        </p>
        {paused && (
          <p className="mt-2 rounded-full border border-border px-3 py-1 text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Paused
          </p>
        )}
      </div>
    </div>
  )
}
