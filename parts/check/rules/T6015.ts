import { propertyOf } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { viewOf } from '../ofViews.ts'
import { readerOf } from '../personal.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/**
 * `cache` on a screen that is not open to anyone, or one of whose own `data` entries is not, or is a member of an
 * agent or `working`. A component it uses that answers each visitor their own is a personal part, and no fault.
 */
export const rule: Rule = {
  code: 'T6015',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const written of writtenIn(source).filter((one) => one.word === 'screen')) {
      const view = viewOf(description, written)
      if (view.cache === undefined) continue
      if (!isStored(view.access) || view.access.rule !== 'anyone') {
        found.push(
          at(
            'T6015',
            written,
            propertyOf(written.declared.options, 'cache'),
            'the screen states `cache` and is not open to anyone: an answer that the engine keeps is sent to nobody alone.',
            "Open the screen to `'anyone'`, or take `cache` away.",
          ),
        )
        continue
      }
      // A component that answers each visitor their own is a personal part, drawn for each and never kept.
      for (const [name, entry] of Object.entries(isStored(view.data) ? view.data : {})) {
        const read = readerOf(entry, description.functions)
        if (!read || read.open) continue
        found.push(
          at(
            'T6015',
            written,
            propertyOf(written.declared.options, 'data'),
            `the screen states \`cache\`, and its entry \`${name}\` reads ${read.what}, which not everyone may read the same.`,
            "Read only what is open to `'anyone'` on a screen that is kept, or take `cache` away.",
          ),
        )
      }
    }
    return found
  },
}
