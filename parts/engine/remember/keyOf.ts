import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import { fingerprintOf } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import { bytesAt, holdsFile } from '../files.ts'

/** What a definition states of the answers it remembers. */
export interface Remember {
  for: number
  shared?: string
  kind?: boolean
  version?: string
}

// How long an answer is kept where `remember` says nothing: 30 days.
const thirtyDays = 30 * 24 * 60 * 60 * 1000

/** What a stored `remember` of a definition or a step says, with what holds where it says nothing. */
export function rememberOf(stated: unknown): Remember | undefined {
  if (stated === undefined || stated === false) return undefined
  const told: Record<string, unknown> = typeof stated === 'object' && stated !== null ? Object(stated) : {}
  return {
    for: typeof told.for === 'number' ? told.for : thirtyDays,
    ...(typeof told.shared === 'string' ? { shared: told.shared } : {}),
    ...(told.kind === true ? { kind: true } : {}),
    ...(typeof told.version === 'string' ? { version: told.version } : {}),
  }
}

/** The fingerprint of text, as a key and a read are kept. */
export const fingerprintOfText = (text: string): string => fingerprintOf(new TextEncoder().encode(text))

// The fingerprints of the built modules of each bundle, which every answer of their definitions rests on.
const modules = new Map<string, string>()

/**
 * The fingerprint of the code of a definition: that of the built module that holds it, whose bytes name every
 * module it reaches, or of its stored body where its `run` was read. `version` stands in the place of both.
 */
function codeOf(o: Opened, record: Record<string, unknown>, stated: Remember): string {
  return stated.version !== undefined ? `version:${stated.version}` : codePrint(o, record)
}

/** The fingerprint of the code of a definition: of the built module that holds it, or of its stored body. */
export function codePrint(o: Opened, record: Record<string, unknown>): string {
  if (Array.isArray(record.body)) return fingerprintOfText(JSON.stringify(record.body))
  const module = typeof record.module === 'string' ? record.module : ''
  if (!module || !holdsFile(o.bundle, module)) return ''
  const key = `${o.bundle}\n${module}`
  let held = modules.get(key)
  if (held === undefined) {
    held = fingerprintOf(bytesAt(o.bundle, module))
    modules.set(key, held)
  }
  return held
}

/**
 * Takes an app, the name of what remembers, its record, what it states, what it rests on - its input or the
 * `key` of a step - its caller, and the kind of worker. Answers the key the answer is remembered under: the
 * fingerprint of the name, the code, what it rests on, its caller where it is not shared, and the kind where it
 * states `kind`.
 */
export function keyOf(
  o: Opened,
  name: string,
  record: Record<string, unknown>,
  stated: Remember,
  restsOn: unknown,
  caller: Caller,
  kind?: string,
): string {
  const parts = [
    name,
    codeOf(o, record, stated),
    JSON.stringify(restsOn ?? null),
    stated.shared === undefined ? callerText(caller) : '',
    stated.kind && kind !== undefined ? kind : '',
  ]
  return fingerprintOfText(JSON.stringify(parts))
}
