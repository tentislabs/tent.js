import { resolve } from 'node:path'
import type { Caller, Finding } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import { bundleFiles } from '../addresses/bundle.ts'
import type { Opened } from '../opened.ts'
import { pageAnswer } from '../pages/answer.ts'
import { exportedPicture, picturesWritten } from './pictures.ts'
import { pageHeaders } from '../pages/headers.ts'
import { sitemapText } from '../pages/sitemap.ts'
import type { Skipped } from './addresses.ts'
import { plannedOf } from './addresses.ts'
import { screenCalls } from './calls.ts'
import { writtenOut } from './written.ts'
import { bytesAt } from '../files.ts'

/** What an export is asked with. */
export interface ExportAsked {
  base?: string
  origin?: string
  version?: string
  names?: 'plain' | 'any'
}

/** What an export answers: the address of each page it wrote, what it left out with the reason, and its warnings. */
export interface Exported {
  pages: string[]
  skipped: Skipped[]
  findings: Finding[]
}

// As many addresses as one file of the sitemap holds.
const perFile = 50_000

/** The base of an export as every address of its pages starts with it: empty, or a path with no slash at its end. */
function baseOf(given: unknown): string {
  if (given === undefined || given === '' || given === '/') return ''
  if (typeof given !== 'string' || !/^(\/[A-Za-z0-9._~-]+)+\/?$/.test(given) || given.includes('/../'))
    throw new TentError('T0002', 'The base of an export is a path of plain words, such as /shop.')
  return given.replace(/\/$/, '')
}

/**
 * The origin of an export: the scheme and the name the site will be reached by, and where none is given the first
 * of the app's own names.
 */
function originOf(o: Opened, given: unknown): string {
  if (given === undefined || given === '') return ownOrigin(o)
  const text = typeof given === 'string' ? given.replace(/\/$/, '') : ''
  const url = URL.canParse(text) ? new URL(text) : undefined
  if (!url || !/^https?:$/.test(url.protocol) || url.origin !== text)
    throw new TentError('T0002', 'The origin of an export is a scheme and a name, such as https://shop.example.com.')
  return url.origin
}

/**
 * The origin of an export that names none: the first of the app's own names, reached over a secure connection but
 * for a name of this computer, and empty for an app that has none.
 */
function ownOrigin(o: Opened): string {
  const first = o.named?.[0]
  if (first === undefined || !URL.canParse(`http://${first}`)) return ''
  const { hostname } = new URL(`http://${first}`)
  const scheme = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ? 'http' : 'https'
  return new URL(`${scheme}://${first}`).origin
}

/**
 * The policy of the page as a line of its head, which a host of files cannot send as a header: who may frame a
 * page cannot be said this way, and is the host's to set. With no origin the page's own site is named.
 */
function policyLine(o: Opened, origin: string, base: string): string {
  const headers = pageHeaders(o.description, origin === '' ? '' : `${origin}${base}`, null)
  const lines = String(headers['content-security-policy'])
    .split('; ')
    .filter((line) => !line.startsWith('frame-ancestors'))
    .map((line) => (origin === '' ? line.replaceAll(' /_t/b/', " 'self'").replace(/ {2,}/g, ' ').trim() : line))
  const text = lines.join('; ').replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<meta http-equiv="Content-Security-Policy" content="${text}">`
}

/**
 * Takes an app, the folder of the export, and how it is asked. Writes the site out as files for any host of files,
 * from the version that `version` names or the running one, as nobody, in the default language: each page and the
 * answer of a move to it, the browser files and the assets, the sitemap, `robots.txt` and `404.html`. The pages say
 * that they were exported for the public. A version built for development is refused with T0013.
 */
export async function exportOf(o: Opened, folder: string, asked: ExportAsked = {}): Promise<Exported> {
  const served = asked.version === undefined || asked.version === o.version ? o : o.versions?.get(asked.version)?.served
  if (!served) throw new TentError('T0013', `No version ${String(asked.version).slice(0, 40)} can be loaded.`)
  if (served.description.app.dev === true)
    throw new TentError('T0013', 'An export is made of a release build, and this version was built for development.', {
      fix: 'Type `tent export`: it builds the project as a release for the export.',
    })
  const base = baseOf(asked.base)
  const origin = originOf(o, asked.origin)
  const nobody: Caller = { kind: 'nobody' }
  const shaped = { mode: 'live' as const, exported: true as const, origin, ...(base === '' ? {} : { base }) }
  const policy = policyLine(served, origin, base)
  const withPolicy = (html: string): string =>
    html.replace('<meta charset="utf-8">\n', `<meta charset="utf-8">\n${policy}\n`)
  const { planned, skipped } = await plannedOf(served, asked.names === 'any')
  const files = new Map<string, string | Uint8Array>()
  // Each picture of the app that a page met is written as files, which the page names in its place.
  const picture = exportedPicture(served)
  const pictures: NonNullable<Awaited<ReturnType<typeof pageAnswer>>['pictures']> = []
  const pages: string[] = []
  const findings: Finding[] = []
  const warned = new Set<string>()
  for (const one of planned) {
    const url = new URL(`http://localhost${one.path}`)
    const answer = await pageAnswer(served, url, origin, nobody, undefined, false, null, { shaped, picture })
    if (answer.status !== 200 || !answer.page) {
      skipped.push({ what: one.path, why: `It answers ${answer.status}, and not the screen.` })
      continue
    }
    files.set(one.place === '' ? 'index.html' : `${one.place}/index.html`, withPolicy(answer.html))
    files.set(`_t/s/${one.place === '' ? 'index' : one.place}.json`, JSON.stringify({ ok: true, value: answer.page }))
    pages.push(one.path)
    pictures.push(...(answer.pictures ?? []))
    const calls = screenCalls(served.description, one.screen)
    const waits = answer.page.answers.filter((entry) => entry.left === 'wait').map((entry) => entry.what)
    if ((calls.length || waits.length) && !warned.has(one.screen)) {
      warned.add(one.screen)
      const named = [...new Set([...calls, ...waits])].sort().join(', ')
      findings.push(
        finding(
          'T6016',
          `The screen ${one.screen} calls ${named}, and an exported page has no engine to call where none stands behind it.`,
          { fix: 'Serve the export with the engine behind the same address, or leave the call out of the screen.' },
          'warning',
        ),
      )
    }
  }
  const missing = await pageAnswer(
    served,
    new URL('http://localhost/_t/not-found'),
    origin,
    nobody,
    undefined,
    false,
    null,
    { shaped },
  )
  files.set('404.html', withPolicy(missing.html))
  const formats = await picturesWritten(served, pictures, files, skipped)
  // Where a picture was written in other formats too, each page is drawn again to name them.
  if (formats.size) {
    const named = exportedPicture(served, formats)
    for (const one of planned) {
      if (!pages.includes(one.path)) continue
      const answer = await pageAnswer(
        served,
        new URL(`http://localhost${one.path}`),
        origin,
        nobody,
        undefined,
        false,
        null,
        {
          shaped,
          picture: named,
        },
      )
      if (answer.status !== 200 || !answer.page) continue
      files.set(one.place === '' ? 'index.html' : `${one.place}/index.html`, withPolicy(answer.html))
      files.set(`_t/s/${one.place === '' ? 'index' : one.place}.json`, JSON.stringify({ ok: true, value: answer.page }))
    }
  }
  for (const file of bundleFiles(served.description))
    files.set(`_t/b/${file}`, new Uint8Array(bytesAt(served.bundle, file)))
  const listed = pages
    .filter((path) => {
      const screen = planned.find((one) => one.path === path)?.screen
      return Object(Object(served.description.screens[screen ?? '']).seo).index !== false
    })
    .sort()
    .map((path) => `${origin}${base}${path}`)
  if (origin !== '') {
    // Past one file of the standard the sitemap is a list of the files that hold the addresses.
    const count = Math.ceil(listed.length / perFile)
    for (let file = 0; file <= (count > 1 ? count : 0); file++) {
      const text = sitemapText(listed, `${origin}${base}`, file)
      if (text !== undefined) files.set(file === 0 ? 'sitemap.xml' : `sitemap-${file}.xml`, text)
    }
  }
  files.set('robots.txt', `User-agent: *\nAllow: /\n${origin === '' ? '' : `Sitemap: ${origin}${base}/sitemap.xml\n`}`)
  writtenOut(resolve(folder), files)
  return { pages, skipped, findings }
}
