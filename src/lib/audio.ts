export type AudioSessionType = 'ambient' | 'playback'

export type BeepKind = 'count' | 'transition' | 'end'

export type BreathCue = 'inhale' | 'hold' | 'exhale' | 'end'

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string }
}

let context: AudioContext | null = null
let master: GainNode | null = null
let muted = false

const activeSources = new Set<AudioScheduledSourceNode>()

function getContext(): AudioContext {
  if (!context) {
    context = new AudioContext({ latencyHint: 'interactive' })
    master = context.createGain()
    master.gain.value = muted ? 0 : 0.7
    master.connect(context.destination)
  }
  return context
}

function getMaster(): GainNode {
  getContext()
  return master as GainNode
}

export function setMuted(value: boolean): void {
  muted = value
  if (master && context) {
    master.gain.setTargetAtTime(value ? 0 : 0.7, context.currentTime, 0.01)
  }
}

/** iOS Safari 16.4+: set the audio session so cues survive the silent switch. */
export function configureAudioSession(type: AudioSessionType): void {
  const nav = navigator as AudioSessionNavigator
  if (!nav.audioSession) return
  try {
    nav.audioSession.type = type
  } catch {
    /* WebKit can reject while another session owns the route — ignore. */
  }
}

/**
 * Must be called from a user gesture (Start / Resume) before any sound.
 * Creates and resumes the AudioContext and applies the requested session type.
 */
export async function unlockAudio(type: AudioSessionType): Promise<void> {
  configureAudioSession(type)
  const ctx = getContext()
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      /* the next gesture will retry */
    }
  }
}

function track(source: AudioScheduledSourceNode): void {
  activeSources.add(source)
  source.addEventListener('ended', () => activeSources.delete(source))
}

export function stopAll(): void {
  for (const source of activeSources) {
    try {
      source.stop()
    } catch {
      /* already stopped */
    }
  }
  activeSources.clear()
}

function beepAt(at: number, frequency: number, duration: number, peak: number): void {
  const ctx = getContext()
  const out = getMaster()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + duration + 0.02)
  track(osc)
}

export function playBeep(kind: BeepKind): void {
  if (muted) return
  const ctx = getContext()
  const at = ctx.currentTime + 0.01

  if (kind === 'end') {
    beepAt(at, 880, 0.11, 0.16)
    beepAt(at + 0.16, 880, 0.11, 0.16)
    beepAt(at + 0.32, 880, 0.14, 0.18)
    return
  }

  if (kind === 'count') {
    beepAt(at, 880, 0.07, 0.14)
    return
  }

  beepAt(at, 660, 0.12, 0.16)
}

function playBowl(root: number, duration: number): void {
  if (muted) return
  const ctx = getContext()
  const out = getMaster()
  const at = ctx.currentTime + 0.01

  const partials = [
    { ratio: 1, gain: 0.4, detune: 0 },
    { ratio: 2.76, gain: 0.18, detune: 3 },
    { ratio: 5.4, gain: 0.08, detune: -4 },
    { ratio: 8.93, gain: 0.04, detune: 6 },
  ]

  for (const partial of partials) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(root * partial.ratio, at)
    osc.detune.setValueAtTime(partial.detune, at)

    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(partial.gain, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + duration + 0.05)
    track(osc)
  }
}

function createWaveBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0

  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = Math.max(-1, Math.min(1, last * 3.5))
  }

  return buffer
}

function playWave(duration: number): void {
  if (muted) return
  const ctx = getContext()
  const out = getMaster()
  const at = ctx.currentTime + 0.01

  const source = ctx.createBufferSource()
  source.buffer = createWaveBuffer(ctx)
  source.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(650, at)
  filter.frequency.linearRampToValueAtTime(1200, at + duration * 0.5)
  filter.frequency.linearRampToValueAtTime(500, at + duration)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(0.22, at + Math.min(1.1, duration * 0.25))
  gain.gain.linearRampToValueAtTime(0.18, at + duration * 0.7)
  gain.gain.linearRampToValueAtTime(0.0001, at + duration)

  source.connect(filter).connect(gain).connect(out)
  source.start(at)
  source.stop(at + duration + 0.05)
  track(source)
}

export function playBreathCue(cue: BreathCue): void {
  if (muted) return
  switch (cue) {
    case 'inhale':
      playBowl(528, 4.4)
      break
    case 'hold':
      playWave(7)
      break
    case 'exhale':
      playBowl(396, 4.4)
      break
    case 'end':
      playBowl(330, 5.5)
      break
  }
}
