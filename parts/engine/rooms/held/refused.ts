import { TentError } from '../../../core/index.ts'
import type { Description } from '../../../core/internal.ts'

// The way out that a permission of the runtime's model stands for, so T0035 can name the packages that reach it.
const wayOfPermission: Record<string, string> = {
  FileSystemRead: 'files',
  FileSystemWrite: 'files',
  Net: 'net',
  ChildProcess: 'programs',
  Worker: 'programs',
  WASI: 'programs',
  Addon: 'native',
}

// The codes of the runtime by which the permission model refuses a way out of the held program. Each becomes T0035.
const refusals = new Set(['ERR_ACCESS_DENIED', 'ERR_DLOPEN_DISABLED', 'ERR_WORKER_INIT_FAILED'])

/**
 * Takes what code of the held program failed with. Answers a refusal of the permission model as T0035, with the
 * permission and the resource it names as its fields, so it crosses to the engine whole; any other error as it is.
 */
export function refusalOf(error: unknown): unknown {
  const code: unknown = Reflect.get(Object(error), 'code')
  if (typeof code !== 'string' || !refusals.has(code)) return error
  const permission: unknown = Reflect.get(Object(error), 'permission')
  const resource: unknown = Reflect.get(Object(error), 'resource')
  return new TentError('T0035', String(Reflect.get(Object(error), 'message') ?? 'a way out'), {
    fields: {
      permission: typeof permission === 'string' ? permission : '',
      resource: typeof resource === 'string' ? resource : '',
    },
  })
}

/** The packages of the app that reach one way out, by the map the build made: those T0035 names where it can. */
export function packagesReaching(description: Description, way: string | undefined): string[] {
  const packages: unknown = description.packages
  if (way === undefined || typeof packages !== 'object' || packages === null) return []
  return Object.entries(packages)
    .filter(([, one]) => {
      const out: unknown = Reflect.get(Object(one), 'out')
      return Array.isArray(out) && out.includes(way)
    })
    .map(([name]) => name)
    .sort()
}

/** T0035: code of a held app, or a package it imports, reached what the hold does not name. */
export function notAllowedOut(name: string, packages: string[], what: string): TentError {
  const by = packages.length ? ` (${packages.join(', ')})` : ''
  return new TentError(
    'T0035',
    `${name}, or a package it imports${by}, tried to reach what \`hold\` does not name: ${what}.`,
    {
      fix: 'Name the host in `hold.net`, the program in `hold.programs`, or the native module in `hold.native`, or do without it.',
    },
  )
}

/**
 * Takes what an action of a held app failed with, its name and the description. Answers the error as the engine
 * tells it: a refusal of the permission model, as it crossed, as T0035, which names the action, what it tried and
 * the packages of the app that reach that way; any other error as it is.
 */
export function refusedOut(error: unknown, name: string, description: Description): unknown {
  const fields = error instanceof TentError && error.code === 'T0035' ? error.fields : undefined
  const permission = fields?.permission
  if (!(error instanceof Error) || permission === undefined) return error
  const resource = fields?.resource
  const what = resource || error.message
  return notAllowedOut(name, packagesReaching(description, wayOfPermission[permission]), what)
}
