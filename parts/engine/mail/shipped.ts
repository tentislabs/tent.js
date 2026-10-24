import { TentError } from '../../core/index.ts'
import type { Mailer } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { valuesOf } from '../values/ofApp.ts'
import { privateHostsOf } from '../fetch/address.ts'

/** The secret that the project names for its mail server, where it names one. */
export function mailSecret(o: Opened): string | undefined {
  const named: unknown = Reflect.get(Object(Reflect.get(Object(o.description.project.mail), 'send')), 'secret')
  return typeof named === 'string' ? named : undefined
}

// The port of each kind of address where it names none.
const ports: Record<string, number> = { 'smtps:': 465, 'smtp:': 587 }

/** Throws T0020 for a mail secret whose value is no address of a mail server. */
const noServer = (secret: string): TentError =>
  new TentError('T0020', `The secret ${secret} holds no address of a mail server.`, {
    fix: `Set ${secret} to smtps://user:password@host:465, or smtp://user:password@host:587.`,
  })

/**
 * Takes an app. Answers the mailer that ships, for an app whose project names its mail server as a secret, and
 * nothing for one that names none. The server is the one that the secret holds, at the one address that the
 * address rule of the guarded fetch answers for its name, which is looked up once for the message. Throws T0019
 * for a secret with no value, T0020 for one that holds no address of a mail server, and T0022 for a server whose
 * address is private or local and not listed in `privateHosts`.
 */
export async function shippedMailer(o: Opened): Promise<Mailer | undefined> {
  const secret = mailSecret(o)
  if (secret === undefined) return undefined
  let url: URL
  try {
    url = new URL(valuesOf(o).secrets.value(secret))
  } catch (error) {
    if (error instanceof TentError) throw error
    throw noServer(secret)
  }
  const port = url.port === '' ? ports[url.protocol] : Number(url.port)
  if (port === undefined || url.hostname === '') throw noServer(secret)
  const host = url.port === '' ? `${url.host}:${port}` : url.host
  const { guardedAddress } = await import('../../connect/index.ts')
  const address = await guardedAddress(host, {
    privateHosts: privateHostsOf(o.description),
    mode: o.mode,
  })
  const server = {
    address,
    name: url.hostname.replace(/^\[|\]$/g, ''),
    port,
    secure: url.protocol === 'smtps:',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  }
  const { sendBySmtp } = await import('../borrowed/nodemailer.ts')
  return { send: (message) => sendBySmtp(server, message) }
}
