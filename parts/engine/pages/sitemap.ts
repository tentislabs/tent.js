import type { Caller } from '../../core/index.ts'
import { isStored, projectLanguages } from '../../core/internal.ts'
import { called } from '../door/call.ts'
import type { Opened } from '../opened.ts'

// As many addresses as one file of the standard holds.
const perFile = 50_000

/** A text as it stands in XML: the five characters that mean something there are written as their names. */
const asXml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (sign) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[sign] ?? sign,
  )

/** A pattern with the values of a row in its places, each written with its percent signs, or nothing where one is missing. */
function filled(pattern: string, row: Record<string, unknown>): string | undefined {
  const parts: string[] = []
  for (const part of pattern.split('/')) {
    const name = part === '*' ? 'rest' : part.startsWith(':') ? part.slice(1) : undefined
    if (name === undefined) {
      parts.push(part)
      continue
    }
    const value = row[name]
    if (value === undefined || value === null || value === '') return undefined
    parts.push(
      part === '*' ? String(value).split('/').map(encodeURIComponent).join('/') : encodeURIComponent(String(value)),
    )
  }
  return parts.join('/')
}

/**
 * Takes an app, the origin it was reached by, and the caller. Answers every address that the sitemap lists, in
 * the order of the paths: each screen that anyone may see and that does not say `index: false`, once for each
 * language, a screen with values in its address once for each row of the query of `seo.addresses`, which is
 * called as the caller, and one with values and no `seo.addresses` not at all.
 */
export async function siteAddresses(o: Opened, origin: string, caller: Caller): Promise<string[]> {
  const description = o.description
  const languages = projectLanguages(description.project)
  const paths: string[] = []
  for (const screen of Object.values(description.screens)) {
    if (!isStored(screen) || typeof screen.path !== 'string' || Object(screen.access).rule !== 'anyone') continue
    const seo = isStored(screen.seo) ? screen.seo : {}
    if (seo.index === false) continue
    if (!/[:*]/.test(screen.path)) {
      paths.push(screen.path)
      continue
    }
    const asked = isStored(seo.addresses) ? seo.addresses : undefined
    if (!asked || typeof asked.query !== 'string') continue
    let rows: unknown
    try {
      rows = await called(o, asked.query, isStored(asked.input) ? asked.input : {}, { caller })
    } catch {
      // A query that fails lists no address: the sitemap still stands for the rest.
      continue
    }
    for (const row of Array.isArray(rows) ? rows : []) {
      const path = isStored(row) ? filled(screen.path, row) : undefined
      if (path !== undefined) paths.push(path)
    }
  }
  const sorted = [...new Set(paths)].sort()
  // A project that keeps a slash at the end of every address of a screen lists its addresses so.
  const kept = (path: string): string =>
    description.project.trailingSlash === 'keep' && path !== '/' && !path.endsWith('/') ? `${path}/` : path
  return languages.flatMap((language, place) =>
    sorted.map((path) => `${origin}${kept(place === 0 ? path : `/${language}${path === '/' ? '' : path}`)}`),
  )
}

/**
 * Takes every address that the sitemap lists, the origin, and which file is asked for: 0 for `/sitemap.xml`.
 * Answers the text of that file, or nothing for a file that is none. Past one file of the standard,
 * `/sitemap.xml` is the list of the files `/sitemap-1.xml`, `/sitemap-2.xml` and so on.
 */
export function sitemapText(addresses: string[], origin: string, file: number): string | undefined {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n'
  const files = Math.ceil(addresses.length / perFile)
  if (file === 0 && files > 1)
    return `${head}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from(
      { length: files },
      (_, place) => `<sitemap><loc>${asXml(`${origin}/sitemap-${place + 1}.xml`)}</loc></sitemap>\n`,
    ).join('')}</sitemapindex>\n`
  if (file > 0 && file > files) return undefined
  const part = file === 0 ? addresses : addresses.slice((file - 1) * perFile, file * perFile)
  return `${head}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${part
    .map((address) => `<url><loc>${asXml(address)}</loc></url>\n`)
    .join('')}</urlset>\n`
}
