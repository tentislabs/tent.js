import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { copyOf } from './projects.ts'
import type { ByHand, Siege, Sieging, Wired } from './sieges.ts'
import { besieged, rowId, wire } from './sieges.ts'

// The bundle of the pages under attack, built once for a file of tests and removed when its program ends.
let built: Promise<string> | undefined

function builtOnce(): Promise<string> {
  built ??= (async () => {
    const all = join(process.cwd(), 'results', 'test')
    mkdirSync(all, { recursive: true })
    const folder = mkdtempSync(join(all, 'gate-'))
    process.once('exit', () => rmSync(folder, { recursive: true, force: true }))
    const project = join(folder, 'gate')
    cpSync(join(import.meta.dirname, 'gate'), project, { recursive: true })
    const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    return made.bundleFolder
  })()
  return built
}

/**
 * Opens the pages under attack in an engine of their own, which listens on a port that the system gave it, in
 * the mode `test` where the attack names no other. `change` changes the description first, as a hand would. It
 * is closed when the test ends.
 */
export async function gated(t: TestContext, o: Sieging = {}): Promise<Siege> {
  const bundle = join(copyOf(t, 'bare'), 'bundle')
  cpSync(await builtOnce(), bundle, { recursive: true })
  const file = join(bundle, 'description.json')
  const description: ByHand = JSON.parse(readFileSync(file, 'utf8'))
  Object.assign(description.project, { limits: { ...description.project.limits, ...o.limits } })
  o.change?.(description)
  writeFileSync(file, JSON.stringify(description))
  return besieged(t, { ...o, bundle, open: { mode: 'test', ...o.open } })
}

/** A `GET` over a real connection, as a browser sends one. */
export const got = (
  gate: Pick<Siege, 'port'>,
  path: string,
  headers: Record<string, string> = {},
  more: { host?: string; via?: string } = {},
): Promise<Wired> => wire(gate, { method: 'GET', path, headers: { accept: 'text/html', ...headers }, ...more })

/** Adds a note as the system, and answers its id. */
export async function noted(
  gate: Pick<Siege, 'app'>,
  values: { title: string; to?: string; hidden?: string },
): Promise<string> {
  const rows: unknown = await gate.app.write([{ add: 'notes', values }], { as: 'system' })
  return rowId(Array.isArray(rows) ? rows[0] : rows)
}

/** Changes a note as the system. */
export async function renoted(gate: Pick<Siege, 'app'>, id: string, values: Record<string, string>): Promise<void> {
  await gate.app.write([{ change: 'notes', id, values }], { as: 'system' })
}

/** How many notes the app holds. */
export const notesIn = async (gate: Pick<Siege, 'app'>): Promise<number> =>
  Number(await gate.app.read({ from: 'notes', count: true }, { as: 'system' }))

/**
 * Adds a user with those roles, and has the engine make a session for it. Answers the id of the user and the
 * cookie of the session, as a browser sends it back.
 */
export async function signedIn(
  gate: Siege,
  name: string,
  roles: string[] = [],
): Promise<{ id: string; cookie: string }> {
  const rows: unknown = await gate.app.write([{ add: 'users', values: { name, roles } }], { as: 'system' })
  const id = rowId(Array.isArray(rows) ? rows[0] : rows)
  return { id, cookie: gate.app.session(id) }
}

/** The page record of a document, read as the page code finds and reads it. */
export function recordOf(html: string): Record<string, unknown> {
  const found = /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(found, `the document holds a page record: ${html.slice(0, 200)}`)
  return JSON.parse(found[1])
}

/** The text of the page record as the document writes it, between the tags of its script. */
export const blockOf = (html: string): string =>
  /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

/** One thing that a reader of HTML makes of a document: an element with its attributes, the end of one, or a comment. */
export interface Tag {
  name: string
  attributes: Record<string, string>
  closes: boolean
}

const signs: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** A text of HTML with its named and numbered signs read, as a browser reads the value of an attribute. */
export const readSigns = (text: string): string =>
  text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
    return signs[name] ?? whole
  })

// The elements whose content a browser reads as text up to their own end tag, and makes no element from.
const textOnly = ['script', 'style', 'title', 'textarea']

/**
 * Takes a document. Answers every element that a browser would make of it, in order, as a browser reads HTML: a
 * `<` before a letter starts an element, whose attributes end at the `>` that stands in no quoted value; `<!--`
 * starts a comment, which is named `!--`; and the content of a script, a style, a title and a text area is text
 * up to its own end tag. So a text of a row that made an element, a comment or an attribute shows as one.
 */
export function tagsOf(html: string): Tag[] {
  const tags: Tag[] = []
  let at = 0
  while (at < html.length) {
    const open = html.indexOf('<', at)
    if (open < 0) break
    if (html.startsWith('<!--', open)) {
      tags.push({ name: '!--', attributes: {}, closes: false })
      const end = html.indexOf('-->', open + 4)
      at = end < 0 ? html.length : end + 3
      continue
    }
    const named = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(html.slice(open, open + 80))
    if (!named) {
      at = open + 1
      continue
    }
    const name = named[2].toLowerCase()
    const attributes: Record<string, string> = {}
    let k = open + named[0].length
    for (;;) {
      while (k < html.length && /[\s/]/.test(html[k])) k++
      if (k >= html.length || html[k] === '>') break
      let key = ''
      while (k < html.length && !/[\s/>=]/.test(html[k])) key += html[k++]
      while (k < html.length && /\s/.test(html[k])) k++
      let value = ''
      if (html[k] === '=') {
        k++
        while (k < html.length && /\s/.test(html[k])) k++
        const quote = html[k] === '"' || html[k] === "'" ? html[k++] : ''
        while (k < html.length && (quote ? html[k] !== quote : !/[\s>]/.test(html[k]))) value += html[k++]
        if (quote) k++
      }
      if (key === '') k++
      else attributes[key.toLowerCase()] = readSigns(value)
    }
    at = k + 1
    tags.push({ name, attributes, closes: named[1] === '/' })
    if (named[1] === '' && textOnly.includes(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, at)
      at = end < 0 ? html.length : end
    }
  }
  return tags
}

/** The elements of a document as their names and the names of their attributes: what two documents of one shape share, whatever their words are. */
export const shapeOf = (html: string): string[] =>
  tagsOf(html).map((tag) =>
    `${tag.closes ? '/' : ''}${tag.name} ${Object.keys(tag.attributes).sort().join(' ')}`.trim(),
  )
