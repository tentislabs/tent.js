import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { valuesHeldFor } from '../values/files.ts'
import { valuesAsked } from '../values/asked.ts'

/**
 * `app.values`: sets, removes or lists the names of the secrets and the settings of the app's own mode, as the
 * admin command does. A setting is answered once every reader of the app uses it. Never answers a value.
 */
export const member =
  (o: Opened): App['values'] =>
  async (asked) => {
    heldOpen(o)
    const kind = asked.kind === 'secret' ? 'secrets' : 'settings'
    const act = asked.list === true ? 'list' : asked.remove === true ? 'remove' : 'set'
    const answer = valuesAsked(o, kind, {
      do: act,
      ...(asked.name === undefined ? {} : { name: asked.name }),
      ...(asked.value === undefined ? {} : { value: asked.value }),
      ...(valuesHeldFor(o.mode) === 'live' ? { live: true } : {}),
      ...(asked.written === true ? { written: true } : {}),
    })
    if (kind === 'settings' && act !== 'list') await o.machine.writer?.valued()
    return answer
  }
