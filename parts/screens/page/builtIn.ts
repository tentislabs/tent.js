import { isStored, pageLink, pageLook } from '../../core/internal.ts'
import type { CSSProperties, Drawable } from '../borrowed/react.ts'
import { createElement } from '../borrowed/react.ts'
import { spokenIn } from './address.ts'
import { named } from './based.ts'
import { useStore } from './context.ts'
import { textOf } from './spoken.ts'
import type { ViewRecord } from './types.ts'

/** The declarations of one part of the look, as the style of an element: each name as React writes it. */
function elementStyle(declarations: string): CSSProperties {
  const style: Record<string, string> = {}
  for (const one of declarations.split(';')) {
    const at = one.indexOf(':')
    const name = one.slice(0, at).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    if (at > 0) style[name] = one.slice(at + 1)
  }
  return style
}

// The parts of the look that a page of status draws, each as the style of an element.
const styles = {
  window: elementStyle(pageLook.window),
  status: elementStyle(pageLook.status),
  words: elementStyle(pageLook.words),
  code: elementStyle(pageLook.code),
  told: elementStyle(pageLook.told),
  link: elementStyle(pageLook.link),
}

/**
 * A page of status, in the one look of the engine's own pages: the status large, its words under it, and one link,
 * back to the start or to the same address again; in the modes `development` and `test` the code of the error in a
 * pill, and of a failure its place and words under it; on live data nothing of the error.
 */
function Status(o: { kind: 'notFound' | 'error'; status: number; error: unknown }): Drawable {
  const store = useStore()
  const { page, words } = store
  const said = (key: string): string => textOf(words, key, {}, page.language)
  const told = page.mode === 'live' || !isStored(o.error) ? undefined : o.error
  const where = isStored(told?.where) ? told.where : undefined
  const place = where ? `${String(where.file)}:${String(where.line)}\n` : ''
  const again = pageLink(o.kind) === 'again'
  const href = named(page, spokenIn(again ? store.shows() : '/', page.language, page.languages))
  return createElement(
    'main',
    { style: styles.window },
    createElement(
      'div',
      null,
      createElement('h1', { style: styles.status }, String(o.status)),
      createElement('h2', { style: styles.words }, said(`tent.${o.kind}.title`)),
      told ? createElement('span', { style: styles.code }, String(told.code)) : null,
      // A refusal tells its code alone, the same for every address that is not found.
      told && o.kind === 'error'
        ? createElement('pre', { style: styles.told }, `${place}${String(told.message)}`)
        : null,
      createElement('a', { style: styles.link, href }, said(again ? 'tent.page.again' : 'tent.page.start')),
    ),
  )
}

/**
 * The two screens that every app has where its project gives none, for an address that is not found and for a
 * failure. They are views of the page code, drawn and sent like any screen, in the one look of the engine's own
 * pages, which each element carries in its own style, so the project's CSS changes nothing of it.
 */
export const builtIn: Record<string, ViewRecord> = {
  'tent.notFound': {
    name: 'tent.notFound',
    kind: 'screen',
    title: { message: 'tent.notFound.title' },
    view: ({ error }) => createElement(Status, { kind: 'notFound', status: 404, error }),
  },
  'tent.error': {
    name: 'tent.error',
    kind: 'screen',
    title: { message: 'tent.error.title' },
    view: ({ error }) => createElement(ErrorStatus, { error }),
  },
}

/** The status of a failure: the page's own where it says one, and 500 where a view failed in a page that stood. */
function ErrorStatus(o: { error: unknown }): Drawable {
  const { page } = useStore()
  return createElement(Status, { kind: 'error', status: page.status >= 400 ? page.status : 500, error: o.error })
}
