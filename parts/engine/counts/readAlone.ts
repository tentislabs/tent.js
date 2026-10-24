// How the counts are read: as the system alone, straight from the store, also of an app that sleeps.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Plan } from '../../core/internal.ts'
import { countsLayout } from '../../core/internal.ts'
import type { Store } from '../../data/index.ts'
import { sqliteStore } from '../../data/index.ts'
import { isPlan } from '../../core/internal.ts'

/** Throws T0013 where a caller that is not the system reads the counts, which are read as the system alone. */
export function countsCallerHeld(caller: Caller): void {
  if (caller.kind !== 'system')
    throw new TentError('T0013', 'The counts are read as the system alone.', {
      fix: "Read them with `{ as: 'system' }`.",
    })
}

/** The plan of the counts that a read is handed, as a table gives it or as its record, and nothing for another. */
export function countsPlan(plan: unknown): Plan | undefined {
  const held: unknown = Reflect.get(Object(plan), 'plan')
  const record = isPlan(held) ? held : isPlan(plan) ? plan : undefined
  return record?.from === countsLayout.name ? record : undefined
}

/**
 * Takes the data folder of an app that sleeps, the store its makers give where they give one, and a plan of the
 * counts. Answers its rows, read from the store opened to read alone for the length of the call, as the facts of
 * an app that no engine runs are read: what was counted before the app fell asleep is written. A folder with no
 * data holds no count.
 */
export function countsReadAlone(dataFolder: string, made: Store | undefined, plan: Plan): unknown {
  if (!made && !existsSync(join(dataFolder, 'data.db'))) return []
  const store = made ?? sqliteStore()
  store.open(dataFolder, { readOnly: true })
  try {
    return store.read(plan, { kind: 'system' }).value
  } finally {
    store.close()
  }
}
