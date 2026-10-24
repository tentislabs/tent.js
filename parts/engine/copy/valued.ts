import type { Opened } from '../opened.ts'
import { readAllAgain } from '../readAgain.ts'
import { valuesHeldFor, readValues, valuesFile } from '../values/files.ts'
import { valuesOf } from '../values/ofApp.ts'
import type { Link } from './link.ts'
import { tell } from './link.ts'

/** The settings of the mode of an app, as its file holds them: what a writer tells its readers. */
const settingsNow = (o: Opened): Record<string, unknown> =>
  readValues(valuesFile(o.dataFolder, 'settings', valuesHeldFor(o.mode)), 'settings')

/** What a writer keeps of the settings that it told its readers: who was told what, and what waits for them. */
export interface ValuesTold {
  /** Tells one reader the settings of the app, as after it joined. */
  tell(reader: string, link: Link): void
  /** Tells every reader the settings anew, and answers once each has said that it uses them, or is gone. */
  all(readers: Iterable<{ id: string; link: Link }>, wait: number): Promise<void>
  /** A reader said that it uses the settings of a telling. */
  valued(reader: string, id: unknown): void
  /** A reader is gone: nothing waits for it any longer. */
  left(reader: string): void
}

/**
 * Takes an app that is the writer of its data. Answers what tells its readers the settings of its mode: the
 * secrets are never sent. A telling is answered by each reader once it uses those settings, and a command that set
 * one is answered after that, or after the wait where a reader is cut off.
 */
export function valuesTold(o: Opened): ValuesTold {
  let next = 0
  // For each reader, the number of the last telling that it has not answered yet.
  const owed = new Map<string, number>()
  const waiting = new Set<() => void>()
  const woken = (): void => {
    for (const done of [...waiting]) done()
  }
  const told = (reader: string, link: Link): void => {
    const id = ++next
    owed.set(reader, id)
    tell(link, { t: 'values', id, settings: settingsNow(o) })
  }
  return {
    tell: told,
    async all(readers, wait) {
      const asked = [...readers]
      for (const one of asked) told(one.id, one.link)
      const ids = new Map(asked.map((one) => [one.id, owed.get(one.id)]))
      const open = (): boolean => [...ids].some(([reader, id]) => owed.get(reader) === id)
      if (!open()) return
      await new Promise<void>((done) => {
        // A reader that is cut off is waited for no longer than a reader may be behind.
        const cancel = o.clock.setTimer(o.clock.now() + wait, () => ended())
        const ended = (): void => {
          waiting.delete(check)
          cancel()
          done()
        }
        const check = (): void => {
          if (!open()) ended()
        }
        waiting.add(check)
      })
    },
    valued(reader, id) {
      if (owed.get(reader) === id) owed.delete(reader)
      woken()
    },
    left(reader) {
      owed.delete(reader)
      woken()
    },
  }
}

/**
 * Takes an app that is a reader, and the settings that its writer told it. Writes them into its settings file of
 * its mode, a setting that the writer holds no longer taken away, and does what a running engine does when it is
 * told of a setting: every live group is run again, and the cache of public screens emptied. A value that does not
 * fit the running version is left out, as a version that is not here yet may state another type.
 */
export function takeValues(o: Opened, settings: unknown): void {
  const given: Record<string, unknown> = Object(settings)
  const mine = valuesOf(o).settings
  for (const one of mine.list()) {
    try {
      if (Object.hasOwn(given, one.name)) mine.set(one.name, given[one.name])
      else if (one.set) mine.remove(one.name)
    } catch {
      // The setting keeps what it had: the writer holds the value, and tells it again with the next telling.
    }
  }
  readAllAgain(o)
}
