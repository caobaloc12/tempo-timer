import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon, StopIcon } from '../../components/Icons'
import { playBreathCue, stopAll, unlockAudio } from '../../lib/audio'
import { formatClock } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { useWakeLock } from '../../lib/useWakeLock'
import type { BreathingCycles, Settings } from '../../types'
import { BreathingCircle } from './BreathingCircle'
import {
  BREATHING_CYCLE_OPTIONS,
  EXHALE_MS,
  HOLD_MS,
  INHALE_MS,
  PHASE_LABELS,
  advanceBreathing,
  circleScale,
  createBreathingState,
  pauseBreathing,
  phaseRemainingMs,
  remainingSessionMs,
  resumeBreathing,
  startBreathing,
  stopBreathing,
  totalDurationMs,
} from './machine'
import type { BreathPhase } from './machine'

export interface BreathingScreenProps {
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  onActiveChange: (active: boolean) => void
}

const PHASE_PREVIEW: readonly { phase: BreathPhase; seconds: number }[] = [
  { phase: 'inhale', seconds: INHALE_MS / 1_000 },
  { phase: 'hold', seconds: HOLD_MS / 1_000 },
  { phase: 'exhale', seconds: EXHALE_MS / 1_000 },
]

function phaseName(phase: BreathPhase): string {
  const label = PHASE_LABELS[phase]
  return `${label.charAt(0)}${label.slice(1).toLowerCase()}`
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReducedMotion(query.matches)

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reducedMotion
}

interface IdleViewProps {
  cycles: BreathingCycles
  onCyclesChange: (cycles: BreathingCycles) => void
  onStart: () => void
}

function IdleView({ cycles, onCyclesChange, onStart }: IdleViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center pb-3">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-breathe uppercase">
            4–7–8 breathing
          </p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-text">Breathe</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Follow the circle. Soften the breath and let each cycle settle.
          </p>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-2">
          {PHASE_PREVIEW.map(({ phase, seconds }) => (
            <div
              key={phase}
              className="rounded-2xl border border-border bg-surface px-2 py-3 text-center"
            >
              <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
                {phaseName(phase)}
              </p>
              <p className="tabular mt-1 text-lg font-medium text-breathe">
                {seconds}
                <span className="ml-0.5 text-xs text-muted">s</span>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <p id="breathing-cycles-label" className="text-sm font-medium text-text">
              Cycles
            </p>
            <p className="text-sm text-muted">
              <span className="tabular text-text">{formatClock(totalDurationMs(cycles))}</span>{' '}
              total
            </p>
          </div>
          <div
            role="group"
            aria-labelledby="breathing-cycles-label"
            className="mt-2 grid grid-cols-3 gap-2"
          >
            {BREATHING_CYCLE_OPTIONS.map((option) => {
              const selected = option === cycles
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${option} cycles`}
                  onClick={() => onCyclesChange(option)}
                  className={[
                    'relative flex min-h-12 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-breathe focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none',
                    selected
                      ? 'border-breathe bg-breathe/10 text-text'
                      : 'border-border bg-surface text-muted active:bg-surface-2',
                  ].join(' ')}
                >
                  {selected && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1 right-2 text-[10px] text-breathe"
                    >
                      ✓
                    </span>
                  )}
                  <span className="tabular text-lg leading-none font-semibold">{option}</span>
                  <span className="mt-1 text-[10px] tracking-[0.1em] uppercase opacity-70">
                    cycles
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="safe-bottom pt-3">
        <button
          type="button"
          onClick={onStart}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-breathe px-5 text-base font-semibold text-bg transition-opacity active:opacity-80 focus-visible:ring-2 focus-visible:ring-breathe focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
        >
          <PlayIcon className="h-5 w-5" />
          Start
        </button>
      </div>
    </div>
  )
}

interface ActiveViewProps {
  phase: BreathPhase
  cycle: number
  cycles: BreathingCycles
  remainingPhaseMs: number
  remainingTotalMs: number
  scale: number
  paused: boolean
  reducedMotion: boolean
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

function ActiveView({
  phase,
  cycle,
  cycles,
  remainingPhaseMs,
  remainingTotalMs,
  scale,
  paused,
  reducedMotion,
  onPause,
  onResume,
  onStop,
}: ActiveViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between pt-1 text-[11px] font-medium tracking-[0.2em] text-muted uppercase">
        <span>4–7–8</span>
        <span className="normal-case tracking-normal">
          <span className="tabular text-text">{formatClock(remainingTotalMs)}</span> left
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        <BreathingCircle
          phase={phase}
          remainingMs={remainingPhaseMs}
          scale={scale}
          paused={paused}
          reducedMotion={reducedMotion}
        />
      </div>

      <p className="pb-1 text-center text-sm text-muted">
        {paused && <span className="font-medium text-text">Paused · </span>}
        Cycle <span className="tabular text-text">{cycle}</span> of{' '}
        <span className="tabular">{cycles}</span>
      </p>

      <div className="safe-bottom flex gap-3 pt-3">
        <button
          type="button"
          onClick={paused ? onResume : onPause}
          aria-label={paused ? 'Resume breathing session' : 'Pause breathing session'}
          className={[
            'flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-colors',
            'focus-visible:ring-2 focus-visible:ring-breathe focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none',
            paused
              ? 'bg-breathe text-bg active:opacity-80'
              : 'border border-border bg-surface text-text active:bg-surface-2',
          ].join(' ')}
        >
          {paused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop breathing session"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted transition-colors active:bg-surface-2 focus-visible:ring-2 focus-visible:ring-breathe focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
        >
          <StopIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

interface FinishedViewProps {
  cycles: BreathingCycles
  onAgain: () => void
  onDone: () => void
}

function FinishedView({ cycles, onAgain, onDone }: FinishedViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center pb-3 text-center">
        <div
          aria-hidden="true"
          className="flex h-24 w-24 items-center justify-center rounded-full border border-breathe/30 bg-breathe/5 text-3xl text-breathe"
        >
          ✓
        </div>
        <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-breathe uppercase">
          Session complete
        </p>
        <h1 className="mt-2 text-3xl font-light tracking-tight text-text">Nicely done</h1>

        <div className="mt-7 grid w-full max-w-xs grid-cols-2 gap-2">
          <div className="rounded-2xl border border-border bg-surface px-3 py-4">
            <p className="text-[11px] tracking-[0.12em] text-muted uppercase">Total time</p>
            <p className="tabular mt-1 text-2xl font-light text-text">
              {formatClock(totalDurationMs(cycles))}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-3 py-4">
            <p className="text-[11px] tracking-[0.12em] text-muted uppercase">
              Cycles
            </p>
            <p className="tabular mt-1 text-2xl font-light text-text">{cycles}</p>
          </div>
        </div>
      </div>

      <div className="safe-bottom grid grid-cols-2 gap-3 pt-3">
        <button
          type="button"
          onClick={onAgain}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-breathe px-4 text-base font-semibold text-bg transition-opacity active:opacity-80 focus-visible:ring-2 focus-visible:ring-breathe focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
        >
          <PlayIcon className="h-5 w-5" />
          Again
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex h-14 items-center justify-center rounded-2xl border border-border bg-surface px-4 text-base font-medium text-text transition-colors active:bg-surface-2 focus-visible:ring-2 focus-visible:ring-breathe focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
        >
          Done
        </button>
      </div>
    </div>
  )
}

export function BreathingScreen({
  settings,
  onSettingsChange,
  onActiveChange,
}: BreathingScreenProps) {
  const [engine, setEngine] = useState(() =>
    createBreathingState(settings.breathingCycles),
  )
  const reducedMotion = usePrefersReducedMotion()
  const running = engine.status === 'running'
  const paused = engine.status === 'paused'
  const sessionActive = running || paused
  const now = useNow(running, 100)

  useWakeLock(sessionActive)

  const onActiveChangeRef = useRef(onActiveChange)
  const aliveRef = useRef(true)
  const audioActionRef = useRef(0)

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  }, [onActiveChange])

  useEffect(() => {
    aliveRef.current = true

    return () => {
      aliveRef.current = false
      audioActionRef.current += 1
      stopAll()
      onActiveChangeRef.current(false)
    }
  }, [])

  useEffect(() => {
    if (engine.status === 'finished') {
      onActiveChange(false)
    }
  }, [engine.status, onActiveChange])

  useEffect(() => {
    if (engine.status !== 'running') return

    const { state: next, cue } = advanceBreathing(engine, now)
    if (next === engine) return

    // oxlint-disable-next-line react/set-state-in-effect -- wall-clock tick; this effect is the timer's clock
    setEngine(next)
    if (cue !== null) {
      playBreathCue(cue)
    }
  }, [engine, now])

  async function beginSession(): Promise<void> {
    const action = audioActionRef.current + 1
    audioActionRef.current = action

    stopAll()
    setEngine(startBreathing(settings.breathingCycles, Date.now()))
    onActiveChange(true)

    await unlockAudio('playback')
    if (!aliveRef.current || audioActionRef.current !== action) return
    playBreathCue('inhale')
  }

  function pauseSession(): void {
    audioActionRef.current += 1
    stopAll()

    const pausedAt = Date.now()
    setEngine((previous) => {
      if (previous.status !== 'running') return previous
      const caughtUp = advanceBreathing(previous, pausedAt).state
      return pauseBreathing(caughtUp, pausedAt)
    })
  }

  async function resumeSession(): Promise<void> {
    const action = audioActionRef.current + 1
    audioActionRef.current = action
    const phase = engine.phase
    const resumedAt = Date.now()

    setEngine((previous) => resumeBreathing(previous, resumedAt))

    await unlockAudio('playback')
    if (!aliveRef.current || audioActionRef.current !== action) return
    playBreathCue(phase)
  }

  function endSession(): void {
    audioActionRef.current += 1
    stopAll()
    setEngine((previous) => stopBreathing(previous))
    onActiveChange(false)
  }

  const remainingPhase = phaseRemainingMs(engine, now)
  const remainingTotal = remainingSessionMs(engine, now)
  const scale = reducedMotion ? 1.05 : circleScale(engine, now)

  let announcement = ''
  if (engine.status === 'running') {
    announcement = `${phaseName(engine.phase)}. Cycle ${engine.cycle} of ${engine.cycles}.`
  } else if (engine.status === 'paused') {
    announcement = `Paused during ${phaseName(engine.phase).toLowerCase()}. Cycle ${engine.cycle} of ${engine.cycles}.`
  } else if (engine.status === 'finished') {
    announcement = `Session complete. ${engine.cycles} cycles.`
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {engine.status === 'idle' && (
        <IdleView
          cycles={settings.breathingCycles}
          onCyclesChange={(cycles) => onSettingsChange({ breathingCycles: cycles })}
          onStart={() => {
            void beginSession()
          }}
        />
      )}

      {sessionActive && (
        <ActiveView
          phase={engine.phase}
          cycle={engine.cycle}
          cycles={engine.cycles}
          remainingPhaseMs={remainingPhase}
          remainingTotalMs={remainingTotal}
          scale={scale}
          paused={paused}
          reducedMotion={reducedMotion}
          onPause={pauseSession}
          onResume={() => {
            void resumeSession()
          }}
          onStop={endSession}
        />
      )}

      {engine.status === 'finished' && (
        <FinishedView
          cycles={engine.cycles}
          onAgain={() => {
            void beginSession()
          }}
          onDone={endSession}
        />
      )}
    </section>
  )
}
