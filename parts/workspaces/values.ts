import { makeSecretKey } from '../engine/index.ts'
import { asked } from '../publish/index.ts'
import type { ValuesAsked } from './face.ts'
import { runWorkspace } from './opening.ts'
import { openLive } from './published.ts'
import type { Held } from './state.ts'
import { oneOf } from './state.ts'

/** The names that a list of the values of an app answered, as a list of texts. */
function namesOf(answer: unknown): string[] | undefined {
  const names: unknown = Array.isArray(answer)
    ? answer
    : (Reflect.get(Object(answer), 'set') ?? Reflect.get(Object(answer), 'settings'))
  if (!Array.isArray(names)) return undefined
  // A setting is listed by its name, with no value: an entry that is a record gives its name alone.
  return names.map((one) => (typeof one === 'string' ? one : String(Reflect.get(Object(one), 'name') ?? '')))
}

/**
 * Takes what the workspaces hold, the id of a workspace and what is asked. Sets, removes or lists a secret or a
 * setting of one side of the workspace: of the test side on its app, and of the live side on its live app in the
 * product's own engine or on the far server it was published to. A list answers the names that are set, and never
 * a value; anything else answers nothing.
 */
export async function valuesOf(held: Held, id: string, o: ValuesAsked): Promise<string[] | undefined> {
  const one = oneOf(held, id)
  const ask = {
    kind: o.kind,
    ...(o.name === undefined ? {} : { name: o.name }),
    ...(o.value === undefined ? {} : { value: o.value }),
    ...(o.remove ? { remove: true } : {}),
    ...(o.list ? { list: true } : {}),
  }
  if (o.side === 'test') {
    const app = await runWorkspace(held, id)
    const answer = await app.values(ask)
    // An engine makes no key of the secrets: where its folder holds none, the workspaces make it, as a command does.
    if (Reflect.get(Object(answer), 'key') === false && makeSecretKey(one.folders.data)) await app.values(ask)
    return o.list ? (namesOf(answer) ?? []) : undefined
  }
  const live = held.o.live?.(id)
  if (live && 'key' in live) {
    const answer = await asked({ to: live, fetch: held.o.fetch }, '/_t/publish/values', o.list ? { list: true } : ask)
    return o.list ? (namesOf(answer) ?? []) : undefined
  }
  const app = await openLive(held, one)
  if (!app) return o.list ? [] : undefined
  const answer = await app.values(ask)
  return o.list ? (namesOf(answer) ?? []) : undefined
}
