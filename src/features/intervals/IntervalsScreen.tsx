import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  PauseIcon,
  PlayIcon,
  SkipIcon,
  StopIcon,
} from '../../components/Icons'
import { playBeep, stopAll, unlockAudio } from '../../lib/audio'
import { clamp, formatClock, formatElapsed } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { useWakeLock } from '../../lib/useWakeLock'
import {
  INTERVAL_PRESETS,
  getPreset,
  type IntervalPreset,
  type IntervalPresetId,
  type Settings,
} from '../../types'
import {
  MAX_ROUNDS,
  MIN_ROUNDS,
  createSession,
  formatNextHint,
  getElapsedMs,
  getPhaseLabel,
  getPhaseProgress,
  getRemainingMs,
  pauseSession,
  resumeSession,
  sessionDurationMs,
  skipPhase,
  tick,
  type IntervalSession,
} from './machine'

interface IntervalsScreenProps {
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  onActiveChange: (active: boolean) => void
}

export function IntervalsScreen({
  settings,
  onSettingsChange,
  onActiveChange,
}: IntervalsScreenProps) {
  const [session, setSession] = useState<IntervalSession | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const sessionRef = useRef<IntervalSession | null>(null)
  const lastTickAtRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const sessionTokenRef = useRef(0)
  const onActiveChangeRef = useRef(onActiveChange)

  const sessionActive = session !== null && session.phase !== 'finished'
  useWakeLock(sessionActive)
  const now = useNow(sessionActive, 100)

  const commitSession = useCallback((next: IntervalSession | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  }, [onActiveChange])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopAll()
      onActiveChangeRef.current(false)
    }
  }, [])

  // Timestamp-driven engine loop. `tick` is pure; this effect only applies its
  // result and plays the (at most one) cue it reports.
  useEffect(() => {
    const current = sessionRef.current
    if (!current || current.phase === 'finished') return
    if (lastTickAtRef.current !== null && now <= lastTickAtRef.current) return
    lastTickAtRef.current = now

    const result = tick(current, now)
    if (result.state !== current) {
      commitSession(result.state)
    }
    for (const cue of result.cues) {
      playBeep(cue)
    }
    if (result.state.phase === 'finished') {
      onActiveChangeRef.current(false)
    }
  }, [now, commitSession])

  async function prepareAudio(): Promise<void> {
    try {
      await unlockAudio(settings.mixWithMusic ? 'ambient' : 'playback')
    } catch {
      /* The timer must still run if audio is unavailable. */
    }
  }

  async function beginSession(): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    const token = sessionTokenRef.current + 1
    sessionTokenRef.current = token
    setUnlocking(true)
    try {
      await prepareAudio()
      if (!mountedRef.current || sessionTokenRef.current !== token) return
      const preset = getPreset(settings.intervalPresetId)
      lastTickAtRef.current = null
      commitSession(
        createSession(
          {
            workSec: preset.workSec,
            restSec: preset.restSec,
            rounds: settings.rounds,
          },
          Date.now(),
        ),
      )
      onActiveChangeRef.current(true)
    } finally {
      busyRef.current = false
      if (mountedRef.current) setUnlocking(false)
    }
  }

  async function resume(): Promise<void> {
    if (busyRef.current) return
    const current = sessionRef.current
    if (!current || !current.paused) return
    busyRef.current = true
    setUnlocking(true)
    try {
      await prepareAudio()
      const latest = sessionRef.current
      if (!mountedRef.current || !latest || !latest.paused) return
      commitSession(resumeSession(latest, Date.now()))
    } finally {
      busyRef.current = false
      if (mountedRef.current) setUnlocking(false)
    }
  }

  function pause(): void {
    const current = sessionRef.current
    if (!current || current.phase === 'finished' || current.paused) return
    commitSession(pauseSession(current, Date.now()))
  }

  function skip(): void {
    const current = sessionRef.current
    if (!current || current.phase === 'finished' || current.paused) return
    const result = skipPhase(current, Date.now())
    commitSession(result.state)
    for (const cue of result.cues) {
      playBeep(cue)
    }
    if (result.state.phase === 'finished') {
      onActiveChangeRef.current(false)
    }
  }

  function stopSession(): void {
    sessionTokenRef.current += 1
    stopAll()
    lastTickAtRef.current = null
    commitSession(null)
    onActiveChangeRef.current(false)
  }

  function handleRoundsChange(nextRounds: number): void {
    onSettingsChange({ rounds: clamp(nextRounds, MIN_ROUNDS, MAX_ROUNDS) })
  }

  const preset = getPreset(settings.intervalPresetId)
  const rounds = clamp(settings.rounds, MIN_ROUNDS, MAX_ROUNDS)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {session === null ? (
        <IdleView
          preset={preset}
          rounds={rounds}
          starting={unlocking}
          onPresetChange={(intervalPresetId: IntervalPresetId) =>
            onSettingsChange({ intervalPresetId })
          }
          onRoundsChange={handleRoundsChange}
          onStart={() => {
            void beginSession()
          }}
        />
      ) : session.phase === 'finished' ? (
        <FinishedView
          session={session}
          now={now}
          starting={unlocking}
          onAgain={() => {
            void beginSession()
          }}
          onDone={stopSession}
        />
      ) : (
        <RunningView
          session={session}
          now={now}
          unlocking={unlocking}
          onPause={pause}
          onResume={() => {
            void resume()
          }}
          onSkip={skip}
          onStop={stopSession}
        />
      )}
    </div>
  )
}

interface IdleViewProps {
  preset: IntervalPreset
  rounds: number
  starting: boolean
  onPresetChange: (id: IntervalPresetId) => void
  onRoundsChange: (rounds: number) => void
  onStart: () => void
}

function IdleView({
  preset,
  rounds,
  starting,
  onPresetChange,
  onRoundsChange,
  onStart,
}: IdleViewProps) {
  const totalMs = sessionDurationMs({
    workSec: preset.workSec,
    restSec: preset.restSec,
    rounds,
  })
  const restCount = Math.max(0, rounds - 1)

  return (
    <div className="safe-bottom flex min-h-0 flex-1 flex-col px-5">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 py-2">
        <section aria-labelledby="interval-preset-heading">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2
              id="interval-preset-heading"
              className="text-sm font-semibold text-text"
            >
              Preset
            </h2>
            <span className="text-[11px] text-muted">60s per round</span>
          </div>

          <div
            role="group"
            aria-labelledby="interval-preset-heading"
            className="grid grid-cols-2 gap-3"
          >
            {INTERVAL_PRESETS.map((option) => {
              const selected = option.id === preset.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPresetChange(option.id)}
                  className={[
                    'flex min-h-[6.25rem] flex-col justify-between rounded-3xl border p-4 text-left transition-colors',
                    selected
                      ? 'border-work bg-work/10'
                      : 'border-border bg-surface active:bg-surface-2',
                  ].join(' ')}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="tabular text-2xl font-semibold tracking-tight text-text">
                      {option.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className={[
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        selected
                          ? 'border-work bg-work text-black'
                          : 'border-border text-transparent',
                      ].join(' ')}
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                  </span>
                  <span className="mt-3 block text-xs leading-relaxed text-muted">
                    {option.workSec}s work · {option.restSec}s rest
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="interval-rounds-heading">
          <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-4">
            <div className="min-w-0">
              <h2
                id="interval-rounds-heading"
                className="text-sm font-semibold text-text"
              >
                Rounds
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {MIN_ROUNDS} to {MAX_ROUNDS}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <StepperButton
                label="Decrease rounds"
                disabled={rounds <= MIN_ROUNDS}
                onClick={() => onRoundsChange(rounds - 1)}
              >
                <MinusIcon className="h-5 w-5" />
              </StepperButton>
              <span
                aria-live="polite"
                aria-atomic="true"
                className="w-12 text-center text-4xl font-semibold tabular text-text"
              >
                {rounds}
              </span>
              <StepperButton
                label="Increase rounds"
                disabled={rounds >= MAX_ROUNDS}
                onClick={() => onRoundsChange(rounds + 1)}
              >
                <PlusIcon className="h-5 w-5" />
              </StepperButton>
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted">Total session</span>
            <span className="text-xl font-semibold tabular text-text">
              {formatElapsed(totalMs)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {restCount > 0
              ? `3s get ready · ${rounds} × ${preset.workSec}s work · ${restCount} × ${preset.restSec}s rest`
              : `3s get ready · ${preset.workSec}s work`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={starting}
        className="mt-2 mb-1 flex h-16 w-full shrink-0 items-center justify-center rounded-2xl bg-work text-lg font-semibold text-black transition-transform active:scale-[0.99] disabled:opacity-60"
      >
        {starting ? 'Starting…' : 'Start'}
      </button>
    </div>
  )
}

interface RunningViewProps {
  session: IntervalSession
  now: number
  unlocking: boolean
  onPause: () => void
  onResume: () => void
  onSkip: () => void
  onStop: () => void
}

function RunningView({
  session,
  now,
  unlocking,
  onPause,
  onResume,
  onSkip,
  onStop,
}: RunningViewProps) {
  const remaining = getRemainingMs(session, now)
  const elapsed = getElapsedMs(session, now)
  const progress = getPhaseProgress(session, now)
  const paused = session.paused
  const phaseLabel = getPhaseLabel(session)
  const isWork = session.phase === 'work'
  const isRest = session.phase === 'rest'

  const toneText = isWork ? 'text-work' : isRest ? 'text-rest' : 'text-text'
  const toneBorder = isWork
    ? 'border-work/40'
    : isRest
      ? 'border-rest/40'
      : 'border-border'
  const toneSurface = isWork
    ? 'bg-work/10'
    : isRest
      ? 'bg-rest/10'
      : 'bg-surface'
  const toneFill = isWork ? 'bg-work' : isRest ? 'bg-rest' : 'bg-text'

  return (
    <div className="safe-bottom flex min-h-0 flex-1 flex-col px-5">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
        <div
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-col items-center"
        >
          <div
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 ${toneBorder} ${toneSurface}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${toneFill}`}
            />
            <span
              className={`text-xs font-bold tracking-[0.24em] uppercase ${toneText}`}
            >
              {phaseLabel}
            </span>
            {paused ? (
              <span className="border-l border-border pl-2 text-xs font-semibold tracking-[0.16em] text-text uppercase">
                Paused
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted">
            Round <span className="font-semibold tabular text-text">{session.round}</span> of{' '}
            <span className="font-semibold tabular text-text">{session.rounds}</span>
          </p>
        </div>

        <div className="mt-1 flex items-center justify-center">
          <span
            aria-hidden="true"
            className={`text-[clamp(5.25rem,30vw,9rem)] leading-none font-semibold tracking-[-0.04em] tabular ${toneText}`}
          >
            {formatClock(remaining)}
          </span>
          <span className="sr-only">{formatClock(remaining)} remaining</span>
        </div>

        <div
          aria-hidden="true"
          className="mt-4 h-1 w-44 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-100 ease-linear ${toneFill}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div className="mt-6 w-full max-w-[17rem] border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
              Elapsed
            </span>
            <span className="text-base font-semibold tabular text-text">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <span className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
              Next
            </span>
            <span className="text-base font-semibold tabular text-text">
              {formatNextHint(session)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-end justify-center gap-8 pt-2">
        <SecondaryControl
          label="Stop"
          ariaLabel="Stop session"
          onClick={onStop}
        >
          <StopIcon className="h-6 w-6" />
        </SecondaryControl>

        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={paused ? onResume : onPause}
            disabled={paused && unlocking}
            aria-label={paused ? 'Resume session' : 'Pause session'}
            className={`flex h-20 w-20 items-center justify-center rounded-full text-black transition-transform active:scale-95 disabled:opacity-60 ${
              paused ? 'bg-text' : toneFill
            }`}
          >
            {paused ? (
              <PlayIcon className="h-8 w-8" />
            ) : (
              <PauseIcon className="h-8 w-8" />
            )}
          </button>
          <span aria-hidden="true" className="mt-1.5 text-xs font-medium text-muted">
            {paused ? 'Resume' : 'Pause'}
          </span>
        </div>

        <SecondaryControl
          label="Skip"
          ariaLabel="Skip phase"
          onClick={onSkip}
          disabled={paused}
        >
          <SkipIcon className="h-6 w-6" />
        </SecondaryControl>
      </div>
    </div>
  )
}

interface FinishedViewProps {
  session: IntervalSession
  now: number
  starting: boolean
  onAgain: () => void
  onDone: () => void
}

function FinishedView({
  session,
  now,
  starting,
  onAgain,
  onDone,
}: FinishedViewProps) {
  const totalMs = getElapsedMs(session, now)

  return (
    <div className="safe-bottom flex min-h-0 flex-1 flex-col px-5">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6 text-center">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-rest/40 bg-rest/10 text-rest"
        >
          <CheckIcon className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-text">
          Session complete
        </h2>
        <div className="mt-7 text-[clamp(4rem,24vw,7rem)] leading-none font-semibold tabular text-text">
          {formatElapsed(totalMs)}
        </div>
        <p className="mt-2 text-xs tracking-[0.2em] text-muted uppercase">
          Total time
        </p>
        <p className="mt-6 text-sm text-muted">
          <span className="font-semibold tabular text-text">{session.rounds}</span>{' '}
          {session.rounds === 1 ? 'round' : 'rounds'} completed
          <span aria-hidden="true"> · </span>
          {session.workSec}s work / {session.restSec}s rest
        </p>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={onAgain}
          disabled={starting}
          className="flex h-14 items-center justify-center rounded-2xl bg-work text-base font-semibold text-black transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {starting ? 'Starting…' : 'Again'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex h-14 items-center justify-center rounded-2xl border border-border bg-surface text-base font-semibold text-text active:bg-surface-2"
        >
          Done
        </button>
      </div>
    </div>
  )
}

interface StepperButtonProps {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: StepperButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-2 text-text transition-colors active:bg-border disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

interface SecondaryControlProps {
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function SecondaryControl({
  label,
  ariaLabel,
  onClick,
  disabled = false,
  children,
}: SecondaryControlProps) {
  return (
    <div className="flex w-16 flex-col items-center">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        disabled={disabled}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-text transition-colors active:bg-surface-2 disabled:opacity-35"
      >
        {children}
      </button>
      <span aria-hidden="true" className="mt-1.5 text-xs font-medium text-muted">
        {label}
      </span>
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  )
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 12h12" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 6v12M6 12h12" />
    </svg>
  )
}
