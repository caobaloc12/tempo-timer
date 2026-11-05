import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from './storage'
import type { Settings } from '../types'

function memoryStorage(initial?: string) {
  let value = initial ?? null
  return {
    getItem: (key: string): string | null => (key === STORAGE_KEY ? value : null),
    setItem: (key: string, next: string): void => {
      if (key === STORAGE_KEY) value = next
    },
    read: (): string | null => value,
  }
}

describe('normalizeSettings', () => {
  it('returns defaults for junk', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values', () => {
    const input: Settings = {
      version: 1,
      lastMode: 'breathing',
      intervalPresetId: '40-20',
      rounds: 12,
      breathingCycles: 16,
      muted: true,
      mixWithMusic: true,
    }
    expect(normalizeSettings(input)).toEqual(input)
  })

  it('repairs invalid values', () => {
    expect(
      normalizeSettings({
        lastMode: 'nope',
        intervalPresetId: 'nope',
        rounds: 999,
        breathingCycles: 7,
        muted: 'yes',
        mixWithMusic: 1,
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      rounds: 30,
    })
  })

  it('clamps rounds to 1..30 and rounds fractions', () => {
    expect(normalizeSettings({ rounds: -4 }).rounds).toBe(1)
    expect(normalizeSettings({ rounds: 8.7 }).rounds).toBe(9)
  })
})

describe('loadSettings / saveSettings', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage()
    const settings: Settings = { ...DEFAULT_SETTINGS, rounds: 10, lastMode: 'breathing' }
    saveSettings(settings, storage)
    expect(loadSettings(storage)).toEqual(settings)
  })

  it('returns defaults for missing or malformed storage', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS)
    expect(loadSettings(memoryStorage('{not json'))).toEqual(DEFAULT_SETTINGS)
  })

  it('survives a storage that throws', () => {
    const throwing = {
      getItem: (): string | null => {
        throw new Error('blocked')
      },
      setItem: (): void => {
        throw new Error('blocked')
      },
    }
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(DEFAULT_SETTINGS, throwing)).not.toThrow()
  })
})
