import type { BreathingCycles, IntervalPresetId, Mode, Settings } from '../types'
import { clamp } from './time'

export const STORAGE_KEY = 'tempo:settings:v1'

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  lastMode: 'intervals',
  intervalPresetId: '45-15',
  rounds: 8,
  breathingCycles: 8,
  muted: false,
  mixWithMusic: false,
}

const PRESET_IDS: readonly IntervalPresetId[] = ['40-20', '45-15']
const CYCLE_OPTIONS: readonly BreathingCycles[] = [8, 12, 16]
const MODES: readonly Mode[] = ['intervals', 'breathing']

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function normalizeSettings(value: unknown): Settings {
  const raw = asRecord(value)
  if (!raw) return { ...DEFAULT_SETTINGS }

  const presetId = PRESET_IDS.includes(raw.intervalPresetId as IntervalPresetId)
    ? (raw.intervalPresetId as IntervalPresetId)
    : DEFAULT_SETTINGS.intervalPresetId

  const rounds =
    typeof raw.rounds === 'number' && Number.isFinite(raw.rounds)
      ? clamp(Math.round(raw.rounds), 1, 30)
      : DEFAULT_SETTINGS.rounds

  const breathingCycles = CYCLE_OPTIONS.includes(raw.breathingCycles as BreathingCycles)
    ? (raw.breathingCycles as BreathingCycles)
    : DEFAULT_SETTINGS.breathingCycles

  const lastMode = MODES.includes(raw.lastMode as Mode)
    ? (raw.lastMode as Mode)
    : DEFAULT_SETTINGS.lastMode

  return {
    version: 1,
    lastMode,
    intervalPresetId: presetId,
    rounds,
    breathingCycles,
    muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_SETTINGS.muted,
    mixWithMusic:
      typeof raw.mixWithMusic === 'boolean' ? raw.mixWithMusic : DEFAULT_SETTINGS.mixWithMusic,
  }
}

type ReadableStorage = Pick<Storage, 'getItem'>

export function loadSettings(storage?: ReadableStorage): Settings {
  try {
    const target = storage ?? window.localStorage
    const raw = target.getItem(STORAGE_KEY)
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

type WritableStorage = Pick<Storage, 'setItem'>

export function saveSettings(settings: Settings, storage?: WritableStorage): void {
  try {
    const target = storage ?? window.localStorage
    target.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* private mode / quota — settings simply won't persist */
  }
}
