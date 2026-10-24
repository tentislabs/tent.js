import type { PageStore } from '../store.ts'
import type { TagPlace } from '../placed.ts'
import type { ToldElement } from './elements.ts'
import { elementsNamed, toldOf, treeOf } from './elements.ts'
import { framesIn } from './frames.ts'
import { colorHeld, pathHeld, placeHeld, usesHeld } from './heard.ts'
import { tokenHeld } from './token.ts'
import { isStored } from '../../../core/internal.ts'

/** Whether something is a window that a message can be posted to: the one that holds the page, or that opened it. */
const isWindow = (value: unknown): value is Window =>
  typeof value === 'object' && value !== null && 'postMessage' in value

// What a tool names a frame by where it gives no color of its own.
const usualColor = '#2563eb'

// Whether the page speaks to its tool already.
let speaking = false

// The presses that picking takes: each is taken before the page sees it, so that it calls nothing and moves nowhere.
const presses = ['click', 'dblclick', 'auxclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'submit']

/**
 * Takes a page that lives in the inspect mode with the token it took from its address, and speaks to the tool
 * of its origin alone: it posts to the window that holds the page, or that opened it, at that origin, and reads a
 * message only when it came from that window while it stands on that origin, so a window of the tool that goes to
 * another site is told nothing more. It tells the tool when the page is ready, which element the pointer is over,
 * which element a press picks, and every element that is drawn, and takes the tool's orders: picking, a frame
 * around an element, and a move. It speaks once, whenever it is asked again.
 */
export function inspecting(o: { store: PageStore }): void {
  const origin = o.store.page.inspect?.origin
  if (speaking || origin === undefined || tokenHeld() === undefined) return
  speaking = true
  const opener: unknown = window.opener
  const tool = window.parent !== window ? window.parent : isWindow(opener) ? opener : undefined
  if (!tool) return
  // A message posted to that origin reaches the window only while it stands there: the browser holds it.
  const post = (message: object): void => tool.postMessage(message, origin)
  const frames = framesIn(document)
  const told = (target: EventTarget | null): ToldElement | undefined =>
    target instanceof Element ? toldOf(target, o.store.page.screen) : undefined

  // The page is ready, and again once it shows another screen, when that screen is drawn.
  let shown = ''
  const ready = (): void => {
    const { screen, path, version } = o.store.page
    const now = JSON.stringify([screen, path, version])
    if (now === shown) return
    shown = now
    requestAnimationFrame(() => requestAnimationFrame(() => post({ t: 'tent.ready', screen, path, version })))
  }
  ready()
  o.store.listen(ready)

  // The element the pointer is over: told when it is another, as a row of a list is another than the row beside it.
  let over = ''
  const pointed = (target: EventTarget | null): void => {
    const element = told(target)
    const now = JSON.stringify(element ? [element.place, element.uses, element.rect] : null)
    if (now === over) return
    over = now
    post(element ? { t: 'tent.over', element } : { t: 'tent.over' })
  }
  document.addEventListener('pointermove', (event) => pointed(event.target), { capture: true, passive: true })
  document.documentElement.addEventListener('pointerleave', () => pointed(null), { passive: true })

  // While picking is on, a press picks its element and does nothing else.
  let picking = false
  for (const kind of presses)
    window.addEventListener(
      kind,
      (event) => {
        if (!picking) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (kind !== 'click') return
        const element = told(event.target)
        post(element ? { t: 'tent.picked', element } : { t: 'tent.picked' })
      },
      { capture: true },
    )

  window.addEventListener('message', (event) => {
    if (event.source !== tool || event.origin !== origin) return
    const asked: unknown = event.data
    if (!isStored(asked)) return
    if (asked.t === 'tent.pick') picking = asked.on === true
    else if (asked.t === 'tent.tree') post({ t: 'tent.tree', elements: treeOf(document, o.store.page.screen) })
    else if (asked.t === 'tent.goTo') {
      const path = pathHeld(asked.path)
      if (path !== undefined) o.store.goTo(path)
    } else if (asked.t === 'tent.highlight') highlight(asked)
  })

  /** Draws a frame around the elements of a place, or takes it away where the message names none. A message of another form sets nothing. */
  function highlight(asked: Record<string, unknown>): void {
    if (asked.place === undefined) {
      frames.clear()
      return
    }
    const place = placeHeld(asked.place)
    const uses = asked.uses === undefined ? undefined : usesHeld(asked.uses)
    const color = asked.color === undefined ? usualColor : colorHeld(asked.color)
    if (!isPlace(place) || (asked.uses !== undefined && uses === undefined) || color === undefined) return
    frames.draw(
      elementsNamed(document, o.store.page.screen, {
        place,
        ...(uses === undefined ? {} : { uses: uses.filter(isPlace) }),
      }),
      color,
    )
  }
}

/** Whether a value that was held to its form is the place of a tag. */
const isPlace = (value: unknown): value is TagPlace =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'file') === 'string'
