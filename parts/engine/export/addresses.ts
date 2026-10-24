import type { Caller } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import { called } from '../door/call.ts'
import type { Opened } from '../opened.ts'

/** What an export left out: a screen by its name or an address as a page names it, and why. */
export interface Skipped {
  what: string
  why: string
}

/** One page that an export writes: its screen, its address as a page names it, and its place in the folder. */
export interface PlannedPage {
  screen: string
  path: string
  // The path of its folder inside the export, with the values of its address read: empty for `/`.
  place: string
}

// A value that could name a file outside the folder, or that holds a control character.
const unsafe = (text: string): boolean =>
  /[/\\]|^\.\.?$|\.\./.test(text) || [...text].some((sign) => sign.charCodeAt(0) < 32 || sign.charCodeAt(0) === 127)
// A sign that cannot stand in the name of a file on one of the three systems, or a dot or a space at its end.
const unnamable = /[<>:"|?*]|[. ]$/

/**
 * Takes a pattern of an address, a row, and whether names may be any. Answers the address with the values of the
 * row in their places, each written with its percent signs, the place of its file with each value read, and why
 * it is not written, where it is not; nothing where the row gives no value for a place.
 */
function filled(
  pattern: string,
  row: Record<string, unknown>,
  any: boolean,
): { path: string; place: string; why?: string } | undefined {
  const path: string[] = []
  const place: string[] = []
  let why: string | undefined
  for (const part of pattern.split('/')) {
    const name = part === '*' ? 'rest' : part.startsWith(':') ? part.slice(1) : undefined
    if (name === undefined) {
      path.push(part)
      place.push(part)
      continue
    }
    const value = row[name]
    if (value === undefined || value === null || value === '') return undefined
    const text = String(value)
    path.push(encodeURIComponent(text))
    place.push(text)
    if (unsafe(text)) why ??= `The value of ${name} could name a file outside the folder.`
    else if (!any && unnamable.test(text))
      why ??= `The value of ${name} cannot stand in the name of a file on every system.`
  }
  return { path: path.join('/'), place: place.join('/').replace(/^\//, ''), ...(why === undefined ? {} : { why }) }
}

/**
 * Takes an app as one version serves it, and whether the names of files may be any that this system takes.
 * Answers every page that an export writes: each screen that anyone may see, and a screen with values in its
 * address once for each row of `seo.addresses`, called as nobody, each in every language of the project. What is not written is named with the reason:
 * a screen that is not open to anyone, one with values and no `seo.addresses`, an address that cannot be a file,
 * and the second of two addresses that differ only in capitals, unless names may be any.
 */
export async function plannedOf(o: Opened, any: boolean): Promise<{ planned: PlannedPage[]; skipped: Skipped[] }> {
  const nobody: Caller = { kind: 'nobody' }
  const planned: PlannedPage[] = []
  const skipped: Skipped[] = []
  for (const [name, screen] of Object.entries(o.description.screens)) {
    if (!isStored(screen) || typeof screen.path !== 'string') continue
    if (Object(screen.access).rule !== 'anyone') {
      skipped.push({ what: name, why: 'The screen is not open to anyone.' })
      continue
    }
    if (!/[:*]/.test(screen.path)) {
      planned.push({ screen: name, path: screen.path, place: screen.path.slice(1) })
      continue
    }
    const seo = isStored(screen.seo) ? screen.seo : {}
    const asked = isStored(seo.addresses) ? seo.addresses : undefined
    if (!asked || typeof asked.query !== 'string') {
      skipped.push({ what: name, why: 'The screen has values in its address and no `seo.addresses`.' })
      continue
    }
    let rows: unknown
    try {
      rows = await called(o, asked.query, isStored(asked.input) ? asked.input : {}, { caller: nobody })
    } catch (error) {
      skipped.push({ what: name, why: `The query of its addresses failed: ${String(Object(error).message ?? error)}` })
      continue
    }
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!isStored(row)) continue
      const made = filled(screen.path, row, any)
      if (made?.why !== undefined) skipped.push({ what: made.path, why: made.why })
      else if (made) planned.push({ screen: name, path: made.path, place: made.place })
    }
  }
  // Each page is written once in each language: every one but the default lies under its code.
  const languages = Array.isArray(o.description.project.languages) ? o.description.project.languages.map(String) : []
  const ofDefault = [...planned]
  for (const code of languages.slice(1))
    for (const one of ofDefault)
      planned.push({
        screen: one.screen,
        path: `/${code}${one.path === '/' ? '' : one.path}`,
        place: one.place === '' ? code : `${code}/${one.place}`,
      })
  if (any) return { planned, skipped }
  // Two names that differ only in capitals are one file on two of the systems: the first one is written.
  const taken = new Set<string>()
  const kept: PlannedPage[] = []
  for (const one of planned) {
    const key = one.place.toLowerCase()
    if (taken.has(key)) skipped.push({ what: one.path, why: 'Another address differs from it only in capitals.' })
    else {
      taken.add(key)
      kept.push(one)
    }
  }
  return { planned: kept, skipped }
}
