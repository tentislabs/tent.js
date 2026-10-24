import { TentError } from '../core/index.ts'
import type { Opened } from './opened.ts'
import type { About } from './web/proxy.ts'

/** An app that is being opened again: what the engine held of it before, and the end of the new opening. */
interface Again {
  o: Opened
  app: object
  done: Promise<void>
}

// The apps that are being opened again at this moment.
const under = new Set<Again>()

/** Has what an app is opened again by be told to the calls that arrive meanwhile, until it has ended. */
export function whileAgain(o: Opened, app: object, work: () => Promise<void>): Promise<void> {
  const { promise, resolve: ended } = Promise.withResolvers<void>()
  const again = { o, app, done: promise }
  // The opening is noted before its work begins: the app may be closed at its first step.
  under.add(again)
  return work().finally(() => {
    under.delete(again)
    ended()
  })
}

/** The end of the opening again of an app, by the app as a program holds it, where it is being opened again. */
export const againOf = (app: object): Promise<void> | undefined => [...under].find((one) => one.app === app)?.done

/** The end of the opening again of the app that a request names, where it is being opened again. */
export const againFor = (about: About): Promise<void> | undefined =>
  [...under].find((one) => one.o.web.names(about.host, about.scheme))?.done

/**
 * Takes the end of an opening again, and its bound, `web.openTime` of the engine. Waits for it within the bound,
 * as a call that arrives meanwhile does. Throws T0008 past it.
 */
export async function waitedAgain(done: Promise<void>, bound: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, refuse) => {
    timer = setTimeout(
      () =>
        refuse(
          new TentError('T0008', `The app was not opened again within ${bound} ms.`, {
            fix: 'Ask again in a moment.',
          }),
        ),
      bound,
    )
  })
  try {
    await Promise.race([done, late])
  } finally {
    clearTimeout(timer)
  }
}
