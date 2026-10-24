import { TentError } from '../../core/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { connectNow } from '../services/loaded.ts'
import { signingOf } from '../services/signing.ts'
import { valuesOf } from '../values/ofApp.ts'
import { isStored } from '../../core/internal.ts'

/** T7118, from a check of the builder's own that threw. */
const refused = (cause: unknown): TentError =>
  Object.assign(
    new TentError('T7118', 'The call could not be verified: the check of the scheme refused it.', {
      fix: 'Send the call as the provider signs it.',
    }),
    { cause },
  )

/**
 * The scheme and the name of the secret that a `verify` names: its own, or the `webhook` of the service whose
 * signature it is. Nothing for one that names neither.
 */
export function schemeOf(o: Opened, verify: unknown): { scheme: unknown; secret: string } | undefined {
  if (!isStored(verify)) return undefined
  const service = typeof verify.service === 'string' ? o.description.services[verify.service] : undefined
  const held = isStored(service?.webhook) ? service.webhook : verify
  const secret: unknown = Reflect.get(Object(held.secret), 'secret')
  return typeof secret === 'string' ? { scheme: held.scheme, secret } : undefined
}

/**
 * Takes an app, what a call coming in, or a route, is verified by, and the headers and the exact bytes that
 * arrived. Checks the signature by its scheme, with the secret of the app's mode, or asks the check of the builder's
 * own that a scheme `{ by }` names, and holds the time it answers to `limits.incomingAge`. Answers the id of the
 * call where it has one. Throws T7118 for a signature that does not hold, and T0009 for a secret with no value.
 */
export async function verifyCall(
  o: Opened,
  verify: unknown,
  headers: Headers,
  body: Uint8Array,
): Promise<{ id?: string }> {
  const named = schemeOf(o, verify)
  if (!named) throw refused('no scheme')
  let secret: string
  try {
    secret = valuesOf(o).secrets.value(named.secret)
  } catch (error) {
    // T0009, so that the service tries again later; the log names the secret.
    throw Object.assign(
      new TentError('T0009', `The secret ${named.secret} that checks this call has no value.`, {
        fix: `Set the secret ${named.secret}.`,
      }),
      { cause: error },
    )
  }
  const now = o.clock.now()
  const age = storedLimit(o.description, 'incomingAge')
  if (isStored(named.scheme) && typeof named.scheme.by === 'string') {
    const check = signingOf(o).verifiers[named.scheme.by]
    let said: { id?: string; time?: number }
    try {
      said = await check({ headers, body, secret, now })
    } catch (error) {
      throw refused(error)
    }
    if (said.time !== undefined && Math.abs(now - said.time) > age) throw refused('the time lies too far from now')
    return typeof said.id === 'string' ? { id: said.id } : {}
  }
  return connectNow().checkSignature({
    verify: { scheme: named.scheme },
    secret,
    headers,
    body,
    now,
    age,
    entries: storedLimit(o.description, 'signatureEntries'),
  })
}
