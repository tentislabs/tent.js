import type { Opened } from '../opened.ts'
import { shownFailure } from './failure.ts'
import { keepFailure } from './held.ts'

/** In the mode `development`: shows a failure while running on the server, by the place in the project's source. */
export function failedHere(o: Opened, name: string, error: unknown): void {
  if (o.mode !== 'development') return
  keepFailure(o, shownFailure(o, name, error))
}

const isText = (value: unknown, most: number): value is string => typeof value === 'string' && value.length <= most

/**
 * In the mode `development`: takes what a page told of a view that failed in the browser - its words, its trace, the
 * tags that drew what failed and its screen - and shows it, by the place in the project's source. What has another
 * form is passed over.
 */
export function failedInBrowser(o: Opened, told: object): void {
  if (o.mode !== 'development') return
  const [message, stack, screen, owners] = ['message', 'stack', 'screen', 'owners'].map((name) =>
    Reflect.get(told, name),
  )
  if (!isText(message, 2000) || !isText(stack, 20000) || !isText(screen, 200)) return
  keepFailure(o, shownFailure(o, screen, undefined, { message, stack, ...(isText(owners, 20000) ? { owners } : {}) }))
}
