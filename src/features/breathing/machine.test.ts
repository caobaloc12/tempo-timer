import { describe, expect, it } from 'vitest'
import {
  CYCLE_MS,
  EXHALE_MS,
  HOLD_MS,
  INHALE_MS,
  advanceBreathing,
  pauseBreathing,
  resumeBreathing,
  startBreathing,
  totalDurationMs,
} from './machine'

describe('breathing machine', () => {
  it('starts on an inhale that lasts 4000ms', () => {
    const state = startBreathing(8, 1_000)

    expect(state.status).toBe('running')
    expect(state.phase).toBe('inhale')
    expect(state.cycle).toBe(1)
    expect(state.phaseEndsAt).toBe(1_000 + INHALE_MS)
    expect((state.phaseEndsAt ?? 0) - 1_000).toBe(4_000)
  })

  it('moves through inhale, hold and exhale with 4000/7000/8000ms timings', () => {
    const started = startBreathing(8, 0)

    const beforeInhaleEnds = advanceBreathing(started, 3_999)
    expect(beforeInhaleEnds.state).toBe(started)
    expect(beforeInhaleEnds.cue).toBeNull()

    const hold = advanceBreathing(started, 4_000)
    expect(hold.state.phase).toBe('hold')
    expect(hold.state.phaseEndsAt).toBe(4_000 + HOLD_MS)

    const beforeHoldEnds = advanceBreathing(hold.state, 10_999)
    expect(beforeHoldEnds.state).toBe(hold.state)

    const exhale = advanceBreathing(hold.state, 11_000)
    expect(exhale.state.phase).toBe('exhale')
    expect((exhale.state.phaseEndsAt ?? 0) - 11_000).toBe(EXHALE_MS)

    const beforeExhaleEnds = advanceBreathing(exhale.state, 18_999)
    expect(beforeExhaleEnds.state).toBe(exhale.state)

    const nextCycle = advanceBreathing(exhale.state, 19_000)
    expect(nextCycle.state.phase).toBe('inhale')
    expect(nextCycle.state.cycle).toBe(2)
    expect((nextCycle.state.phaseEndsAt ?? 0) - 19_000).toBe(INHALE_MS)
  })

  it('counts cycles and finishes after the last exhale', () => {
    const started = startBreathing(8, 0)

    const secondCycle = advanceBreathing(started, CYCLE_MS)
    expect(secondCycle.state.cycle).toBe(2)
    expect(secondCycle.state.phase).toBe('inhale')
    expect(secondCycle.state.phaseEndsAt).toBe(CYCLE_MS + INHALE_MS)

    const lastCycle = advanceBreathing(started, 7 * CYCLE_MS)
    expect(lastCycle.state.cycle).toBe(8)
    expect(lastCycle.state.phase).toBe('inhale')
    expect(lastCycle.state.phaseEndsAt).toBe(7 * CYCLE_MS + INHALE_MS)

    const justBeforeEnd = advanceBreathing(started, 8 * CYCLE_MS - 1)
    expect(justBeforeEnd.state.status).toBe('running')
    expect(justBeforeEnd.state.cycle).toBe(8)
    expect(justBeforeEnd.state.phase).toBe('exhale')

    const finished = advanceBreathing(started, 8 * CYCLE_MS)
    expect(finished.state.status).toBe('finished')
    expect(finished.state.cycle).toBe(8)
    expect(finished.state.phase).toBe('exhale')
    expect(finished.state.phaseEndsAt).toBeNull()
  })

  it('stores the phase remainder on pause and rebases the clock on resume', () => {
    const started = startBreathing(8, 0)
    const paused = pauseBreathing(started, 1_000)

    expect(paused.status).toBe('paused')
    expect(paused.phase).toBe('inhale')
    expect(paused.phaseEndsAt).toBeNull()
    expect(paused.pausedRemainingMs).toBe(3_000)

    const whilePaused = advanceBreathing(paused, 50_000)
    expect(whilePaused.state).toBe(paused)
    expect(whilePaused.cue).toBeNull()

    const resumed = resumeBreathing(paused, 10_000)
    expect(resumed.status).toBe('running')
    expect(resumed.phase).toBe('inhale')
    expect(resumed.phaseEndsAt).toBe(10_000 + 3_000)
    expect(resumed.pausedRemainingMs).toBeNull()

    const beforeEnd = advanceBreathing(resumed, 12_999)
    expect(beforeEnd.state).toBe(resumed)

    const hold = advanceBreathing(resumed, 13_000)
    expect(hold.state.phase).toBe('hold')
    expect(hold.state.phaseEndsAt).toBe(13_000 + HOLD_MS)
  })

  it('returns the cue for each transition and a single ending cue', () => {
    const started = startBreathing(8, 0)

    const hold = advanceBreathing(started, 4_000)
    expect(hold.cue).toBe('hold')

    const exhale = advanceBreathing(hold.state, 11_000)
    expect(exhale.cue).toBe('exhale')

    const nextInhale = advanceBreathing(exhale.state, 19_000)
    expect(nextInhale.cue).toBe('inhale')

    const finished = advanceBreathing(started, CYCLE_MS * 8)
    expect(finished.cue).toBe('end')
    expect(finished.state.status).toBe('finished')
  })

  it('catches up across skipped phases and reports only the final cue', () => {
    const started = startBreathing(8, 0)

    // 60s lands 3s into cycle 4's inhale after skipping three full cycles.
    const caughtUp = advanceBreathing(started, 60_000)
    expect(caughtUp.state.cycle).toBe(4)
    expect(caughtUp.state.phase).toBe('inhale')
    expect(caughtUp.cue).toBe('inhale')

    const finished = advanceBreathing(started, 200_000)
    expect(finished.state.status).toBe('finished')
    expect(finished.state.cycle).toBe(8)
    expect(finished.cue).toBe('end')
  })

  it('derives total session duration from the cycle count', () => {
    expect(totalDurationMs(8)).toBe(152_000)
    expect(totalDurationMs(12)).toBe(228_000)
    expect(totalDurationMs(16)).toBe(304_000)
  })
})
