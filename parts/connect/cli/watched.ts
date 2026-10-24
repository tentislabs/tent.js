import { isStored } from '../../core/internal.ts'
import type { Reach } from '../env.ts'
import { asked } from './asked.ts'

/**
 * A list after a `rows` message, as a page applies one: the rows it removes and the rows it puts, each after the
 * row it names, or first. Nothing where the list does not hold what the message builds on.
 */
function rowsPut(held: unknown, message: Record<string, unknown>): { value: unknown } | undefined {
  const paged = isStored(held) && Array.isArray(held.rows)
  const list: unknown = paged ? held.rows : held
  if (!Array.isArray(list) || !Array.isArray(message.put) || !Array.isArray(message.removed)) return undefined
  const idOf = (row: unknown): unknown => (isStored(row) ? row.id : undefined)
  const put = message.put.filter(isStored)
  const gone = new Set<unknown>([...message.removed, ...put.map((one) => idOf(one.row))])
  const rows: unknown[] = list.filter((row) => !gone.has(idOf(row)))
  for (const one of put) {
    let at = 0
    if (one.after !== undefined) {
      at = rows.findIndex((row) => idOf(row) === one.after) + 1
      if (at === 0) return undefined
    }
    rows.splice(at, 0, one.row)
  }
  if (!paged) return { value: rows }
  return { value: { rows, ...(message.next === undefined ? {} : { next: message.next }) } }
}

/** The version that runs now, as the list of commands names it, or the one that was named where it is still the one. */
async function runningVersion(reach: Reach, version: string): Promise<string> {
  const listed = await asked(reach, `/_t/cli?have=${encodeURIComponent(version)}`)
  const named: unknown = listed.ok && isStored(listed.value) ? listed.value.version : undefined
  return typeof named === 'string' ? named : version
}

/**
 * Watches a live query over the live connection that the reach opens, under the version of the list of commands:
 * `on` is handed its first answer and each answer after a write, a `rows` message applied to the list it holds, as
 * a page applies one. On `reload` it asks for the commands again and watches again under the version that runs.
 * A connection that cannot be opened leaves the watch with no answer. Answers what stops it.
 */
export function watched(
  reach: Reach,
  first: string,
  query: string,
  input: unknown,
  on: (value: unknown) => void,
): () => void {
  let stopped = false
  let version = first
  let line: Awaited<ReturnType<Reach['live']>> | undefined
  let held: { value: unknown; mark?: string } | undefined
  const id = 'w1'
  const watch = (marked: boolean): object => ({
    t: 'watch',
    id,
    query,
    input,
    version,
    ...(marked && held?.mark !== undefined ? { have: held.mark } : {}),
  })
  const opening = reach.live(new Request('http://localhost/_t/live')).then((opened) => {
    line = opened
    if (stopped) return opened.close()
    opened.each((message) => {
      if (stopped || !isStored(message)) return
      if (message.t === 'alive') return opened.send({ t: 'alive' })
      if (message.t === 'reload') {
        // An answer of the old version is no base for the new one: the watch is asked whole again.
        held = undefined
        void runningVersion(reach, version)
          .catch(() => version)
          .then((now) => {
            version = now
            if (!stopped) opened.send(watch(false))
          })
        return
      }
      if (message.id !== id) return
      if (message.t === 'result') {
        held = { value: message.value, ...(typeof message.mark === 'string' ? { mark: message.mark } : {}) }
        return on(held.value)
      }
      if (message.t === 'rows') {
        const put = held !== undefined && held.mark === message.was ? rowsPut(held.value, message) : undefined
        // A list that holds another answer than the message builds on is watched again, and answered whole.
        if (!put || typeof message.mark !== 'string') return opened.send(watch(false))
        held = { value: put.value, mark: message.mark }
        return on(held.value)
      }
    })
    opened.send(watch(true))
  })
  // The engine that cannot be reached is no failure of the command: its watch is told nothing.
  opening.catch(() => undefined)
  return () => {
    stopped = true
    line?.send({ t: 'unwatch', id })
    line?.close()
  }
}
