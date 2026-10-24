import type { App } from '../engine/index.ts'
import { failureText, isFailure } from './failureText.ts'

/** What tells one failure from another: its words and where it stands. */
const keyOf = (failure: Record<string, unknown>): string => JSON.stringify([failure.message, failure.where])

/**
 * Takes the app of a session of `tent dev`, its port, the folder of the project, and where the session says what it
 * does. Watches what the open pages show, as a page of the app does, over a live connection of this computer, and
 * says each failure while running there once, with the path of its file. Answers what ends the watching.
 */
export function failuresTold(o: { app: App; port: number; folder: string; out(line: string): void }): () => void {
  const address = `http://localhost:${o.port}`
  let told = new Set<string>()
  let end: ReturnType<App['live']>
  try {
    end = o.app.live(new Request(`${address}/_t/live`, { headers: { origin: address } }))
  } catch {
    return () => undefined
  }
  end.each((message) => {
    // The engine asks each connection now and then whether it is still there.
    if (message.t === 'alive') return end.send({ t: 'alive' })
    if (message.t !== 'findings' || !Array.isArray(message.findings)) return
    const failures = message.findings.filter(isFailure)
    for (const one of failures) if (!told.has(keyOf(one))) o.out(failureText(one, o.folder))
    // A failure that the pages no longer show is said again when it comes back.
    told = new Set(failures.map(keyOf))
  })
  return () => end.close()
}
