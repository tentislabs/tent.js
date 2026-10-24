import type { Opened } from '../opened.ts'
import { pythonLoadedFor, pythonReadyOn } from '../pythonRun.ts'

/** What a worker holds loaded of the `python` definitions of its versions, which it tells its writer. */
export interface LoadedOn {
  // Makes a version loadable here: the environments of its `python` definitions stand, with those named loaded.
  ready(served: Opened): Promise<void>
  // Loads the definition of a task before its work begins, so that its loading counts on no try.
  before(served: Opened, task: Record<string, unknown>): Promise<void>
  // The definitions it holds loaded, over every version.
  names(): string[]
  // Sends again what it holds loaded, to a link that does not know it.
  resend(): void
}

/**
 * Takes the kinds of a worker, the definitions it was started to load, and what sends a message to its writer.
 * Answers what keeps and tells the `python` definitions it holds loaded: `loaded` is sent whenever they change.
 */
export function loadedOn(kinds: string[], load: string[], send: (message: object) => void): LoadedOn {
  const of = new Map<string, string[]>()
  const said = (served: Opened, names: string[]): void => {
    if ((of.get(served.version) ?? []).join('\n') === names.join('\n')) return
    of.set(served.version, names)
    send({ t: 'loaded', version: served.version, names })
  }
  return {
    ready: async (served) => said(served, await pythonReadyOn(served, kinds, load)),
    async before(served, task) {
      const name = String(task.of === 'action' ? task.flow : (task.definition ?? ''))
      said(served, await pythonLoadedFor(served, name))
    },
    names: () => [...new Set([...of.values()].flat())].sort(),
    resend() {
      for (const [version, names] of of) if (names.length) send({ t: 'loaded', version, names })
    },
  }
}
