import type { Opened } from './opened.ts'
import type { Called } from './rooms/room.ts'

// What an app with a `python` is handed for its calls, and what a worker asks of one: the Python program is loaded at
// the first of them, so that an engine whose apps have none holds nothing of it.

/** Whether a version holds a `python`: the one question that is answered without loading anything of Python. */
const holdsPython = (o: Opened): boolean =>
  Object.values(o.description.functions).some((record) => typeof record.python === 'object' && record.python !== null)

// Whether anything of Python was begun in this program: a switch in an engine that began none loads nothing of it.
let begun = false

/** Answers the `run` of a `python`, kept as the room's entries are: it hands its call to a Python program of the app. */
export const pythonRun = (o: Opened, name: string, record: Record<string, unknown>): Called => {
  begun = true
  return async (handed) => (await import('./python/call.ts')).carriedPython(o, name, record, Object(handed[0]))
}

/** Tells the Python programs of an app that a switch made another version the running one: those of others end. */
export function pythonSwitched(o: Opened): void {
  if (!begun) return
  // What fails there is logged, as for `pythonAhead`: a promise that nothing waits for must never be refused.
  void import('./python/programs.ts')
    .then(({ switchedTo }) => switchedTo(o))
    .catch((error: unknown) =>
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: `The Python programs of the app were not told of the switch: ${String(error)}`,
      }),
    )
}

/** Starts what an app that holds a `python` needs, as it is opened, without holding the opening up. */
export function pythonAhead(o: Opened): void {
  begun = true
  // What fails there is logged: a promise that nothing waits for must never be refused.
  void import('./python/ahead.ts')
    .then(({ ahead }) => ahead(o))
    .catch((error: unknown) =>
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: `The Python of the app was not begun: ${String(error)}`,
      }),
    )
}

/**
 * Takes the code of a version on a worker, its kinds and the definitions it was started to load. Answers once the
 * version is loadable there: the environment of each `python` of its kinds made, and those named loaded. Answers
 * the `python` definitions it holds loaded, none for a version that holds no `python`.
 */
export async function pythonReadyOn(o: Opened, kinds: string[], load: string[]): Promise<string[]> {
  if (!holdsPython(o)) return []
  return (await import('./python/onWorker.ts')).readyOn(o, kinds, load)
}

/**
 * Takes the code of a version on a worker and the definition of a task. Loads it where it is a `python` that is not
 * loaded yet, before the work of the task begins. Answers the `python` definitions the worker holds loaded then.
 */
export async function pythonLoadedFor(o: Opened, name: string): Promise<string[]> {
  if (!holdsPython(o)) return []
  const { loadAhead, loadedNames } = await import('./python/onWorker.ts')
  await loadAhead(o, name)
  return loadedNames(o)
}
