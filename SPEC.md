# Tempo — build spec

Personal-use PWA for iPhone Safari (primary) and Android Chrome (secondary).
Two modes: **Intervals** and **Breathing**. English UI. Dark-first. No backend.

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- `vite-plugin-pwa` (manifest, service worker, offline)
- Vitest for pure timer logic
- `localStorage` for last-used settings
- Deploy target: Vercel (HTTPS required for PWA + Wake Lock)

## Intervals

- Built-in presets only:
  - `40-20`: 40s work / 20s rest
  - `45-15`: 45s work / 15s rest
- Every round is exactly 60 seconds.
- Rounds 1–30, default 8.
- 3s "Get ready" before round 1.
- Sequence: getReady → work(1) → rest(1) → work(2) → … → work(N) → finished.
  No rest after the final work phase.
- Display: huge countdown, phase, round X of N, total elapsed, next-phase hint.
- Colors: work amber, rest teal.
- Controls: start, pause/resume, skip phase, stop/reset.
- Audio cues:
  - 3-2-1 beeps during the last 3 seconds of getReady and each rest (into work).
  - Distinct transition beep on work→rest and rest→work.
  - Triple beep when finished.
- Wake Lock keeps the screen on during an active session; re-acquire on visibility.
- If the phone locks anyway, the state catches up by timestamp; cues in the gap are lost.
- Audio session: `playback` by default (audible on silent switch). If the
  "Mix with music" setting is on, use `ambient` for intervals (mixes with music,
  respects the silent switch).

## Breathing

- 4-7-8: inhale 4s → hold 7s → exhale 8s = 19s per cycle.
- Cycles 8 / 12 / 16, default 8.
- Sounds at phase starts:
  - inhale: higher singing-bowl strike (528 Hz additive synthesis)
  - hold: 7s ocean-wave swell (filtered brown noise)
  - exhale: lower singing-bowl strike (396 Hz)
  - end: closing bowl
- Audio session: `playback` (must work with the silent switch on).
- Visual: expanding circle (4s) → hold (7s) → contracting circle (8s),
  soft blue/violet on near-black; cycle counter and phase countdown.
  Respect `prefers-reduced-motion`.
- Screen stays on (black background). Screen-off is not supported in v1.
- Controls: start, pause/resume, stop.

## Persistence

`localStorage` key `tempo:settings:v1`:

- `lastMode`
- `intervalPresetId`
- `rounds`
- `breathingCycles`
- `muted`
- `mixWithMusic`

No accounts, cloud, history, stats, custom presets, notifications, haptics,
plain stopwatch, Play Store, or analytics.

## Design

- Near-black background (`#0A0A0B`), dark surfaces.
- Huge tabular numerals; controls at the bottom; portrait.
- Work amber, rest teal, breathing soft blue/violet.
- System font stack. No gradients, no logo on the timer screens.

## Definition of done

1. Installs to the iPhone home screen, opens standalone, works offline after first load.
2. Interval run matches timings exactly, with correct beeps and no final rest.
3. Pause/resume/skip work; Wake Lock holds; reload restores last settings.
4. Breathing run plays the three distinct cues, works on silent, pauses/stops cleanly.
5. Android Chrome parity for install, sound, and Wake Lock.
6. Unit tests cover phase transitions, presets, skip-last-rest, and cycle counting.
7. Deployed Vercel URL + README with install/use instructions.

## Known limitations

- iOS Safari suspends JavaScript when the screen locks; v1 keeps the screen on.
- True background audio / lock-screen operation is native-app territory (Capacitor later).
- iOS Safari has no Vibration API; no haptics.
- Sound cues are synthesized with Web Audio (no external assets to license).
