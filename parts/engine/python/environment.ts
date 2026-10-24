import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { runInstaller, startedWith } from './installer.ts'
import type { AppProgram, ProgramStart } from '../rooms/room.ts'
import type { OwnPython, PythonParts } from './tools.ts'
import { installerOf, pythonOf } from './tools.ts'
import { fingerprintOf } from '../../core/internal.ts'

/** The file that says an environment is whole: it is written last, and touched each time the environment is used. */
export const wholeMark = '.tent-whole'

/** What an environment is made from: the text of its lock, what `python` of `project` states, and how a secret is opened. */
export interface EnvironmentAsked {
  lock: string
  stated: Record<string, unknown>
  parts: PythonParts
  secret(name: string): string
  // How long the making is waited for, in milliseconds.
  time: number
  // Starts the installer: in the room of the app it is made for, or as the person's own program ahead of any app.
  program(o: ProgramStart): AppProgram
}

/** An environment that stands whole: its folder, its Python program, and whether this asking made it. */
export interface Environment {
  folder: string
  python: string
  made: boolean
}

/** The Python program of an environment, where the installer lays it on this system. */
const programIn = (folder: string): string =>
  process.platform === 'win32' ? join(folder, 'Scripts', 'python.exe') : join(folder, 'bin', 'python')

/** The line of Python that a lock was made for, by its first line. */
const lockedPython = (lock: string): string | undefined => lock.match(/^# python (\d+\.\d+)\r?\n/)?.[1]

/** The names of the packages of a lock: each line that names one with its exact version. */
const packagesOf = (lock: string): string[] =>
  lock
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==/)?.[1])
    .filter((one): one is string => one !== undefined)

/** Marks an environment as used now: the clean of old environments counts from there. */
export function touched(folder: string): void {
  const now = new Date()
  try {
    utimesSync(join(folder, wholeMark), now, now)
  } catch {
    // An environment that was cleaned away meanwhile is made again at its next use.
  }
}

/** The error of an environment that could not be made, with what the installer said of why. */
const notMade = (lock: string, said: string): TentError =>
  new TentError(
    'T0016',
    `The packages of the lock for Python ${lockedPython(lock) ?? '?'} could not be installed: ${said.replace(/\s+/g, ' ').trim().slice(0, 1000)}`,
    {
      fix: 'See that this computer reaches the package index, and that each package file is the one its lock names: `tent python lock` makes the lock anew.',
    },
  )

// The environments that are being made in this program, by their folder: calls meanwhile share one making.
const making = new Map<string, Promise<Environment>>()

/** Puts a folder that was filled in its place. Where another program was first, its folder stays and this one goes. */
async function moveIn(filled: string, place: string): Promise<boolean> {
  for (let tries = 0; ; tries++)
    try {
      await rename(filled, place)
      return true
    } catch (error) {
      if (existsSync(join(place, wholeMark))) {
        rmSync(filled, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
        return false
      }
      // Windows refuses for a moment while another program still reads a file that was just written.
      if (tries >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(Object(error).code)) throw error
      await new Promise((done) => setTimeout(done, 50 * (tries + 1)))
    }
}

/** Makes the environment of a lock under another name, from the lock alone, and renames it into its place. */
async function made(asked: EnvironmentAsked, place: string, version: string): Promise<Environment> {
  const own: unknown = asked.stated.own
  const python = await pythonOf(version, asked.parts, ownOf(own))
  const installer = await installerOf(asked.parts)
  const fetched = dirname(python.place)
  const filling = join(dirname(place), `.${place.slice(-16)}.${randomBytes(4).toString('hex')}`)
  mkdirSync(dirname(place), { recursive: true })
  const common = {
    cache: join(fetched, 'python-cache'),
    usual: usualIndex(asked.parts),
    project: asked.stated,
    secret: asked.secret,
  }
  try {
    const venv = await runInstaller(
      asked.program,
      installer,
      startedWith({ ...common, words: ['venv', filling, '--relocatable'], python: python.program }),
      { time: asked.time },
    )
    if (venv.code !== 0) throw notMade(asked.lock, venv.err || venv.out)
    const lock = join(filling, '.tent-lock')
    writeFileSync(lock, asked.lock)
    const laid = await runInstaller(
      asked.program,
      installer,
      startedWith({
        ...common,
        words: ['pip', 'sync', lock, '--require-hashes', '--allow-empty-requirements'],
        python: filling,
        packages: packagesOf(asked.lock),
      }),
      { time: asked.time },
    )
    if (laid.code !== 0) throw notMade(asked.lock, laid.err || laid.out)
    writeFileSync(join(filling, wholeMark), `${JSON.stringify({ python: version })}\n`)
    const moved = await moveIn(filling, place)
    return { folder: place, python: programIn(place), made: moved }
  } catch (error) {
    rmSync(filling, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    throw error
  }
}

/** A Python of the builder's own, where `python.own` of `project` names one whole. */
function ownOf(own: unknown): OwnPython | undefined {
  const [version, address, fingerprint]: unknown[] = ['version', 'address', 'fingerprint'].map((key) =>
    Reflect.get(Object(own), key),
  )
  return typeof version === 'string' && typeof address === 'string' && typeof fingerprint === 'string'
    ? { version, address, fingerprint }
    : undefined
}

/**
 * The usual package index: that of the standard, or under the address of the builder's own that serves the parts,
 * since a server that may not reach the sites the parts come from does not reach that index either.
 */
export function usualIndex(parts: PythonParts): string {
  const own = parts.from ?? process.env.TENT_PARTS
  return own ? `${own.replace(/\/+$/, '')}/simple` : 'https://pypi.org/simple'
}

/**
 * Takes the text of a lock and what it is made with. Answers its environment, made where the install holds none
 * yet: from the lock alone and with every fingerprint checked, in `fetched/python-envs/<the first 16 characters of
 * the lock's fingerprint>/`, under another name first and renamed when it is whole. Two callings for one lock share
 * one making. Throws T0016 for a part or a package that could not be fetched, or whose bytes do not fit.
 */
export async function environmentOf(asked: EnvironmentAsked): Promise<Environment> {
  const version = lockedPython(asked.lock)
  if (version === undefined)
    throw new TentError('T0016', 'The packages of a lock that names no Python could not be installed.', {
      fix: 'Run `tent python lock`, and build the project again.',
    })
  const python = await pythonOf(version, asked.parts, ownOf(asked.stated.own))
  const name = fingerprintOf(asked.lock).slice(0, 16)
  const place = join(dirname(python.place), 'python-envs', name)
  if (existsSync(join(place, wholeMark))) {
    touched(place)
    return { folder: place, python: programIn(place), made: false }
  }
  const under = making.get(place)
  if (under) return { ...(await under), made: false }
  const work = made(asked, place, version).finally(() => making.delete(place))
  making.set(place, work)
  return work
}
