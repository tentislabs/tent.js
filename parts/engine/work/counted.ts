import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { servicesOf } from '../services/env.ts'
import { table } from '../tables/workPlaces.ts'

const system = { kind: 'system' } as const

// The places under the limits of a service that a `may` of a worker took, by the task and the id of the `may`.
const places = new WeakMap<object, Map<string, () => void>>()

const placesOf = (o: Opened): Map<string, () => void> => {
  let made = places.get(o.handles)
  if (!made) {
    made = new Map()
    places.set(o.handles, made)
  }
  return made
}

// What ends the wait of each `may` that waits for its turn, by the task and the id of the `may`.
const waits = new WeakMap<object, Map<string, AbortController>>()

const waitsOf = (o: Opened): Map<string, AbortController> => {
  let made = waits.get(o.handles)
  if (!made) {
    made = new Map()
    waits.set(o.handles, made)
  }
  return made
}

/** Takes the rows of places away from the store, by their task and the id of their `may`. */
function forget(o: Opened, keys: { task: string; may: string }[]): void {
  if (!keys.length) return
  o.store.write((tx) => {
    for (const key of keys) tx.remove(table.name, key, system)
  })
}

/**
 * The `may` of a worker: an outside call that it is about to make itself. It is counted against the limits of
 * the service here, by the writer, so that many workers do not pass them many times, and answered once the call
 * may start; the place it took is kept in the store until its `did`, or the end of its try. Throws T0002 for a
 * service that the version does not hold, and T5108 where the try is lost while the `may` waits.
 */
export async function mayCall(o: Opened, task: string, message: Record<string, unknown>): Promise<null> {
  const service = String(message.service)
  if (!Object.hasOwn(o.description.services, service))
    throw new TentError('T0002', `A worker asks to call ${service.slice(0, 60)}, which is no service of the app.`)
  const services = await servicesOf(o)
  const may = String(message.may)
  const key = `${task} ${may}`
  // The wait ends with the try: a try that is lost while its `may` waits takes no place.
  const ends = new AbortController()
  waitsOf(o).set(key, ends)
  try {
    const free = await services.turn(service, o.version, ends.signal)
    o.store.write((tx) =>
      tx.add(table.name, { task, may, service, version: o.version, at: new Date(o.clock.now()) }, system),
    )
    placesOf(o).set(key, free)
  } finally {
    waitsOf(o).delete(key)
  }
  return null
}

/** The `did` of a worker: its call ended. The place it took is freed, and the row of `outgoing` is written. */
export function didCall(o: Opened, task: string, run: string, message: Record<string, unknown>): null {
  const may = String(message.may)
  const key = `${task} ${may}`
  placesOf(o).get(key)?.()
  placesOf(o).delete(key)
  forget(o, [{ task, may }])
  o.log.write('outgoing', {
    at: o.clock.now(),
    service: String(message.service),
    call: String(message.call),
    ...(typeof message.status === 'number' ? { status: message.status } : {}),
    ms: typeof message.ms === 'number' ? message.ms : 0,
    run,
  })
  return null
}

/** Frees every place that the `may` of a task took, and ends each that waits: its try ended, or was lost, with no `did`. */
export function freePlaces(o: Opened, task: string): void {
  for (const [key, ends] of waitsOf(o))
    if (key.startsWith(`${task} `))
      ends.abort(new TentError('T5108', `The task ${task.slice(0, 40)} is not out any more.`))
  const held = placesOf(o)
  const freed: { task: string; may: string }[] = []
  for (const [key, free] of held)
    if (key.startsWith(`${task} `)) {
      free()
      held.delete(key)
      freed.push({ task, may: key.slice(task.length + 1) })
    }
  forget(o, freed)
}

/**
 * Takes the places again that the store keeps from before the writer opened: each of a task that the rows say is
 * out stays taken until its `did` or the end of its try; one of any other task is let go.
 */
export async function placesAgain(o: Opened, out: Set<string>): Promise<void> {
  const services = await servicesOf(o)
  const kept = (): Record<string, unknown>[] => {
    const read = o.store.read({ from: table.name }, system).value
    return Array.isArray(read) ? read.map((row) => Object(row)) : []
  }
  const rows = kept()
  forget(
    o,
    rows.filter((row) => !out.has(String(row.task))).map((row) => ({ task: String(row.task), may: String(row.may) })),
  )
  for (const row of rows.filter((one) => out.has(String(one.task)))) {
    const [task, may] = [String(row.task), String(row.may)]
    try {
      const free = await services.turn(String(row.service), String(row.version), new AbortController().signal)
      // A `did` or the end of the try that came while the place was taken again leaves it free.
      if (kept().some((one) => one.task === task && one.may === may)) placesOf(o).set(`${task} ${may}`, free)
      else free()
    } catch {
      // A service or a version that is gone holds no place.
      forget(o, [{ task, may }])
    }
  }
}
