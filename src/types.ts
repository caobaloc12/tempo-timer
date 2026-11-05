export type Mode = 'intervals' | 'breathing'

export type IntervalPresetId = '40-20' | '45-15'

export type BreathingCycles = 8 | 12 | 16

export interface IntervalPreset {
  id: IntervalPresetId
  workSec: number
  restSec: number
  label: string
  shortLabel: string
}

const PRESET_MAP: Record<IntervalPresetId, IntervalPreset> = {
  '40-20': { id: '40-20', workSec: 40, restSec: 20, label: '40 / 20', shortLabel: '40–20' },
  '45-15': { id: '45-15', workSec: 45, restSec: 15, label: '45 / 15', shortLabel: '45–15' },
}

export const INTERVAL_PRESETS: readonly IntervalPreset[] = [
  PRESET_MAP['40-20'],
  PRESET_MAP['45-15'],
]

export function getPreset(id: IntervalPresetId): IntervalPreset {
  return PRESET_MAP[id]
}

export interface Settings {
  version: 1
  lastMode: Mode
  intervalPresetId: IntervalPresetId
  rounds: number
  breathingCycles: BreathingCycles
  muted: boolean
  mixWithMusic: boolean
}
