import { describe, expect, it } from 'vitest'
import { clamp, formatClock, formatElapsed, secToMs } from './time'

describe('formatClock', () => {
  it('rounds up so a partial second still shows', () => {
    expect(formatClock(44_200)).toBe('0:45')
  })

  it('formats whole minutes and zero', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(60_000)).toBe('1:00')
    expect(formatClock(152_000)).toBe('2:32')
  })

  it('never goes negative', () => {
    expect(formatClock(-5_000)).toBe('0:00')
  })
})

describe('formatElapsed', () => {
  it('rounds to the nearest second', () => {
    expect(formatElapsed(44_400)).toBe('0:44')
    expect(formatElapsed(44_600)).toBe('0:45')
  })
})

describe('clamp', () => {
  it('clamps both ends', () => {
    expect(clamp(0, 1, 30)).toBe(1)
    expect(clamp(31, 1, 30)).toBe(30)
    expect(clamp(8, 1, 30)).toBe(8)
  })
})

describe('secToMs', () => {
  it('converts seconds to milliseconds and rejects negatives', () => {
    expect(secToMs(45)).toBe(45_000)
    expect(secToMs(-1)).toBe(0)
  })
})
