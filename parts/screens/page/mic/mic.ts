import { holdPart } from '../parts.ts'

/** A recording that has begun: what ends it with its sound, and what ends it with nothing kept. */
export interface Recorded {
  stop(): Promise<Blob | undefined>
  cancel(): void
}

/**
 * Asks the browser for the microphone and records, telling how loud the sound is, from 0 to 1, and how many whole
 * seconds the recording has lasted, ten times a second. Answers the recording, or nothing where the browser refused
 * the microphone or has none. It is a part of its own, so a page that records nothing loads nothing of it.
 */
export async function record(o: {
  level(now: number): void
  seconds(now: number): void
}): Promise<Recorded | undefined> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return undefined
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return undefined
  }
  const recorder = new MediaRecorder(stream)
  const pieces: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size) pieces.push(event.data)
  }
  const began = Date.now()
  let context: AudioContext | undefined
  let read = (): void => undefined
  if (typeof AudioContext !== 'undefined') {
    const opened = new AudioContext()
    context = opened
    const analyser = opened.createAnalyser()
    opened.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    read = () => {
      analyser.getByteTimeDomainData(samples)
      let most = 0
      for (const sample of samples) most = Math.max(most, Math.abs(sample - 128))
      o.level(most / 128)
    }
  }
  const timer = setInterval(() => {
    o.seconds(Math.floor((Date.now() - began) / 1000))
    read()
  }, 100)
  /** Ends what the recording holds: its tracks, its timer and its sound reading. */
  const ended = (): void => {
    clearInterval(timer)
    for (const track of stream.getTracks()) track.stop()
    void context?.close().catch(() => undefined)
    o.level(0)
  }
  o.seconds(0)
  recorder.start()
  return {
    async stop() {
      const done = new Promise<void>((settle) => {
        recorder.onstop = () => settle()
      })
      recorder.stop()
      await done
      ended()
      return pieces.length ? new Blob(pieces, { type: recorder.mimeType || 'audio/webm' }) : undefined
    },
    cancel() {
      if (recorder.state === 'recording') recorder.stop()
      ended()
    },
  }
}

holdPart('mic', { record })
