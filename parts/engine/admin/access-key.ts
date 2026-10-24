import type { Admin } from '../admin.ts'
import { badWord, wordOf } from '../admin.ts'
import { addKey, keysOf, removeKey } from '../keys/kept.ts'
import { madeKey, shownOf } from '../keys/made.ts'
import { rightsGiven } from '../keys/rights.ts'

/** A list of names as the command line writes it: words with commas between. */
const listOf = (written: unknown): string[] | undefined =>
  typeof written === 'string'
    ? written
        .split(',')
        .map((one) => one.trim())
        .filter(Boolean)
    : undefined

/**
 * `tent access key add <name>`, `list` and `remove <id>`: the keys of programs, as the handle `keys` makes them,
 * with full access. `add` answers the key once, with its id; `list` answers every key without it. On a reader the
 * write is the writer's. Throws T0002 for a field that does not fit, and T2103 for a user of no row.
 */
export const admin: Admin = {
  name: 'access-key',
  async run(o, args) {
    const act = wordOf(args, 'do', '`add`, `list` or `remove`')
    const given: Record<string, unknown> = Object(args)
    if (act === 'list') return keysOf(o).map(shownOf)
    if (act === 'remove') {
      const id = wordOf(args, 'name', 'the id of a key')
      o.store.write((tx) => removeKey(tx, id))
      return { removed: id }
    }
    if (act !== 'add') throw badWord('do', '`add`, `list` or `remove`')
    const scopes = listOf(given.scopes)
    const roles = listOf(given.roles)
    const rights = listOf(given.right)
    const kinds = listOf(given.kinds)
    // What a key of the right `work` is bound to, as `--kinds`, `--at-once` and `--workers` state it.
    const work = {
      ...(kinds ? { kinds } : {}),
      ...(given.atOnce === undefined ? {} : { atOnce: given.atOnce }),
      ...(given.workers === undefined ? {} : { workers: given.workers }),
    }
    const made = madeKey(o, {
      ...(Object.keys(work).length ? { work } : {}),
      ...(rights ? { rights: rightsGiven(rights) } : {}),
      name: wordOf(args, 'name', 'the name of a key'),
      ...(scopes ? { scopes } : {}),
      ...(roles ? { roles } : {}),
      ...(typeof given.user === 'string' ? { user: given.user } : {}),
      ...(given.perMinute === undefined ? {} : { perMinute: given.perMinute }),
      ...(typeof given.for === 'string' ? { for: given.for } : {}),
      ...(typeof given.asks === 'string' ? { asks: given.asks } : {}),
    })
    o.store.write((tx) => addKey(tx, made.row, made.fingerprint))
    return { ...shownOf(made.row), key: made.key }
  },
}
