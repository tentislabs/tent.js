import { builtinModules } from 'node:module'

/**
 * Takes what an import names. Answers the package it names, as `@scope/name` or `name`, or nothing for a file of
 * the project, a module of the runtime, and the framework itself.
 */
export function packageOf(named: string): string | undefined {
  if (named.startsWith('.') || named.startsWith('/') || /^[a-zA-Z]:/.test(named) || named.includes('\0'))
    return undefined
  if (named.startsWith('node:') || named === 'tentjs' || named.startsWith('tentjs/')) return undefined
  if (builtinModules.includes(named)) return undefined
  const parts = named.split('/')
  const name = named.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  return /^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name) ? name : undefined
}

/** The package that a file lies in, by its place: the folder under the last `node_modules/` of its path. */
export function packageAt(file: string): string | undefined {
  const path = file.replaceAll('\\', '/')
  const at = path.lastIndexOf('/node_modules/')
  if (at < 0) return undefined
  return packageOf(path.slice(at + '/node_modules/'.length))
}

// The modules of the runtime by the way out that each opens: a connection, a program, a file of the computer.
const ways: Record<string, string> = {
  net: 'net',
  http: 'net',
  https: 'net',
  http2: 'net',
  tls: 'net',
  dgram: 'net',
  dns: 'net',
  'dns/promises': 'net',
  child_process: 'programs',
  worker_threads: 'programs',
  cluster: 'programs',
  fs: 'files',
  'fs/promises': 'files',
}

/** The way out that importing a module opens: `net`, `programs`, `files` or `native`, or nothing for one that opens none. */
export function wayOf(named: string): string | undefined {
  if (named.endsWith('.node')) return 'native'
  const bare = named.startsWith('node:') ? named.slice('node:'.length) : named
  return Object.hasOwn(ways, bare) ? ways[bare] : undefined
}
