import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { noScreens } from '../pages/none.ts'
import { callerNamed } from '../program.ts'

/**
 * `app.page`: what a `GET` of an address of the app answers, as the caller that `as` names, and as nobody where it
 * names none: `{ status, headers, html }`. A screen that needs a sign-in answers 302 with the address in
 * `headers.location`, and an unknown address answers 404 with the `notFound` screen.
 */
export const member =
  (o: Opened): App['page'] =>
  async (path, how) => {
    heldOpen(o)
    // The address is taken as it is written, so that one which is no address of the app is not found.
    const url = new URL(`http://localhost${path.startsWith('/') ? path : `/${path}`}`)
    if (!Object.keys(o.description.screens).length) throw noScreens(url.pathname)
    const { pageAnswer } = await import('../pages/answer.ts')
    const caller = callerNamed(Reflect.get(Object(how), 'as') ?? 'nobody')
    // A reader draws a screen itself, and sends one that meets an action on to its writer, as it does a call.
    const answer = await o.machine.sent('page', [path], caller, true, () => pageAnswer(o, url, url.origin, caller))
    const { status, headers, html } = Object(answer)
    return { status, headers, html }
  }
