# Tempo

Tempo is a personal-use progressive web app (PWA) for interval training and
4-7-8 breathing. It runs entirely in the browser — no backend, accounts, or
analytics.

## Modes

- **Intervals** — 40/20 and 45/15 work/rest presets, 1–30 rounds (default 8).
  Every round is 60 seconds, and a 3-second "Get ready" precedes the first
  work phase. Cues mark the last three seconds of Get ready and each rest,
  phase transitions, and the finish.
- **Breathing** — 4-7-8 (inhale 4s, hold 7s, exhale 8s) for 8, 12, or 16
  cycles (default 8), with distinct singing-bowl and ocean-wave cues.

Both modes keep the screen awake during a session and remember the last-used
settings in `localStorage` under `tempo:settings:v1`.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, `vite-plugin-pwa` (manifest,
service worker, offline support), Vitest, and `localStorage`. Audio cues are
synthesized with the Web Audio API. There is no backend, no accounts, and no
analytics.

## Development

Requires Node 22+.

```bash
npm install        # install dependencies
npm run dev        # start the Vite dev server
npm test           # run the Vitest suite once
npm run typecheck  # type-check the project
npm run build      # production build to dist/
npm run preview    # preview the production build
npm run icons      # regenerate PWA icons and public/favicon.svg
```

The icon script uses `sharp` and writes the PNGs in `public/icons/` plus
`public/favicon.svg`. The PNGs are generated assets and are not committed:
`npm run build` runs the script automatically via the `prebuild` hook.

## Install on a phone

- **iPhone (Safari):** open the deployed URL, tap **Share**, then **Add to Home
  Screen**.
- **Android (Chrome):** open the deployed URL, open the browser menu, then
  choose **Install app** or **Add to Home screen**.

Launch Tempo from the home screen to open it standalone. Installation and
offline use require HTTPS.

## Deploy to Vercel

Import the repository into Vercel and use the Vite framework preset with build
command `npm run build` and output directory `dist`; Vercel auto-detects these.
Alternatively, deploy with the Vercel CLI. HTTPS is required for the PWA
service worker, installation, and the Screen Wake Lock API.

## Architecture

- `src/features/intervals` — interval timer state and screen.
- `src/features/breathing` — 4-7-8 breathing state and screen.
- `src/lib` — Web Audio synthesis, localStorage settings, Wake Lock, and time
  helpers.
- `src/app` — app shell, mode switching, and settings sheet.
- `src/components` — shared UI components and icons.

## Audio

All cues are generated at runtime with the Web Audio API: additive singing
bowls, a filtered-noise ocean wave, and sine beeps. No external audio assets
are used, so there is no sample licensing to manage.

## Known limitations

- The screen must stay on during a session.
- iOS Safari suspends JavaScript when the screen locks, so cues can be missed
  if the phone locks anyway.
- There are no haptics on iOS web (Safari has no Vibration API).
- There is no true background audio or lock-screen operation.
- v1 is a PWA, not a Play Store app.
