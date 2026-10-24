import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'
import { slashedIn, spokenIn } from './address.ts'
import { filesAt, named } from './based.ts'
import { asBlock, asText } from './document.ts'
import type { Words } from './spoken.ts'
import { spokenText } from './spoken.ts'
import type { LaterScript, Page, ViewRecord } from './types.ts'
import { valueOf } from './valueOf.ts'

/** What a field of `seo` gives: an arrow of a view is called with what the view is handed, and a stored value is worked out. */
function worked(given: unknown, handed: Record<string, unknown>): unknown {
  return typeof given === 'function' ? given(handed) : valueOf(given, { names: handed })
}

/** A value as one text of the head, or nothing where it is none. */
const textOf = (value: unknown): string | undefined =>
  value === undefined || value === null || typeof value === 'object' ? undefined : String(value)

/**
 * Takes the description, the record of the screen, what its view is handed, and the page. Answers the lines of
 * the head beside the title and the files of the page: the description of the screen, its picture, its one
 * address and the address of the screen in each other language, a word to search engines to leave it out, its
 * structured data, the icon of the site, and the lines of `head` of the project and of the screen. Every text of
 * them is written as text, and structured data as a block that no text of a row can end.
 */
export function headLines(o: {
  description: Description
  record: ViewRecord
  handed: Record<string, unknown>
  page: Page
  // The words of the language of the page, which a field that is a word is written in.
  words?: Words
}): string[] {
  const { page, description } = o
  const assets = isStored(description.assets) ? description.assets : {}
  const base = filesAt(page)
  // An asset is named by its file in the bundle, and an address as it is written, a path of the app under the base.
  const addressOf = (given: unknown): string | undefined => {
    if (isStored(given) && typeof given.asset === 'string') {
      const found: unknown = assets[given.asset]
      return isStored(found) && typeof found.file === 'string' ? `${base}${found.file}` : undefined
    }
    return typeof given === 'string' ? named(page, given) : undefined
  }
  // A full address is written with the origin that the app was reached by, which is one of its own names.
  const full = (address: string): string =>
    address.startsWith('/') && page.origin ? `${page.origin}${address}` : address
  const lines: string[] = []
  const seo = isStored(o.record.seo) ? o.record.seo : {}
  const said = (value: unknown): string | undefined => spokenText(value, o.words ?? {}, page.language) ?? textOf(value)
  const description_ = said(worked(seo.description, o.handed))
  if (description_ !== undefined) lines.push(`<meta name="description" content="${asText(description_)}">`)
  // An asset that is written in place is named as it stands, and a value that is worked out by what it gives.
  // An image that names a component is the picture the engine draws of this address, with its size.
  const drawn = isStored(seo.image) && typeof seo.image.view === 'string' ? pictureLines(o, seo.image) : undefined
  const image = drawn
    ? undefined
    : addressOf(isStored(seo.image) && typeof seo.image.asset === 'string' ? seo.image : worked(seo.image, o.handed))
  if (image !== undefined) lines.push(`<meta property="og:image" content="${asText(full(image))}">`)
  lines.push(...(drawn ?? []))
  if (seo.index === false) lines.push('<meta name="robots" content="noindex">')
  if (page.origin) {
    // A project that keeps a slash at the end of every address of a screen names its addresses so.
    const kept = (path: string): string => (description.project.trailingSlash === 'keep' ? slashedIn(path) : path)
    // A page of each language is its own, and names the same screen in every language, itself among them, and the
    // default language as the one for any other: search engines read the versions as one set where each lists all.
    const inLanguage = (language: string): string =>
      asText(`${page.origin}${named(page, kept(spokenIn(page.path, language, page.languages)))}`)
    lines.push(`<link rel="canonical" href="${inLanguage(page.language)}">`)
    if (page.languages.length > 1) {
      for (const language of page.languages)
        lines.push(`<link rel="alternate" hreflang="${asText(language)}" href="${inLanguage(language)}">`)
      lines.push(`<link rel="alternate" hreflang="x-default" href="${inLanguage(page.languages[0])}">`)
    }
  }
  if (seo.data !== undefined) {
    const data = worked(seo.data, o.handed)
    if (data !== undefined) lines.push(`<script type="application/ld+json">${asBlock(data)}</script>`)
  }
  const icon = addressOf(description.project.icon)
  if (icon !== undefined) lines.push(`<link rel="icon" href="${asText(icon)}">`)
  const hosts =
    isStored(description.project.unlock) && Array.isArray(description.project.unlock.scripts)
      ? description.project.unlock.scripts.map(String)
      : []
  for (const line of linesOf(description, o.record.name)) {
    // A script that is loaded once the page lives, or once a consent is given, is the page code's to add.
    if (laterOf(line) !== undefined) continue
    const drawn = lineOf(line, addressOf, hosts, page.nonce)
    if (drawn !== undefined) lines.push(drawn)
  }
  return lines
}

/** The lines of a shared link whose picture the engine draws of a component: its address at the engine, and its size. */
function pictureLines(o: Parameters<typeof headLines>[0], image: Record<string, unknown>): string[] {
  const { page } = o
  if (!page.origin) return []
  const size = Array.isArray(image.size) && image.size.length === 2 ? image.size.map(Number) : [1200, 630]
  const lead = page.language === page.languages[0] ? '' : `/${page.language}`
  const picture = `${page.origin}${named(page, `/_t/seo/image/${encodeURIComponent(o.record.name)}?${lead}${page.path}`)}`
  return [
    `<meta property="og:image" content="${asText(picture)}">`,
    `<meta property="og:image:width" content="${size[0]}">`,
    `<meta property="og:image:height" content="${size[1]}">`,
  ]
}

/** The lines of `head` of the project and of a screen, in that order. */
const linesOf = (description: Description, screen: string): unknown[] =>
  [description.project.head, Object(description.screens[screen]).head].flatMap((one) => (Array.isArray(one) ? one : []))

/** When a line of the head is loaded where it is no script of the first HTML: its `load` and its `consent`. */
function laterOf(line: unknown): { load: 'alive' | 'idle'; consent?: string } | undefined {
  const script: unknown = isStored(line) ? line.script : undefined
  if (!isStored(script)) return undefined
  const load = script.load === 'alive' || script.load === 'idle' ? script.load : 'alive'
  const consent = typeof script.consent === 'string' ? script.consent : undefined
  if (script.load !== 'alive' && script.load !== 'idle' && consent === undefined) return undefined
  return { load, ...(consent === undefined ? {} : { consent }) }
}

/**
 * Takes the description, the record of the screen and the page. Answers the scripts of `head` that the page code
 * adds once the page lives, when the browser is next idle, or once a state of consent is true: each with its
 * address, as a script of the first HTML is written, and when it is added. A script from a host that `unlock`
 * does not list is left out, as it is from the head.
 */
export function laterScripts(o: { description: Description; record: ViewRecord; page: Page }): LaterScript[] {
  const { description, page } = o
  const hosts =
    isStored(description.project.unlock) && Array.isArray(description.project.unlock.scripts)
      ? description.project.unlock.scripts.map(String)
      : []
  const assets = isStored(description.assets) ? description.assets : {}
  const found: LaterScript[] = []
  for (const line of linesOf(description, o.record.name)) {
    const later = laterOf(line)
    const script: unknown = isStored(line) ? line.script : undefined
    if (!later || !isStored(script)) continue
    const given = script.src
    let src: string | undefined
    if (isStored(given) && typeof given.asset === 'string') {
      const file: unknown = Reflect.get(Object(assets[given.asset]), 'file')
      src = typeof file === 'string' ? `${filesAt(page)}${file}` : undefined
    } else if (typeof given === 'string') {
      src = named(page, given)
      if (!src.startsWith('/') && !hosts.some((host) => src?.startsWith(`${host.replace(/\/$/, '')}/`))) src = undefined
    }
    if (src === undefined) continue
    found.push({
      src,
      ...later,
      ...(script.async === true ? { async: true as const } : {}),
      ...(script.defer === true ? { defer: true as const } : {}),
      ...(typeof script.type === 'string' ? { type: script.type } : {}),
    })
  }
  return found
}

/** The names that each kind of line of the head takes, and no other. */
const taken: Record<string, string[]> = {
  meta: ['name', 'property', 'content', 'media'],
  link: ['rel', 'href', 'type', 'sizes', 'media', 'hreflang', 'title', 'as', 'crossorigin'],
  script: ['src', 'async', 'defer', 'type'],
}

/**
 * One line of `head`, as HTML: a `meta`, a `link` or a `script`, with the names it takes and no other. A `script`
 * is an asset of the app or an address on a host that `unlock` lists, and any other is left out. A script carries
 * the nonce of the page, so that a library's script of the head that runs before the first paint is let in.
 */
function lineOf(
  line: unknown,
  addressOf: (given: unknown) => string | undefined,
  hosts: string[],
  nonce: string | undefined,
): string | undefined {
  if (!isStored(line)) return undefined
  const [kind] = Object.keys(line)
  const given = Object.hasOwn(taken, kind) && isStored(line[kind]) ? line[kind] : undefined
  if (!given) return undefined
  const parts: string[] = []
  for (const name of taken[kind]) {
    const value = given[name]
    if (value === undefined || value === null || value === false) continue
    if (value === true) parts.push(` ${name}`)
    else if (name === 'href' || name === 'src') {
      const address = addressOf(value)
      if (address === undefined) return undefined
      if (
        kind === 'script' &&
        !address.startsWith('/') &&
        !hosts.some((host) => address.startsWith(`${host.replace(/\/$/, '')}/`))
      )
        return undefined
      parts.push(` ${name}="${asText(address)}"`)
    } else parts.push(` ${name}="${asText(String(value))}"`)
  }
  if (kind === 'script' && nonce !== undefined) parts.push(` nonce="${asText(nonce)}"`)
  return kind === 'script' ? `<script${parts.join('')}></script>` : `<${kind}${parts.join('')}>`
}
