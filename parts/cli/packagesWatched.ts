// The packages that the screens of a session of development import, watched where they lie: a package is never taken
// in place by Fast Refresh, so a file of one that changes has every open page load its address anew, as Vite does.
// An install removes the folder of a package and writes it again: the watch of the folder that went is closed, and
// the nearest folder above it is watched until the package lies there again, as Vite's watcher, chokidar, does.
import type { FSWatcher } from 'node:fs'
import { statSync, watch } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// How long the folder of packages is quiet before a change is told: an install writes many files at once.
const quiet = 100

/** The names of the packages of a description that reach a browser. */
export function browserPackages(description: { packages?: Record<string, unknown> }): string[] {
  return Object.entries(description.packages ?? {})
    .filter(([, one]) => Reflect.get(Object(one), 'browser') === true)
    .map(([name]) => name)
    .sort()
}

/** The number by which the system knows a folder, or nothing where no folder lies there. */
function folderId(place: string): bigint | undefined {
  const found = statSync(place, { bigint: true, throwIfNoEntry: false })
  return found?.isDirectory() ? found.ino : undefined
}

/** The folder that a place is, or the nearest folder above it, up to the folder of the project. */
function nearestFolder(place: string, top: string): string {
  let at = place
  while (at !== top && folderId(at) === undefined) at = dirname(at)
  return at
}

/**
 * Takes the folder of a project and what is told when a file of a watched package changed. Answers what sets the
 * packages to watch, by their names, and what ends the watching. A package that is not installed is watched for: it
 * is told as a change when an install lays it there.
 */
export function packagesWatched(folder: string, changed: () => void): { watch(names: string[]): void; close(): void } {
  const top = resolve(folder)
  const watched = new Map<string, FSWatcher>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const told = (): void => {
    clearTimeout(timer)
    timer = setTimeout(changed, quiet)
  }

  /** Watches the folder of a package where it lies, and otherwise the nearest folder above it, for its return. */
  const arm = (name: string): void => {
    const lies = join(top, 'node_modules', name)
    const at = nearestFolder(lies, top)
    const own = at === lies
    const id = folderId(at)
    let watcher: FSWatcher | undefined
    /** Closes this watch and watches the package again where it now lies, once. */
    const again = (): void => {
      if (!watcher || watched.get(name) !== watcher) return
      watcher.close()
      watched.delete(name)
      arm(name)
    }
    try {
      watcher = watch(at, { recursive: own }, () => {
        // On some systems the watch of a folder that was removed tells without end: a folder that went, or that
        // was removed and written again, is the end of its watch.
        if (folderId(at) !== id || (!own && nearestFolder(lies, top) !== at)) {
          told()
          return again()
        }
        if (own) told()
      })
    } catch {
      // A folder that the system lets no program watch is not watched: a load of the page shows what changed.
      return
    }
    // A watch that fails, as one of a folder that an install removed may, is laid again where the package lies.
    watcher.on('error', again)
    watched.set(name, watcher)
  }

  return {
    watch(names) {
      for (const [name, one] of watched)
        if (!names.includes(name)) {
          one.close()
          watched.delete(name)
        }
      for (const name of names) if (!watched.has(name)) arm(name)
    },
    close() {
      clearTimeout(timer)
      for (const one of watched.values()) one.close()
      watched.clear()
    },
  }
}
