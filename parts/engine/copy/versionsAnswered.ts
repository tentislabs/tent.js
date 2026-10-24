// The answers that hand the loadable versions of an app on, to a reader and to a worker alike.
import { noLink } from '../noLink.ts'
import type { Opened } from '../opened.ts'
import { jsonAnswer } from '../wire.ts'
import { blobOf, versionsTold } from './versions.ts'

/** Answers the mode of the app and the list of its loadable versions, each with its files. */
export const versionsAnswer = (o: Opened): Response => jsonAnswer(200, { mode: o.mode, list: versionsTold(o) })

/**
 * Answers the bytes of one file of a loadable version, with its length, by the fingerprint that a path ends in.
 * Throws the refusal of an address that is not there for a fingerprint that no loadable version names.
 */
export function blobAnswer(o: Opened, asked: string): Response {
  const bytes = /^[0-9a-f]{64}$/.test(asked) ? blobOf(o, asked) : undefined
  if (!bytes) throw noLink()
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
