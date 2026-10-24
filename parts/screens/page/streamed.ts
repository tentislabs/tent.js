import { createHash } from 'node:crypto'
import type { Drawable } from '../borrowed/react.ts'
import { createElement, Fragment } from '../borrowed/react.ts'
import type { PageStore } from './store.ts'
import { askingOf } from './store.ts'
import type { Answered, ViewRecord } from './types.ts'
import { Use } from './view.tsx'

/** A use of a personal component that the draw met: its name of the stream, its component, and what it was given. */
interface PersonalUse {
  name: string
  component: string
  given: Record<string, unknown>
}

/** What a draw of a page that is streamed holds of its parts: what stands in the place of each, and those that wait. */
export interface StreamedParts {
  streamed: NonNullable<PageStore['streamed']>
  // The uses that wait in this draw, each by its name of the stream, in the order the draw met them.
  waiting: string[]
  // The uses of the personal components, each drawn for its visitor alone and never here.
  personal: PersonalUse[]
}

/**
 * Takes the uses that the page that is sent shows waiting, the screen's `loading` component, and the components
 * that answer each visitor their own. Answers what a draw of the page draws in the place of each use of a
 * component: a use that waits, and every use of a personal component, is the loading component, or nothing,
 * between two empty templates that name it; a use that the page shows waiting and that came now is its drawing
 * inside a template that names it, which the engine sends as its part; any other is drawn as it is. A use is named
 * by its component and what its `data` asks, and counted among the uses of that name: so the use that waited and
 * the one that came are told the same in two draws of the page.
 */
export function streamedParts(
  pending: readonly string[],
  loading: ViewRecord | undefined,
  personal: readonly string[] = [],
): StreamedParts {
  const counts = new Map<string, number>()
  const waiting: string[] = []
  const met: PersonalUse[] = []
  const nameOf = (component: string, answers: Record<string, Answered | undefined>): string => {
    const asked = Object.values(answers)
      .flatMap((one) => (one === undefined ? [] : [askingOf(one.what, one.input)]))
      .sort()
    const base = createHash('sha256')
      .update(`${component}\n${asked.join('\n')}`)
      .digest('hex')
      .slice(0, 12)
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return `${base}-${count}`
  }
  const place = (name: string): Drawable =>
    createElement(
      Fragment,
      null,
      createElement('template', { 'data-t-wait': name }),
      loading ? createElement(Use, { record: loading, given: {} }) : null,
      createElement('template', { 'data-t-end': name }),
    )
  const streamed: StreamedParts['streamed'] = (component, answers, drawn, given) => {
    const own = personal.includes(component)
    if (!own && !Object.keys(answers).length) return drawn
    const name = nameOf(component, answers)
    if (own) {
      met.push({ name, component, given })
      return place(name)
    }
    if (drawn === undefined) {
      waiting.push(name)
      return place(name)
    }
    return pending.includes(name) ? createElement('template', { 'data-t-done': name }, drawn) : drawn
  }
  return { streamed, waiting, personal: met }
}
