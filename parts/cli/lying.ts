import type { Dirent } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// What no save of a project lies in: the engine's own folder, the packages, git, and the type list a build writes.
const passed = new Set(['.tent', 'node_modules', '.git', 'tent.d.ts'])

/** What the disk says of each file of a project's folders, by where it lies: what tells that its entry changed. */
export type Lying = Map<string, string>

/**
 * Takes folders. Answers what the disk says of each file in them, by where it lies. The system changes what it says
 * of a file at every write and every move into its place, whatever moment the file carries, so a file moved in or
 * put back with an old moment is told as well as one saved.
 */
export function lyingIn(folders: string[]): Lying {
  const lying: Lying = new Map()
  const walk = (at: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(at, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (passed.has(entry.name)) continue
      const lies = join(at, entry.name)
      if (entry.isDirectory()) walk(lies)
      else if (entry.isFile()) {
        const said = statSync(lies, { throwIfNoEntry: false, bigint: true })
        if (said) lying.set(lies.replaceAll('\\', '/'), `${said.ino} ${said.size} ${said.mtimeNs} ${said.ctimeNs}`)
      }
    }
  }
  for (const folder of folders) walk(folder)
  return lying
}

/** Takes what the disk said of the files before and what it says now. Answers each file that came, went or changed. */
export function changedFrom(before: Lying, now: Lying): string[] {
  const changed: string[] = []
  for (const [lies, said] of now) if (before.get(lies) !== said) changed.push(lies)
  for (const lies of before.keys()) if (!now.has(lies)) changed.push(lies)
  return changed
}
