import { isStored } from '../../core/internal.ts'
import type { PostPress } from './types.ts'

/** A press of the engine's own, as a `grant` or an `ask` screen is handed it: the address it posts to and its form. */
export function postOf(what: unknown): PostPress | undefined {
  if (!isStored(what) || what.kind !== 'post' || typeof what.post !== 'string' || !what.post.startsWith('/_t/'))
    return undefined
  const form = isStored(what.form) ? what.form : {}
  return {
    definition: String(what.definition),
    kind: 'post',
    post: what.post,
    form: Object.fromEntries(Object.entries(form).map(([name, value]) => [name, String(value)])),
  }
}
