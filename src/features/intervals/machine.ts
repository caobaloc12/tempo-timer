import { clamp, formatClock } from '../../lib/time'

export const GET_READY_MS = 3000
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 30

/**
 * No countdown second has been played yet. Count cues fire once per second
 * (3, 2, 1) while a get-ready, work, or rest phase winds down.
 */
const NO_COUNT_SECOND = 4

/** 2 transitions per round plus the get-ready phase; the extra margin is a guard. */
const MAX_CATCH_UP_STEPS = MAX_ROUNDS * 2 + 2

export type IntervalPhase = 'getReady' | 'work' | 'rest' | 'finished'

export type IntervalCue = 'count' | 'transition' | 'end'

export interface IntervalConfig {
  workSec: number
  restSec: number
  rounds: number
}

export interface IntervalSession {
  phase: IntervalPhase
  /** 1-based round number. Equals `rounds` once finished. */
  round: number
  rounds: number
  workSec: number
  restSec: number
  /** Wall-clock time the session began (used for total elapsed). */
  startedAt: number
  phaseStartedAt: number
  phaseEndsAt: number
  finishedAt: number | null
  paused: boolean
  pausedAt: number | null
  pausedRemainingMs: number | null
  totalPausedMs: number
  lastCountSecond: number
}

export interface TickResult {
  state: IntervalSession
  cues: IntervalCue[]
}

export interface NextPhaseInfo {
  phase: 'work' | 'rest' | 'finished'
  round: number
  durationMs: number
}

function normalizeRounds(rounds: number): number {
  if (!Number.isFinite(rounds)) return MIN_ROUNDS
  return clamp(Math.round(rounds), MIN_ROUNDS, MAX_ROUNDS)
}

function normalizeSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 1
  return Math.max(1, Math.round(seconds))
}

function normalizeConfig(config: IntervalConfig): IntervalConfig {
  return {
    workSec: normalizeSeconds(config.workSec),
    restSec: normalizeSeconds(config.restSec),
    rounds: normalizeRounds(config.rounds),
  }
}

export function createSession(config: IntervalConfig, now: number): IntervalSession {
  const { workSec, restSec, rounds } = normalizeConfig(config)
  return {
    phase: 'getReady',
    round: 1,
    rounds,
    workSec,
    restSec,
    startedAt: now,
    phaseStartedAt: now,
    phaseEndsAt: now + GET_READY_MS,
    finishedAt: null,
    paused: false,
    pausedAt: null,
    pausedRemainingMs: null,
    totalPausedMs: 0,
    lastCountSecond: NO_COUNT_SECOND,
  }
}

/** Actual wall-clock length of a session: 3s ready, N work blocks, N-1 rests. */
export function sessionDurationMs(config: IntervalConfig): number {
  const { workSec, restSec, rounds } = normalizeConfig(config)
  return (
    GET_READY_MS +
    rounds * workSec * 1000 +
    Math.max(0, rounds - 1) * restSec * 1000
  )
}

export function getPhaseDurationMs(state: IntervalSession): number {
  switch (state.phase) {
    case 'getReady':
      return GET_READY_MS
    case 'work':
      return state.workSec * 1000
    case 'rest':
      return state.restSec * 1000
    case 'finished':
      return 0
  }
}

function beginPhase(
  state: IntervalSession,
  phase: 'work' | 'rest',
  round: number,
  at: number,
): IntervalSession {
  const durationMs =
    phase === 'work' ? state.workSec * 1000 : state.restSec * 1000
  return {
    ...state,
    phase,
    round,
    phaseStartedAt: at,
    phaseEndsAt: at + durationMs,
    finishedAt: null,
    paused: false,
    pausedAt: null,
    pausedRemainingMs: null,
    lastCountSecond: NO_COUNT_SECOND,
  }
}

function advanceOne(state: IntervalSession, at: number): IntervalSession {
  switch (state.phase) {
    case 'getReady':
      return beginPhase(state, 'work', 1, at)
    case 'work':
      if (state.round >= state.rounds) {
        return {
          ...state,
          phase: 'finished',
          phaseStartedAt: at,
          phaseEndsAt: at,
          finishedAt: at,
          paused: false,
          pausedAt: null,
          pausedRemainingMs: null,
          lastCountSecond: NO_COUNT_SECOND,
        }
      }
      return beginPhase(state, 'rest', state.round, at)
    case 'rest':
      return beginPhase(state, 'work', state.round + 1, at)
    case 'finished':
      return state
  }
}

function countdownSecondAt(state: IntervalSession, now: number): number | null {
  if (state.phase === 'finished') return null
  const remaining = state.phaseEndsAt - now
  if (remaining <= 0) return null
  const second = Math.ceil(remaining / 1000)
  return second >= 1 && second <= 3 ? second : null
}

/**
 * Advances a session to `now`, returning at most one cue per call.
 *
 * Timestamps are authoritative: if the app was backgrounded for several
 * phases, every elapsed phase is walked in order, but only the final
 * transition (or the end cue) is emitted. Countdown cues in the gap are lost
 * by design.
 */
export function tick(state: IntervalSession, now: number): TickResult {
  if (state.phase === 'finished' || state.paused) {
    return { state, cues: [] }
  }

  if (now < state.phaseEndsAt) {
    const second = countdownSecondAt(state, now)
    if (second !== null && second < state.lastCountSecond) {
      return {
        state: { ...state, lastCountSecond: second },
        cues: ['count'],
      }
    }
    return { state, cues: [] }
  }

  let next = state
  let transitions = 0
  while (
    next.phase !== 'finished' &&
    now >= next.phaseEndsAt &&
    transitions < MAX_CATCH_UP_STEPS
  ) {
    next = advanceOne(next, next.phaseEndsAt)
    transitions += 1
  }

  if (transitions === 0) {
    return { state, cues: [] }
  }

  // If we landed inside the final seconds of a phase, remember the current
  // second so the catch-up spark does not immediately repeat a count cue.
  const second = countdownSecondAt(next, now)
  next = { ...next, lastCountSecond: second ?? NO_COUNT_SECOND }

  return {
    state: next,
    cues: [next.phase === 'finished' ? 'end' : 'transition'],
  }
}

/** Skips the current phase and starts the next one at `now`. */
export function skipPhase(state: IntervalSession, now: number): TickResult {
  if (state.phase === 'finished' || state.paused) {
    return { state, cues: [] }
  }
  const next = advanceOne(state, now)
  return {
    state: next,
    cues: [next.phase === 'finished' ? 'end' : 'transition'],
  }
}

/** Freezes the phase countdown, remembering exactly how much time was left. */
export function pauseSession(
  state: IntervalSession,
  now: number,
): IntervalSession {
  if (state.phase === 'finished' || state.paused) return state
  return {
    ...state,
    paused: true,
    pausedAt: now,
    pausedRemainingMs: getRemainingMs(state, now),
  }
}

/** Re-bases `phaseEndsAt` from the stored remaining time. */
export function resumeSession(
  state: IntervalSession,
  now: number,
): IntervalSession {
  if (!state.paused) return state
  const pausedForMs =
    state.pausedAt === null ? 0 : Math.max(0, now - state.pausedAt)
  const remainingMs = Math.max(0, state.pausedRemainingMs ?? 0)
  return {
    ...state,
    paused: false,
    pausedAt: null,
    pausedRemainingMs: null,
    totalPausedMs: state.totalPausedMs + pausedForMs,
    phaseEndsAt: now + remainingMs,
  }
}

export function getRemainingMs(
  state: IntervalSession,
  now: number,
): number {
  if (state.phase === 'finished') return 0
  const durationMs = getPhaseDurationMs(state)
  if (state.paused) {
    return clamp(state.pausedRemainingMs ?? 0, 0, durationMs)
  }
  // Clamping also protects the one frame between resume and the next tick,
  // when `now` may still be a beat old.
  return clamp(state.phaseEndsAt - now, 0, durationMs)
}

export function getElapsedMs(state: IntervalSession, now: number): number {
  let end: number
  if (state.phase === 'finished') {
    end = state.finishedAt ?? state.phaseEndsAt
  } else if (state.paused) {
    end = state.pausedAt ?? now
  } else {
    end = now
  }
  return Math.max(0, end - state.startedAt - state.totalPausedMs)
}

export function getPhaseProgress(
  state: IntervalSession,
  now: number,
): number {
  if (state.phase === 'finished') return 1
  const durationMs = getPhaseDurationMs(state)
  if (durationMs <= 0) return 1
  return clamp(1 - getRemainingMs(state, now) / durationMs, 0, 1)
}

export function getPhaseLabel(state: IntervalSession): string {
  switch (state.phase) {
    case 'getReady':
      return 'Get ready'
    case 'work':
      return 'Work'
    case 'rest':
      return 'Rest'
    case 'finished':
      return 'Finished'
  }
}

export function getNextPhase(
  state: IntervalSession,
): NextPhaseInfo | null {
  switch (state.phase) {
    case 'finished':
      return null
    case 'getReady':
      return {
        phase: 'work',
        round: 1,
        durationMs: state.workSec * 1000,
      }
    case 'work':
      if (state.round >= state.rounds) {
        return { phase: 'finished', round: state.rounds, durationMs: 0 }
      }
      return {
        phase: 'rest',
        round: state.round,
        durationMs: state.restSec * 1000,
      }
    case 'rest':
      return {
        phase: 'work',
        round: state.round + 1,
        durationMs: state.workSec * 1000,
      }
  }
}

/** Short hint for the "Next" row, e.g. `Rest · 0:20` or `Finish · Last round`. */
export function formatNextHint(state: IntervalSession): string {
  const next = getNextPhase(state)
  if (!next) return ''
  if (next.phase === 'finished') return 'Finish · Last round'
  const label = next.phase === 'work' ? 'Work' : 'Rest'
  return `${label} · ${formatClock(next.durationMs)}`
}
