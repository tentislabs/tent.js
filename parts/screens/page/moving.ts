// The transitions between views that are under way, and who is told when that changes.
const showing = { count: 0, heard: new Set<() => void>() }

/** Tells each who listens that the count of the transitions under way changed by that much. */
function told(by: number): void {
  showing.count += by
  for (const one of [...showing.heard]) one()
}

/**
 * What the record of a page in the mode `test` reads of the moves, so that a step waits until a move it set off is
 * drawn: while a transition between views runs, a press lands on the picture of it and not on the screen.
 */
export const moves = {
  under: (): number => showing.count,
  listen(heard: () => void): () => void {
    showing.heard.add(heard)
    return () => void showing.heard.delete(heard)
  },
}

/**
 * Whether the browser is a WebKit engine: one that names `AppleWebKit` and neither `Chrome/` nor `Chromium/`, which
 * the engines built on Chromium name too, Edge among them. A desktop window of Tauri on macOS is one, and every
 * browser of iOS, as Edge there, which names itself `EdgiOS`.
 */
const isWebKit = (agent: string): boolean => /AppleWebKit/.test(agent) && !/Chrome\/|Chromium\//.test(agent)

/**
 * Shows a move between two screens through the browser's own transition between views: the next screen is drawn
 * inside it, so a `view-transition-name` of the project's own CSS is seen as one element that moves. In a browser
 * that has none, for a viewer who asked for less motion, and in a WebKit engine, the screens change at once.
 * `drawn` is called once the next screen is drawn.
 */
export function moving(apply: () => void, drawn?: () => void): void {
  // A page drawn with no document of a browser around it, as in a test, changes at once.
  const browser = typeof document === 'object' && typeof matchMedia === 'function'
  if (
    !browser ||
    typeof document.startViewTransition !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    // WebKit ends its page in a view transition between a page that fits the window and a taller one.
    isWebKit(navigator.userAgent)
  ) {
    apply()
    // The page takes the next screen after the work that the change set off.
    if (drawn) setTimeout(drawn, 0)
    return
  }
  told(1)
  const transition = document.startViewTransition(async () => {
    apply()
    // The next screen is drawn once the page has taken it: after the work that the change set off.
    await new Promise((done) => setTimeout(done, 0))
    drawn?.()
  })
  // A transition that the browser skips, as for a second move that starts before it ends, ends too.
  transition.finished.catch(() => undefined).finally(() => told(-1))
}
