import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { readAllAgain } from '../readAgain.ts'
import type { ValueKind } from './files.ts'
import { valuesHeldFor } from './files.ts'
import { secretKeyAt } from './key.ts'
import { valuesOf } from './ofApp.ts'
import { secretValues } from './secrets.ts'
import { settingValues } from './settings.ts'
import type { ValuesAsked } from './stored.ts'
import { carriedOut } from './stored.ts'

/**
 * Takes what the engine holds of an app, the kind of value, and the words of a command: `do`, which is `set`,
 * `remove` or `list`, with `name`, `value`, and `live` for the live file. Carries it out as the engine that holds
 * the key: it writes the file, and where the file is the one its own mode reads, it uses the new value from the
 * next use on. A setting that changed has every live group run again, since a query may read one. Answers what
 * the command prints. Throws T0002 for a word that is none of the three.
 */
export function valuesAsked(o: Opened, kind: ValueKind, args: object): unknown {
  const act: unknown = Reflect.get(args, 'do')
  if (act !== 'set' && act !== 'remove' && act !== 'list')
    throw new TentError('T0002', 'The command takes `set`, `remove` or `list` as `do`.', { fields: { do: 'values' } })
  const [name, value]: unknown[] = [Reflect.get(args, 'name'), Reflect.get(args, 'value')]
  const live = Reflect.get(args, 'live') === true
  const asked: ValuesAsked = {
    kind,
    live,
    ...(typeof name === 'string' ? { name } : {}),
    ...(act === 'list' ? { list: true } : act === 'remove' ? { remove: true } : { value }),
    ...(Reflect.get(args, 'written') === true ? { written: true } : {}),
  }
  // The settings of an app are its writer's: a reader is told them, and sets none.
  if (kind === 'settings' && act !== 'list') o.machine.writes('a setting')
  const held = live ? 'live' : 'test'
  const own = valuesHeldFor(o.mode) === held
  const mine = valuesOf(o)
  // The other file of the two is written through values of its own: this engine reads none of it.
  const at = own
    ? { secrets: mine.secrets, settings: mine.settings, description: o.description }
    : {
        secrets: secretValues(o.dataFolder, held),
        settings: settingValues(o.dataFolder, held, () => o.description),
        description: o.description,
      }
  // An engine makes no key. With none at hand a secret is not set, and the command is told so: it makes the key
  // file where the one rule of who makes one lets it, and asks again.
  if (kind === 'secrets' && act === 'set' && secretKeyAt(o.dataFolder) === undefined)
    return { name: asked.name, set: false, key: false }
  const answer = carriedOut(asked, at)
  if (own && act !== 'list') {
    if (kind === 'secrets') mine.changed()
    // A query and a screen may read a setting: every live group is run again, and no cached screen is kept.
    else readAllAgain(o)
  }
  return answer
}
