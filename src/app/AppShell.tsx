import type { ReactNode } from 'react'
import { SettingsIcon } from '../components/Icons'
import type { Mode } from '../types'

interface AppShellProps {
  mode: Mode
  onModeChange: (mode: Mode) => void
  locked: boolean
  onOpenSettings: () => void
  children: ReactNode
}

const MODES: readonly { id: Mode; label: string }[] = [
  { id: 'intervals', label: 'Intervals' },
  { id: 'breathing', label: 'Breathing' },
]

export function AppShell({
  mode,
  onModeChange,
  locked,
  onOpenSettings,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh justify-center bg-shell">
      <div className="flex h-dvh w-full max-w-[480px] flex-col bg-bg text-text md:my-6 md:h-[calc(100dvh-3rem)] md:rounded-[2rem] md:border md:border-border md:shadow-2xl md:shadow-black/50">
        <header className="safe-top flex items-center justify-between px-5 pb-2">
          <span className="text-xs font-semibold tracking-[0.28em] text-muted uppercase">
            Tempo
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:text-text active:bg-surface"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </header>

        <nav
          aria-label="Timer mode"
          className="mx-5 mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-1"
        >
          {MODES.map((item) => {
            const selected = item.id === mode
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                disabled={locked && !selected}
                onClick={() => onModeChange(item.id)}
                className={[
                  'rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  selected ? 'bg-surface-2 text-text shadow-sm' : 'text-muted hover:text-text',
                  locked && !selected ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
