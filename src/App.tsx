import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './app/AppShell'
import { SettingsSheet } from './app/SettingsSheet'
import { BreathingScreen } from './features/breathing/BreathingScreen'
import { IntervalsScreen } from './features/intervals/IntervalsScreen'
import { setMuted } from './lib/audio'
import { loadSettings, saveSettings } from './lib/storage'
import type { Mode, Settings } from './types'

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [sessionActive, setSessionActive] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  useEffect(() => {
    setMuted(settings.muted)
  }, [settings.muted])

  const changeMode = useCallback(
    (mode: Mode) => {
      if (sessionActive) return
      updateSettings({ lastMode: mode })
    },
    [sessionActive, updateSettings],
  )

  return (
    <>
      <AppShell
        mode={settings.lastMode}
        onModeChange={changeMode}
        locked={sessionActive}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        {settings.lastMode === 'intervals' ? (
          <IntervalsScreen
            settings={settings}
            onSettingsChange={updateSettings}
            onActiveChange={setSessionActive}
          />
        ) : (
          <BreathingScreen
            settings={settings}
            onSettingsChange={updateSettings}
            onActiveChange={setSessionActive}
          />
        )}
      </AppShell>

      <SettingsSheet
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  )
}
