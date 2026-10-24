import type { Finding } from '../../../core/index.ts'
import { viewOf } from '../../ofViews.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { isView } from '../../tags.ts'
import { isStored } from '../../../core/internal.ts'

/**
 * The part of a screen that does not fit, for the screens of sign-in for programs: a second `grant` or `ask`
 * screen, or one whose `access` is not `'signedIn'`, since the person it asks is the one who signed in.
 */
export const rule: Rule = {
  code: 'T6012',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const seen = new Set<string>()
    for (const written of writtenIn(source).filter(isView)) {
      const view = viewOf(description, written)
      const kind = view.for
      if (written.word !== 'screen' || (kind !== 'grant' && kind !== 'ask')) continue
      if (seen.has(kind))
        found.push(
          at('T6012', written, undefined, `a second \`${kind}\` screen: an app has one.`, 'Keep one of the two.'),
        )
      seen.add(kind)
      if (!isStored(view.access) || view.access.rule !== 'signedIn')
        found.push(
          at(
            'T6012',
            written,
            undefined,
            `the \`${kind}\` screen is not for \`signedIn\`: it asks the person who signed in.`,
            "Give it `access: 'signedIn'`.",
          ),
        )
    }
    return found
  },
}
