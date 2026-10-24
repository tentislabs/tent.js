import type { Opened } from '../opened.ts'
import { environmentFor } from './call.ts'
import { clearLeft } from './folders.ts'

/**
 * Takes an app that holds a `python`, as it is opened. Removes what a call that was killed left in the folder of
 * the calls, and starts making the environment of each of its locks, without holding the opening up: a first call
 * waits for that making, and one that fails is made again by the next call.
 */
export function ahead(o: Opened): void {
  // A folder that a call under way holds is kept; one that the disk will not let go is left for the next opening.
  for (const refused of clearLeft(o.dataFolder))
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'error',
      message: `A folder that a Python call left could not be removed: ${refused}`,
    })
  const locks = new Map<string, Record<string, unknown>>()
  for (const record of Object.values(o.description.functions))
    if (typeof record.python === 'object' && record.python !== null)
      locks.set(String(Reflect.get(record.python, 'lock') ?? ''), record)
  for (const record of locks.values())
    environmentFor(o, record).catch((error: unknown) =>
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: `The Python environment of the app could not be made ahead: ${error instanceof Error ? error.message : String(error)}`,
      }),
    )
}
