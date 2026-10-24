import type { Opened } from '../../opened.ts'
import { discoverAll } from './discover.ts'
import { byUser, lookedAt, outsideServices } from './look.ts'
import { startPrograms } from './programs.ts'

// How often the documents of a server that discovers its sign-in are read again.
const daily = 86_400_000

/**
 * When an app with outside MCP servers opens: the program of each server that is one is started, each server
 * with a fixed auth is looked at once, which the first run waits for, and the documents of each server that
 * discovers its sign-in are read, then once a day, and the app registers with each that needs it, for each of the
 * origins it is reached by. Answers what ends the programs and the readings.
 */
export function outsideStarted(o: Opened, origins: string[]): { close(): void } {
  const programs = startPrograms(o)
  const fixed = outsideServices(o.description).filter((service) => !byUser(o.description, service))
  void lookedAt(o, fixed, undefined).catch(() => undefined)
  void discoverAll(o, origins).catch(() => undefined)
  const again = setInterval(() => void discoverAll(o, origins).catch(() => undefined), daily)
  again.unref()
  return {
    close() {
      clearInterval(again)
      programs.close()
    },
  }
}

/**
 * The names an app is reached by, as origins: those of its `address`, over `https` but for this computer, and
 * with none given this computer's own, with and without the port of the engine.
 */
export function originsOf(address: string | string[] | undefined, port: number): string[] {
  if (address === undefined) return ['http://localhost', `http://localhost:${port}`]
  const here = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/
  return [address]
    .flat()
    .filter((name) => name !== '*')
    .map((name) => `${here.test(name) ? 'http' : 'https'}://${name}`)
}
