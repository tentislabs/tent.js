import type { TagPlace } from '../placed.ts'
import { placeOfProps } from '../placed.ts'

/** An element as a tool is told it: its view, the place of its tag, the uses it is drawn inside, its tag and where it lies. */
export interface ToldElement {
  view: string
  place: TagPlace
  uses: TagPlace[]
  tag: string
  rect: { x: number; y: number; width: number; height: number }
  elements?: ToldElement[]
}

/** What React of development keeps of what it drew, from an element up to the root, the innermost first. */
function* drawnAbove(element: Element): Generator<object> {
  const key = Object.keys(element).find((one) => one.startsWith('__reactFiber$'))
  for (let drawn: unknown = key === undefined ? undefined : Reflect.get(element, key); drawn; ) {
    if (typeof drawn === 'object' && drawn !== null) yield drawn
    drawn = Reflect.get(Object(drawn), 'return')
  }
}

/** The place of what was drawn, where a tag of a file of the project drew it. */
function placeOf(drawn: object): (TagPlace & { view?: string }) | undefined {
  const props: unknown = Reflect.get(drawn, 'memoizedProps')
  return typeof props === 'object' && props !== null ? placeOfProps(props) : undefined
}

/** The name of what a tag drew: an element by its tag, and a component by its own name. */
function nameOf(drawn: object): string {
  const type: unknown = Reflect.get(drawn, 'type')
  if (typeof type === 'string') return type
  return String(
    Reflect.get(Object(type), 'definition') ??
      Reflect.get(Object(type), 'displayName') ??
      Reflect.get(Object(type), 'name') ??
      'Component',
  )
}

/** Whether what was drawn is a use of a component of the project, as `component(...)` makes one. */
const isUse = (drawn: object): boolean => Reflect.get(Object(Reflect.get(drawn, 'type')), 'kind') === 'component'

/** The innermost tag of a file of the project that drew an element, with the uses of components around it. */
function tagOf(element: Element): { tag: TagPlace & { view?: string; name: string }; uses: TagPlace[] } | undefined {
  let tag: (TagPlace & { view?: string; name: string }) | undefined
  const uses: TagPlace[] = []
  for (const drawn of drawnAbove(element)) {
    const place = placeOf(drawn)
    if (!place) continue
    if (!tag) tag = { ...place, name: nameOf(drawn) }
    else if (isUse(drawn)) uses.unshift({ file: place.file, from: place.from, to: place.to })
  }
  return tag ? { tag, uses } : undefined
}

/**
 * Takes an element of the page and the screen that is shown. Answers what the tool is told of the innermost tag of
 * a file of the project that drew it, also a component of a package that it lies in, or nothing where no tag of a
 * file did: a release build tells nothing. The element told is the outermost that the tag drew.
 */
export function toldOf(element: Element, screen: string): ToldElement | undefined {
  const found = tagOf(element)
  if (!found) return undefined
  const { tag, uses } = found
  // Each element above is asked for its own tag alone, so the walk up costs one look for each element it passes.
  let outer = element
  for (let up = element.parentElement; up; up = up.parentElement) {
    const around = tagOf(up)?.tag
    if (around?.file !== tag.file || around.from !== tag.from) break
    outer = up
  }
  const at = outer.getBoundingClientRect()
  return {
    view: tag.view ?? screen,
    place: { file: tag.file, from: tag.from, to: tag.to },
    uses,
    tag: tag.name,
    rect: { x: at.x, y: at.y, width: at.width, height: at.height },
  }
}

/** Whether two places are one: the same file, first and last character. */
const samePlace = (a: TagPlace, b: TagPlace): boolean => a.file === b.file && a.from === b.from && a.to === b.to

/** Whether two lists of places are one, place by place. */
const same = (a: TagPlace[], b: TagPlace[]): boolean =>
  a.length === b.length && a.every((one, k) => samePlace(one, b[k]))

/** Every element of the drawing of the page that a tag of a file of the project drew, each once: the outermost that its tag drew. */
function drawnBy(document: Document, screen: string): { element: Element; told: ToldElement }[] {
  const found: { element: Element; told: ToldElement }[] = []
  for (const element of document.querySelectorAll('#tent *')) {
    const told = toldOf(element, screen)
    if (!told) continue
    const parent = element.parentElement ? toldOf(element.parentElement, screen) : undefined
    // An element inside the outermost one of its own tag is that tag's, and is told once.
    if (parent && samePlace(parent.place, told.place) && same(parent.uses, told.uses)) continue
    found.push({ element, told })
  }
  return found
}

/** Every element that is drawn, each with the elements inside it, the outermost first. */
export function treeOf(document: Document, screen: string): ToldElement[] {
  const top: ToldElement[] = []
  const held = new Map<Element, ToldElement>()
  for (const { element, told } of drawnBy(document, screen)) {
    held.set(element, told)
    let around: ToldElement | undefined
    for (let up = element.parentElement; up && !around; up = up.parentElement) around = held.get(up)
    if (around) around.elements = [...(around.elements ?? []), told]
    else top.push(told)
  }
  return top
}

/** Takes the document and the place of a tag with the places of the uses it is inside. Answers every element it drew. */
export function elementsNamed(
  document: Document,
  screen: string,
  named: { place: TagPlace; uses?: TagPlace[] },
): Element[] {
  return drawnBy(document, screen)
    .filter(
      ({ told }) => samePlace(told.place, named.place) && (named.uses === undefined || same(told.uses, named.uses)),
    )
    .map(({ element }) => element)
}
