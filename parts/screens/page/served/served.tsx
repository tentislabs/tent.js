import type { Drawable } from '../../borrowed/react.ts'
import { createElement, Fragment, use, useEffect, useLayoutEffect, useRef, useState } from '../../borrowed/react.ts'
import { createPortal } from '../../borrowed/reactBrowser.ts'
import { useStore } from '../context.ts'
import { holdPart } from '../parts.ts'
import type { ViewRecord } from '../types.ts'
import { mergedInto } from './merged.ts'

/** What a use of a component that is drawn on the server alone is drawn from. */
export interface ServedUse {
  record: ViewRecord
  // The properties that it declares, as the use gives them.
  props: Record<string, unknown>
  // The living children that the use gives it, by the name of the property that gave each: `children` among them.
  living: Record<string, Drawable>
  // What its own `data` was answered, which draws it again where it changes.
  answers: unknown
  // On a server: its drawing, as a component like any other draws it.
  children?: Drawable
}

// The HTML of each part that the first page holds, in the order of the page, read before the page comes alive:
// each use takes the first of its component. What no use took is let go once the page lives.
const sent: { component: string; html: string }[] =
  typeof document === 'undefined'
    ? []
    : [...document.querySelectorAll('[data-t-part]')].map((element) => ({
        component: element.getAttribute('data-t-part') ?? '',
        html: element.innerHTML,
      }))

/** The elements inside a part that are places of its living children for one mark, and inside no other such place. */
function placesIn(part: Element, mark: string): Record<string, Element> {
  const found: Record<string, Element> = {}
  for (const element of part.querySelectorAll('[data-t-child]')) {
    const [own, named] = (element.getAttribute('data-t-child') ?? '').split(':')
    if (own !== mark || named === undefined || Object.hasOwn(found, named)) continue
    // A place inside another place is the living child's own, and none of the part.
    if (
      element.parentElement?.closest('[data-t-child]') &&
      part.contains(element.parentElement.closest('[data-t-child]'))
    )
      continue
    found[named] = element
  }
  return found
}

// The drawing of each use that is drawn on the server alone, by the use: React draws a use that waited again with
// the same properties, which find the drawing it waited for.
const drawnAlone = new WeakMap<object, Promise<string>>()

/**
 * One use of a component that is drawn on the server alone. On a server it is its drawing, in an element that
 * names it, and the HTML is told to the page. In a browser it keeps the HTML that the server drew, brings each
 * living child to life in its place, and asks the server for the part again where a property it is given, or an
 * answer of its own `data`, changes.
 */
export function Served(o: ServedUse): Drawable {
  const store = useStore()
  const name = o.record.name
  if (store.drawnAlone) {
    let drawing = drawnAlone.get(o)
    if (!drawing) {
      drawing = store.drawnAlone(o.children)
      drawnAlone.set(o, drawing)
    }
    // The part is drawn by the streaming draw, apart: the use waits for it as for any view that waits.
    const html = use(drawing)
    store.partsMet?.push({ component: name, props: o.props, html })
    return createElement('div', {
      'data-t-part': name,
      style: { display: 'contents' },
      dangerouslySetInnerHTML: { __html: html },
    })
  }
  return createElement(Living, o)
}

/** A part in a browser: the HTML of the server, with the living children in their places. */
function Living(o: ServedUse): Drawable {
  const store = useStore()
  const name = o.record.name
  const asked = JSON.stringify([o.props, o.answers])
  // The HTML that the server drew: of the first page, of the answer of a move, or none until it is asked for.
  const [html] = useState(() => {
    const first = sent.findIndex((one) => one.component === name)
    if (first >= 0) return sent.splice(first, 1)[0].html
    return store.page.parts?.find(
      (one) => one.component === name && JSON.stringify(one.props) === JSON.stringify(o.props),
    )?.html
  })
  const [mark, setMark] = useState(store.page.mark ?? '')
  const [places, setPlaces] = useState<Record<string, Element>>({})
  const element = useRef<HTMLDivElement>(null)
  const drawn = useRef(html === undefined ? '' : asked)
  const turn = useRef(0)
  // The living children are drawn into their places before the browser paints: what the server drew there goes.
  useLayoutEffect(() => {
    if (!element.current) return
    const found = placesIn(element.current, mark)
    for (const place of Object.values(found)) if (!Reflect.get(place, 'tentLiving')) place.replaceChildren()
    for (const place of Object.values(found)) Reflect.set(place, 'tentLiving', true)
    setPlaces(found)
  }, [mark])
  useEffect(() => {
    sent.length = 0
  }, [])
  useEffect(() => {
    if (drawn.current === asked || !store.drawnPart) return
    drawn.current = asked
    const mine = ++turn.current
    // Of two askings the later one stands, and the part keeps what it shows until the answer is there.
    void store.drawnPart(name, o.props).then((answer) => {
      if (!answer || mine !== turn.current || !element.current) return
      mergedInto(element.current, answer.html, (kept) => Reflect.get(kept, 'tentLiving') === true, answer.mark)
      setMark(answer.mark)
    })
  }, [asked, name, store, o.props])
  return createElement(
    Fragment,
    null,
    createElement('div', {
      ref: element,
      'data-t-part': name,
      style: { display: 'contents' },
      suppressHydrationWarning: true,
      dangerouslySetInnerHTML: { __html: html ?? '' },
    }),
    ...Object.entries(places).map(([named, place]) =>
      Object.hasOwn(o.living, named) ? createPortal(o.living[named], place, named) : null,
    ),
  )
}

holdPart('served', { Served })
