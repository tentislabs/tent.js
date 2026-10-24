import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { ConnectEnv } from './env.ts'
import type { Planned, Stored } from './requestOf.ts'
import { valueOf } from './requestOf.ts'

/**
 * Takes what the engine hands `connect`, the record of a service, and a request of it. Puts the auth of the
 * service on the request: `bearer` and `basic` as the standard line, `header` as that line, `query` as one more
 * name of the address. A secret is opened here, which throws T0019 where it has no value. `oauth` and an auth
 * of the builder's own are put on elsewhere: the first needs the connection of the user, the second runs last.
 */
export function authAdded(env: ConnectEnv, stored: Stored, planned: Planned): void {
  const auth = stored.auth
  if (!isStored(auth)) return
  if (auth.bearer !== undefined) planned.headers.set('Authorization', `Bearer ${valueOf(env, auth.bearer)}`)
  if (isStored(auth.header)) planned.headers.set(String(auth.header.name), valueOf(env, auth.header.value))
  if (isStored(auth.basic)) {
    const pair = `${valueOf(env, auth.basic.user)}:${valueOf(env, auth.basic.password)}`
    planned.headers.set('Authorization', `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`)
  }
  if (isStored(auth.query)) planned.url.searchParams.append(String(auth.query.name), valueOf(env, auth.query.value))
}

/**
 * Takes what the engine hands `connect`, the record of a service, its name, a finished request, and the user the
 * call is made for. Answers the request that is sent: the one the signer of the builder's own answers, where the
 * service names one, and the same request otherwise. Throws T0009 where the signer fails.
 */
export async function signerRan(
  env: ConnectEnv,
  stored: Stored,
  service: string,
  request: Request,
  user: string | undefined,
): Promise<Request> {
  const auth = isStored(stored.auth) ? stored.auth : {}
  const signer = typeof auth.by === 'string' ? env.signers[auth.by] : undefined
  if (!signer) return request
  try {
    return await signer(request, { service, ...(user === undefined ? {} : { user }) })
  } catch (error) {
    throw Object.assign(new TentError('T0009', `The signer ${String(auth.by)} of the service ${service} failed.`), {
      cause: error,
    })
  }
}
