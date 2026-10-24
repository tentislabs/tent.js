import { number, project, query, text } from '../../core/index.ts'
import type { Description, Loaded } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { Answered, DrawInput, Drawn, Page } from '../draw.ts'
import { draw } from '../draw.ts'

/** The backend definitions that the screens of the tests read and call. */
export const openOrders = query('openOrders', {
  access: 'anyone',
  input: { limit: number({ default: 50 }), status: text({ optional: true }) },
  run: () => [],
})
export const getOrder: object = query('getOrder', { access: 'anyone', input: { id: text() }, run: () => null })

/** The rows that the test `read` answers a query with. */
export const rows = [
  { id: 'a', name: 'Ann', total: 1999, open: true },
  { id: 'b', name: 'Bo', total: 5, open: false },
]

/** Describes definitions, each with what the build read of its arrows, and fails where the description finds anything. */
export function described(definitions: (object | Loaded)[]): Description {
  const loaded = definitions.map((one): Loaded => ('value' in one && 'views' in one ? one : { value: one }))
  const made = describe({ definitions: [{ value: project('shop', { currency: 'USD' }) }, ...loaded] })
  if (made.findings.length) throw new Error(made.findings.map((one) => `${one.code} ${one.message}`).join('\n'))
  return made.description
}

/** The record of a page of the tests, with what the case states of it. */
export const pageOf = (name: string, more: Partial<Page> = {}): Page => ({
  version: 'v1',
  mode: 'test',
  status: 200,
  screen: name,
  origin: 'http://localhost:3000',
  path: `/${name}`,
  params: {},
  state: {},
  language: 'en',
  languages: ['en'],
  currency: 'USD',
  user: null,
  settings: {},
  zone: 'UTC',
  framedBy: null,
  load: { screen: `browser/screens.${name}.js`, parts: [], styles: ['browser/styles.css'], error: '' },
  answers: [],
  ...more,
})

/** A `read` of the tests: it answers every asking with what the case gives for its name, and keeps what it was asked. */
export function reader(answers: Record<string, unknown> = {}): {
  read: DrawInput['read']
  asked: { what: string; input: unknown; o: object | undefined }[]
} {
  const asked: { what: string; input: unknown; o: object | undefined }[] = []
  return {
    asked,
    read: (what, input, o) => {
      asked.push({ what, input, o })
      const { entry, of, needed } = o ?? {}
      const told: Answered = { what, input, ...(entry ? { entry } : {}), ...(of ? { of } : {}) }
      if (needed) told.needed = true
      const given = Object.hasOwn(answers, what) ? answers[what] : rows
      return typeof given === 'function' ? given(told) : { ...told, value: given }
    },
  }
}

/** Draws a screen of a description with a test `read` and no engine. */
export async function drawn(
  description: Description,
  name: string,
  more: { page?: Partial<Page>; answers?: Record<string, unknown>; views?: Record<string, object> } = {},
): Promise<Drawn & { asked: { what: string; input: unknown; o: object | undefined }[] }> {
  const { read, asked } = reader(more.answers)
  const made = await draw({
    description,
    page: pageOf(name, more.page),
    read,
    views: more.views ?? {},
    picture: () => undefined,
  })
  return { ...made, asked }
}

/** The drawing of a document: what stands inside the element with the id `tent`. */
export function drawingOf(html: string | undefined): string {
  const found = /<div id="tent">([\s\S]*)<\/div>\n<script type="application\/json" id="tent-page">/.exec(html ?? '')
  if (!found) throw new Error(`the document holds no drawing: ${html}`)
  return found[1]
}

/** The page record of a document, read as the page code finds and reads it. */
export function recordOf(html: string | undefined): Page {
  const found = /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html ?? '')
  if (!found) throw new Error('the document holds no page record')
  return JSON.parse(found[1])
}

/** A text of HTML with the names of its signs turned back, as a browser reads an attribute. */
export const unescaped = (text: string): string =>
  text.replace(
    /&(amp|lt|gt|quot|#39|#x27);/g,
    (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[name] ?? "'",
  )
