import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GuardedFetch } from '../connect/index.ts'
import { refusedUpdate, sawList, signedList } from './signedList.ts'

/** The list of known problems: by each version that has one, the problem in one sentence and the version that fixes it. */
export interface Known {
  made: number
  versions: Record<string, { problem: string; fixed: string }>
}

// The look is started and not waited for, and is held to five seconds.
const lookTime = 5000
const isVersion = (text: unknown): text is string => typeof text === 'string' && /^\d+\.\d+\.\d+$/.test(text)

/**
 * Takes the folder of an install, where releases are served, the keys a list may be signed with, and the fetch.
 * Reads `known.json` there, and keeps it in the folder with the moment it was read, `readAt`. Answers the list, or
 * nothing where it could not be fetched. Throws T0026 for a list whose signature does not fit, that is older than
 * the one before, or that names anything but versions - a list names versions and never an address: it is
 * thrown away, and the one before is kept.
 */
export async function readKnown(
  home: string,
  o: { from: string; keys: string[]; fetch: GuardedFetch },
): Promise<Known | undefined> {
  let read: Awaited<ReturnType<typeof signedList>>
  try {
    read = await signedList(o.from, 'known.json', {
      keys: o.keys,
      fetch: o.fetch,
      time: lookTime,
      format: 'tent.known/1',
      home,
      seen: 'known',
    })
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'T0026') throw error
    return undefined
  }
  const listed: unknown = read.list.versions
  const versions: Known['versions'] = {}
  for (const [version, line] of Object.entries(Object(listed))) {
    const problem: unknown = Reflect.get(Object(line), 'problem')
    const fixed: unknown = Reflect.get(Object(line), 'fixed')
    if (!isVersion(version) || typeof problem !== 'string' || !isVersion(fixed) || problem.length > 500)
      throw refusedUpdate('known.json names more than versions and the sentence of a problem: it was thrown away.')
    versions[version] = { problem, fixed }
  }
  const known: Known = { made: Number(read.list.made), versions }
  const file = join(home, 'known.json')
  writeFileSync(
    `${file}.${process.pid}`,
    `${JSON.stringify({ format: 'tent.known/1', ...known, readAt: Date.now() }, null, 2)}\n`,
  )
  renameSync(`${file}.${process.pid}`, file)
  sawList(home, 'known', known.made)
  return known
}

/** The list of known problems as the install last read it, with the moment it was read, or nothing. */
export function keptKnown(home: string): (Known & { readAt: number }) | undefined {
  const file = join(home, 'known.json')
  if (!existsSync(file)) return undefined
  try {
    const read = Object(JSON.parse(readFileSync(file, 'utf8')))
    return typeof read.readAt === 'number' && typeof read.versions === 'object' ? read : undefined
  } catch {
    return undefined
  }
}
