import type { Page } from '../types.ts'

/**
 * Takes what a view threw as it drew in the browser, the record of the page, and the places of the tags that drew
 * what failed. Tells the engine of it over a live connection of its own, which closes once it is said: its words,
 * its trace, those places and the screen, which the engine leads back to the project's source and shows on every
 * open page. A page outside development holds no such part.
 */
export function thrown(error: unknown, page: Page, owners = ''): void {
  if (page.mode !== 'development') return
  const at = new URL(`/_t/live${page.user ? `?as=${encodeURIComponent(page.user.id)}` : ''}`, window.location.href)
  at.protocol = at.protocol === 'https:' ? 'wss:' : 'ws:'
  const told = JSON.stringify({
    t: 'thrown',
    message: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    stack: (error instanceof Error ? (error.stack ?? '') : '').slice(0, 20000),
    owners: owners.slice(0, 20000),
    screen: page.screen.slice(0, 200),
  })
  const socket = new WebSocket(at)
  socket.addEventListener('open', () => {
    socket.send(told)
    socket.close()
  })
}
