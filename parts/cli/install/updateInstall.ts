import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import type { GuardedFetch } from '../../connect/index.ts'
import { fingerprintOf, programRuns } from '../../core/internal.ts'
import { refusedUpdate, releaseFile, sawList, signedList, unpack } from '../../engine/index.ts'
import { heldUpdate } from './updateLock.ts'
import { writtenWhole } from './writtenWhole.ts'

/** A version of ours: three numbers with dots. */
const isVersion = (text: unknown): text is string => typeof text === 'string' && /^\d+\.\d+\.\d+$/.test(text)

/** Whether one version is newer than another, by its three numbers. */
const newer = (one: string, other: string): boolean => one.localeCompare(other, 'en', { numeric: true }) > 0

/** Reads one line of the folder of the install, as `current` and `previous`, or nothing. */
const lineOf = (home: string, name: string): string | undefined => {
  const file = join(home, name)
  if (!existsSync(file)) return undefined
  const read = readFileSync(file, 'utf8').trim()
  return read === '' ? undefined : read
}

/** Writes one line of the folder of the install whole. */
const writeLine = (home: string, name: string, line: string): void => writtenWhole(join(home, name), `${line}\n`)

/** Whether a program still runs from a version: a file in its `running/` whose program runs. */
function runsFrom(folder: string): boolean {
  const running = join(folder, 'running')
  if (!existsSync(running)) return false
  return readdirSync(running).some((one) => /^\d+$/.test(one) && programRuns(Number(one)))
}

const system = `${process.platform}-${process.arch}`

/**
 * Takes the folder of an install and how to update it: `version`, a version that was typed, or the newest of
 * `releases.json`; `back`, to swap `current` and `previous`; `tools`, to bring the build tools too; `keep`, to
 * remove no older version; `from`, where releases are served; `keys`, the keys of `trust.json`; `fetch`; and `time`,
 * how long one layer may take, 30 minutes where it is not given. Holds `update.lock`, behind which a second update
 * waits, and then finds the version in place. Every layer the install has is fetched, held to its size, its time and its
 * fingerprint, unpacked under another name, and renamed into `versions/<version>/`; then `previous` is written,
 * and after it `current`, each by a rename. A version older than `previous` is removed, unless `keep` was asked, or
 * a program still runs from it, which the next update removes. A newer `trust.json` that a present key signed is
 * taken. Answers the version that is current now, and the one that was. Throws T0026 where a signature, a
 * fingerprint, the age of a list or the version a `release.json` names does not fit, and nothing changes then.
 */
export async function updateInstall(
  home: string,
  o: {
    version?: string
    back?: boolean
    tools?: boolean
    keep?: boolean
    from: string
    keys: string[]
    fetch: GuardedFetch
    time?: number
  },
): Promise<{ version: string; was: string }> {
  const release = await heldUpdate(home)
  try {
    const was = lineOf(home, 'current')
    if (was === undefined) throw refusedUpdate(`${home} holds no install to update: it names no current version.`)
    if (o.back) {
      const previous = lineOf(home, 'previous')
      if (previous === undefined || !existsSync(join(home, 'versions', previous)))
        throw refusedUpdate('This install has no version before the current one to go back to.')
      writeLine(home, 'previous', was)
      writeLine(home, 'current', previous)
      return { version: previous, was }
    }
    const time = o.time ?? 30 * 60 * 1000
    leftBehind(home)
    const listed = await signedList(o.from, 'releases.json', {
      keys: o.keys,
      fetch: o.fetch,
      time,
      format: 'tent.releases/1',
      home,
      seen: 'releases',
    })
    const versions = (Array.isArray(listed.list.versions) ? listed.list.versions : [])
      .map((one: unknown) => Reflect.get(Object(one), 'version'))
      .filter(isVersion)
    if (o.version !== undefined && !versions.includes(o.version))
      throw refusedUpdate(`releases.json names no version ${o.version}.`)
    const newest = versions.reduce<string | undefined>(
      (best, one) => (best === undefined || newer(one, best) ? one : best),
      undefined,
    )
    // A lower version than the current one is taken only where it was typed.
    const picked = o.version ?? (newest !== undefined && newer(newest, was) ? newest : was)
    const has = (layer: string): boolean => existsSync(join(home, 'versions', was, layer))
    const layers = ['runtime', 'player', ...(has('tools') || o.tools ? ['tools'] : [])]
    const target = join(home, 'versions', picked)
    if (picked === was && layers.every((one) => existsSync(join(target, one)))) {
      sawList(home, 'releases', Number(listed.list.made))
      return { version: was, was }
    }
    const one = await signedList(o.from, `${picked}/release.json`, {
      keys: o.keys,
      fetch: o.fetch,
      time,
      format: 'tent.release/1',
    })
    if (one.list.version !== picked)
      throw refusedUpdate(
        `${picked}/release.json names the version ${String(one.list.version)}, and ${picked} was asked for.`,
      )
    const lines: unknown = Reflect.get(Object(one.list.layers), system)
    if (lines === undefined || lines === null) throw refusedUpdate(`Tent.js ${picked} has no release for ${system}.`)
    const base = o.from.endsWith('/') ? o.from : `${o.from}/`
    const files: Uint8Array[] = []
    // A layer that lies in `versions/` already was laid whole, by a rename: only what is missing is fetched, and a
    // version that a program runs from is never taken away under it.
    for (const layer of layers.filter((name) => !existsSync(join(target, name)))) {
      const line: unknown = Reflect.get(Object(lines), layer)
      const [size, file, print] = [
        Reflect.get(Object(line), 'size'),
        Reflect.get(Object(line), 'file'),
        Reflect.get(Object(line), 'fingerprint'),
      ]
      if (typeof size !== 'number' || typeof file !== 'string' || typeof print !== 'string')
        throw refusedUpdate(`${picked}/release.json states no layer ${layer} for ${system}.`)
      const address = new URL(`${picked}/${file}`, base).href
      const bytes = await releaseFile(o.fetch, address, { time, size })
      if (bytes.length !== size || fingerprintOf(bytes) !== print)
        throw refusedUpdate(
          `${file} does not have the size and the fingerprint that ${picked}/release.json states: nothing changed.`,
        )
      files.push(brotliDecompressSync(bytes))
    }
    // The layers are unpacked under another name, and renamed into place whole.
    const laying = join(home, 'versions', `.${picked}.${process.pid}`)
    rmSync(laying, { recursive: true, force: true })
    mkdirSync(laying, { recursive: true })
    try {
      await unpack(files, laying, target)
    } catch (error) {
      rmSync(laying, { recursive: true, force: true })
      throw refusedUpdate(
        `A layer of ${picked} could not be laid: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (existsSync(target)) {
      // What is missing is added to a version that lies there already: the folders it has stay as they are.
      for (const name of readdirSync(laying)) renameSync(join(laying, name), join(target, name))
      rmSync(laying, { recursive: true, force: true })
    } else renameSync(laying, target)
    await trusted(home, o, base, picked, time)
    if (picked !== was) {
      writeLine(home, 'previous', was)
      writeLine(home, 'current', picked)
      sawList(home, 'releases', Number(listed.list.made))
      if (!o.keep) removeOlder(home, [picked, was])
    } else sawList(home, 'releases', Number(listed.list.made))
    return { version: picked, was }
  } finally {
    release()
  }
}

/** Removes what an update that was killed left half-laid: a folder `.<version>.<process>` of a process that no longer runs. */
function leftBehind(home: string): void {
  const versions = join(home, 'versions')
  if (!existsSync(versions)) return
  for (const one of readdirSync(versions)) {
    const pid = /^\..+\.(\d+)$/.exec(one)?.[1]
    if (pid !== undefined && (Number(pid) === process.pid || !programRuns(Number(pid))))
      rmSync(join(versions, one), { recursive: true, force: true })
  }
}

/** Removes every version but those that are kept, and but one that a program still runs from, which the next update removes. */
function removeOlder(home: string, kept: string[]): void {
  const versions = join(home, 'versions')
  for (const one of readdirSync(versions)) {
    if (kept.includes(one) || one.startsWith('.')) continue
    if (runsFrom(join(versions, one))) continue
    rmSync(join(versions, one), { recursive: true, force: true })
  }
}

/**
 * Takes the newer `trust.json` of a release: where a key that this install trusts signed it and its `made` is newer
 * than the one it holds. An old list served again brings no key back, and one that no present key signed is not
 * taken: in both cases the update goes on with the keys it has.
 */
async function trusted(
  home: string,
  o: { keys: string[]; fetch: GuardedFetch },
  base: string,
  picked: string,
  time: number,
): Promise<void> {
  let read: Awaited<ReturnType<typeof signedList>>
  try {
    read = await signedList(base, `${picked}/trust.json`, {
      keys: o.keys,
      fetch: o.fetch,
      time,
      format: 'tent.trust/1',
      home,
      seen: 'trust',
    })
  } catch {
    return
  }
  const file = join(home, 'trust.json')
  const kept: unknown = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
  const held = Number(Reflect.get(Object(kept), 'made') ?? 0)
  const keys = read.list.keys
  if (Number(read.list.made) <= held || !Array.isArray(keys) || !keys.every((one) => typeof one === 'string')) return
  writtenWhole(file, read.bytes)
  sawList(home, 'trust', Number(read.list.made))
}
