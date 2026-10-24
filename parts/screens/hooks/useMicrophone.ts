import { useEffect, useRef, useState } from '../borrowed/react.ts'
import { named } from '../page/based.ts'
import { useStore } from '../page/context.ts'
import { uploaded } from '../page/upload.ts'
import type { Recorded } from '../page/mic/mic.ts'
import { usePart } from '../page/parts.ts'

/** What `useMicrophone` gives: what starts and ends a recording, where it stands, how loud it is and how long. */
export interface Microphone {
  start(): Promise<void>
  // Ends the recording and uploads it: answers its file id, or nothing where nothing was recorded.
  stop(): Promise<string | undefined>
  cancel(): void
  state: 'idle' | 'asking' | 'recording' | 'denied'
  // How loud the sound is now, from 0 to 1.
  level: number
  seconds: number
}

/**
 * Answers the microphone of the page: `start` asks the browser for it and records, `stop` ends the recording and
 * uploads it like any file, answering its id, and `cancel` ends it with nothing kept. A browser that refuses the
 * microphone leaves it `denied`. The recording is done by the part `mic`, which the page loads where a screen uses
 * the hook. On the server it is idle.
 */
export function useMicrophone(): Microphone {
  const store = useStore()
  const part = usePart('mic')
  const [state, setState] = useState<Microphone['state']>('idle')
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const held = useRef<Recorded | undefined>(undefined)
  // While the browser is asked for the microphone: a second start begins nothing, and a recording that the view no
  // longer wants once it is given, as after a cancel or once the view left, is ended at once.
  const asking = useRef(false)
  const wanted = useRef(0)
  const shown = useRef(true)
  useEffect(() => {
    shown.current = true
    return () => {
      shown.current = false
      wanted.current += 1
      held.current?.cancel()
      held.current = undefined
    }
  }, [])

  return {
    state,
    level,
    seconds,
    async start() {
      if (held.current || asking.current || !part) return
      asking.current = true
      const mine = ++wanted.current
      setState('asking')
      const recording = await part.record({ level: setLevel, seconds: setSeconds }).finally(() => {
        asking.current = false
      })
      if (mine !== wanted.current || !shown.current) {
        recording?.cancel()
        return
      }
      if (!recording) {
        setState('denied')
        return
      }
      held.current = recording
      setState('recording')
    },
    async stop() {
      const now = held.current
      held.current = undefined
      if (!now) return undefined
      const sound = await now.stop()
      setState('idle')
      if (!sound) return undefined
      const answer = await uploaded(named(store.page, '/_t/files?name=recording'), sound, () => undefined)
      return 'id' in answer ? answer.id : undefined
    },
    cancel() {
      wanted.current += 1
      held.current?.cancel()
      held.current = undefined
      setState('idle')
    },
  }
}
