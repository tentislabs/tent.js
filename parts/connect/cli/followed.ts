import type { RunPart } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { Reach } from '../env.ts'
import { Unrunnable } from './flags.ts'

/** The kinds of a part that end a run. */
const ends = ['done', 'failed', 'stopped']

// The engine sends a sign of life every 30 seconds: as a page does, a connection that was silent for 45 is lost.
const lostAfter = 45_000

/**
 * Follows a run over the live connection that the reach opens, as a page does. Answers its parts in their order:
 * first where the run stands, as `{ kind: 'run', ... }`, then each part as the engine sends it, up to its end.
 * A run the caller may not follow is refused with the error the engine sends, T0001. A connection on which nothing
 * at all arrived for 45 seconds is lost, and throws `Unrunnable`.
 */
export async function* followed(reach: Reach, run: string): AsyncIterable<RunPart> {
  const line = await reach.live(new Request('http://localhost/_t/live'))
  const waiting: Record<string, unknown>[] = []
  let wake = (): void => undefined
  line.each((message) => {
    if (!isStored(message)) return
    if (message.t === 'alive') {
      line.send({ t: 'alive' })
      return wake()
    }
    if (message.id !== 'r1') return
    waiting.push(message)
    wake()
  })
  line.send({ t: 'run-watch', id: 'r1', run })
  try {
    for (;;) {
      if (!waiting.length) {
        await new Promise<void>((done, lost) => {
          const timer = setTimeout(() => lost(new Unrunnable('The live connection to the app was lost.')), lostAfter)
          wake = () => {
            clearTimeout(timer)
            done()
          }
        })
        continue
      }
      const message = waiting.shift() ?? {}
      const { t, id: _, ...rest } = message
      if (t === 'failed') {
        const error = isStored(message.error) ? message.error : {}
        throw new TentError(String(error.code ?? 'T0001'), String(error.message ?? 'The run cannot be followed.'))
      }
      yield t === 'run' ? { kind: 'run', ...rest } : rest
      if (t === 'run-part' && ends.includes(String(message.kind))) return
      // A run that had ended when it was followed ends here too, with the part that tells its end.
      if (t === 'run' && ends.includes(String(message.state))) {
        const text: unknown = Reflect.get(Object(message.text), 'text')
        if (message.state === 'done')
          yield { kind: 'done', ...(typeof text === 'string' ? { text } : {}), used: message.used ?? {} }
        else yield { kind: String(message.state), ...(isStored(message.error) ? { error: message.error } : {}) }
        return
      }
    }
  } finally {
    line.send({ t: 'unwatch', id: 'r1' })
    line.close()
  }
}
