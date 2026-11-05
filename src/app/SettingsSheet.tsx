import { useEffect } from 'react'
import type { Settings } from '../types'

interface SettingsSheetProps {
  open: boolean
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-5 border-b border-border py-4 text-left last:border-b-0"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={[
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-work' : 'bg-surface-2',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

export function SettingsSheet({ open, settings, onChange, onClose }: SettingsSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="sheet safe-bottom w-full max-w-[480px] rounded-t-3xl border-t border-border bg-surface px-6 pt-5 md:rounded-3xl md:border md:shadow-2xl md:shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="settings-title" className="text-base font-semibold text-text">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            Done
          </button>
        </div>

        <div className="mt-2">
          <ToggleRow
            label="Mute sounds"
            description="Silences interval beeps and breathing cues."
            checked={settings.muted}
            onChange={(muted) => onChange({ muted })}
          />
          <ToggleRow
            label="Mix with music"
            description="Intervals only. Beeps mix with music but respect the silent switch. Breathing always plays through the silent switch."
            checked={settings.mixWithMusic}
            onChange={(mixWithMusic) => onChange({ mixWithMusic })}
          />
        </div>

        <div className="mt-4 border-t border-border pt-4 pb-2">
          <p className="text-xs leading-relaxed text-muted">
            Tempo v0.1.0 · local-only, no accounts. The screen stays on during a session;
            iOS pauses web timers if the screen locks, so keep the app visible.
          </p>
        </div>
      </div>
    </div>
  )
}
