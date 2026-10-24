import { join } from 'node:path'
import type { SecureOptions } from '../certs/keeper.ts'
import { msOf } from '../words.ts'
import type { Serves, Serving } from './server.ts'

/** Where the web side starts: the data folder of the first app, whose `certs/` holds the certificates, and its log. */
export interface Listening {
  dataFolder: string
  say?(level: 'info' | 'warning', message: string): void
}

// One year, the time `Strict-Transport-Security` states where nothing names another.
const year = 365 * 86_400

/** The value of `Strict-Transport-Security` that `secure.hsts` states, or nothing where it is switched off. */
function hstsOf(hsts: boolean | string | undefined): string | undefined {
  if (hsts === false || hsts === 'off') return undefined
  if (hsts === undefined || hsts === true || hsts === 'on') return `max-age=${year}`
  return `max-age=${Math.round(msOf('secure.hsts', hsts, year * 1000) / 1000)}`
}

/**
 * Takes what the server asks of its engine, `secure`, where the web side starts, and the port of the engine. Loads
 * the certificates part, which no engine without secure names loads, and starts the secure side of the web.
 */
export async function startSecure(
  serving: Serving,
  secure: SecureOptions,
  at: Listening | undefined,
  port: number | undefined,
): Promise<Serves> {
  const [{ serveSecure }, { keepCertificates }] = await Promise.all([
    import('./secure.ts'),
    import('../certs/keeper.ts'),
  ])
  // Said in the log of the first app, and on the standard error, which is the log of the program that runs it.
  const say = (level: 'info' | 'warning', message: string): void => {
    console.error(message)
    at?.say?.(level, message)
  }
  const keeper = keepCertificates({ secure, folder: join(at?.dataFolder ?? process.cwd(), 'certs'), say })
  const hsts = hstsOf(secure.hsts)
  return serveSecure(serving, {
    port: secure.port ?? port ?? 443,
    plainPort: secure.plainPort ?? 80,
    keeper,
    say,
    ...(hsts === undefined ? {} : { hsts }),
  })
}
