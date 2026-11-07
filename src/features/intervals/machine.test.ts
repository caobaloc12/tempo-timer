import { describe, it, expect } from 'vitest'
import {
  GET_READY_MS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  createSession,
  formatNextHint,
  getElapsedMs,
  getNextPhase,
  getPhaseLabel,
  getPhaseProgress,
  getRemainingMs,
  pauseSession,
  resumeSession,
  sessionDurationMs,
  skipPhase,
  tick,
  type IntervalConfig,
} from './machine'

const T0 = 1_000_000
const CONFIG: IntervalConfig = { workSec: 40, restSec: 20, rounds: 2 }

const READY_END = T0 + GET_READY_MS // T0 + 3_000
const WORK1_END = READY_END + 40_000 // T0 + 43_000
const REST1_END = WORK1_END + 20_000 // T0 + 63_000
const WORK2_END = REST1_END + 40_000 // T0 + 103_000

function startSession(config: IntervalConfig = CONFIG, at = T0) {
  return createSession(config, at)
}

describe('createSession', () => {
  it('starts with a 3000ms get-ready phase', () => {
    const session = startSession()
    expect(session.phase).toBe('getReady')
    expect(session.round).toBe(1)
    expect(session.rounds).toBe(2)
    expect(session.phaseStartedAt).toBe(T0)
    expect(session.phaseEndsAt).toBe(T0 + 3000)
    expect(session.phaseEndsAt - session.phaseStartedAt).toBe(3000)
    expect(session.finishedAt).toBeNull()
    expect(session.paused).toBe(false)
  })

  it('clamps rounds to the supported 1-30 range', () => {
    expect(startSession({ ...CONFIG, rounds: 0 }).rounds).toBe(MIN_ROUNDS)
    expect(startSession({ ...CONFIG, rounds: 99 }).rounds).toBe(MAX_ROUNDS)
  })
})

describe('tick phase transitions', () => {
  it('advances getReady -> work -> rest -> work and counts rounds', () => {
    let state = startSession()

    const toWork1 = tick(state, READY_END)
    expect(toWork1.state.phase).toBe('work')
    expect(toWork1.state.round).toBe(1)
    expect(toWork1.state.phaseStartedAt).toBe(READY_END)
    expect(toWork1.state.phaseEndsAt - toWork1.state.phaseStartedAt).toBe(40_000)
    expect(toWork1.cues).toEqual(['transition'])
    state = toWork1.state

    const toRest1 = tick(state, WORK1_END)
    expect(toRest1.state.phase).toBe('rest')
    expect(toRest1.state.round).toBe(1)
    expect(toRest1.state.phaseEndsAt - toRest1.state.phaseStartedAt).toBe(20_000)
    expect(toRest1.cues).toEqual(['transition'])
    state = toRest1.state

    const toWork2 = tick(state, REST1_END)
    expect(toWork2.state.phase).toBe('work')
    expect(toWork2.state.round).toBe(2)
    expect(toWork2.state.phaseStartedAt).toBe(REST1_END)
    expect(toWork2.state.phaseEndsAt - toWork2.state.phaseStartedAt).toBe(40_000)
    expect(toWork2.cues).toEqual(['transition'])
  })

  it('does not schedule a rest after the final work phase', () => {
    let state = startSession()
    state = tick(state, READY_END).state
    state = tick(state, WORK1_END).state
    state = tick(state, REST1_END).state

    const finished = tick(state, WORK2_END)
    expect(finished.state.phase).toBe('finished')
    expect(finished.state.phase).not.toBe('rest')
    expect(finished.state.round).toBe(2)
    expect(finished.state.finishedAt).toBe(WORK2_END)
    expect(finished.cues).toEqual(['end'])
    expect(getElapsedMs(finished.state, T0 + 500_000)).toBe(103_000)
    expect(getRemainingMs(finished.state, T0 + 500_000)).toBe(0)
  })

  it('finishes directly after work when there is only one round', () => {
    const oneRound = startSession({ workSec: 40, restSec: 20, rounds: 1 })
    const work = tick(oneRound, READY_END).state
    const finished = tick(work, READY_END + 40_000)
    expect(finished.state.phase).toBe('finished')
    expect(finished.cues).toEqual(['end'])
  })

  it('emits the end cue exactly once', () => {
    let state = startSession()
    state = tick(state, READY_END).state
    state = tick(state, WORK1_END).state
    state = tick(state, REST1_END).state
    const finished = tick(state, WORK2_END)
    expect(finished.cues).toEqual(['end'])

    const afterwards = tick(finished.state, WORK2_END + 60_000)
    expect(afterwards.state).toBe(finished.state)
    expect(afterwards.cues).toEqual([])
  })
})

describe('skip', () => {
  it('skips from getReady into work round 1', () => {
    const result = skipPhase(startSession(), T0 + 500)
    expect(result.state.phase).toBe('work')
    expect(result.state.round).toBe(1)
    expect(result.state.phaseStartedAt).toBe(T0 + 500)
    expect(result.state.phaseEndsAt).toBe(T0 + 40_500)
    expect(result.cues).toEqual(['transition'])
  })

  it('skips from work into rest', () => {
    const work = skipPhase(startSession(), T0 + 500).state
    const result = skipPhase(work, T0 + 10_000)
    expect(result.state.phase).toBe('rest')
    expect(result.state.round).toBe(1)
    expect(result.state.phaseStartedAt).toBe(T0 + 10_000)
    expect(result.state.phaseEndsAt).toBe(T0 + 30_000)
    expect(result.cues).toEqual(['transition'])
  })

  it('skips from rest into the next work round', () => {
    let state = skipPhase(startSession(), T0 + 500).state
    state = skipPhase(state, T0 + 10_000).state
    const result = skipPhase(state, T0 + 15_000)
    expect(result.state.phase).toBe('work')
    expect(result.state.round).toBe(2)
    expect(result.state.phaseStartedAt).toBe(T0 + 15_000)
    expect(result.state.phaseEndsAt).toBe(T0 + 55_000)
    expect(result.cues).toEqual(['transition'])
  })

  it('finishes when skipping the final work phase', () => {
    let state = skipPhase(startSession(), T0 + 500).state
    state = skipPhase(state, T0 + 10_000).state
    state = skipPhase(state, T0 + 15_000).state
    const result = skipPhase(state, T0 + 16_000)
    expect(result.state.phase).toBe('finished')
    expect(result.state.finishedAt).toBe(T0 + 16_000)
    expect(result.cues).toEqual(['end'])
    expect(getElapsedMs(result.state, T0 + 60_000)).toBe(16_000)
  })

  it('is a no-op while paused or finished', () => {
    const session = startSession()
    const paused = pauseSession(session, T0 + 1_000)
    expect(skipPhase(paused, T0 + 2_000)).toEqual({
      state: paused,
      cues: [],
    })
  })
})

describe('pause and resume', () => {
  it('stores the remaining time and resumes from it', () => {
    let state = startSession()
    state = tick(state, T0 + 500).state
    expect(getRemainingMs(state, T0 + 500)).toBe(2_500)

    const paused = pauseSession(state, T0 + 1_000)
    expect(paused.paused).toBe(true)
    expect(paused.pausedAt).toBe(T0 + 1_000)
    expect(paused.pausedRemainingMs).toBe(2_000)
    expect(paused.phaseEndsAt).toBe(READY_END)

    // Time moves on, but a paused session stays frozen.
    expect(getRemainingMs(paused, T0 + 60_000)).toBe(2_000)
    expect(getElapsedMs(paused, T0 + 60_000)).toBe(1_000)
    expect(tick(paused, T0 + 60_000).state).toBe(paused)
    expect(tick(paused, T0 + 60_000).cues).toEqual([])

    const resumed = resumeSession(paused, T0 + 60_000)
    expect(resumed.paused).toBe(false)
    expect(resumed.pausedAt).toBeNull()
    expect(resumed.pausedRemainingMs).toBeNull()
    expect(resumed.totalPausedMs).toBe(59_000)
    expect(resumed.phaseEndsAt).toBe(T0 + 62_000)
    expect(getRemainingMs(resumed, T0 + 60_000)).toBe(2_000)
    expect(getElapsedMs(resumed, T0 + 60_000)).toBe(1_000)

    const stillReady = tick(resumed, T0 + 61_000)
    expect(stillReady.state.phase).toBe('getReady')

    const toWork = tick(resumed, T0 + 62_000)
    expect(toWork.state.phase).toBe('work')
    expect(toWork.cues).toEqual(['transition'])
    expect(getElapsedMs(toWork.state, T0 + 62_000)).toBe(3_000)
  })

  it('ignores pause while already paused or finished', () => {
    const session = startSession()
    const paused = pauseSession(session, T0 + 1_000)
    expect(pauseSession(paused, T0 + 2_000)).toBe(paused)

    let state = tick(session, READY_END).state
    state = tick(state, WORK1_END).state
    state = tick(state, REST1_END).state
    const done = tick(state, WORK2_END).state
    expect(done.phase).toBe('finished')
    expect(pauseSession(done, T0 + 200_000)).toBe(done)
  })
})

describe('audio cue timing', () => {
  it('beeps 3-2-1 in the last seconds of getReady', () => {
    let state = startSession()

    const c3 = tick(state, T0)
    expect(c3.cues).toEqual(['count'])
    state = c3.state

    const c2 = tick(state, T0 + 1_000)
    expect(c2.cues).toEqual(['count'])
    state = c2.state

    const c1 = tick(state, T0 + 2_000)
    expect(c1.cues).toEqual(['count'])
    state = c1.state

    // Same second, no repeat.
    expect(tick(state, T0 + 2_500).cues).toEqual([])

    const go = tick(state, READY_END)
    expect(go.cues).toEqual(['transition'])
  })

  it('beeps 3-2-1 in the last seconds of work', () => {
    let state = startSession()
    state = tick(state, READY_END).state // work 1

    const c3 = tick(state, WORK1_END - 3_000)
    expect(c3.state.phase).toBe('work')
    expect(c3.cues).toEqual(['count'])
    state = c3.state

    const c2 = tick(state, WORK1_END - 2_000)
    expect(c2.cues).toEqual(['count'])
    state = c2.state

    const c1 = tick(state, WORK1_END - 1_000)
    expect(c1.cues).toEqual(['count'])
    state = c1.state

    // Same second, no repeat.
    expect(tick(state, WORK1_END - 500).cues).toEqual([])

    const toRest = tick(state, WORK1_END)
    expect(toRest.cues).toEqual(['transition'])
    expect(toRest.state.phase).toBe('rest')
  })

  it('counts down the final work phase into the end cue', () => {
    let state = startSession()
    state = tick(state, READY_END).state // work 1
    state = tick(state, WORK1_END).state // rest 1
    state = tick(state, REST1_END).state // work 2

    const c3 = tick(state, WORK2_END - 3_000)
    expect(c3.cues).toEqual(['count'])
    state = c3.state

    const c2 = tick(state, WORK2_END - 2_000)
    expect(c2.cues).toEqual(['count'])
    state = c2.state

    const c1 = tick(state, WORK2_END - 1_000)
    expect(c1.cues).toEqual(['count'])
    state = c1.state

    const finished = tick(state, WORK2_END)
    expect(finished.cues).toEqual(['end'])
    expect(finished.state.phase).toBe('finished')
  })

  it('beeps 3-2-1 in the last seconds of rest', () => {
    let state = startSession()
    state = tick(state, READY_END).state // work 1
    state = tick(state, WORK1_END).state // rest 1
    expect(state.phase).toBe('rest')

    const c3 = tick(state, REST1_END - 3_000)
    expect(c3.cues).toEqual(['count'])
    state = c3.state

    const c2 = tick(state, REST1_END - 2_000)
    expect(c2.cues).toEqual(['count'])
    state = c2.state

    const c1 = tick(state, REST1_END - 1_000)
    expect(c1.cues).toEqual(['count'])
    state = c1.state

    expect(tick(state, REST1_END - 500).cues).toEqual([])

    const backToWork = tick(state, REST1_END)
    expect(backToWork.cues).toEqual(['transition'])
    expect(backToWork.state.phase).toBe('work')
    expect(backToWork.state.round).toBe(2)
  })

  it('emits one transition cue per boundary', () => {
    let state = startSession()
    let result = tick(state, READY_END)
    expect(result.cues).toEqual(['transition'])
    state = result.state

    result = tick(state, WORK1_END)
    expect(result.cues).toEqual(['transition'])
    state = result.state

    result = tick(state, REST1_END)
    expect(result.cues).toEqual(['transition'])
    state = result.state

    result = tick(state, WORK2_END)
    expect(result.cues).toEqual(['end'])
  })
})

describe('catch-up after backgrounding', () => {
  it('walks multiple elapsed phases but emits a single transition cue', () => {
    const state = startSession()
    const now = REST1_END + 500
    const result = tick(state, now)

    expect(result.state.phase).toBe('work')
    expect(result.state.round).toBe(2)
    expect(result.state.phaseStartedAt).toBe(REST1_END)
    expect(result.cues).toEqual(['transition'])
    expect(result.cues).toHaveLength(1)
    expect(getRemainingMs(result.state, now)).toBe(39_500)
  })

  it('emits only the end cue when the whole session elapsed', () => {
    const state = startSession()
    const result = tick(state, WORK2_END + 30_000)
    expect(result.state.phase).toBe('finished')
    expect(result.cues).toEqual(['end'])
    expect(result.cues).toHaveLength(1)
    expect(getElapsedMs(result.state, WORK2_END + 30_000)).toBe(103_000)
  })

  it('does not burst count cues when landing inside the last seconds', () => {
    const state = startSession()
    // Lands 1.5s before the end of rest 1, after two phase boundaries.
    const now = REST1_END - 1_500
    const result = tick(state, now)
    expect(result.state.phase).toBe('rest')
    expect(result.cues).toEqual(['transition'])

    // The same second does not fire again immediately.
    expect(tick(result.state, now + 100).cues).toEqual([])

    // The next second does.
    expect(tick(result.state, REST1_END - 1_000).cues).toEqual(['count'])
  })
})

describe('derived view helpers', () => {
  it('computes the real session duration (no rest after the final work)', () => {
    expect(sessionDurationMs({ workSec: 40, restSec: 20, rounds: 8 })).toBe(463_000)
    expect(sessionDurationMs({ workSec: 45, restSec: 15, rounds: 8 })).toBe(468_000)
    expect(sessionDurationMs({ workSec: 40, restSec: 20, rounds: 1 })).toBe(43_000)
  })

  it('reports remaining, elapsed and progress', () => {
    const session = startSession()
    expect(getRemainingMs(session, T0)).toBe(3_000)
    expect(getRemainingMs(session, T0 + 1_500)).toBe(1_500)
    expect(getElapsedMs(session, T0 + 1_500)).toBe(1_500)
    expect(getPhaseProgress(session, T0)).toBe(0)
    expect(getPhaseProgress(session, T0 + 1_500)).toBeCloseTo(0.5)
    expect(getPhaseProgress(session, T0 + 3_000)).toBe(1)
  })

  it('labels phases and hints at the next phase', () => {
    let state = startSession()
    expect(getPhaseLabel(state)).toBe('Get ready')
    expect(formatNextHint(state)).toBe('Work · 0:40')
    expect(getNextPhase(state)).toEqual({
      phase: 'work',
      round: 1,
      durationMs: 40_000,
    })

    state = tick(state, READY_END).state
    expect(getPhaseLabel(state)).toBe('Work')
    expect(formatNextHint(state)).toBe('Rest · 0:20')
    expect(getNextPhase(state)).toEqual({
      phase: 'rest',
      round: 1,
      durationMs: 20_000,
    })

    state = tick(state, WORK1_END).state
    expect(getPhaseLabel(state)).toBe('Rest')
    expect(formatNextHint(state)).toBe('Work · 0:40')

    state = tick(state, REST1_END).state
    expect(formatNextHint(state)).toBe('Finish · Last round')
    expect(getNextPhase(state)).toEqual({
      phase: 'finished',
      round: 2,
      durationMs: 0,
    })

    state = tick(state, WORK2_END).state
    expect(getPhaseLabel(state)).toBe('Finished')
    expect(formatNextHint(state)).toBe('')
    expect(getPhaseProgress(state, T0 + 200_000)).toBe(1)
    expect(getNextPhase(state)).toBeNull()
  })
})
