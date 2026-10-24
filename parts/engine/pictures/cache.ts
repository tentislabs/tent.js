import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

/** Drops the oldest copies of the folder until what it keeps is no more than its cap. */
function trimmed(folder: string, cap: number): void {
  const kept = readdirSync(folder)
    .map((name) => {
      const found = statSync(join(folder, name), { throwIfNoEntry: false })
      return { name, size: found?.size ?? 0, at: found?.mtimeMs ?? 0 }
    })
    .sort((a, b) => a.at - b.at)
  let sum = kept.reduce((all, one) => all + one.size, 0)
  for (const one of kept) {
    if (sum <= cap) return
    rmSync(join(folder, one.name), { force: true })
    sum -= one.size
  }
}

/** Removes every scaled copy of the bytes of one fingerprint, as their file is taken away for good. */
export function forgetCopies(dataFolder: string, fingerprint: string): void {
  const folder = join(dataFolder, 'cache', 'img')
  if (!existsSync(folder)) return
  for (const name of readdirSync(folder))
    if (name.startsWith(`${fingerprint}.`)) rmSync(join(folder, name), { force: true })
}

/**
 * Takes an app, the name of a scaled copy, and what makes it. Answers the copy that `cache/img/` keeps under that
 * name, made at the first asking and written beside its place and then moved into it, so that no asking finds half
 * of it. What the folder keeps stays under `limits.imageCacheSize`, the oldest copies dropped first.
 */
export async function cachedCopy(o: Opened, name: string, make: () => Promise<Uint8Array>): Promise<Uint8Array> {
  const folder = join(o.dataFolder, 'cache', 'img')
  const place = join(folder, name)
  if (existsSync(place)) {
    try {
      return new Uint8Array(readFileSync(place))
    } catch {
      // A copy that another asking just dropped is made again.
    }
  }
  const made = await make()
  mkdirSync(folder, { recursive: true })
  const beside = join(folder, `.${name}.${process.pid}.${Math.round(performance.now() * 1000)}`)
  writeFileSync(beside, made)
  renameSync(beside, place)
  trimmed(folder, storedLimit(o.description, 'imageCacheSize'))
  return made
}
