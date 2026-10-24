import { TentError } from '../core/index.ts'
import type { Opened } from './opened.ts'
import { valuesOf } from './values/ofApp.ts'
import { pathsAt, textAt } from './files.ts'

// A value that is shorter is not searched for: it would be found in code that holds no secret.
const shortest = 8

/**
 * Searches the browser files of a bundle that is added for the values of the app's own secrets, in every form
 * that the engine keeps out of its log: a version built elsewhere was searched there for the values of that
 * computer, and not for those of this one. Throws T3007, which names the file, where one is found.
 */
export function searchedForSecrets(o: Opened, place: string): void {
  const forms = valuesOf(o)
    .forms()
    .filter((one) => one.length >= shortest)
  if (!forms.length) return
  for (const path of pathsAt(place, 'browser')) {
    const text = textAt(place, path)
    if (forms.some((form) => text.includes(form)))
      throw new TentError(
        'T3007',
        `The browser file ${path.slice(path.lastIndexOf('/') + 1)} of the version holds the value of a secret of this server.`,
        {
          fix: 'Read the secret in backend code, and hand the page only what it may show.',
        },
      )
  }
}
