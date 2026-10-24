import { propertyOf } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { viewOf } from '../ofViews.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isView, tagsOf } from '../tags.ts'
import { isStored } from '../../core/internal.ts'

/**
 * A part of a screen that does not fit: a second `notFound` or `error` screen, or one whose `access` is not
 * `'anyone'`; a `layout` or a `loading` that names no component; a component that holds itself; a `seo.addresses`
 * query that not everyone may call.
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
      if (written.word === 'screen' && (kind === 'notFound' || kind === 'error')) {
        if (seen.has(kind))
          found.push(
            at('T6012', written, undefined, `a second \`${kind}\` screen: an app has one.`, 'Keep one of the two.'),
          )
        seen.add(kind)
        if (!isStored(view.access) || view.access.rule !== 'anyone')
          found.push(
            at(
              'T6012',
              written,
              undefined,
              `the \`${kind}\` screen is not open to \`anyone\`: every visitor may be shown it.`,
              "Give it `access: 'anyone'`.",
            ),
          )
      }
      for (const option of ['layout', 'loading']) {
        const named = view[option]
        if (typeof named !== 'string' || Object.hasOwn(description.components, named)) continue
        found.push(
          at(
            'T6012',
            written,
            propertyOf(written.declared.options, option),
            `\`${option}\` names \`${named}\`, which is no component of the app.`,
            'Name a component, by its definition.',
          ),
        )
      }
      const seo = isStored(view.seo) && isStored(view.seo.addresses) ? view.seo.addresses : undefined
      const query = typeof seo?.query === 'string' ? seo.query : undefined
      const read =
        query !== undefined && Object.hasOwn(description.functions, query) ? description.functions[query] : undefined
      if (query !== undefined && (!isStored(read?.access) || read.access.rule !== 'anyone'))
        found.push(
          at(
            'T6012',
            written,
            propertyOf(written.declared.options, 'seo'),
            `\`seo.addresses\` reads ${query}, which not everyone may call: the sitemap is asked for by anyone.`,
            "Read a query whose `access` is `'anyone'`.",
          ),
        )
    }
    for (const tag of tagsOf(source)) {
      if (tag.written.word !== 'component') continue
      if (tag.name === tag.written.declared.exportName || tag.name === tag.written.name)
        found.push(
          at(
            'T6012',
            tag.written,
            tag.node,
            `the component \`${tag.written.name}\` holds itself, so it would never end being drawn.`,
            'Draw another component in its place, or take the use away.',
          ),
        )
    }
    return found
  },
}
