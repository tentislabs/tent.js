import type { Page } from '../../../rig/browser.ts'

/**
 * Takes a page of a real browser, the origin of the app, and the cookie that `app.session` answered. Sets the cookie
 * into the browser of the page, with the marks the engine gives a session cookie: from its next request the page is
 * that user.
 */
export async function sessionIn(page: Page, origin: string, cookie: string): Promise<void> {
  const at = cookie.indexOf('=')
  await page
    .context()
    .addCookies([
      { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin, httpOnly: true, sameSite: 'Lax' },
    ])
}
