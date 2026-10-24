import { resolve } from 'node:path'
import type { EngineOptions } from '../../engine/index.ts'

type Secure = NonNullable<EngineOptions['secure']>

// The entries of `--secure`, each with what it takes: a file is resolved from where the command was typed.
const takes: Record<string, 'text' | 'file' | 'count'> = {
  from: 'text',
  roots: 'file',
  rate: 'count',
  renew: 'text',
  cert: 'file',
  key: 'file',
  hsts: 'text',
  plainPort: 'count',
}

/** What `--domain` and `--secure` of `tent start` set: `secure` of the engine, the names of the app, and its host. */
export interface Secured {
  secure: Secure
  address: string[]
  host: string
  // The address the app answers at, as the command says it.
  at: string
}

/**
 * Takes the words of `tent start` and the folder they were typed in. Answers what `--domain` sets, with each entry
 * of `--secure`, or nothing where no `--domain` was typed. With `--domain` the engine listens on 443, or on
 * `--port`, on every address of the computer unless `--host` names one. Throws for an entry that is none of the
 * words of `--secure`, or one that is typed without `--domain`.
 */
export function secureFrom(args: Record<string, unknown>, folder: string): Secured | undefined {
  const entries = Array.isArray(args.secure) ? args.secure.map(String) : []
  if (typeof args.domain !== 'string') {
    if (entries.length) throw new Error('--secure is for the names that --domain lists: type --domain <names>.')
    return undefined
  }
  const names = args.domain
    .split(',')
    .map((one) => one.trim().toLowerCase())
    .filter(Boolean)
  if (!names.length) throw new Error('--domain names the names the app is served on: --domain shop.example.com.')
  const port = typeof args.port === 'number' ? args.port : 443
  const secure: Secure = { names, port }
  for (const entry of entries) {
    const [name = '', value] = entry.split(/=(.*)/s)
    const kind = Object.hasOwn(takes, name) ? takes[name] : undefined
    if (!kind || value === undefined)
      throw new Error(
        `--secure takes <name>=<value>, one of ${Object.keys(takes).join(', ')}, and was handed "${entry}".`,
      )
    if (kind === 'count' && !/^\d+$/.test(value))
      throw new Error(`--secure ${name}=${value}: ${name} is a whole number.`)
    if (name === 'from' && URL.parse(value)?.protocol !== 'https:')
      throw new Error(
        `--secure from=${value}: an authority is named by an address over https, as https://acme.example/dir.`,
      )
    const read = kind === 'file' ? resolve(folder, value) : kind === 'count' ? Number(value) : value
    Object.assign(secure, { [name]: read })
  }
  const shown = port === 443 ? '' : `:${port}`
  return {
    secure,
    address: names.map((one) => `${one}${shown}`),
    // A server that is reached by its names listens on every address of the computer, of both kinds.
    host: typeof args.host === 'string' ? args.host : '::',
    at: `https://${names[0]}${shown}`,
  }
}
