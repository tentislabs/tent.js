// A frame lies over everything of the page and takes no pointer: it is the page code's own, drawn with no tag
// and no rule of the style file, and its color is set through the style of the element, never as text.
const look =
  'position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;outline-style:solid;outline-width:2px;outline-offset:0;margin:0;padding:0;border:0;background:transparent'

/** The frames drawn around elements: what draws them anew over their elements while they stand, and what takes them away. */
export interface Frames {
  draw(elements: Element[], color: string): void
  clear(): void
}

/** Takes the document of the page. Answers what draws a frame around elements, which follows each element where it moves. */
export function framesIn(document: Document): Frames {
  let shown: { frame: HTMLElement; element: Element }[] = []
  let following = 0
  const follow = (): void => {
    following = 0
    for (const { frame, element } of shown) {
      const at = element.getBoundingClientRect()
      frame.style.left = `${at.left}px`
      frame.style.top = `${at.top}px`
      frame.style.width = `${at.width}px`
      frame.style.height = `${at.height}px`
    }
    if (shown.length) following = requestAnimationFrame(follow)
  }
  const clear = (): void => {
    for (const { frame } of shown) frame.remove()
    shown = []
    if (following) cancelAnimationFrame(following)
    following = 0
  }
  return {
    clear,
    draw(elements, color) {
      clear()
      for (const element of elements) {
        const frame = document.createElement('div')
        frame.setAttribute('data-t-highlight', '')
        frame.style.cssText = look
        frame.style.outlineColor = color
        document.body.append(frame)
        shown.push({ frame, element })
      }
      follow()
    },
  }
}
