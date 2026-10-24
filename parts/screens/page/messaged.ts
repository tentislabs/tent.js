import type { Drawable } from '../borrowed/react.ts'
import { createElement } from '../borrowed/react.ts'
import { useStore } from './context.ts'
import type { MessageHeld } from './spoken.ts'
import { isMessage, spokenText } from './spoken.ts'

/** A message among the children of an element: its text in the language of the page. */
function Spoken(o: { held: MessageHeld }): Drawable {
  const store = useStore()
  return spokenText(o.held, store.words, store.page.language) ?? null
}

/** Whether children hold a message, also inside a list. */
const holdsMessage = (children: unknown): boolean =>
  isMessage(children) || (Array.isArray(children) && children.some(holdsMessage))

/** Children with each message among them as the element that draws its text. */
const spokenIn = (children: unknown, key?: string): unknown => {
  if (isMessage(children)) return createElement(Spoken, { held: children, ...(key === undefined ? {} : { key }) })
  return Array.isArray(children) ? children.map((one, place) => spokenIn(one, `message ${place}`)) : children
}

/**
 * Takes a function of React's JSX runtime, which a module that is built against the page code calls for each tag.
 * Answers it with each message among the children of the tag drawn as its text: React draws no record.
 */
export function messaging<Type, Props, Rest extends unknown[], Made>(
  made: (type: Type, props: Props, ...rest: Rest) => Made,
): (type: Type, props: Props, ...rest: Rest) => Made {
  return (type, props, ...rest) => {
    const children: unknown = typeof props === 'object' && props !== null ? Reflect.get(props, 'children') : undefined
    if (!holdsMessage(children)) return made(type, props, ...rest)
    return made(type, { ...props, children: spokenIn(children) }, ...rest)
  }
}
