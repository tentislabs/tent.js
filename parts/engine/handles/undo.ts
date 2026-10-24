import { TentError } from '../../core/index.ts'
import type { By } from '../../data/index.ts'
import { callOf } from '../handleCall.ts'
import type { Opened } from '../opened.ts'
import { undoneOfRun } from '../undo/ofRun.ts'
import type { Undone } from '../undo/undone.ts'
import { undoneBy } from '../undo/undone.ts'
import { isStored } from '../../core/internal.ts'

/** The id that a member is handed. Throws T0002 for anything else. */
function idOf(id: unknown, what: string): string {
  if (typeof id === 'string' && id !== '') return id
  throw new TentError('T0002', `\`undo\` is handed the id of ${what}.`, { fields: { id: 'type' } })
}

/** The moment that `since` names. Throws T0002 for one that is none. */
function sinceOf(how: unknown): number {
  const since: unknown = Reflect.get(Object(how), 'since')
  const at = since instanceof Date ? since.getTime() : typeof since === 'string' ? Date.parse(since) : Number.NaN
  if (Number.isFinite(at)) return at
  throw new TentError('T0002', '`since` is the moment from which what was written is taken back.', {
    fields: { since: 'type' },
  })
}

/**
 * The working object behind the handle `undo`, for code with full access. `run` takes back what one run wrote, and
 * with `started` the runs it started; `grant` what a program wrote with a grant since a moment, and `key` what a
 * key wrote. Each answers `{ undone, clashes, outside }`, and with `dry` the same with nothing changed.
 */
export const handle = (o: Opened): object => {
  const calling = (used: string) =>
    callOf(`\`undo.${used}\``, { waits: true, acts: true, full: 'takes back what another wrote' })
  const undone = (used: string, how: unknown, matches: (by: By) => boolean, from: number) =>
    undoneBy(o, calling(used), { matches, from, dry: isStored(how) && how.dry === true })
  return {
    async run(id: unknown, how?: unknown): Promise<Undone> {
      const run = idOf(id, 'a run')
      const given = isStored(how) ? how : {}
      return undoneOfRun(o, calling('run'), run, { started: given.started === true, dry: given.dry === true })
    },
    async grant(id: unknown, how?: unknown): Promise<Undone> {
      const grant = idOf(id, 'a grant')
      return undone('grant', how, (by) => by.caller === `grant:${grant}`, sinceOf(how))
    },
    async key(id: unknown, how?: unknown): Promise<Undone> {
      const key = idOf(id, 'a key')
      return undone('key', how, (by) => by.caller === `key:${key}`, sinceOf(how))
    },
  }
}
