/** Makes the attributes of one element those of another: what the other lacks goes, what it holds is set. */
function sameAttributes(kept: Element, wanted: Element): void {
  for (const name of [...kept.getAttributeNames()]) if (!wanted.hasAttribute(name)) kept.removeAttribute(name)
  for (const name of wanted.getAttributeNames()) {
    const value = wanted.getAttribute(name) ?? ''
    if (kept.getAttribute(name) !== value) kept.setAttribute(name, value)
  }
}

/** Lays the nodes of one parent over those of another, in their order, keeping what is kept and never looking into it. */
function mergedChildren(into: Node, from: Node, isKept: (element: Element) => boolean, mark: string): void {
  const wanted = [...from.childNodes]
  for (let at = 0; at < wanted.length; at++) {
    const one = wanted[at]
    const there = into.childNodes[at]
    if (there === undefined) {
      into.appendChild(one.cloneNode(true))
      continue
    }
    // The place of a living child stays the element it is: only its mark is told anew.
    if (there instanceof Element && isKept(there) && one instanceof Element && one.hasAttribute('data-t-child')) {
      const named = (one.getAttribute('data-t-child') ?? '').split(':')[1] ?? 'children'
      there.setAttribute('data-t-child', `${mark}:${named}`)
      continue
    }
    if (
      there.nodeType !== one.nodeType ||
      there.nodeName !== one.nodeName ||
      (there instanceof Element && isKept(there))
    ) {
      into.replaceChild(one.cloneNode(true), there)
      continue
    }
    if (there instanceof Element && one instanceof Element) {
      sameAttributes(there, one)
      mergedChildren(there, one, isKept, mark)
    } else if (there.nodeValue !== one.nodeValue) there.nodeValue = one.nodeValue
  }
  while (into.childNodes.length > wanted.length) into.lastChild?.remove()
}

/**
 * Takes the element of a part, the HTML that the server drew of it anew, what says whether an element is the
 * place of a living child, and the mark of the new drawing. Lays the new HTML over what stands, node by node in
 * their order: a node of the same kind is kept and made equal, another is put in its place, and the place of a
 * living child is never looked into, so it never leaves the page and what lives in it lives on.
 */
export function mergedInto(element: Element, html: string, isKept: (element: Element) => boolean, mark: string): void {
  const made = document.createElement('template')
  made.innerHTML = html
  mergedChildren(element, made.content, isKept, mark)
}
