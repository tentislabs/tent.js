import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { App, Browsed, BrowserEngine } from '../engine/index.ts'
import { kept } from './evidence.ts'
import { preloadText } from './preload.ts'

/** What a test is told of a thing it found on a screen: what it is, its name, its words, and its state. */
export interface Found {
  role: string
  name: string
  text: string
  value?: string
  checked?: boolean
  disabled: boolean
}

/** A thing as the page told it, read field by field: what it does not tell is empty. */
function foundOf(told: unknown): Found {
  const field = (name: string): unknown => Reflect.get(Object(told), name)
  const [value, checked] = [field('value'), field('checked')]
  return {
    role: String(field('role') ?? ''),
    name: String(field('name') ?? ''),
    text: String(field('text') ?? ''),
    ...(typeof value === 'string' ? { value } : {}),
    ...(typeof checked === 'boolean' ? { checked } : {}),
    disabled: field('disabled') === true,
  }
}

/** What a turn of an agent came to, once it ended: its run, its state, its text, its steps and what it asks. */
export interface Said {
  run: string
  state: string
  text: string
  steps: { name: string; state: string }[]
  asks: string[]
}

/** A file that a test hands a field of files: its name, its bytes, and its kind. */
export interface Handed {
  name: string
  bytes: Uint8Array | string
  kind?: string
}

/**
 * A page of a real browser on the test app. Each step finds what it names by what the description and the reader
 * know of it, and answers once what it set off has landed, by the record that the page keeps: every call it made
 * answered, every live watch holding the answer that holds the write, its moves drawn, and the page alive. A name
 * that finds nothing is T0001 and one that finds two is T0002, naming what the screen holds; a step that does not
 * land within `limits.testStep` is T0008, naming what it waited for.
 */
export interface Page {
  /** The field that a form sends under that name, or that a reader names so. */
  field(name: string): Promise<Found>
  /** Presses the press of those words, as a person does. */
  press(label: string): Promise<void>
  /** The element of that `id`. */
  block(id: string): Promise<Found>
  /** The one element that shows exactly those words. */
  text(words: string): Promise<Found>
  /**
   * Sends a message in the chat screen of an agent: types it into the field `message` and presses Enter, as a
   * person does, and answers when the turn of the run it started has ended.
   */
  say(message: string): Promise<Said>
  /** Puts the text into the field of that name, in place of its words, as a person types it. */
  type(field: string, text: string): Promise<void>
  /** Picks a choice of a field of choices: an option of a list, a button of a group, or a box set or unset. */
  pick(field: string, choice: unknown): Promise<void>
  /** Hands a field of files those files, as a person picks them. */
  upload(field: string, files: Handed | Handed[]): Promise<void>
  /** Goes one step back, as the back button of the browser does. */
  back(): Promise<void>
  /** What a screen reader hears of the page: each thing with its role, its name and its state, one on a line. */
  reader(): Promise<string>
  /** A picture of the page, as the bytes of a PNG file. */
  picture(o?: { full?: boolean }): Promise<Uint8Array>
}

/** What the part alone reads of a page of a test: the engine that draws it, and the end of its browser. */
const inner = new WeakMap<Page, { engine: BrowserEngine; close(): Promise<void> }>()

/** Answers what the part holds of a page of a test. Throws T0013 for a page that it did not open. */
function innerOf(page: Page): { engine: BrowserEngine; close(): Promise<void> } {
  const held = inner.get(page)
  if (!held) throw new TentError('T0013', 'This page was not opened by `app.open`.')
  return held
}

/** The engine of the browser that draws a page of a test. */
export const engineOf = (page: Page): BrowserEngine => innerOf(page).engine

/** Ends the browser of a page of a test, as the test app does for each page it opened when it closes. */
export const closePage = (page: Page): Promise<void> => innerOf(page).close()

/** What a page of a test is made with: its browser, its app, and what it is told when it closes. */
export interface Made {
  browsed: Browsed
  app: App
  // The longest a step may take before it fails, in milliseconds.
  step: number
  closed(): void
}

// The record that the test laid into the page, through which the page code gives what a test reads.
const hook = "globalThis[Symbol.for('tent.test')]"

/** A finding, as the page is told it. */
interface Asked {
  kind: 'field' | 'press' | 'block' | 'text'
  name: string
}

/** The words by which a finding names what it looks for. */
const lookedFor = (asked: Asked): string =>
  `${asked.kind === 'block' ? 'element with the id' : asked.kind} ${JSON.stringify(asked.name)}`

/** The newest write of the app, by its number. */
const newest = (app: App): number => app.at().n

/** What a question to a page answers within a few seconds, or nothing: a page whose code never came alive answers none. */
async function briefly(asking: Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      asking.catch(() => undefined),
      new Promise((done) => {
        timer = setTimeout(() => done(undefined), 3000)
      }),
    ])
  } finally {
    // The timer of an answer that came first is ended, so that none stands after it.
    clearTimeout(timer)
  }
}

/** A pause of the program of the test, while the browser loads another document. */
const moment = (): Promise<void> => new Promise((done) => setTimeout(done, 50))

/**
 * Takes what a page of a test is made with. Answers the page, whose steps wait by fact, as the record of the page
 * tells it, for `step` milliseconds at most, and what waits for the page to land, which `app.open` waits for once.
 */
export function pageOf(made: Made): {
  page: Page
  landed(): Promise<void>
  moved(ahead: number): void
} {
  const { browsed, app } = made
  let ended = false
  let moving: Promise<unknown> = Promise.resolve()

  /** Runs an expression on what the page code gives the test, and answers its value. */
  const asked = (expression: string): Promise<unknown> =>
    browsed.evaluate(`${hook}.ready.then((tested) => tested === null ? null : tested.${expression})`)

  /**
   * Answers once what the page set off has landed, and the newest write of the app reached its watches: a write
   * that a step of the page made, and one that reached it from elsewhere. Throws T0008 after `step` milliseconds,
   * naming what the page still waited for.
   */
  async function landed(): Promise<void> {
    // A move of the clock that the test made is in the page before the step reads it.
    await moving
    const until = performance.now() + made.step
    let write = newest(app)
    for (;;) {
      let timer: NodeJS.Timeout | undefined
      const late = new Promise<'late'>((done) => {
        timer = setTimeout(() => done('late'), Math.max(0, until - performance.now()))
      })
      const told = await Promise.race([asked(`landed(${write})`).catch(() => 'away' as const), late])
      clearTimeout(timer)
      if (told === 'late') {
        const waited = await briefly(asked(`waiting(${write})`))
        const what = Array.isArray(waited) && waited.length ? waited.map(String).join('; ') : 'the page coming alive'
        throw new TentError(
          'T0008',
          `A step of the page did not land within ${made.step / 1000} seconds: it still waited for ${what}.`,
          {
            fix: 'Look at what the step set off: a call that is not answered, a watch that holds no answer. `limits.testStep` bounds a step.',
          },
        )
      }
      // The document went away while the page loaded another one: the step waits for the new one.
      if (told === 'away') {
        await Promise.race([browsed.loaded(), moment()])
        continue
      }
      // A write that was made meanwhile is waited for too, until no newer one stands.
      const now = newest(app)
      if (now === write) return
      write = now
    }
  }

  /** What the page answered a finding: the thing, or the failure that names what the screen holds. */
  async function foundIn(what: Asked, told: unknown): Promise<Found> {
    if (told === null)
      throw new TentError('T0001', `The page shows no screen of the app, so no ${lookedFor(what)} is on it.`)
    const answer: Record<string, unknown> = Object(told)
    if (typeof answer.missed !== 'string') return foundOf(answer.found)
    const path = String(await browsed.evaluate('Promise.resolve(location.pathname)').catch(() => '?'))
    if (answer.missed === 'none')
      throw new TentError(
        'T0001',
        `No ${lookedFor(what)} is on the screen ${path}. It holds ${String(answer.holds)}.`,
        {
          fix: 'Name a thing by what the screen calls it: a field by its name, a press by its words, an element by its `id`.',
        },
      )
    throw new TentError(
      'T0002',
      `The ${lookedFor(what)} fits ${String(answer.count)} things on the screen ${path}, two or more where a step finds one. It holds ${String(answer.holds)}.`,
      { fix: 'Give one of them other words, a `label` or an `id`, so that a name finds one thing.' },
    )
  }

  /** Finds what a test asks for, once the page has landed, and answers what the page tells of it. */
  async function found(what: Asked): Promise<Found> {
    await landed()
    return foundIn(what, await asked(`find(${JSON.stringify(what)})`))
  }

  /** Answers a point that the page told, or throws the failure of a finding that it told in its place. */
  async function pointOf(what: Asked, told: unknown): Promise<{ x: number; y: number }> {
    const point: Record<string, unknown> = Object(told)
    if (typeof point.x === 'number' && typeof point.y === 'number') return { x: point.x, y: point.y }
    await foundIn(what, told)
    throw new TentError('T0001', `The ${lookedFor(what)} cannot be pressed.`)
  }

  const steps = {
    field: (name) => found({ kind: 'field', name }),
    block: (id) => found({ kind: 'block', name: id }),
    text: (words) => found({ kind: 'text', name: words }),
    async press(label) {
      const what: Asked = { kind: 'press', name: label }
      await landed()
      await browsed.click(await pointOf(what, await asked(`point(${JSON.stringify(what)})`)))
      await landed()
    },
    async type(field, text) {
      const what: Asked = { kind: 'field', name: field }
      await landed()
      const told = await asked(`focus(${JSON.stringify(what)})`)
      if (told !== true) await foundIn(what, told)
      await browsed.type(text)
      await landed()
    },
    async pick(field, choice) {
      const what: Asked = { kind: 'field', name: field }
      await landed()
      const told = await asked(`pick(${JSON.stringify(what)}, ${JSON.stringify(choice)})`)
      const refused: unknown = Reflect.get(Object(told), 'refused')
      if (typeof refused === 'string')
        throw new TentError('T0002', `The ${lookedFor(what)} has no choice ${JSON.stringify(choice)}: ${refused}.`)
      if (told !== true) await browsed.click(await pointOf(what, told))
      await landed()
    },
    async upload(field, files) {
      const what: Asked = { kind: 'field', name: field }
      await landed()
      await foundIn(what, await asked(`find(${JSON.stringify(what)})`))
      const folder = mkdtempSync(join(tmpdir(), 'tent-upload-'))
      try {
        // Each file lies in a folder of its own, so that two files of one name can be handed together.
        const paths = (Array.isArray(files) ? files : [files]).map((file, n) => {
          mkdirSync(join(folder, String(n)))
          const path = join(folder, String(n), file.name)
          writeFileSync(path, file.bytes)
          return path
        })
        await browsed.files(`${hook}.tested.element(${JSON.stringify(what)})`, paths)
        await landed()
      } finally {
        // A browser on Windows may hold a file it was handed a moment after its upload has ended.
        rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
      }
    },
    async say(message) {
      const what: Asked = { kind: 'field', name: 'message' }
      await landed()
      const before = new Set(app.runs.find({ newest: 50 }).map((one) => one.id))
      const told = await asked(`focus(${JSON.stringify(what)})`)
      if (told !== true) await foundIn(what, told)
      await browsed.type(message)
      await browsed.enter()
      const until = performance.now() + made.step
      // The turn has ended once the run that the message started works no more: it is done, failed, or waits.
      for (;;) {
        await landed()
        const run = app.runs.find({ newest: 50 }).find((one) => !before.has(one.id) && one.id === one.top)
        if (run && !['queued', 'running'].includes(run.state))
          return {
            run: run.id,
            state: run.state,
            text: String(Reflect.get(Object(run.answer), 'text') ?? ''),
            steps: run.steps.map((step) => ({ name: step.name, state: step.state })),
            asks: run.steps.filter((step) => step.state === 'waiting').map((step) => step.name),
          }
        if (performance.now() > until)
          throw new TentError('T0008', `The turn did not end within ${made.step / 1000} seconds.`, {
            fix: 'Look at what the agent was asked: a model that never answers, a tool that waits.',
          })
        await moment()
      }
    },
    async back() {
      await landed()
      await browsed.evaluate('Promise.resolve(void history.back())')
      await landed()
    },
    async reader() {
      await landed()
      return String(await asked('heard()'))
    },
    async picture(o) {
      await landed()
      return browsed.picture(o)
    },
  } satisfies Page
  const close = async (): Promise<void> => {
    if (ended) return
    ended = true
    made.closed()
    await browsed.end()
  }
  // A step that fails keeps what the page held, and its failure names where.
  const evidenced =
    <Given extends unknown[], Answer>(work: (...given: Given) => Promise<Answer>) =>
    (...given: Given): Promise<Answer> =>
      work(...given).catch(async (failure: unknown) => {
        const told = { heard: () => briefly(asked('heard()')), traces: () => briefly(asked('traces()')) }
        throw await kept(browsed, told, failure)
      })
  const page: Page = {
    field: evidenced(steps.field),
    press: evidenced(steps.press),
    block: evidenced(steps.block),
    text: evidenced(steps.text),
    say: evidenced(steps.say),
    type: evidenced(steps.type),
    pick: evidenced(steps.pick),
    upload: evidenced(steps.upload),
    back: evidenced(steps.back),
    reader: evidenced(steps.reader),
    picture: evidenced(steps.picture),
  }
  inner.set(page, { engine: browsed.engine, close })
  /** Moves the time of the page with the clock of the app: of the document it shows, and of every one it loads next. */
  const moved = (ahead: number): void => {
    moving = moving
      .then(() => browsed.evaluate(`Promise.resolve(${hook}.move(${JSON.stringify(ahead)}))`))
      .then(() => browsed.preload(preloadText(ahead)))
      .catch(() => undefined)
  }
  landings.set(page, landed)
  return { page, landed, moved }
}

// What waits for each page of a test to land: the steps of every other caller of the app wait for it too.
const landings = new WeakMap<Page, () => Promise<void>>()

/** Answers once each of these pages has landed, and the newest write of the app reached its watches. */
export async function pagesLanded(pages: Iterable<Page>): Promise<void> {
  for (const page of [...pages]) await landings.get(page)?.()
}
