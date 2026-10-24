import type { cleanEnvironments as clean } from './python/clean.ts'
import type { packageInstaller as installer } from './python/compile.ts'
import type { installEnvironments as install } from './python/install.ts'

// What the commands of Python are handed through the entry of the engine: each loads its work at its first use, so
// that an engine whose apps have no `python` holds nothing of it.

/**
 * Takes where the parts are taken from, the data folder whose secrets an index names, and what `python` of
 * `project` states. Answers the installer of packages as the build tools are handed it, for `tent python lock`: the
 * lines of Python the engine pins with the systems a lock is made for, and the run that resolves entries.
 */
export function pythonInstaller(o: Parameters<typeof installer>[0] = {}): ReturnType<typeof installer> {
  let made: Promise<ReturnType<typeof installer>> | undefined
  const real = (): Promise<ReturnType<typeof installer>> =>
    (made ??= import('./python/compile.ts').then((one) => one.packageInstaller(o)))
  return {
    versions: async () => (await real()).versions(),
    compile: async (asked) => (await real()).compile(asked),
  }
}

/** `installEnvironments` of its own file, loaded at its first use: the environments of a bundle or a project, made ahead. */
export async function installPython(o: Parameters<typeof install>[0]): ReturnType<typeof install> {
  return (await import('./python/install.ts')).installEnvironments(o)
}

/** `cleanEnvironments` of its own file, loaded at its first use: the environments that were not used for a time, removed. */
export async function cleanPython(o: Parameters<typeof clean>[0] = {}): Promise<ReturnType<typeof clean>> {
  return (await import('./python/clean.ts')).cleanEnvironments(o)
}
