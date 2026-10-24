import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The folder `fetched/` of a worker: the files of tasks it fetched, held to a size. */
export interface Fetched {
  // The text of a file by its fingerprint, where it was fetched before.
  read(fingerprint: string): string | undefined
  // Keeps a file that was fetched, and removes the oldest others past the size, but those a task at work names.
  keep(fingerprint: string, text: string): void
  // Removes the files whose bytes the writer removed.
  drop(fingerprints: string[]): void
  // How many bytes the folder holds.
  size(): number
}

/**
 * Takes the folder of a worker, the size its fetched files are held to, and what answers the fingerprints that
 * the tasks at work name. Answers its folder `fetched/`.
 */
export function fetchedIn(folder: string, most: number, inUse: () => Set<string>): Fetched {
  const at = join(folder, 'fetched')
  mkdirSync(at, { recursive: true })
  const files = (): { name: string; bytes: number; at: number }[] =>
    readdirSync(at).map((name) => {
      const held = statSync(join(at, name))
      return { name, bytes: held.size, at: held.mtimeMs }
    })
  return {
    read(fingerprint) {
      const path = join(at, fingerprint)
      if (!existsSync(path)) return undefined
      // A file that is used again is the last to go: the one used longest ago goes first.
      const now = new Date()
      utimesSync(path, now, now)
      return readFileSync(path, 'utf8')
    },
    keep(fingerprint, text) {
      writeFileSync(join(at, fingerprint), text)
      const used = inUse()
      let total = files().reduce((sum, one) => sum + one.bytes, 0)
      // The one used longest ago goes first; a file that a task at work names stays, though the folder is past its size then.
      for (const one of files().sort((a, b) => a.at - b.at)) {
        if (total <= most) break
        if (used.has(one.name) || one.name === fingerprint) continue
        rmSync(join(at, one.name), { force: true })
        total -= one.bytes
      }
    },
    drop(fingerprints) {
      // A name that is no fingerprint reaches no other file of the folder.
      for (const one of fingerprints.filter((name) => /^[0-9a-f]{64}$/.test(name)))
        try {
          rmSync(join(at, one), { force: true })
        } catch {
          // A file that the system holds open goes later, by the size of the folder, as any other.
        }
    },
    size: () => files().reduce((sum, one) => sum + one.bytes, 0),
  }
}
