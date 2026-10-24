import type { ValuesAsked } from '../engine/index.ts'
import { asked } from '../publish/index.ts'
import type { Asked } from './reach.ts'
import { serverFetch, targetOf } from './targets.ts'

/**
 * Hands a secret or a setting to the engine of a far server, with the key of the right `publish` that `tent login`
 * kept for it, or lists the names that are set there: never a value. Answers what the command prints.
 */
export async function valuesFar(to: unknown, insecure: unknown, told: ValuesAsked): Promise<Asked> {
  const target = targetOf(to)
  const kind = told.kind === 'secrets' ? 'secret' : 'setting'
  const reaching = { to: target, fetch: serverFetch(insecure) }
  if (told.list) {
    const listed = Object(await asked(reaching, '/_t/publish/values', { list: true }))
    return { value: kind === 'secret' ? { set: listed.secrets ?? [] } : { settings: listed.settings ?? [] } }
  }
  await asked(reaching, '/_t/publish/values', {
    kind,
    name: told.name,
    ...(told.remove ? { remove: true } : { value: told.value }),
    ...(told.written ? { written: true } : {}),
  })
  return { value: { name: told.name, set: told.remove !== true, to: target.name } }
}
