import { testHook } from '../hooked.ts'
import { holdPart } from '../parts.ts'
import type { Reach } from '../reach.ts'
import type { PageStore } from '../store.ts'
import type { Asked, Finding } from './found.ts'
import { elementOf, find } from './found.ts'
import { heardTree } from './heard.ts'
import type { PageRecord } from './record.ts'
import { recorded } from './record.ts'

/** A point of the window, where a test presses. */
interface Point {
  x: number
  y: number
}

/**
 * What the page code of a page in the mode `test` gives the test that drives it, through the record that the test
 * laid into the page before its scripts: when what a step set off has landed, and what it waits for until then;
 * what the screen holds by name; and what a reader hears.
 */
interface Tested {
  landed(write?: number): Promise<true>
  waiting(write?: number): string[]
  find(asked: Asked): Finding
  // Brings the one element that fits into view, and answers its middle, where a person presses.
  point(asked: Asked): Point | Finding
  // Gives the one field that fits the focus, with its words chosen, so that what is typed takes their place.
  focus(asked: Asked): true | Finding
  // Picks a choice of the one field that fits: a list at once, a button and a box by the point where it is pressed.
  pick(asked: Asked, choice: unknown): true | Point | Finding | { refused: string }
  // The one element that fits, as the browser's own channel holds it, which hands a field of files its files.
  element(asked: Asked): Element | undefined
  heard(): string
  traces(): string[]
}

/** The record that a test laid into the page before its scripts, which the page gives what a test reads. */
interface Hook {
  give(tested: Tested): void
}

/** The record that a test laid into this page, or nothing in a page that no test drives. */
const hookOf = (): Hook | undefined => {
  const hook: unknown = Reflect.get(globalThis, testHook)
  return typeof hook === 'object' && hook !== null && typeof Reflect.get(hook, 'give') === 'function'
    ? { give: (tested) => Reflect.apply(Reflect.get(hook, 'give'), hook, [tested]) }
    : undefined
}

/** Whether the screen lives in the browser: the root of the drawing carries `data-t-alive`. */
const alive = (): boolean => document.querySelector('body > div#tent')?.hasAttribute('data-t-alive') === true

/** Carries the work out once the browser has drawn what changed: after two of its frames, or a short while in a page it draws none for. */
function drawnThen(work: () => void): void {
  let done = false
  const once = (): void => {
    if (done) return
    done = true
    work()
  }
  const late = setTimeout(once, 200)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      clearTimeout(late)
      once()
    }),
  )
}

/** Sets the value of a list as a person picks it, so that the view hears the change as from the browser itself. */
function picked(list: HTMLSelectElement, choice: unknown): true | { refused: string } {
  const wanted = (Array.isArray(choice) ? choice : [choice]).map(String)
  const options = [...list.options]
  const chosen = options.filter((one) => wanted.includes(one.value) || wanted.includes(one.text.trim()))
  if (chosen.length !== wanted.length)
    return { refused: `the list holds ${options.map((one) => JSON.stringify(one.text.trim())).join(', ')}` }
  for (const option of options) option.selected = chosen.includes(option)
  list.dispatchEvent(new Event('input', { bubbles: true }))
  list.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

/** The middle of an element once it is in view. */
function middleOf(element: Element): Point {
  element.scrollIntoView({ block: 'center', inline: 'center' })
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/**
 * Takes the record of the page, which the page that it wraps keeps, and the page. Gives the test that laid its record
 * into the page what it reads, and draws the screen again whenever the test moves the clock of the page.
 */
function tell(record: PageRecord, store: PageStore): void {
  const hook = hookOf()
  if (!hook) return
  window.addEventListener('tent-clock', () => store.changed())
  const missed = (asked: Asked): Finding => find(asked)
  hook.give({
    landed: (write) =>
      new Promise((done) => {
        const ends: (() => void)[] = []
        const look = (): void => {
          if (record.waiting(write).length || !alive()) return
          drawnThen(() => {
            if (record.waiting(write).length || !alive()) return
            for (const end of ends) end()
            done(true)
          })
        }
        ends.push(record.listen(look), store.listen(look))
        const root = document.querySelector('body > div#tent')
        if (root) {
          const watch = new MutationObserver(look)
          watch.observe(root, { attributes: true, attributeFilter: ['data-t-alive'] })
          ends.push(() => watch.disconnect())
        }
        look()
      }),
    waiting: (write) => [...record.waiting(write), ...(alive() ? [] : ['the page coming alive'])],
    find,
    point(asked) {
      const element = elementOf(asked)
      return element ? middleOf(element) : missed(asked)
    },
    focus(asked) {
      const element = elementOf(asked)
      if (!element) return missed(asked)
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.focus()
        element.select()
      } else if (element instanceof HTMLElement) element.focus()
      return true
    },
    pick(asked, choice) {
      const element = elementOf(asked)
      if (!element) return missed(asked)
      if (element instanceof HTMLSelectElement) return picked(element, choice)
      if (element instanceof HTMLInputElement && element.type === 'checkbox')
        return element.checked === (choice === true) ? true : middleOf(element)
      if (element instanceof HTMLInputElement && element.type === 'radio') {
        // The buttons of one field are those of its name in its own form: two forms may each hold a field of one name.
        const group = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
          (one) => one.name === element.name && one.form === element.form,
        )
        const button = group.find(
          (one) =>
            one.value === String(choice) ||
            [...(one.labels ?? [])].some((label) => label.textContent?.trim() === String(choice)),
        )
        if (!button) return { refused: `its buttons are ${group.map((one) => JSON.stringify(one.value)).join(', ')}` }
        return button.checked ? true : middleOf(button)
      }
      return { refused: 'it is no field of choices' }
    },
    element: elementOf,
    heard: heardTree,
    traces: () => record.traces(),
  })
}

/**
 * Takes what a living page reaches its engine through. Answers it wrapped by the record of the page, and what
 * gives the test the record once the page lives.
 */
export function watched(reach: Reach): { reach: Reach; told(store: PageStore): void } {
  const made = recorded(reach)
  return { reach: made.reach, told: (store) => tell(made.record, store) }
}

holdPart('tested', { watched })
