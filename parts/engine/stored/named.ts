import { TentError } from '../../core/index.ts'
import type { FileStore } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { valuesOf } from '../values/ofApp.ts'
import { s3Store } from './s3.ts'
import { isStored } from '../../core/internal.ts'

/** A text that a project states as it is, or by a setting or a secret, worked out now. */
function textOf(o: Opened, stated: unknown, what: string): string {
  if (typeof stated === 'string') return stated
  if (isStored(stated) && typeof stated.secret === 'string') return valuesOf(o).secrets.value(stated.secret)
  if (isStored(stated) && typeof stated.setting === 'string') {
    const value: unknown = Reflect.get(valuesOf(o).settings.values, stated.setting)
    if (typeof value === 'string' && value !== '') return value
    throw new TentError('T0009', `The setting \`${stated.setting}\` that names ${what} of a store holds no text.`, {
      fix: `Set it: \`tent settings set ${stated.setting} <value>\`.`,
    })
  }
  throw new TentError('T0009', `A store of files names ${what} with neither a text, a setting nor a secret.`)
}

/**
 * Takes what the engine holds of an app, and the record of a store of files that its project names, as `s3`
 * made it. Answers the store, made now: its address and its key are worked out from their settings and secrets
 * at this moment. Throws T0009 for a record that names no store the framework ships, and T0019 for a secret that
 * holds no value.
 */
export function namedStore(o: Opened, named: unknown): FileStore {
  const s3 = isStored(named) ? named.s3 : undefined
  if (!isStored(s3)) throw new TentError('T0009', 'A store of files is named by `s3`, and this one is no such record.')
  const key = textOf(o, s3.key, 'the key')
  const colon = key.indexOf(':')
  if (colon < 1)
    throw new TentError(
      'T0009',
      'The key of a store of the S3 protocol is written as `<the id of the key>:<its secret>`.',
      {
        fix: 'Set the secret that `key` names to the id of the key, a colon, and its secret.',
      },
    )
  return s3Store({
    url: textOf(o, s3.url, 'the address'),
    bucket: String(s3.bucket),
    region: typeof s3.region === 'string' ? s3.region : 'us-east-1',
    keyId: key.slice(0, colon),
    keySecret: key.slice(colon + 1),
  })
}
