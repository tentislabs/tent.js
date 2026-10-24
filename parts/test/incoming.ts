import { createHmac } from 'node:crypto'
import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { App } from '../engine/index.ts'

/** What `app.incoming` is handed: the body, more headers, and whether the call is signed. */
export interface IncomingAsked {
  body?: unknown
  headers?: Record<string, string>
  sign?: boolean
}

/** The headers that sign a body by a scheme and its secret, as the sender of that scheme signs it. */
function signed(scheme: unknown, secret: string, body: string, now: number): Record<string, string> {
  const at = String(Math.floor(now / 1000))
  const hmac = (key: string | Buffer, text: string, as: 'hex' | 'base64') =>
    createHmac('sha256', key).update(text).digest(as)
  if (scheme === 'standard') {
    if (secret.startsWith('whpk_'))
      throw new TentError('T0013', 'A test signs no call with a public key: hand the headers of a signed call.')
    const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
    const id = `msg_${now}`
    return {
      'webhook-id': id,
      'webhook-timestamp': at,
      'webhook-signature': `v1,${hmac(key, `${id}.${at}.${body}`, 'base64')}`,
    }
  }
  if (scheme === 'stripe') return { 'stripe-signature': `t=${at},v1=${hmac(secret, `${at}.${body}`, 'hex')}` }
  if (scheme === 'github')
    return { 'x-hub-signature-256': `sha256=${hmac(secret, body, 'hex')}`, 'x-github-delivery': `delivery-${now}` }
  if (isStored(scheme) && typeof scheme.header === 'string') {
    const encoding = scheme.encoding === 'base64' ? 'base64' : 'hex'
    const prefix = typeof scheme.prefix === 'string' ? scheme.prefix : ''
    return {
      [scheme.header]: `${prefix}${hmac(secret, body, encoding)}`,
      ...(typeof scheme.id === 'string' ? { [scheme.id]: `call-${now}` } : {}),
    }
  }
  throw new TentError('T0013', "A test signs no call of a check of the builder's own: hand the headers it reads.")
}

/**
 * `app.incoming(name, { body, headers, sign })`: sends a call to an `incoming`, signed the way its scheme asks
 * unless `sign` is false, and answers the standard response. The secret is the one the test app holds.
 */
export const incoming =
  (app: () => App, secretOf: (name: string) => string) =>
  async (name: string, o: IncomingAsked = {}): Promise<Response> => {
    const { description } = app()
    const record = Object.hasOwn(description.incoming, name) ? description.incoming[name] : undefined
    if (!record || typeof record.path !== 'string')
      throw new TentError('T0013', `${JSON.stringify(name).slice(0, 60)} names no call coming in of the app.`)
    const body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body ?? {})
    const verify: Record<string, unknown> = isStored(record.verify) ? record.verify : {}
    const service = typeof verify.service === 'string' ? description.services[verify.service] : undefined
    const held: Record<string, unknown> = isStored(service?.webhook) ? service.webhook : verify
    const secret: unknown = Reflect.get(Object(held.secret), 'secret')
    const signing =
      o.sign !== false && record.verify !== undefined && typeof secret === 'string'
        ? signed(held.scheme, secretOf(secret), body, Date.now())
        : {}
    return app().request(
      new Request(`http://localhost${record.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signing, ...o.headers },
        body,
      }),
      { from: '203.0.113.1' },
    )
  }
