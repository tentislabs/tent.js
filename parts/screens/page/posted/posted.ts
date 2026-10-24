import { isStored } from '../../../core/internal.ts'
import { postOf } from '../postPress.ts'
import { named } from '../based.ts'
import { holdPart } from '../parts.ts'
import type { PageStore } from '../store.ts'
import type { PostPress } from '../types.ts'

/**
 * Posts the form of a press of the engine's own, and answers the address that the engine answers with, which the
 * page then loads whole. Throws the error that the engine answered.
 */
async function sentPost(store: PageStore, posted: PostPress): Promise<string> {
  const answer = await fetch(named(store.page, posted.post), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(posted.form).toString(),
  })
  const read: unknown = await answer.json().catch(() => undefined)
  const to: unknown = isStored(read) && isStored(read.value) ? read.value.to : undefined
  if (!isStored(read) || read.ok !== true || typeof to !== 'string') throw isStored(read) ? read.error : read
  return to
}

/** What a press of the engine's own sends, where `call` is one, or nothing for any other. */
const postedBy = (call: unknown): ((store: PageStore) => Promise<string>) | undefined => {
  const posted = postOf(call)
  return posted ? (store) => sentPost(store, posted) : undefined
}

// A page loads this part before it draws a screen that is handed `grant` or `ask`; a server holds it from its start.
holdPart('posted', { postedBy })
