import type { BreathCue } from '../../lib/audio'
import type { BreathingCycles } from '../../types'

export type BreathPhase = 'inhale' | 'hold' | 'exhale'
export type BreathingStatus = 'idle' | 'running' | 'paused' | 'finished'

export const PHASE_LABELS: Readonly<Record<BreathPhase, string>> = {
  inhale: 'INHALE',
  hold: 'HOLD',
  exhale: 'EXHALE',
}

export const INHALE_MS = 4_000
export const HOLD_MS = 7_000
export const EXHALE_MS = 8_000
export const CYCLE_MS = INHALE_MS + HOLD_MS + EXHALE_MS

export const PHASE_DURATIONS_MS: Readonly<Record<BreathPhase, number>> = {
  inhale: INHALE_MS,
  hold: HOLD_MS,
  exhale: EXHALE_MS,
}

export const PHASE_ORDER: readonly BreathPhase[] = ['inhale', 'hold', 'exhale']

export const BREATHING_CYCLE_OPTIONS: readonly BreathingCycles[] = [8, 12, 16]

export interface BreathingState {
  status: BreathingStatus
  phase: BreathPhase
  /** 1-based cycle while a session is active; the completed count once finished. */
  cycle: number
  cycles: BreathingCycles
  phaseEndsAt: number | null
  pausedRemainingMs: number | null
}

export interface BreathingAdvance {
  state: BreathingState
  /** The last cue crossed while catching up, or null when nothing changed. */
  cue: BreathCue | null
}

export function totalDurationMs(cycles: number): number {
  return Math.max(0, cycles) * CYCLE_MS
}

export function createBreathingState(cycles: BreathingCycles): BreathingState {
  return {
    status: 'idle',
    phase: 'inhale',
    cycle: 1,
    cycles,
    phaseEndsAt: null,
    pausedRemainingMs: null,
  }
}

export function startBreathing(cycles: BreathingCycles, now: number): BreathingState {
  return {
    status: 'running',
    phase: 'inhale',
    cycle: 1,
    cycles,
    phaseEndsAt: now + INHALE_MS,
    pausedRemainingMs: null,
  }
}

function finish(state: BreathingState): BreathingState {
  return {
    ...state,
    status: 'finished',
    phase: 'exhale',
    cycle: state.cycles,
    phaseEndsAt: null,
    pausedRemainingMs: null,
  }
}

/**
 * Advances a running session to `now` using absolute timestamps.
 *
 * A single call may cross several phase (and cycle) boundaries after the app
 * has been backgrounded. Only the cue for the final phase reached is returned,
 * so a catch-up never fires a burst of overlapping sounds.
 */
export function advanceBreathing(state: BreathingState, now: number): BreathingAdvance {
  if (state.status !== 'running' || state.phaseEndsAt === null) {
    return { state, cue: null }
  }

  if (now < state.phaseEndsAt) {
    return { state, cue: null }
  }

  let phase = state.phase
  let cycle = state.cycle
  let phaseEndsAt = state.phaseEndsAt
  let cue: BreathCue | null = null

  while (now >= phaseEndsAt) {
    if (phase === 'inhale') {
      phase = 'hold'
      phaseEndsAt += HOLD_MS
      cue = 'hold'
    } else if (phase === 'hold') {
      phase = 'exhale'
      phaseEndsAt += EXHALE_MS
      cue = 'exhale'
    } else if (cycle >= state.cycles) {
      return { state: finish(state), cue: 'end' }
    } else {
      phase = 'inhale'
      cycle += 1
      phaseEndsAt += INHALE_MS
      cue = 'inhale'
    }
  }

  return {
    state: {
      ...state,
      phase,
      cycle,
      phaseEndsAt,
      pausedRemainingMs: null,
    },
    cue,
  }
}

export function pauseBreathing(state: BreathingState, now: number): BreathingState {
  if (state.status !== 'running' || state.phaseEndsAt === null) {
    return state
  }

  return {
    ...state,
    status: 'paused',
    phaseEndsAt: null,
    pausedRemainingMs: Math.max(0, state.phaseEndsAt - now),
  }
}

export function resumeBreathing(state: BreathingState, now: number): BreathingState {
  if (state.status !== 'paused') {
    return state
  }

  const remaining = state.pausedRemainingMs ?? PHASE_DURATIONS_MS[state.phase]

  return {
    ...state,
    status: 'running',
    phaseEndsAt: now + remaining,
    pausedRemainingMs: null,
  }
}

export function stopBreathing(state: BreathingState): BreathingState {
  return createBreathingState(state.cycles)
}

/** Milliseconds left in the current phase, clamped to the phase duration. */
export function phaseRemainingMs(state: BreathingState, now: number): number {
  if (state.status === 'finished') return 0

  const duration = PHASE_DURATIONS_MS[state.phase]

  if (state.status === 'paused') {
    return Math.min(duration, Math.max(0, state.pausedRemainingMs ?? 0))
  }

  if (state.status === 'idle' || state.phaseEndsAt === null) {
    return duration
  }

  return Math.min(duration, Math.max(0, state.phaseEndsAt - now))
}

/** Total time left in the whole session, including later phases and cycles. */
export function remainingSessionMs(state: BreathingState, now: number): number {
  if (state.status === 'finished') return 0
  if (state.status === 'idle') return totalDurationMs(state.cycles)

  const currentPhaseIndex = PHASE_ORDER.indexOf(state.phase)
  const remainingPhases = PHASE_ORDER.slice(currentPhaseIndex + 1).reduce(
    (total, phase) => total + PHASE_DURATIONS_MS[phase],
    0,
  )
  const remainingCycles = Math.max(0, state.cycles - state.cycle)

  return phaseRemainingMs(state, now) + remainingPhases + remainingCycles * CYCLE_MS
}

/** 0 → 1 across the current phase. Used to drive the circle from timestamps. */
export function phaseProgress(state: BreathingState, now: number): number {
  if (state.status !== 'running' && state.status !== 'paused') return 0

  const duration = PHASE_DURATIONS_MS[state.phase]
  const remaining = phaseRemainingMs(state, now)

  return Math.min(1, Math.max(0, 1 - remaining / duration))
}

export const CIRCLE_MIN_SCALE = 0.75
export const CIRCLE_MAX_SCALE = 1.35

/**
 * Circle scale for the current instant: inhale expands, hold stays large,
 * exhale contracts. It is recomputed from timestamps, so pausing and
 * resuming cannot accumulate drift.
 */
export function circleScale(state: BreathingState, now: number): number {
  const progress = phaseProgress(state, now)

  if (state.phase === 'hold') return CIRCLE_MAX_SCALE
  if (state.phase === 'exhale') {
    return CIRCLE_MAX_SCALE - (CIRCLE_MAX_SCALE - CIRCLE_MIN_SCALE) * progress
  }
  return CIRCLE_MIN_SCALE + (CIRCLE_MAX_SCALE - CIRCLE_MIN_SCALE) * progress
}
