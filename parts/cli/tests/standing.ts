import type { Page } from '../../../rig/browser.ts'

/**
 * Takes a page before it loads its address. Answers once its live connection stands: it watches its data over it. A
 * page comes alive before its connection may stand, and one that opens the connection after a switch is told only the
 * version that runs, so it asks for its screen again: a test that holds a save taken in place saves once it stands.
 */
export const connectionStands = (page: Page): Promise<void> =>
  page
    .waitForEvent('websocket', { timeout: 60_000 })
    .then((socket) =>
      socket.waitForEvent('framesent', {
        predicate: (frame) => String(frame.payload).includes('"watch"'),
        timeout: 60_000,
      }),
    )
    .then(() => undefined)
